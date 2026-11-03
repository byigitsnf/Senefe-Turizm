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
        const { status, body } = await handler(Object.fromEntries(request.query), request.params, input);
        const cacheControl = method === "GET" && status === 200 ? `public, max-age=${maxAge}` : "no-store";
        return { status, jsonBody: body, headers: { "Cache-Control": cacheControl } };
      } catch (error) {
        context.error(error);
        return { status: 500, jsonBody: { error: "Sunucu hatası" } };
      }
    }
  });
}
