/* Azure Functions (Node.js v4 programlama modeli) giriş noktası: her rota bir HTTP fonksiyonu olur. */

const { app } = require("@azure/functions");
const { ROUTES } = require("./routes");

for (const { name, route, handler, method = "GET", maxAge = 60 } of ROUTES) {
  app.http(name, {
    methods: [method],
    authLevel: "anonymous",
    route,
    handler: async (request, context) => {
      try {
        const input = method === "POST" ? await request.json().catch(() => ({})) : undefined;
        const headers = Object.fromEntries(request.headers);
        const ip = (headers["x-azure-clientip"] ?? headers["x-forwarded-for"] ?? "?").split(",")[0].trim();
        const result = await handler(Object.fromEntries(request.query), request.params, input, { headers, ip });
        const { status, body, raw, contentType, cacheControl } = result;
        const fallback = method === "GET" && status === 200 ? `public, max-age=${maxAge}` : "no-store";
        const responseHeaders = { "Cache-Control": cacheControl ?? fallback };
        if (raw) return { status, body: raw, headers: { ...responseHeaders, "Content-Type": contentType } };
        return { status, jsonBody: body, headers: responseHeaders };
      } catch (error) {
        context.error(error);
        return { status: 500, jsonBody: { error: "Sunucu hatası" } };
      }
    }
  });
}
