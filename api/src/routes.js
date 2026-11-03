/* =========================================================
   API uçları — Azure Functions'tan ve yerel geliştirme sunucusundan
   aynı şekilde çağrılır. Her işleyici { status, body } döndürür.

   GET /api/catalog        Sitenin ihtiyaç duyduğu her şey tek yanıtta
   GET /api/tours          Turlar; ?scope=yurtici|yurtdisi  ?continent=avrupa  ?transport=Gemi
   GET /api/tours/{id}     Tek tur
   GET /api/visa           Vize rehberi
   GET /api/live/{id}      Turun uçuş hattında şu an havada olan İstanbul kalkışlı uçaklar (OpenSky)
   GET /api/hotels         Otel arama; ?lat=&lon=&checkin=&checkout=&adults= (LiteAPI)
   GET /api/hotels/{id}    Otel bilgisi ve oda seçenekleri; aynı tarih parametreleriyle
   POST /api/hotels/prebook  { offerId } → fiyat ve müsaitlik doğrulaması
   POST /api/hotels/book     { prebookId, firstName, lastName, email } → rezervasyon (sandbox)
   GET /api/health         Hangi veri kaynağının kullanıldığı
   ========================================================= */

const { getStore } = require("./store");
const { liveFlightsTo, hasCredentials, OpenSkyError } = require("./opensky");
const hotels = require("./liteapi");

const ok = (body) => ({ status: 200, body });
const notFound = (message) => ({ status: 404, body: { error: message } });

const TOUR_FILTERS = ["scope", "continent", "transport"];

async function catalog() {
  const store = getStore();
  const [tours, meta] = await Promise.all([store.listTours(), store.getMeta()]);
  return ok({ source: store.source, tours, ...meta });
}

async function listTours(query) {
  const tours = await getStore().listTours();
  const filtered = tours.filter((tour) =>
    TOUR_FILTERS.every((key) => !query[key] || tour[key] === query[key])
  );
  return ok(filtered);
}

async function getTour(_query, { id }) {
  const tour = await getStore().getTour(id);
  return tour ? ok(tour) : notFound(`"${id}" kodlu tur bulunamadı`);
}

async function visa() {
  const { visaInfo } = await getStore().getMeta();
  return ok(visaInfo);
}

async function liveFlights(_query, { id }) {
  const tour = await getStore().getTour(id);
  if (!tour) return notFound(`"${id}" kodlu tur bulunamadı`);
  const code = tour.flight?.outbound?.to;
  if (!code) return { status: 400, body: { error: "Bu tur uçaklı değil" } };

  try {
    return ok(await liveFlightsTo(code));
  } catch (error) {
    if (!(error instanceof OpenSkyError)) throw error;
    return { status: error.status === 404 ? 404 : 503, body: { error: error.message, retryAfter: error.retryAfter } };
  }
}

/** LiteAPI hatalarını kullanıcıya gösterilecek mesajla döndürür. */
const hotelRoute = (run) => async (query, params, body) => {
  try {
    return ok(await run(query, params, body));
  } catch (error) {
    if (!(error instanceof hotels.LiteApiError)) throw error;
    return { status: error.status, body: { error: error.message } };
  }
};

async function health() {
  return ok({
    status: "ok",
    source: getStore().source,
    opensky: hasCredentials() ? "hesap" : "hesapsız",
    hotels: hotels.hotelsStatus(),
    time: new Date().toISOString()
  });
}

/**
 * route: Azure Functions rota şablonu; handler: (query, params, body) => Promise<{status, body}>
 * method: "GET" (varsayılan) ya da "POST"; POST yanıtları önbelleğe alınmaz
 * maxAge: tarayıcı önbellek süresi (sn), verilmezse 60
 */
const ROUTES = [
  { name: "catalog", route: "catalog", handler: catalog },
  { name: "tours", route: "tours", handler: listTours },
  { name: "tour", route: "tours/{id}", handler: getTour },
  { name: "visa", route: "visa", handler: visa },
  { name: "live", route: "live/{id}", handler: liveFlights, maxAge: 15 },
  { name: "hotelSearch", route: "hotels", handler: hotelRoute(hotels.searchHotels), maxAge: 120 },
  { name: "hotelPrebook", route: "hotels/prebook", method: "POST", handler: hotelRoute((_q, _p, body) => hotels.prebook(body)) },
  { name: "hotelBook", route: "hotels/book", method: "POST", handler: hotelRoute((_q, _p, body) => hotels.book(body)) },
  { name: "hotel", route: "hotels/{id}", handler: hotelRoute(hotels.getHotel), maxAge: 120 },
  { name: "health", route: "health", handler: health }
];

module.exports = { ROUTES };
