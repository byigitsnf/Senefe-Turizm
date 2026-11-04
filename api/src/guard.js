/* =========================================================
   Ücretli ya da kotalı servislere giden uçların koruması:
   yalnızca sitenin kendi sayfalarından gelen istekler kabul edilir ve
   IP başına dakikalık istek sınırı uygulanır.

   Başka bir sitede, başka bir kurulumda ya da betikle bu sunucunun
   anahtarlarını kullanmayı zorlaştırır. Tarayıcı dışından taklit edilebildiği
   için tek başına güvence değildir: asıl sınır istek sayacı ve servis
   tarafındaki bütçe uyarısıdır. Sayaç sunucu örneği başınadır, yaklaşıktır.
   ========================================================= */

const WINDOW_MS = 60_000;
const counters = new Map();

function isSameSite(headers) {
  const fetchSite = headers["sec-fetch-site"];
  if (fetchSite) return fetchSite === "same-origin";

  const host = (headers["x-forwarded-host"] ?? headers.host ?? "").split(",")[0].trim();
  const source = headers.origin ?? headers.referer;
  if (!host || !source) return false;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

function overLimit(key, perMinute) {
  const now = Date.now();
  if (counters.size > 5000) {
    for (const [oldKey, entry] of counters) if (entry.resets <= now) counters.delete(oldKey);
  }
  const entry = counters.get(key);
  if (!entry || entry.resets <= now) {
    counters.set(key, { count: 1, resets: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > perMinute;
}

/** İşleyiciyi korumaya alır; handler: (query, params, body, context) => Promise<{status, body}> */
function protect(name, perMinute, handler) {
  return async (query, params, body, context) => {
    const { headers = {}, ip = "?" } = context ?? {};
    if (!isSameSite(headers)) return { status: 403, body: { error: "Bu uç yalnızca sitenin kendisinden kullanılabilir" } };
    if (overLimit(`${name}:${ip}`, perMinute)) return { status: 429, body: { error: "Çok fazla istek, biraz sonra deneyin" } };
    return handler(query, params, body, context);
  };
}

module.exports = { protect };
