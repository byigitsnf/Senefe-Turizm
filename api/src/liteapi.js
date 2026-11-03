/* =========================================================
   Oteller — LiteAPI (Nuitee Connect) istemcisi
   https://docs.liteapi.travel/docs/booking-a-room

   Akış: arama (/hotels/rates) → otel ve odalar (/data/hotel + /hotels/rates)
         → ön rezervasyon (/rates/prebook) → rezervasyon (/rates/book)

   Anahtar LITEAPI_KEY ortam değişkeninden okunur; tarayıcıya hiç gitmez.
   Rezervasyon yalnızca sandbox anahtarıyla (sand_…) yapılır ve ödeme
   ACC_CREDIT_CARD ile simüle edilir. Canlı (prod) anahtarla rezervasyon
   ancak LITEAPI_ALLOW_LIVE_BOOKING=true ise açılır, çünkü bu yöntem
   hesaba tanımlı kartı gerçekten tahsil eder.
   ========================================================= */

const SEARCH_URL = "https://api.liteapi.travel/v3.0";
const BOOK_URL = "https://book.liteapi.travel/v3.0";
const TIMEOUT_MS = 15_000;

const CURRENCY = "EUR";
const NATIONALITY = "TR";
const SEARCH_RADIUS_M = 15_000;
const SEARCH_LIMIT = 24;

const SEARCH_TTL_MS = 5 * 60 * 1000;
const HOTEL_TTL_MS = 24 * 60 * 60 * 1000;

const BOARD_NAMES = {
  RO: "Sadece oda",
  BB: "Oda + kahvaltı",
  BI: "Kahvaltı dahil",
  HB: "Yarım pansiyon",
  FB: "Tam pansiyon",
  AI: "Her şey dahil",
  TI: "Her şey dahil"
};

class LiteApiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

const apiKey = () => process.env.LITEAPI_KEY ?? "";
const isConfigured = () => Boolean(apiKey());
const isSandbox = () => apiKey().startsWith("sand_");
const bookingAllowed = () => isSandbox() || process.env.LITEAPI_ALLOW_LIVE_BOOKING === "true";


/* ---------- Önbellek ---------- */

const cache = new Map();

async function cached(key, ttlMs, load) {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.promise;
  if (cache.size > 500) {
    for (const [oldKey, old] of cache) if (old.expires <= Date.now()) cache.delete(oldKey);
  }
  const promise = load();
  cache.set(key, { expires: Date.now() + ttlMs, promise });
  try {
    return await promise;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}


/* ---------- İstekler ---------- */

async function call(base, path, { method = "GET", query, body } = {}) {
  if (!isConfigured()) throw new LiteApiError("Otel servisi henüz yapılandırılmadı (LITEAPI_KEY eksik)", 503);

  const url = new URL(base + path);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);

  const response = await fetch(url, {
    method,
    headers: { "X-API-Key": apiKey(), Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.description ?? data?.error?.message ?? data?.message ?? `LiteAPI ${response.status}`;
    console.warn(`LiteAPI ${method} ${path} → ${response.status}: ${message}`);
    throw new LiteApiError(response.status === 429 ? "Otel servisi şu an yoğun, biraz sonra deneyin" : "Otel servisi isteği yanıtlayamadı", response.status === 429 ? 429 : 502);
  }
  return data;
}


/* ---------- Doğrulama ---------- */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Tarih ve kişi sayısını kontrol eder; hatalıysa 400 döndürülecek mesajı fırlatır. */
function parseStay({ checkin, checkout, adults }) {
  const today = new Date().toISOString().slice(0, 10);
  if (!DATE_PATTERN.test(checkin ?? "") || !DATE_PATTERN.test(checkout ?? "")) throw new LiteApiError("Giriş ve çıkış tarihlerini YYYY-AA-GG biçiminde girin", 400);
  if (checkin < today) throw new LiteApiError("Giriş tarihi geçmişte olamaz", 400);
  const nights = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86_400_000);
  if (nights < 1 || nights > 30) throw new LiteApiError("Konaklama 1 ile 30 gece arasında olmalı", 400);
  const adultCount = Number(adults ?? 2);
  if (!Number.isInteger(adultCount) || adultCount < 1 || adultCount > 6) throw new LiteApiError("Yetişkin sayısı 1 ile 6 arasında olmalı", 400);
  return { checkin, checkout, nights, adults: adultCount };
}

function parseCoords({ lat, lon }) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new LiteApiError("Geçerli bir konum seçin", 400);
  }
  return { latitude: Number(latitude.toFixed(4)), longitude: Number(longitude.toFixed(4)) };
}


/* ---------- Dönüştürme ---------- */

const stripHtml = (html) => (html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const amountOf = (money) => (Array.isArray(money) ? money[0] : money) ?? null;

function rateSummary(offer) {
  const rate = offer.rates?.[0] ?? {};
  const price = amountOf(offer.offerRetailRate) ?? amountOf(rate.retailRate?.total);
  const payAtHotel = (rate.retailRate?.taxesAndFees ?? [])
    .filter((fee) => fee && fee.included === false)
    .reduce((sum, fee) => sum + (fee.amount ?? 0), 0);
  const policy = rate.cancellationPolicies ?? {};
  const firstPenalty = (policy.cancelPolicyInfos ?? []).map((info) => info.cancelTime).filter(Boolean).sort()[0] ?? null;

  return {
    offerId: offer.offerId,
    name: rate.name ?? "Oda",
    board: BOARD_NAMES[rate.boardType] ?? rate.boardName ?? rate.boardType ?? "",
    maxOccupancy: rate.maxOccupancy ?? null,
    price: price ? { amount: Math.round(price.amount * 100) / 100, currency: price.currency } : null,
    payAtHotel: payAtHotel ? Math.round(payAtHotel * 100) / 100 : 0,
    refundable: policy.refundableTag === "RFN",
    freeCancelUntil: policy.refundableTag === "RFN" ? firstPenalty : null
  };
}


/* ---------- İşlemler ---------- */

/** Bir konumun çevresindeki oteller, her biri için en ucuz oda fiyatıyla. */
function searchHotels(query) {
  const stay = parseStay(query);
  const coords = parseCoords(query);
  const key = `search:${coords.latitude},${coords.longitude}:${stay.checkin}:${stay.checkout}:${stay.adults}`;

  return cached(key, SEARCH_TTL_MS, async () => {
    const result = await call(SEARCH_URL, "/hotels/rates", {
      method: "POST",
      body: {
        ...coords,
        radius: SEARCH_RADIUS_M,
        occupancies: [{ adults: stay.adults }],
        currency: CURRENCY,
        guestNationality: NATIONALITY,
        checkin: stay.checkin,
        checkout: stay.checkout,
        maxRatesPerHotel: 1,
        limit: SEARCH_LIMIT,
        timeout: 8
      }
    });

    const details = new Map((result.hotels ?? []).map((hotel) => [hotel.id, hotel]));
    const hotels = (result.data ?? [])
      .map((entry) => {
        const hotel = details.get(entry.hotelId);
        const offers = (entry.roomTypes ?? []).map(rateSummary).filter((offer) => offer.price);
        if (!hotel || !offers.length) return null;
        const cheapest = offers.reduce((a, b) => (a.price.amount <= b.price.amount ? a : b));
        return {
          id: hotel.id,
          name: hotel.name,
          photo: hotel.main_photo || hotel.thumbnail || null,
          address: hotel.address ?? "",
          city: hotel.city_name ?? "",
          stars: hotel.stars ?? null,
          rating: hotel.rating ?? null,
          reviews: hotel.review_count ?? 0,
          price: cheapest.price,
          board: cheapest.board,
          refundable: cheapest.refundable
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.price.amount - b.price.amount);

    return { ...stay, currency: CURRENCY, sandbox: Boolean(result.sandbox ?? isSandbox()), hotels };
  });
}

function hotelContent(id) {
  return cached(`hotel:${id}`, HOTEL_TTL_MS, async () => {
    const { data } = await call(SEARCH_URL, "/data/hotel", { query: { hotelId: id, language: "tr" } });
    if (!data) throw new LiteApiError("Otel bulunamadı", 404);
    return {
      id: data.id,
      name: data.name,
      stars: data.starRating ?? null,
      rating: data.rating ?? null,
      reviews: data.reviewCount ?? 0,
      address: [data.address, data.city].filter(Boolean).join(", "),
      description: stripHtml(data.hotelDescription).slice(0, 900),
      photos: (data.hotelImages ?? []).map((image) => image.urlHd || image.url).filter(Boolean).slice(0, 8),
      facilities: (data.hotelFacilities ?? []).slice(0, 14),
      checkin: data.checkinCheckoutTimes?.checkin_start ?? null,
      checkout: data.checkinCheckoutTimes?.checkout ?? null,
      location: data.location ?? null
    };
  });
}

/** Otel bilgisi ve seçilen tarihlerdeki oda seçenekleri. */
async function getHotel(query, { id }) {
  if (!/^[\w-]{1,40}$/.test(id ?? "")) throw new LiteApiError("Geçersiz otel kodu", 400);
  const stay = parseStay(query);

  const [hotel, rates] = await Promise.all([
    hotelContent(id),
    cached(`rates:${id}:${stay.checkin}:${stay.checkout}:${stay.adults}`, SEARCH_TTL_MS, () =>
      call(SEARCH_URL, "/hotels/rates", {
        method: "POST",
        body: {
          hotelIds: [id],
          occupancies: [{ adults: stay.adults }],
          currency: CURRENCY,
          guestNationality: NATIONALITY,
          checkin: stay.checkin,
          checkout: stay.checkout,
          maxRatesPerHotel: 12,
          timeout: 8
        }
      })
    )
  ]);

  const rooms = (rates.data?.[0]?.roomTypes ?? [])
    .map(rateSummary)
    .filter((room) => room.price)
    .sort((a, b) => a.price.amount - b.price.amount);

  return { ...stay, currency: CURRENCY, hotel, rooms };
}

/** Seçilen odanın fiyatını ve müsaitliğini son kez doğrular. */
async function prebook(body) {
  const offerId = body?.offerId;
  if (typeof offerId !== "string" || offerId.length < 10 || offerId.length > 4000) throw new LiteApiError("Geçersiz oda seçimi", 400);

  const { data } = await call(BOOK_URL, "/rates/prebook", { method: "POST", body: { offerId, usePaymentSdk: false } });
  const rate = data.roomTypes?.[0]?.rates?.[0] ?? {};
  const policy = rate.cancellationPolicies ?? {};
  return {
    prebookId: data.prebookId,
    hotelId: data.hotelId,
    checkin: data.checkin,
    checkout: data.checkout,
    room: rate.name ?? "Oda",
    board: BOARD_NAMES[rate.boardType] ?? rate.boardName ?? "",
    price: { amount: data.price, currency: data.currency },
    priceChanged: Boolean(data.priceDifferencePercent),
    cancellationChanged: Boolean(data.cancellationChanged),
    refundable: policy.refundableTag === "RFN",
    sandbox: isSandbox()
  };
}

/** Ön rezervasyonu kesinleştirir. Ödeme sandbox'ta simüle edilir. */
async function book(body) {
  if (!bookingAllowed()) throw new LiteApiError("Canlı anahtarla rezervasyon kapalı; yalnızca sandbox anahtarıyla deneme yapılabilir", 403);

  const firstName = String(body?.firstName ?? "").trim().slice(0, 60);
  const lastName = String(body?.lastName ?? "").trim().slice(0, 60);
  const email = String(body?.email ?? "").trim().slice(0, 120);
  const prebookId = String(body?.prebookId ?? "");
  if (!/^[\w-]{4,60}$/.test(prebookId)) throw new LiteApiError("Ön rezervasyon bulunamadı, odayı yeniden seçin", 400);
  if (!firstName || !lastName) throw new LiteApiError("Ad ve soyadı girin", 400);
  if (!EMAIL_PATTERN.test(email)) throw new LiteApiError("Geçerli bir e-posta adresi girin", 400);

  const holder = { firstName, lastName, email };
  const { data } = await call(BOOK_URL, "/rates/book", {
    method: "POST",
    body: {
      prebookId,
      clientReference: `SNF-${Date.now().toString(36).toUpperCase()}`,
      holder,
      guests: [{ occupancyNumber: 1, ...holder }],
      payment: { method: "ACC_CREDIT_CARD" }
    }
  });

  return {
    bookingId: data.bookingId,
    status: data.status,
    hotelConfirmationCode: data.hotelConfirmationCode ?? null,
    hotelName: data.hotel?.name ?? "",
    checkin: data.checkin,
    checkout: data.checkout,
    price: { amount: data.price, currency: data.currency },
    sandbox: isSandbox()
  };
}

const hotelsStatus = () => (!isConfigured() ? "kapalı" : isSandbox() ? "sandbox" : "canlı");

module.exports = { searchHotels, getHotel, prebook, book, hotelsStatus, LiteApiError };
