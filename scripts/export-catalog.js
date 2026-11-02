/* =========================================================
   js/data.js içeriğini api/seed/catalog.json dosyasına aktarır.
   Bu JSON hem Cosmos DB'ye yüklenen test verisidir hem de API
   Cosmos'a bağlı değilken kullandığı yerel veridir.

   Kullanım:  node scripts/export-catalog.js
   ========================================================= */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "js", "data.js");
const TARGET = path.join(ROOT, "api", "seed", "catalog.json");

// data.js tarayıcı için yazılmış düz bir betik; ayrı bir bağlamda çalıştırıp sabitlerini okuyoruz.
const code = fs.readFileSync(SOURCE, "utf8");
const { EUR_TO_TRY, FLIGHT_OPERATORS, TOURS, VISA_INFO } = vm.runInNewContext(
  `${code}\n;({ EUR_TO_TRY, FLIGHT_OPERATORS, TOURS, VISA_INFO })`,
  {},
  { filename: SOURCE }
);

const catalog = {
  eurToTry: EUR_TO_TRY,
  flightOperators: FLIGHT_OPERATORS,
  visaInfo: VISA_INFO,
  tours: TOURS
};

fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.writeFileSync(TARGET, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`${TOURS.length} tur, ${VISA_INFO.length} vize satırı → ${path.relative(ROOT, TARGET)}`);
