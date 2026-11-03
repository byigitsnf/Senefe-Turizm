/* =========================================================
   OTA Web App — etkileşimli noktalı dünya haritası
   Ülke sınırları geo/countries-50m.js'ten (Natural Earth) gelir,
   çizim ve yakınlaştırma d3 + topojson-client ile yapılır.
   Kara, ekrandaki boyuta göre noktalara çevrilir; yakınlaştırınca
   noktalar sıklaşır ve kıyılar ayrıntılı görünür.
   Tıklama ve ipucu davranışı app.js'tedir.
   ========================================================= */

const MAP_BASE_WIDTH = 1000;   // projeksiyonun temel koordinat genişliği
const MAP_DOT_SPACING = 7;     // ekranda noktalar arası mesafe (px)
const MAP_DOT_RADIUS = 2.1;    // ekranda nokta yarıçapı (px)
const MAP_ZOOM_DURATION = 900; // ms

/**
 * Harita görünümleri: [[batı, güney], [doğu, kuzey]] sınırları.
 * fit "cover" alanı doldurur (kenarlar kırpılabilir), "contain" bölgenin tamamını gösterir.
 * overlap: bölgenin üstteki sekmelerin ve alttaki arama alanlarının altına ne kadar
 * taşabileceği (0 = hiç, 1 = tamamen). Türkiye'de turlar kapanmasın diye 0'dır.
 */
const MAP_VIEWS = {
  world: { bounds: [[-168, -56], [180, 80]], fit: "cover", focus: [29, 32] },
  turkey: { bounds: [[25.6, 35.6], [44.9, 42.2]], fit: "contain", overlap: 0 },
  avrupa: { bounds: [[-10, 36], [40, 55]], fit: "contain", overlap: 0.75 },
  asya: { bounds: [[34, 2], [146, 56]], fit: "contain", overlap: 0.8 },
  afrika: { bounds: [[-18, -35], [52, 37]], fit: "contain", overlap: 0.9 },
  amerika: { bounds: [[-168, -55], [-34, 70]], fit: "contain", overlap: 0.9 },
  okyanusya: { bounds: [[112, -47], [179, -2]], fit: "contain", overlap: 0.8 }
};

/** Nokta renklendirmesinde kullanılan bölgeler; "home" Türkiye'dir. */
const MAP_REGIONS = ["americas", "europe", "africa", "asia", "oceania", "home"];

/** Ülkeyi ağırlık merkezine göre kabaca bir bölgeye atar (yalnızca renk için). */
function regionOfCountry(feature) {
  if (feature.properties.name === "Turkey") return "home";
  const [lon, lat] = d3.geoCentroid(feature);
  if (lon < -25) return "americas";
  if (lon >= 110 && lat < -2) return "oceania";
  if (lat >= 35 && lon <= 45) return "europe";
  if (lat < 37 && lon <= 52 && !(lon >= 34 && lat >= 12)) return "africa";
  return "asia";
}

/** İki nokta arasında yukarı doğru kavis yapan uçuş yolu. */
function mapArcPath(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const distance = Math.hypot(dx, dy) || 1;
  const lift = distance * 0.3;

  let nx = dy / distance;
  let ny = -dx / distance;
  if (ny > 0) { nx = -nx; ny = -ny; } // kavis her zaman yukarı baksın

  const cx = (from[0] + to[0]) / 2 + nx * lift;
  const cy = (from[1] + to[1]) / 2 + ny * lift;
  const f = (n) => n.toFixed(2);
  return `M${f(from[0])} ${f(from[1])} Q${f(cx)} ${f(cy)} ${f(to[0])} ${f(to[1])}`;
}

function markerHTML(marker, [x, y]) {
  const pinRadius = marker.kind === "domestic" ? 4 : 5;
  return `
    <g class="world-map__marker world-map__marker--${marker.kind}" data-id="${marker.id}"
       transform="translate(${x.toFixed(2)} ${y.toFixed(2)})" tabindex="0" role="button" aria-label="${marker.label}">
      <g class="world-map__scale">
        <circle class="world-map__hit" r="10"/>
        <circle class="world-map__pin" r="${pinRadius}"/>
        <text class="world-map__city" x="9" y="4">${marker.city}</text>
      </g>
    </g>`;
}

function homeHTML(home, [x, y]) {
  const labelWidth = home.label.length * 7.6 + 16;
  return `
    <g class="world-map__home-group" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})" aria-hidden="true">
      <g class="world-map__scale">
        <circle class="world-map__pulse" r="6"/>
        <circle class="world-map__home" r="4.5"/>
        <g class="world-map__label">
          <path d="M3 -4 L14 -16 L24 -16 Z"/>
          <rect x="10" y="-36" width="${labelWidth}" height="21" rx="5"/>
          <text x="${10 + labelWidth / 2}" y="-21">${home.label}</text>
        </g>
      </g>
    </g>`;
}

/**
 * Haritayı kurar ve kontrol nesnesini döndürür.
 * home:    { lat, lon, label }
 * markers: [{ id, lat, lon, kind: "domestic" | "intl", label, city }]
 * insets:  () => ({ top, bottom }) — haritanın üstünü kapatan alanlar (px); bölge bunların arasına sığdırılır
 * wheelTarget: fare tekerleğiyle yakınlaştırmayı dinleyen öğe (harita tıklamaları geçirdiği için genelde kapsayıcının ebeveyni)
 */
function createWorldMap(container, {
  home,
  markers = [],
  insets = () => ({ top: 0, bottom: 0 }),
  wheelTarget = container.parentElement
}) {
  if (typeof d3 === "undefined" || typeof topojson === "undefined" || typeof WORLD_TOPOLOGY === "undefined") {
    container.hidden = true; // kütüphane yüklenemezse harita gizlenir, site çalışmaya devam eder
    return { setView() {}, setDimmed() {} };
  }

  const projection = d3.geoMercator()
    .scale(MAP_BASE_WIDTH / (2 * Math.PI))
    .translate([MAP_BASE_WIDTH / 2, MAP_BASE_WIDTH / 2]);
  const geoPath = d3.geoPath(projection);

  const countryObject = WORLD_TOPOLOGY.objects.countries;
  const countries = topojson.feature(WORLD_TOPOLOGY, countryObject).features
    .filter((feature) => feature.properties.name !== "Antarctica");
  const borders = topojson.mesh(WORLD_TOPOLOGY, countryObject, (a, b) => a !== b);
  const homeCountry = countries.find((feature) => feature.properties.name === "Turkey");

  const regionShapes = MAP_REGIONS.map((region) => ({
    type: "FeatureCollection",
    features: countries.filter((feature) => regionOfCountry(feature) === region)
  }));

  const homePoint = projection([home.lon, home.lat]);
  const markerPoints = markers.map((marker) => projection([marker.lon, marker.lat]));

  container.innerHTML = `
    <svg focusable="false">
      <g class="world-map__dots" aria-hidden="true"></g>
      <path class="world-map__home-country" d="${geoPath(homeCountry)}" aria-hidden="true"/>
      <path class="world-map__borders" d="${geoPath(borders)}" aria-hidden="true"/>
      <g aria-hidden="true">
        ${markers.map((marker, i) => `<path class="world-map__arc world-map__arc--${marker.kind}" data-id="${marker.id}" d="${mapArcPath(homePoint, markerPoints[i])}"/>`).join("")}
      </g>
      <g>${markers.map((marker, i) => markerHTML(marker, markerPoints[i])).join("")}</g>
      ${homeHTML(home, homePoint)}
    </svg>
    <div class="map-pan">
      <button type="button" class="map-pan__zoom" data-zoom="in" aria-label="Yakınlaştır">+</button>
      <div class="map-pan__track">
        <div class="map-pan__thumb" role="slider" tabindex="0" aria-orientation="vertical"
             aria-label="Haritayı yukarı aşağı kaydır" aria-valuemin="0" aria-valuemax="100"></div>
      </div>
      <button type="button" class="map-pan__zoom" data-zoom="out" aria-label="Uzaklaştır">−</button>
    </div>`;

  const svg = container.querySelector("svg");
  const dotsLayer = svg.querySelector(".world-map__dots");
  const scaleGroups = [...svg.querySelectorAll(".world-map__scale")];
  const panBar = container.querySelector(".map-pan");
  const panTrack = container.querySelector(".map-pan__track");
  const panThumb = container.querySelector(".map-pan__thumb");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Kaydırma ve yakınlaştırmanın sınırı: dünya görünümünün kapsadığı alan
  const [[worldWest, worldSouth], [worldEast, worldNorth]] = MAP_VIEWS.world.bounds;
  const [worldX0, worldY0] = projection([worldWest, worldNorth]);
  const [worldX1, worldY1] = projection([worldEast, worldSouth]);
  const worldRect = { x: worldX0, y: worldY0, w: worldX1 - worldX0, h: worldY1 - worldY0 };

  let currentView = "world";
  let currentPoints = [];
  let measuredSize = ""; // son hesaplamadaki kapsayıcı boyutu; boyut değişmediyse yeniden ölçeklenmez
  let rect = null;      // şu an görünen alan (temel koordinatlarda)
  let frame = null;
  let manualRect = false; // kullanıcı tekerlek ya da çubukla oynadıysa true
  let dotsTimer;

  const containerSize = () => {
    const { width, height } = container.getBoundingClientRect();
    return { width, height };
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  /** Görünen alanı dünya sınırlarının dışına taşırmaz. */
  function clampToWorld(target) {
    const { w, h } = target;
    return {
      x: w >= worldRect.w ? worldRect.x + (worldRect.w - w) / 2 : clamp(target.x, worldRect.x, worldRect.x + worldRect.w - w),
      y: h >= worldRect.h ? worldRect.y + (worldRect.h - h) / 2 : clamp(target.y, worldRect.y, worldRect.y + worldRect.h - h),
      w,
      h
    };
  }

  /**
   * Bir görünümün sınırlarını kapsayıcıya uyan görünür alana çevirir.
   * points ([boylam, enlem] listesi) verilirse bu noktaların hepsi, kontrollerin
   * kapatmadığı boş alana sığacak kadar uzaklaştırılır ve onlara ortalanır.
   */
  function rectForView(name, points = []) {
    const view = MAP_VIEWS[name];
    const { width, height } = containerSize();
    measuredSize = `${width}x${height}`;
    const [[west, south], [east, north]] = view.bounds;
    const [x0, y0] = projection([west, north]);
    const [x1, y1] = projection([east, south]);
    const region = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };

    if (view.fit === "cover") {
      const scale = Math.max(width / region.w, height / region.h);
      const w = width / scale;
      const h = height / scale;
      const [fx, fy] = projection(view.focus);
      return {
        x: clamp(fx - w / 2, region.x, region.x + region.w - w),
        y: clamp(fy - h / 2, region.y, region.y + region.h - h),
        w,
        h
      };
    }

    // contain: bölgeyi üst ve alttaki kontrollerin arasındaki boşluğa sığdır;
    // overlap kadarının kontrollerin altına taşmasına izin ver
    const { top, bottom } = insets();
    const pad = 24;
    const keep = 1 - (view.overlap ?? 0);
    const freeHeight = Math.max(height - top - bottom - pad * 2, height * 0.3);
    const availableWidth = width - pad * 2;
    const availableHeight = Math.min(height - pad * 2, freeHeight + (top + bottom) * (1 - keep));
    let scale = Math.min(availableWidth / region.w, availableHeight / region.h);
    const labelRoom = 110; // şehir adları noktanın sağına yazılır
    const projected = points.map((point) => projection(point));

    // Turların hepsi boş alana sığmıyorsa uzaklaştır
    if (projected.length > 1) {
      const xs = projected.map(([x]) => x);
      const ys = projected.map(([, y]) => y);
      const pointScale = Math.min(
        (availableWidth - labelRoom * 2) / Math.max(Math.max(...xs) - Math.min(...xs), 0.001),
        (freeHeight - 24) / Math.max(Math.max(...ys) - Math.min(...ys), 0.001)
      );
      scale = Math.min(scale, pointScale);
    }

    // Bölgeyi ortala
    const result = {
      x: region.x + region.w / 2 - width / 2 / scale,
      y: region.y + region.h / 2 - (top + pad + freeHeight / 2) / scale,
      w: width / scale,
      h: height / scale
    };

    // Kenarda kalan turlar görünene kadar gerektiği kadar kaydır
    if (projected.length) {
      const screenX = projected.map(([x]) => (x - result.x) * scale);
      const screenY = projected.map(([, y]) => (y - result.y) * scale);
      const box = { left: pad, right: width - labelRoom, top: top + 12, bottom: height - bottom - 12 };
      const shift = (min, max, low, high) => (min < low ? min - low : max > high ? max - high : 0);
      result.x += shift(Math.min(...screenX), Math.max(...screenX), box.left, box.right) / scale;
      result.y += shift(Math.min(...screenY), Math.max(...screenY), box.top, box.bottom) / scale;
    }

    return result;
  }

  function applyRect() {
    const { width } = containerSize();
    svg.setAttribute("viewBox", `${rect.x} ${rect.y} ${rect.w} ${rect.h}`);
    const counterScale = `scale(${(rect.w / width).toFixed(5)})`; // işaretler ekranda hep aynı boyda kalsın
    scaleGroups.forEach((group) => group.setAttribute("transform", counterScale));
    updatePanBar();
  }

  /** Sağdaki çubuğu kontrollerin arasına yerleştirir; tutamaç, görünen alanın dünyadaki yerini gösterir. */
  function updatePanBar() {
    const { top, bottom } = insets();
    panBar.style.top = `${top}px`;
    panBar.style.bottom = `${bottom}px`;

    const trackHeight = panTrack.clientHeight;
    const thumbHeight = Math.max(28, trackHeight * Math.min(1, rect.h / worldRect.h));
    const range = worldRect.h - rect.h;
    const position = range > 0 ? clamp((rect.y - worldRect.y) / range, 0, 1) : 0.5;
    panThumb.style.height = `${thumbHeight}px`;
    panThumb.style.top = `${position * (trackHeight - thumbHeight)}px`;
    panThumb.setAttribute("aria-valuenow", Math.round(position * 100));
  }

  /** Elle yakınlaştırma/kaydırma bittikten kısa süre sonra noktaları yeni ölçekte yeniden çizer. */
  function settleManualChange() {
    manualRect = true;
    svg.classList.toggle("is-zoomed", currentView !== "world" || rect.w < worldRect.w * 0.5);
    clearTimeout(dotsTimer);
    dotsTimer = setTimeout(buildDots, 180);
  }

  /** factor < 1 yakınlaştırır; (anchorX, anchorY) noktası ekranda yerinde kalır. */
  function zoomBy(factor, anchorX, anchorY) {
    cancelAnimationFrame(frame);
    svg.classList.remove("is-moving");
    const { width, height } = containerSize();
    const ax = anchorX ?? width / 2;
    const ay = anchorY ?? height / 2;

    const maxWidth = Math.min(worldRect.w, worldRect.h * (width / height));
    const minWidth = worldRect.w / 60;
    const w = clamp(rect.w * factor, minWidth, maxWidth);
    const h = w * (height / width);
    const pointX = rect.x + (ax / width) * rect.w;
    const pointY = rect.y + (ay / height) * rect.h;

    rect = clampToWorld({ x: pointX - (ax / width) * w, y: pointY - (ay / height) * h, w, h });
    applyRect();
    settleManualChange();
  }

  function panToY(y) {
    cancelAnimationFrame(frame);
    svg.classList.remove("is-moving");
    rect = clampToWorld({ ...rect, y });
    applyRect();
    settleManualChange();
  }

  function bindPanAndZoom() {
    // Haritanın üstündeki kontroller; tekerlek ve sürükleme bunların üzerinde çalışmaz
    const CONTROLS = "input, select, textarea, button, label, .search__row, .chip-row, .segmented, .map-pan";

    // Fare tekerleği: arama alanları ve düğmeler dışında haritayı yakınlaştırır/uzaklaştırır
    wheelTarget.addEventListener("wheel", (event) => {
      if (event.target.closest(CONTROLS)) return;
      event.preventDefault();
      const box = container.getBoundingClientRect();
      zoomBy(Math.exp(event.deltaY * 0.0015), event.clientX - box.left, event.clientY - box.top);
    }, { passive: false });

    // Sol tıkla sürükleme: haritayı her yöne kaydırır. Yalnızca fareyle; dokunmatikte sayfa kaydırılabilsin.
    wheelTarget.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if (event.target.closest(`${CONTROLS}, .world-map__marker`)) return;

      const startX = event.clientX;
      const startY = event.clientY;
      let startRect = null; // sürükleme gerçekten başlayınca alınır

      const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!startRect) {
          if (Math.hypot(dx, dy) < 4) return; // küçük titremeler tıklama sayılır
          cancelAnimationFrame(frame);
          svg.classList.remove("is-moving");
          startRect = { ...rect };
          wheelTarget.classList.add("is-dragging");
          wheelTarget.setPointerCapture(event.pointerId);
        }
        const { width, height } = containerSize();
        rect = clampToWorld({
          ...startRect,
          x: startRect.x - dx * (startRect.w / width),
          y: startRect.y - dy * (startRect.h / height)
        });
        applyRect();
        settleManualChange();
      };

      const onUp = () => {
        wheelTarget.classList.remove("is-dragging");
        wheelTarget.removeEventListener("pointermove", onMove);
        wheelTarget.removeEventListener("pointerup", onUp);
        wheelTarget.removeEventListener("pointercancel", onUp);
      };

      event.preventDefault(); // sürüklerken metin seçilmesin
      wheelTarget.addEventListener("pointermove", onMove);
      wheelTarget.addEventListener("pointerup", onUp);
      wheelTarget.addEventListener("pointercancel", onUp);
    });

    panBar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-zoom]");
      if (button) zoomBy(button.dataset.zoom === "in" ? 0.7 : 1 / 0.7);
    });

    // Tutamacı sürükleme
    panThumb.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      panThumb.setPointerCapture(event.pointerId);
      const startY = event.clientY;
      const startRectY = rect.y;
      const unitsPerPixel = (worldRect.h - rect.h) / Math.max(panTrack.clientHeight - panThumb.offsetHeight, 1);

      const onMove = (moveEvent) => panToY(startRectY + (moveEvent.clientY - startY) * unitsPerPixel);
      const onUp = () => {
        panThumb.removeEventListener("pointermove", onMove);
        panThumb.removeEventListener("pointerup", onUp);
        panThumb.removeEventListener("pointercancel", onUp);
      };
      panThumb.addEventListener("pointermove", onMove);
      panThumb.addEventListener("pointerup", onUp);
      panThumb.addEventListener("pointercancel", onUp);
    });

    // Çubuğun boş yerine tıklayınca o konuma git
    panTrack.addEventListener("pointerdown", (event) => {
      if (event.target !== panTrack) return;
      const box = panTrack.getBoundingClientRect();
      const fraction = (event.clientY - box.top) / box.height;
      panToY(worldRect.y + fraction * worldRect.h - rect.h / 2);
    });

    panThumb.addEventListener("keydown", (event) => {
      const step = { ArrowUp: -0.15, ArrowDown: 0.15 }[event.key];
      if (!step) return;
      event.preventDefault();
      panToY(rect.y + rect.h * step);
    });
  }

  /** Karayı ekran boyutunda bir tuvale çizer ve düzenli aralıklarla örnekleyerek noktalar üretir. */
  function buildDots() {
    const { width, height } = containerSize();
    if (!width || !height) return;

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const scale = width / rect.w;
    context.setTransform(scale, 0, 0, scale, -rect.x * scale, -rect.y * scale);

    const painter = d3.geoPath(projection, context);
    regionShapes.forEach((shape, index) => {
      context.fillStyle = `rgb(${(index + 1) * 40}, 0, 0)`;
      context.beginPath();
      painter(shape);
      context.fill();
    });

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const radius = MAP_DOT_RADIUS / scale;
    const paths = MAP_REGIONS.map(() => []);
    const offset = MAP_DOT_SPACING / 2;

    for (let py = offset; py < canvas.height; py += MAP_DOT_SPACING) {
      for (let px = offset; px < canvas.width; px += MAP_DOT_SPACING) {
        const i = (Math.floor(py) * canvas.width + Math.floor(px)) * 4;
        if (pixels[i + 3] < 128) continue;
        const region = Math.round(pixels[i] / 40) - 1;
        if (region < 0 || region >= MAP_REGIONS.length) continue;
        const x = rect.x + px / scale;
        const y = rect.y + py / scale;
        paths[region].push(`M${(x - radius).toFixed(2)} ${y.toFixed(2)}a${radius.toFixed(3)} ${radius.toFixed(3)} 0 1 0 ${(radius * 2).toFixed(3)} 0a${radius.toFixed(3)} ${radius.toFixed(3)} 0 1 0 ${(-radius * 2).toFixed(3)} 0`);
      }
    }

    dotsLayer.innerHTML = MAP_REGIONS
      .map((region, index) => `<path class="world-map__dots--${region}" d="${paths[index].join("")}"/>`)
      .join("");
  }

  function animateTo(target) {
    cancelAnimationFrame(frame);
    const start = { ...rect };
    const startedAt = performance.now();
    const duration = reduceMotion ? 0 : MAP_ZOOM_DURATION;
    svg.classList.add("is-moving");

    const step = (now) => {
      const t = duration ? Math.min(1, (now - startedAt) / duration) : 1;
      const eased = d3.easeCubicInOut(t);
      rect = {
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        w: start.w + (target.w - start.w) * eased,
        h: start.h + (target.h - start.h) * eased
      };
      applyRect();
      if (t < 1) {
        frame = requestAnimationFrame(step);
      } else {
        buildDots();
        svg.classList.remove("is-moving");
      }
    };
    frame = requestAnimationFrame(step);
  }

  /** points: bu görünümde mutlaka görünmesi gereken turların [boylam, enlem] değerleri. */
  function setView(name, points = []) {
    if (!MAP_VIEWS[name] || (name === currentView && !manualRect)) return;
    manualRect = false; // sekme seçimi elle yapılan yakınlaştırmayı sıfırlar
    clearTimeout(dotsTimer);
    currentView = name;
    currentPoints = points;
    svg.dataset.view = name;
    svg.classList.toggle("is-zoomed", name !== "world");
    animateTo(rectForView(name, points));
  }

  function setDimmed(visibleIds) {
    svg.querySelectorAll("[data-id]").forEach((element) => {
      element.classList.toggle("is-dim", !visibleIds.has(element.dataset.id));
    });
  }

  // İlk çizim ve pencere boyutu değiştikçe yeniden ölçekleme
  svg.dataset.view = currentView;
  rect = rectForView(currentView);
  applyRect();
  buildDots();

  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const { width, height } = containerSize();
      if (`${width}x${height}` === measuredSize) return; // yakınlaştırma zaten yeni boyuta göre hesaplandı
      cancelAnimationFrame(frame);
      manualRect = false;
      rect = rectForView(currentView, currentPoints);
      applyRect();
      buildDots();
      svg.classList.remove("is-moving");
    }, 120);
  }).observe(container);

  bindPanAndZoom();

  return { setView, setDimmed };
}
