/* =========================================================
   Rota haritası — Amazon Location Service
   Anahtarlar yalnızca sunucudadır, tarayıcıya ve depoya girmez:
     AWS_LOCATION_MAP_KEY     geo-maps:GetTile; harita istekleri buradan geçer
     AWS_LOCATION_ROUTE_KEY   geo-routes:CalculateRoutes
     AWS_LOCATION_REGION      İsteğe bağlı, varsayılan eu-north-1

   AWS Hizmet Koşulları 82.4–82.5 gereği:
     - Harita parçaları sunucuda saklanmaz.
     - Rota sonuçları en fazla 30 gün saklanabilir; burada yalnızca bellekte,
       ROUTE_TTL_MS kadar tutulur. Dosyaya ya da depoya yazılmaz.
     - Japonya verisi hiç saklanmaz (bkz. isInJapan).
   ========================================================= */

const { TOUR_STOPS } = require("./tour-stops");

const TIMEOUT_MS = 10_000;
const ROUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SIMPLIFY_TOLERANCE = 0.0008;   // derece, ~80 m
const LEG_BATCH = 4;
const TRAVEL_MODES = { road: "Car", walk: "Pedestrian" };

const region = () => process.env.AWS_LOCATION_REGION || "eu-north-1";
const mapsBase = () => `https://maps.geo.${region()}.amazonaws.com/v2`;
const routesUrl = () => `https://routes.geo.${region()}.amazonaws.com/v2/routes`;

const notConfigured = (name) => ({ status: 503, body: { error: `Harita bu kurulumda yapılandırılmamış (${name} eksik)` } });

/** İsteğin geldiği sitenin adresi, ör. https://site.example */
function siteOrigin(headers = {}) {
  const host = (headers["x-forwarded-host"] ?? headers.host ?? "localhost").split(",")[0].trim();
  const proto = (headers["x-forwarded-proto"] ?? (/^(localhost|127\.)/.test(host) ? "http" : "https")).split(",")[0].trim();
  return `${proto}://${host}`;
}

const amazonHeaders = (context) => ({ Referer: `${siteOrigin(context?.headers)}/` });


/* ---------- Harita ---------- */

/** Stil dosyasını alır; içindeki AWS adreslerini kendi /api/map ucumuza çevirir, anahtarı çıkarır. */
async function mapStyle(scheme, context) {
  const key = process.env.AWS_LOCATION_MAP_KEY;
  if (!key) return notConfigured("AWS_LOCATION_MAP_KEY");

  const response = await fetch(`${mapsBase()}/styles/Standard/descriptor?key=${encodeURIComponent(key)}&color-scheme=${scheme}`, {
    headers: amazonHeaders(context),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) return { status: 502, body: { error: `Harita servisi yanıt vermedi (${response.status})` } };

  const text = (await response.text())
    .split(`${mapsBase()}/`).join(`${siteOrigin(context?.headers)}/api/map/`)
    .replace(/\?key=[^"&]*/g, "");
  if (text.includes(key)) return { status: 502, body: { error: "Harita stili işlenemedi" } };

  return {
    status: 200,
    raw: Buffer.from(text),
    contentType: "application/json; charset=utf-8",
    cacheControl: "private, max-age=3600"
  };
}

/** Yalnızca stilin ihtiyaç duyduğu dosyalar geçer; anahtar sunucuda eklenir. */
const ASSET_PATTERN = /^(tiles\/vector\.basemap\/\d+\/\d+\/\d+|glyphs\/[^/]+\/\d+-\d+\.pbf|styles\/[\w.-]+\/Standard\/\w+\/\w+\/sprites\/sprites(@2x)?\.(json|png))$/;

/** /api/map/style/{Light|Dark} ya da stilin istediği dosyalar: Azure tek rota kuralıyla karşılar. */
async function mapAsset(_query, { path }, _body, context) {
  const style = /^style\/(Light|Dark)$/.exec(path ?? "");
  if (style) return mapStyle(style[1], context);

  const key = process.env.AWS_LOCATION_MAP_KEY;
  if (!key) return notConfigured("AWS_LOCATION_MAP_KEY");
  if (!ASSET_PATTERN.test(path ?? "")) return { status: 404, body: { error: "Bulunamadı" } };

  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${mapsBase()}/${encoded}?key=${encodeURIComponent(key)}`, {
    headers: amazonHeaders(context),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) return { status: response.status === 404 ? 404 : 502, body: { error: "Harita dosyası alınamadı" } };

  return {
    status: 200,
    raw: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    cacheControl: response.headers.get("cache-control") ?? "no-store"
  };
}


/* ---------- Rotalar ---------- */

const round = ([lon, lat]) => [Number(lon.toFixed(5)), Number(lat.toFixed(5))];

/** Douglas-Peucker: şekli bozmadan gereksiz noktaları atar, yanıt küçük kalır. */
function simplify(points) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const length = Math.hypot(bx - ax, by - ay) || 1e-9;
    let farthest = -1;
    let distance = SIMPLIFY_TOLERANCE;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
      if (d > distance) {
        distance = d;
        farthest = i;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = true;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

async function calculateLeg(key, from, to, via) {
  const response = await fetch(`${routesUrl()}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Origin: from, Destination: to, TravelMode: TRAVEL_MODES[via], LegGeometryFormat: "Simple" }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Rota servisi ${response.status}`);
  const route = (await response.json()).Routes?.[0];
  const line = (route?.Legs ?? []).flatMap((leg) => leg.Geometry?.LineString ?? []);
  if (line.length < 2) throw new Error("Rota dönmedi");
  return {
    line: simplify(line.map(round)),
    km: Math.round((route.Summary?.Distance ?? 0) / 100) / 10,
    minutes: Math.round((route.Summary?.Duration ?? 0) / 60)
  };
}

const isInJapan = ([lon, lat]) => lat >= 24 && lat <= 46 && lon >= 122 && lon <= 146;

async function buildTourRoute(rows) {
  const key = process.env.AWS_LOCATION_ROUTE_KEY;
  const stops = rows.map(([day, name, lat, lon]) => ({ day, name, coords: [lon, lat] }));
  let complete = Boolean(key);

  const buildLeg = async (index) => {
    const [day, , , , via = "road", waypoints = []] = rows[index];
    const from = stops[index - 1].coords;
    const to = stops[index].coords;
    const base = { day, from: index - 1, to: index };

    if (!TRAVEL_MODES[via]) return { ...base, via, line: [from, ...waypoints.map(([lat, lon]) => [lon, lat]), to] };
    if (key) {
      try {
        return { ...base, via, ...(await calculateLeg(key, from, to, via)) };
      } catch (error) {
        console.warn(`Rota hesaplanamadı (${stops[index - 1].name} → ${stops[index].name}): ${error.message}`);
        complete = false;
      }
    }
    // Rota alınamazsa harita yine durakları gösterir; bacak kesikli düz çizgi olur.
    return { ...base, via: "estimate", line: [from, to] };
  };

  const legs = [];
  for (let index = 1; index < rows.length; index += LEG_BATCH) {
    const batch = Array.from({ length: Math.min(LEG_BATCH, rows.length - index) }, (_, offset) => buildLeg(index + offset));
    legs.push(...(await Promise.all(batch)));
  }
  return { stops, legs, complete };
}

const routeCache = new Map();

/** Turun durakları ve rotası. Yalnızca bellekte, kısa süreli tutulur. */
async function tourRoute(_query, { id }) {
  const rows = Object.hasOwn(TOUR_STOPS, id) ? TOUR_STOPS[id] : null;
  if (!rows) return { status: 404, body: { error: "Bu turun rotası yok" } };

  const cacheable = !rows.some(([, , lat, lon]) => isInJapan([lon, lat]));
  const headers = { cacheControl: cacheable ? "private, max-age=86400" : "no-store" };

  const cached = routeCache.get(id);
  if (cached && cached.expires > Date.now()) return { status: 200, body: cached.body, ...headers };

  const { complete, ...body } = await buildTourRoute(rows);
  if (!complete) return { status: 200, body, cacheControl: "no-store" };
  if (cacheable) routeCache.set(id, { body, expires: Date.now() + ROUTE_TTL_MS });
  return { status: 200, body, ...headers };
}

const locationStatus = () => ({
  harita: Boolean(process.env.AWS_LOCATION_MAP_KEY),
  rota: Boolean(process.env.AWS_LOCATION_ROUTE_KEY)
});

module.exports = { mapAsset, tourRoute, locationStatus };
