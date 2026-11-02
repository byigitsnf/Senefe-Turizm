/* =========================================================
   Static Web Apps'e yüklenecek site dosyalarını dist/ klasörüne kopyalar.
   api/, infra/ ve scripts/ siteyle birlikte yayımlanmasın diye gerekli.

   Kullanım:  node scripts/build-web.js
   ========================================================= */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const SITE_FILES = ["index.html", "staticwebapp.config.json", "css", "js", "images"];

fs.rmSync(DIST, { recursive: true, force: true });
for (const entry of SITE_FILES) {
  const source = path.join(ROOT, entry);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(DIST, entry), { recursive: true });
}
console.log(`Site dosyaları → ${path.relative(ROOT, DIST)}/`);
