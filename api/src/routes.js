/* =========================================================
   API uçları — Azure Functions'tan ve yerel geliştirme sunucusundan
   aynı şekilde çağrılır. Her işleyici { status, body } döndürür.

   GET /api/catalog        Sitenin ihtiyaç duyduğu her şey tek yanıtta
   GET /api/tours          Turlar; ?scope=yurtici|yurtdisi  ?continent=avrupa  ?transport=Gemi
   GET /api/tours/{id}     Tek tur
   GET /api/visa           Vize rehberi
   GET /api/live/{id}      Turun uçuş hattında şu an havada olan İstanbul kalkışlı uçaklar (OpenSky)
   GET /api/health         Hangi veri kaynağının kullanıldığı
   ========================================================= */

const { getStore } = require("./store");
const { liveFlightsTo, hasCredentials, OpenSkyError } = require("./opensky");

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

async function health() {
  return ok({
    status: "ok",
    source: getStore().source,
    opensky: hasCredentials() ? "hesap" : "hesapsız",
    time: new Date().toISOString()
  });
}

/**
 * route: Azure Functions rota şablonu; handler: (query, params) => Promise<{status, body}>
 * maxAge: tarayıcı önbellek süresi (sn), verilmezse 60
 */
const ROUTES = [
  { name: "catalog", route: "catalog", handler: catalog },
  { name: "tours", route: "tours", handler: listTours },
  { name: "tour", route: "tours/{id}", handler: getTour },
  { name: "visa", route: "visa", handler: visa },
  { name: "live", route: "live/{id}", handler: liveFlights, maxAge: 15 },
  { name: "health", route: "health", handler: health }
];

module.exports = { ROUTES };
