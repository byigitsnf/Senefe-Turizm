/* =========================================================
   seed/catalog.json içeriğini Azure Cosmos DB'ye yükler (upsert).
   Veritabanı ve kapsayıcılar yoksa oluşturulur; tekrar çalıştırmak güvenlidir.

   Kullanım (api klasöründe):
     $env:COSMOS_CONNECTION_STRING = "<bağlantı dizesi>"   # PowerShell
     npm run seed
   ========================================================= */

const fs = require("node:fs");
const { CosmosClient } = require("@azure/cosmos");
const { DATABASE, SEED_FILE } = require("../src/store");

/** Ücretsiz katmanın sınırı 1000 RU/s; veritabanı düzeyinde paylaşılır. */
const SHARED_THROUGHPUT = 1000;

async function main() {
  const connectionString = process.env.COSMOS_CONNECTION_STRING;
  if (!connectionString) {
    console.error("COSMOS_CONNECTION_STRING tanımlı değil.");
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
  const client = new CosmosClient(connectionString);

  const { database } = await client.databases.createIfNotExists({ id: DATABASE, throughput: SHARED_THROUGHPUT });
  const { container: tours } = await database.containers.createIfNotExists({ id: "tours", partitionKey: { paths: ["/scope"] } });
  const { container: meta } = await database.containers.createIfNotExists({ id: "meta", partitionKey: { paths: ["/id"] } });

  for (const tour of catalog.tours) {
    await tours.items.upsert(tour);
  }

  await meta.items.upsert({ id: "visa-info", items: catalog.visaInfo });
  await meta.items.upsert({ id: "flight-operators", operators: catalog.flightOperators });
  await meta.items.upsert({ id: "settings", eurToTry: catalog.eurToTry });

  // catalog.json'dan çıkarılmış turlar veritabanında da kalmasın
  const ids = new Set(catalog.tours.map((tour) => tour.id));
  const { resources: existing } = await tours.items.query("SELECT t.id, t.scope FROM t").fetchAll();
  const stale = existing.filter((tour) => !ids.has(tour.id));
  for (const tour of stale) {
    await tours.item(tour.id, tour.scope).delete();
  }

  console.log(`${catalog.tours.length} tur yüklendi, ${stale.length} eski tur silindi → ${DATABASE}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
