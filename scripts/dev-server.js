/* =========================================================
   Yerel geliştirme sunucusu: siteyi ve /api uçlarını aynı adreste sunar.
   Azure Functions Core Tools gerektirmez; Azure'daki fonksiyonlarla aynı
   işleyicileri (api/src/routes.js) kullanır.

   Kullanım:  node scripts/dev-server.js          → http://localhost:7071
   COSMOS_CONNECTION_STRING tanımlıysa veriler Cosmos DB'den, değilse
   api/seed/catalog.json dosyasından gelir.
   ========================================================= */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { ROUTES } = require("../api/src/routes");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 7071;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp"
};

/** "tours/{id}" gibi rota şablonlarını düzenli ifadeye çevirir. */
const compiled = ROUTES.map((route) => ({
  ...route,
  pattern: new RegExp(`^/api/${route.route.replace(/\{(\w+)\}/g, "(?<$1>[^/]+)")}/?$`)
}));

function send(response, status, body, type = MIME_TYPES[".json"]) {
  response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  response.end(type === MIME_TYPES[".json"] ? JSON.stringify(body) : body);
}

async function handleApi(url, response) {
  for (const { pattern, handler } of compiled) {
    const match = url.pathname.match(pattern);
    if (!match) continue;
    try {
      const params = Object.fromEntries(Object.entries(match.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]));
      const { status, body } = await handler(Object.fromEntries(url.searchParams), params);
      return send(response, status, body);
    } catch (error) {
      console.error(error);
      return send(response, 500, { error: "Sunucu hatası" });
    }
  }
  send(response, 404, { error: "Böyle bir API ucu yok" });
}

function serveStatic(url, response) {
  const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.normalize(path.join(ROOT, relative));
  // Yalnızca site dosyaları sunulur; api/ ve scripts/ klasörleri dışarıya kapalı.
  const blocked = !file.startsWith(ROOT) || /[\\/](api|scripts|node_modules)[\\/]/.test(file.slice(ROOT.length));
  if (blocked) return send(response, 404, "Bulunamadı", "text/plain; charset=utf-8");

  fs.readFile(file, (error, data) => {
    if (error) return send(response, 404, "Bulunamadı", "text/plain; charset=utf-8");
    send(response, 200, data, MIME_TYPES[path.extname(file)] ?? "application/octet-stream");
  });
}

http
  .createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method !== "GET") return send(response, 405, { error: "Yalnızca GET" });
    if (url.pathname.startsWith("/api/")) return handleApi(url, response);
    serveStatic(url, response);
  })
  .listen(PORT, () => {
    const source = process.env.COSMOS_CONNECTION_STRING ? "Cosmos DB" : "api/seed/catalog.json";
    console.log(`Şenefe Turizm → http://localhost:${PORT}  (veri: ${source})`);
  });
