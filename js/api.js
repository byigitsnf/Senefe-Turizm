/* =========================================================
   Şenefe Turizm — canlı veri
   Site açılırken tur verisini API'den (Azure Functions + Cosmos DB) ister.
   API'ye ulaşılamazsa (dosyadan açıldığında, Claude önizlemesinde ya da
   sunucu kapalıyken) data.js içindeki gömülü veriyle devam eder.

   API adresini değiştirmek için index.html'de bu dosyadan önce:
     <script>window.SENEFE_API_BASE = "https://<site>.azurestaticapps.net/api";</script>
   ========================================================= */

const API_BASE = window.SENEFE_API_BASE ?? "/api";
const API_TIMEOUT_MS = 4000;

/**
 * Katalog verisini API'den alıp data.js'teki dizileri yerinde günceller.
 * Döndürdüğü değer verinin kaynağıdır: "cosmos", "memory" (API'nin yerel verisi) ya da "embedded".
 */
async function loadCatalog() {
  if (location.protocol === "file:") return "embedded";

  try {
    const response = await fetch(`${API_BASE}/catalog`, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const catalog = await response.json();
    if (!Array.isArray(catalog.tours) || !catalog.tours.length) throw new Error("API boş tur listesi döndürdü");

    TOURS.splice(0, TOURS.length, ...catalog.tours);
    if (catalog.visaInfo?.length) VISA_INFO.splice(0, VISA_INFO.length, ...catalog.visaInfo);
    if (catalog.flightOperators) Object.assign(FLIGHT_OPERATORS, catalog.flightOperators);
    if (catalog.eurToTry) EUR_TO_TRY = catalog.eurToTry;
    return catalog.source ?? "api";
  } catch (error) {
    console.info(`Canlı veri alınamadı, gömülü veri kullanılıyor (${error.message}).`);
    return "embedded";
  }
}
