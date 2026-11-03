/* =========================================================
   Yerel geliştirme sunucusu: siteyi ve /api uçlarını aynı adreste sunar.
   Azure Functions Core Tools gerektirmez; Azure'daki fonksiyonlarla aynı
   işleyicileri (api/src/routes.js) kullanır.

   Kullanım:  node scripts/dev-server.js          → http://localhost:7071
   COSMOS_CONNECTION_STRING tanımlıysa veriler Cosmos DB'den, değilse
   api/seed/catalog.json dosyasından gelir.

   Proje kökündeki .env dosyası (depoya eklenmez) varsa ortam değişkeni
   olarak okunur, ör. LITEAPI_KEY=sand_… satırıyla otel araması açılır.
   ========================================================= */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");

// .env: "AD=değer" satırları; zaten tanımlı değişkenlerin üzerine yazmaz.
const ENV_FILE = path.join(ROOT, ".env");
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const { ROUTES } = require("../api/src/routes");
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

function readJson(request) {
  return new Promise((resolve) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; if (raw.length > 100_000) request.destroy(); });
    request.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
  });
}

async function handleApi(url, request, response) {
  for (const { pattern, handler, method = "GET" } of compiled) {
    const match = url.pathname.match(pattern);
    if (!match || request.method !== method) continue;
    try {
      const params = Object.fromEntries(Object.entries(match.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]));
      const input = method === "POST" ? await readJson(request) : undefined;
      const { status, body } = await handler(Object.fromEntries(url.searchParams), params, input);
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
  // Yalnızca site dosyaları sunulur; api/, scripts/ ve .env gibi nokta ile başlayanlar dışarıya kapalı.
  const blocked = !file.startsWith(ROOT) || /[\\/](api|scripts|node_modules)[\\/]|[\\/]\./.test(file.slice(ROOT.length));
  if (blocked) return send(response, 404, "Bulunamadı", "text/plain; charset=utf-8");

  fs.readFile(file, (error, data) => {
    if (error) return send(response, 404, "Bulunamadı", "text/plain; charset=utf-8");
    send(response, 200, data, MIME_TYPES[path.extname(file)] ?? "application/octet-stream");
  });
}

http
  .createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) return handleApi(url, request, response);
    if (request.method !== "GET") return send(response, 405, { error: "Yalnızca GET" });
    serveStatic(url, response);
  })
  .listen(PORT, () => {
    const source = process.env.COSMOS_CONNECTION_STRING ? "Cosmos DB" : "api/seed/catalog.json";
    console.log(`OTA Web App → http://localhost:${PORT}  (veri: ${source})`);
  });
