/* =========================================================
   OTA Web App — tur rota haritası (Amazon Location Service)
   Tur detayındaki "Rota Haritası" sekmesi: programdaki duraklar ve aralarındaki
   rota. Rota ve harita kendi API'mizden gelir (/api/routes, /api/map); anahtarlar
   sunucudadır. Harita parçası ücretli olduğu için MapLibre ve harita yalnızca
   sekme açılınca yüklenir.

   Deneme özelliğidir. Kapatmak için ROUTE_MAP_ENABLED = false yapın;
   tamamen kaldırmak için README'deki "Rota haritası" bölümüne bakın.
   ========================================================= */

const ROUTE_MAP_ENABLED = true;
const MAPLIBRE_BASE = "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl";

const routeMap = { tourId: null, element: null, map: null, data: null, day: 0, markers: [], error: null };

const VIA_LABELS = { rail: "tren", sea: "deniz", boat: "tekne", walk: "yürüyüş" };

const isDarkTheme = () => document.documentElement.classList.contains("dark");
const mapStyleUrl = () => new URL(`${API_BASE}/map/style/${isDarkTheme() ? "Dark" : "Light"}.json`, location.href).href;


/* ---------- Sekme içeriği ---------- */

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} dk`;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
}

/** Bir günün durakları ve yol bilgisi: "Paris · Louvre — 12 km, ~30 dk yol · tekne" */
function routeDayMeta(day) {
  const data = routeMap.data;
  if (!data) return "";
  const names = [...new Set(data.stops.filter((stop) => stop.day === day).map((stop) => stop.name))];
  const legs = data.legs.filter((leg) => leg.day === day);
  const roadLegs = legs.filter((leg) => leg.via === "road");
  const km = roadLegs.reduce((sum, leg) => sum + leg.km, 0);
  const minutes = roadLegs.reduce((sum, leg) => sum + leg.minutes, 0);
  const others = [...new Set(legs.map((leg) => VIA_LABELS[leg.via]).filter(Boolean))];
  const travel = [
    km >= 1 ? `${Math.round(km).toLocaleString("tr-TR")} km, ~${formatDuration(minutes)} yol` : "",
    ...others
  ].filter(Boolean).join(" · ");
  return `${names.join(" · ")}${travel ? ` — ${travel}` : ""}`;
}

function routeDaysHTML(tour) {
  return tour.days.map((text, index) => {
    const day = index + 1;
    return `
      <li>
        <button type="button" data-route-day="${day}" aria-pressed="${routeMap.day === day}">
          <span>${day}. GÜN</span>
          <div>${text}<small>${routeDayMeta(day)}</small></div>
        </button>
      </li>`;
  }).join("");
}

function routeMapTabHTML(tour) {
  return `
    <div class="route-tab">
      <div id="routeMapSlot"></div>
      <div class="route-legend" aria-hidden="true">
        <span><i class="route-legend__road"></i>Karayolu</span>
        <span><i class="route-legend__other"></i>Tren, deniz, tekne, yürüyüş</span>
      </div>
      <ol class="route-days" id="routeDays">${routeDaysHTML(tour)}</ol>
      <p class="note">Bir güne dokunarak o günün rotasını görün. Rota programa göre yaklaşıktır; kesik çizgiler şematiktir.</p>
    </div>`;
}

function paintRouteDays() {
  const list = $("#routeDays");
  if (list && activeTour) list.innerHTML = routeDaysHTML(activeTour);
}

function showRouteMapMessage(text) {
  routeMap.error = text;
  routeMap.element?.querySelector(".route-map__message")?.remove();
  const message = document.createElement("p");
  message.className = "route-map__message";
  message.textContent = text;
  routeMap.element?.append(message);
}


/* ---------- Harita ---------- */

let mapLibrePromise = null;

/** MapLibre'yi yalnızca ilk haritada, bir kez yükler. */
function loadMapLibre() {
  mapLibrePromise ??= new Promise((resolve, reject) => {
    const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: `${MAPLIBRE_BASE}.css` });
    const script = Object.assign(document.createElement("script"), { src: `${MAPLIBRE_BASE}.js`, onload: resolve });
    script.onerror = () => {
      mapLibrePromise = null;
      reject(new Error("Harita kütüphanesi yüklenemedi"));
    };
    document.head.append(link, script);
  });
  return mapLibrePromise;
}

function routeGeoJSON() {
  return {
    type: "FeatureCollection",
    features: routeMap.data.legs.map((leg) => ({
      type: "Feature",
      properties: { day: leg.day, dashed: leg.via !== "road" },
      geometry: { type: "LineString", coordinates: leg.line }
    }))
  };
}

function addRouteLayers() {
  const { map } = routeMap;
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  const surface = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();

  map.addSource("route", { type: "geojson", data: routeGeoJSON() });
  map.addLayer({
    id: "route-casing",
    type: "line",
    source: "route",
    filter: ["==", ["get", "dashed"], false],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": surface, "line-width": 7 }
  });
  map.addLayer({
    id: "route-road",
    type: "line",
    source: "route",
    filter: ["==", ["get", "dashed"], false],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": accent, "line-width": 4 }
  });
  map.addLayer({
    id: "route-dashed",
    type: "line",
    source: "route",
    filter: ["==", ["get", "dashed"], true],
    paint: { "line-color": accent, "line-width": 3, "line-dasharray": [1.5, 1.5] }
  });
  applyRouteDayStyle();
}

/** Seçili gün öne çıkar, diğerleri soluklaşır; gün seçili değilse hepsi tam görünür. */
function applyRouteDayStyle() {
  const { map, day, markers } = routeMap;
  if (map?.getLayer("route-road")) {
    const opacity = day ? ["case", ["==", ["get", "day"], day], 1, 0.2] : 1;
    for (const layer of ["route-casing", "route-road", "route-dashed"]) map.setPaintProperty(layer, "line-opacity", opacity);
  }
  for (const { element, days } of markers) {
    element.classList.toggle("is-dim", Boolean(day) && !days.includes(day));
  }
}

function createRouteMarkers() {
  const groups = new Map();
  for (const stop of routeMap.data.stops) {
    const key = stop.coords.join(",");
    const group = groups.get(key) ?? { coords: stop.coords, names: new Set(), days: [] };
    group.names.add(stop.name);
    if (!group.days.includes(stop.day)) group.days.push(stop.day);
    groups.set(key, group);
  }

  routeMap.markers = [...groups.values()].map(({ coords, names, days }) => {
    const name = [...names].join(", ");
    const element = Object.assign(document.createElement("button"), {
      type: "button",
      className: "route-pin",
      textContent: days.join(","),
      title: name
    });
    element.setAttribute("aria-label", `${days.join(", ")}. gün: ${name}`);
    element.addEventListener("click", () => selectRouteDay(days[0], { toggle: false }));
    const popup = new maplibregl.Popup({ offset: 16, closeButton: false }).setText(name);
    const marker = new maplibregl.Marker({ element }).setLngLat(coords).setPopup(popup).addTo(routeMap.map);
    return { marker, element, days };
  });
}

/** Seçili günün (gün yoksa tüm rotanın) sınırlarına yaklaşır. */
function fitRouteView({ animate = true } = {}) {
  const { map, data, day } = routeMap;
  if (!map || !data) return;
  const bounds = new maplibregl.LngLatBounds();
  for (const stop of data.stops) if (!day || stop.day === day) bounds.extend(stop.coords);
  for (const leg of data.legs) {
    if (!day || leg.day === day) leg.line.forEach((point) => bounds.extend(point));
  }
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: animate && !reduced ? 700 : 0 });
}

function selectRouteDay(day, { toggle = true } = {}) {
  routeMap.day = toggle && routeMap.day === day ? 0 : day;
  $$("#routeDays [data-route-day]").forEach((button) => {
    button.setAttribute("aria-pressed", Number(button.dataset.routeDay) === routeMap.day);
  });
  applyRouteDayStyle();
  fitRouteView();
}

async function startRouteMap(tour) {
  const isCurrent = () => routeMap.tourId === tour.id;
  try {
    const [response] = await Promise.all([fetch(`${API_BASE}/routes/${encodeURIComponent(tour.id)}`), loadMapLibre()]);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `Rota verisi alınamadı (${response.status})`);
    if (!isCurrent()) return;

    routeMap.data = data;
    paintRouteDays();

    routeMap.map = new maplibregl.Map({
      container: routeMap.element,
      style: mapStyleUrl(),
      center: data.stops[0].coords,
      zoom: 6,
      maxZoom: 16,
      cooperativeGestures: true,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": "Yakınlaştırmak için Ctrl + kaydırma kullanın",
        "CooperativeGesturesHandler.MacHelpText": "Yakınlaştırmak için ⌘ + kaydırma kullanın",
        "CooperativeGesturesHandler.MobileHelpText": "Haritayı hareket ettirmek için iki parmak kullanın"
      }
    });
    routeMap.map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    routeMap.map.on("style.load", addRouteLayers);
    routeMap.map.on("error", ({ error }) => {
      if (error?.status === 503) showRouteMapMessage("Harita bu kurulumda yapılandırılmamış.");
      else if ([401, 403, 429, 502].includes(error?.status)) showRouteMapMessage("Harita şu an yüklenemiyor.");
    });
    createRouteMarkers();
    fitRouteView({ animate: false });
  } catch (error) {
    if (isCurrent()) showRouteMapMessage(error.message);
  }
}

/** Çekmece her çizildiğinde çağrılır: aynı harita korunur, yeni parça istenmez. */
function syncRouteMap() {
  const slot = $("#routeMapSlot");
  if (!slot || !activeTour) return;

  if (routeMap.tourId !== activeTour.id) {
    destroyRouteMap();
    routeMap.tourId = activeTour.id;
    routeMap.element = Object.assign(document.createElement("div"), { className: "route-map" });
    slot.replaceChildren(routeMap.element);
    startRouteMap(activeTour);
    return;
  }

  slot.replaceChildren(routeMap.element);
  routeMap.map?.resize();
}

function destroyRouteMap() {
  routeMap.map?.remove();
  Object.assign(routeMap, { tourId: null, element: null, map: null, data: null, day: 0, markers: [], error: null });
}

// Tema değişince harita da aydınlık/karanlık stile geçer
let routeMapDark = isDarkTheme();
new MutationObserver(() => {
  if (routeMapDark === isDarkTheme()) return;
  routeMapDark = isDarkTheme();
  routeMap.map?.setStyle(mapStyleUrl());
}).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
