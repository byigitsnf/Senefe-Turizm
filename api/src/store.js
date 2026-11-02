/* =========================================================
   Veri katmanı
   COSMOS_CONNECTION_STRING tanımlıysa Azure Cosmos DB'den okur;
   tanımlı değilse seed/catalog.json dosyasını bellekte kullanır
   (Azure'a bağlanmadan yerelde çalıştırmak için).

   Cosmos DB düzeni (veritabanı: COSMOS_DATABASE, varsayılan "senefe"):
     tours  bölüm anahtarı /scope   her belge bir tur
     meta   bölüm anahtarı /id      "visa-info", "flight-operators", "settings"
   ========================================================= */

const path = require("node:path");
const fs = require("node:fs");

const SEED_FILE = path.join(__dirname, "..", "seed", "catalog.json");
const DATABASE = process.env.COSMOS_DATABASE || "senefe";

/** Cosmos'un belgelere eklediği sistem alanları (_rid, _etag, _ts…) yanıttan çıkarılır. */
const clean = ({ _rid, _self, _etag, _attachments, _ts, ...doc }) => doc;

function createMemoryStore() {
  const catalog = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
  return {
    source: "memory",
    async listTours() { return catalog.tours; },
    async getTour(id) { return catalog.tours.find((tour) => tour.id === id) ?? null; },
    async getMeta() {
      return { visaInfo: catalog.visaInfo, flightOperators: catalog.flightOperators, eurToTry: catalog.eurToTry };
    }
  };
}

function createCosmosStore(connectionString) {
  // Paket yalnızca Cosmos kullanılırken yüklenir; yerel çalıştırma bağımlılık istemez.
  const { CosmosClient } = require("@azure/cosmos");
  const database = new CosmosClient(connectionString).database(DATABASE);
  const tours = database.container("tours");
  const meta = database.container("meta");

  const readMeta = async (id) => (await meta.item(id, id).read()).resource;

  return {
    source: "cosmos",
    async listTours() {
      const { resources } = await tours.items.readAll().fetchAll();
      return resources.map(clean);
    },
    async getTour(id) {
      // Bölüm anahtarı (scope) bilinmediği için id ile sorgulanır.
      const { resources } = await tours.items
        .query({ query: "SELECT * FROM t WHERE t.id = @id", parameters: [{ name: "@id", value: id }] })
        .fetchAll();
      return resources[0] ? clean(resources[0]) : null;
    },
    async getMeta() {
      const [visa, operators, settings] = await Promise.all(
        ["visa-info", "flight-operators", "settings"].map(readMeta)
      );
      return {
        visaInfo: visa?.items ?? [],
        flightOperators: operators?.operators ?? {},
        eurToTry: settings?.eurToTry ?? null
      };
    }
  };
}

let store;

/** Tek bir veri katmanı örneği; Functions ısındıktan sonra bağlantı yeniden kullanılır. */
function getStore() {
  if (!store) {
    const connectionString = process.env.COSMOS_CONNECTION_STRING;
    store = connectionString ? createCosmosStore(connectionString) : createMemoryStore();
  }
  return store;
}

module.exports = { getStore, DATABASE, SEED_FILE };
