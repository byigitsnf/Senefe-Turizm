/* Azure Functions (Node.js v4 programlama modeli) giriş noktası: her rota bir HTTP fonksiyonu olur. */

const { app } = require("@azure/functions");
const { ROUTES } = require("./routes");

for (const { name, route, handler } of ROUTES) {
  app.http(name, {
    methods: ["GET"],
    authLevel: "anonymous",
    route,
    handler: async (request, context) => {
      try {
        const { status, body } = await handler(Object.fromEntries(request.query), request.params);
        return { status, jsonBody: body, headers: { "Cache-Control": "public, max-age=60" } };
      } catch (error) {
        context.error(error);
        return { status: 500, jsonBody: { error: "Sunucu hatası" } };
      }
    }
  });
}
