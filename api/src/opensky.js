/* =========================================================
   Anlık uçuş takibi — OpenSky Network REST API
   https://openskynetwork.github.io/opensky-api/rest.html

   OpenSky uçakların anlık konumunu verir ama kalkış/varış bilgisi vermez.
   Bu yüzden İstanbul → varış hattındaki uçaklar iki adımda bulunur:
     1. Hattın çevresindeki uçaklar alınır (/states/all, bölge sorgusu);
        rotaya yakın olan ve varışa doğru uçanlar aday olur.
     2. Her adayın canlı izinin ilk noktası (/tracks/all) İstanbul'daysa
        uçuş İstanbul kalkışlı kabul edilir. Bu sonuç uçuş boyunca önbellekte kalır.

     3. Hesapla giriş yapıldıysa dünün İstanbul kalkışları (/flights/departure)
        da okunur: aynı çağrı kodlu uçuş dün başka yere indiyse aday elenir,
        bu hatta indiyse hat "doğrulandı" sayılır. Hesapsız sonuçlar "tahmini"dir.

   Hesap gerekmez. OPENSKY_CLIENT_ID ve OPENSKY_CLIENT_SECRET tanımlıysa
   OAuth2 ile giriş yapılır ve günlük sorgu hakkı 400'den 4000'e çıkar.
   ========================================================= */

const { ISTANBUL_AIRPORTS, AIRPORTS, AIRLINES } = require("./airports");

const API_URL = "https://opensky-network.org/api";
const TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const TIMEOUT_MS = 8000;

/** Aynı hat için sonuç bu süre boyunca yeniden sorgulanmaz (hesapsızken sorgu hakkı daha az). */
const LIVE_TTL_MS = { anonymous: 90_000, authenticated: 30_000 };
/** Bir uçağın kalkış havalimanı bu süre boyunca hatırlanır. */
const ORIGIN_TTL_MS = 3 * 60 * 60 * 1000;
/** Dünün kalkış listesi bu süre boyunca yeniden alınmaz. */
const HINTS_TTL_MS = 6 * 60 * 60 * 1000;
/** Her yenilemede kalkış yeri sorgulanacak en fazla aday. */
const MAX_CANDIDATES = 8;
/** Canlı izin ilk noktası İstanbul havalimanlarına bu kadar yakınsa kalkış oradandır. */
const ORIGIN_RADIUS_KM = 60;

class OpenSkyError extends Error {
  constructor(message, status, retryAfter) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const hasCredentials = () => Boolean(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET);


/* ---------- Önbellek ---------- */

const cache = new Map();

/** Süresi dolmamış sonucu döndürür; yenisi alınamazsa eskisiyle devam eder. */
async function cached(key, ttlMs, load) {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.promise;

  if (cache.size > 1000) {
    for (const [oldKey, old] of cache) if (old.expires <= Date.now()) cache.delete(oldKey);
  }

  const promise = load();
  cache.set(key, { expires: Date.now() + ttlMs, promise });
  try {
    return await promise;
  } catch (error) {
    if (entry) {
      cache.set(key, entry);
      return entry.promise;
    }
    cache.delete(key);
    throw error;
  }
}


/* ---------- OpenSky istekleri ---------- */

let token = null;

async function authHeaders() {
  if (!hasCredentials()) return {};
  if (!token || token.expires <= Date.now()) {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.OPENSKY_CLIENT_ID,
        client_secret: process.env.OPENSKY_CLIENT_SECRET
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!response.ok) {
      console.warn(`OpenSky girişi başarısız (${response.status}), hesapsız devam ediliyor.`);
      return {};
    }
    const data = await response.json();
    token = { value: data.access_token, expires: Date.now() + ((data.expires_in ?? 1800) - 30) * 1000 };
  }
  return { Authorization: `Bearer ${token.value}` };
}

async function openSkyGet(path, params, retried = false) {
  const url = new URL(API_URL + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, { headers: await authHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (response.status === 401 && token && !retried) {
    token = null;
    return openSkyGet(path, params, true);
  }
  if (response.status === 404) return null;
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("X-Rate-Limit-Retry-After-Seconds")) || null;
    throw new OpenSkyError("OpenSky günlük sorgu hakkı doldu", 429, retryAfter);
  }
  if (!response.ok) throw new OpenSkyError(`OpenSky yanıt vermedi (${response.status})`, response.status);
  return response.json();
}


/* ---------- Coğrafi hesaplar (küresel, km) ---------- */

const EARTH_KM = 6371;
const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function distanceKm([lat1, lon1], [lat2, lon2]) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

function bearingDeg([lat1, lon1], [lat2, lon2]) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const angleDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/** Büyük daire üzerinde from → to arasındaki fraction (0–1) noktası. */
function intermediatePoint(from, to, fraction) {
  const d = distanceKm(from, to) / EARTH_KM;
  if (d === 0) return from;
  const [φ1, λ1, φ2, λ2] = [rad(from[0]), rad(from[1]), rad(to[0]), rad(to[1])];
  const a = Math.sin((1 - fraction) * d) / Math.sin(d);
  const b = Math.sin(fraction * d) / Math.sin(d);
  const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2);
  const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2);
  const z = a * Math.sin(φ1) + b * Math.sin(φ2);
  return [deg(Math.atan2(z, Math.hypot(x, y))), deg(Math.atan2(y, x))];
}

/** Hattı kenar payıyla saran bölge: OpenSky'a sorulacak alan. */
function corridorBox(from, to) {
  const points = Array.from({ length: 21 }, (_, i) => intermediatePoint(from, to, i / 20));
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  const margin = 1.5;
  return {
    lamin: Math.max(-90, Math.min(...lats) - margin),
    lamax: Math.min(90, Math.max(...lats) + margin),
    lomin: Math.max(-180, Math.min(...lons) - margin),
    lomax: Math.min(180, Math.max(...lons) + margin)
  };
}

/**
 * Uçağın hatta göre konumu: rotadan sapma (km) ve kat edilen yol (km).
 * Kaynak: büyük daire üzerinde cross-track / along-track uzaklığı.
 */
function routePosition(from, to, point) {
  const d13 = distanceKm(from, point) / EARTH_KM;
  const θ13 = rad(bearingDeg(from, point));
  const θ12 = rad(bearingDeg(from, to));
  const crossTrack = Math.asin(Math.sin(d13) * Math.sin(θ13 - θ12));
  const alongTrack = Math.acos(Math.min(1, Math.cos(d13) / Math.cos(crossTrack))) * Math.sign(Math.cos(θ13 - θ12));
  return { offTrackKm: Math.abs(crossTrack) * EARTH_KM, alongKm: alongTrack * EARTH_KM };
}


/* ---------- Hat eşleştirme ---------- */

/** /states/all satırını okunur nesneye çevirir (alan sırası dokümantasyondaki gibidir). */
function parseState(row) {
  return {
    icao24: row[0],
    callsign: (row[1] ?? "").trim(),
    country: row[2],
    lastContact: row[4],
    position: row[6] != null && row[5] != null ? [row[6], row[5]] : null,
    altitude: row[7] ?? row[13],
    onGround: row[8],
    speed: row[9],
    heading: row[10],
    verticalRate: row[11]
  };
}

const TURKISH_CARRIERS = ["THY", "PGT", "TKJ", "SXS"];

/**
 * Çağrı kodu hattın türüne uymuyorsa false: yurt içi hatlarda yalnızca Türk havayolları;
 * THY'nin sayısal çağrı kodlarında 2000–2999 yurt içi, 2000'in altı yurt dışı seferdir.
 */
function fitsRouteType(callsign, domestic) {
  const prefix = callsign.slice(0, 3);
  if (domestic && !TURKISH_CARRIERS.includes(prefix)) return false;
  const number = prefix === "THY" && /^THY\d+$/.test(callsign) ? Number(callsign.slice(3)) : null;
  if (number === null) return true;
  const domesticNumber = number >= 2000 && number < 3000;
  return domestic ? domesticNumber : !domesticNumber;
}

/** Uçak İstanbul → varış hattında ve varışa doğru uçuyorsa ilerleme bilgisini döndürür. */
function matchRoute(state, destination, domestic) {
  if (state.onGround || !state.position || !state.callsign || state.speed == null || state.speed < 60 || state.heading == null) return null;
  if (!fitsRouteType(state.callsign, domestic)) return null;

  const origin = ISTANBUL_AIRPORTS.IST.coords;
  const routeKm = distanceKm(origin, destination);
  const { offTrackKm, alongKm } = routePosition(origin, destination, state.position);
  const remainingKm = distanceKm(state.position, destination);

  const tolerance = Math.min(350, Math.max(60, routeKm * 0.12));
  if (offTrackKm > tolerance || alongKm < 10 || remainingKm < 10 || alongKm > routeKm + 30) return null;

  // İnişe yetecek mesafe kalmadığı hâlde yüksekte ve alçalmıyorsa uçak bu havalimanının
  // üzerinden geçiyordur (3° süzülüş: her 1000 m irtifa için ~19 km).
  const descentKm = (state.altitude ?? 0) / 1000 * 19 + 20;
  if (remainingKm < descentKm && (state.verticalRate ?? 0) > -1) return null;

  // Varışa yaklaşırken alçalma manevraları yüzünden yön toleransı genişler.
  const headingTolerance = remainingKm < 150 ? 75 : 35;
  if (angleDiff(state.heading, bearingDeg(state.position, destination)) > headingTolerance) return null;

  return { ...state, remainingKm, progress: Math.min(1, alongKm / routeKm) };
}

/**
 * Uçağın canlı izindeki ilk noktaya bakarak kalkış havalimanını bulur.
 * Döner: { code: "IST" | "SAW", startTime } · null (İstanbul kalkışlı değil) · undefined (bilinmiyor)
 */
async function departureOf({ icao24, callsign }) {
  try {
    return await cached(`origin:${icao24}:${callsign}`, ORIGIN_TTL_MS, async () => {
      const track = await openSkyGet("/tracks/all", { icao24, time: 0 });
      const first = track?.path?.[0];
      if (!first || first[1] == null) throw new Error("İz bulunamadı");
      const start = [first[1], first[2]];
      const match = Object.entries(ISTANBUL_AIRPORTS).find(([, airport]) => distanceKm(airport.coords, start) <= ORIGIN_RADIUS_KM);
      return match ? { code: match[0], startTime: track.startTime } : null;
    });
  } catch {
    return undefined;
  }
}

/**
 * Dün İstanbul'dan kalkan uçuşlarda çağrı kodu → varış havalimanı (ICAO).
 * Geçmiş uçuşlar yalnızca hesapla alınabilir; hesapsızken boş döner.
 */
async function yesterdaysDestinations() {
  if (!hasCredentials()) return new Map();
  const end = Math.floor(Date.now() / 86_400_000) * 86_400;
  try {
    return await cached(`hints:${end}`, HINTS_TTL_MS, async () => {
      const lists = await Promise.all(Object.values(ISTANBUL_AIRPORTS).map((airport) =>
        openSkyGet("/flights/departure", { airport: airport.icao, begin: end - 86_400, end })
      ));
      const destinations = new Map();
      for (const flight of lists.flat()) {
        const callsign = flight?.callsign?.trim();
        if (callsign && flight.estArrivalAirport) destinations.set(callsign, flight.estArrivalAirport);
      }
      return destinations;
    });
  } catch {
    return new Map();
  }
}

function airlineOf(callsign) {
  const prefix = callsign.slice(0, 3);
  const [name, color] = AIRLINES[prefix] ?? [null, null];
  return { airline: name, color };
}

async function findFlights(code) {
  const { icao, coords: destination, domestic } = AIRPORTS[code];
  const [data, hints] = await Promise.all([
    openSkyGet("/states/all", corridorBox(ISTANBUL_AIRPORTS.IST.coords, destination)),
    yesterdaysDestinations()
  ]);
  const candidates = (data?.states ?? [])
    .map(parseState)
    .map((state) => matchRoute(state, destination, domestic))
    .filter((flight) => flight && (!hints.has(flight.callsign) || hints.get(flight.callsign) === icao))
    .sort((a, b) => b.progress - a.progress)
    .slice(0, MAX_CANDIDATES);

  const departures = await Promise.all(candidates.map(departureOf));

  const flights = candidates
    .map((flight, index) => ({ flight, departure: departures[index] }))
    .filter(({ departure }) => departure !== null)
    .map(({ flight, departure }) => ({
      icao24: flight.icao24,
      callsign: flight.callsign,
      ...airlineOf(flight.callsign),
      country: flight.country,
      from: departure?.code ?? null,
      departedAt: departure?.startTime ? new Date(departure.startTime * 1000).toISOString() : null,
      routeConfirmed: hints.get(flight.callsign) === icao,
      originConfirmed: departure !== undefined,
      position: flight.position.map((value) => Number(value.toFixed(3))),
      altitude: flight.altitude == null ? null : Math.round(flight.altitude),
      speed: Math.round(flight.speed * 3.6),
      heading: Math.round(flight.heading),
      verticalRate: flight.verticalRate == null ? null : Number(flight.verticalRate.toFixed(1)),
      progress: Number(flight.progress.toFixed(3)),
      remainingKm: Math.round(flight.remainingKm),
      etaMinutes: Math.round(flight.remainingKm / (flight.speed * 3.6) * 60),
      lastContact: new Date(flight.lastContact * 1000).toISOString()
    }));

  return {
    to: code,
    flights,
    updatedAt: new Date((data?.time ?? Date.now() / 1000) * 1000).toISOString(),
    authenticated: hasCredentials()
  };
}

/** İstanbul'dan code havalimanına giden ve şu an havada olan uçaklar. */
function liveFlightsTo(code) {
  if (!AIRPORTS[code]) throw new OpenSkyError(`${code} havalimanının konumu tanımlı değil`, 404);
  const ttl = hasCredentials() ? LIVE_TTL_MS.authenticated : LIVE_TTL_MS.anonymous;
  return cached(`live:${code}`, ttl, () => findFlights(code));
}

module.exports = { liveFlightsTo, hasCredentials, OpenSkyError };
