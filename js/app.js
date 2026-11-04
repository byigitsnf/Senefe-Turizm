/* =========================================================
   OTA Web App — uygulama mantığı
   Veriler api.js üzerinden API'den, ulaşılamazsa data.js'ten (TOURS, VISA_INFO, EUR_TO_TRY), harita world-map.js'ten gelir.
   1. Yardımcılar        5. Tur detay paneli ve rezervasyon
   2. Uygulama durumu    6. İletişim, kopyalama, bildirim
   3. Tur hesapları      7. Tema
   4. Listeleme          8. Başlatma
   4a. Arama kutusundaki harita
   4b. Öne çıkan turlar slaytı
   ========================================================= */

"use strict";


/* ---------- 1. Yardımcılar ---------- */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

/** localStorage gizli pencerede ya da engelliyken hata verebilir; sessizce yok say. */
const storage = {
  get(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* depolama kullanılamıyor */
    }
  }
};

const STORAGE_KEYS = { favorites: "ota-favs", theme: "ota-theme" };

const PHONE_PATTERN = /^[0-9 +()-]{10,}$/;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

const TRANSPORT_TYPES = ["Uçak", "Otobüs", "Tren", "Gemi"];
const TRANSPORT_ICONS = { "Uçak": "✈", "Otobüs": "🚌", "Tren": "🚆", "Gemi": "🛳" };
const SCOPE_LABELS = { all: "Tüm turlar", yurtici: "Yurt içi turlar", yurtdisi: "Yurt dışı turlar" };

/** Yurt dışı seçilince açılan kıta sekmeleri; anahtarlar data.js'teki continent değerleriyle aynıdır. */
const CONTINENTS = [
  ["avrupa", "Avrupa"],
  ["asya", "Asya"],
  ["afrika", "Afrika"],
  ["amerika", "Amerika"],
  ["okyanusya", "Okyanusya"]
];
const continentName = (key) => (CONTINENTS.find(([k]) => k === key) || [])[1] || "";

const MAX_BUDGET = 120000;
const CHILD_DISCOUNT = 0.5;       // 2–11 yaş çocuk indirimi
const SINGLE_ROOM_FACTOR = 1.4;   // tek kişilik oda farkı
const DEPOSIT_RATE = 0.3;         // peşinat oranı

const TODAY = new Date().toISOString().slice(0, 10);

function formatMoney(amount, currency) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}

function formatDate(isoDate, options) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("tr-TR", options);
}

const shortDate = (isoDate) => formatDate(isoDate, { day: "2-digit", month: "short" });
const longDate = (isoDate) => formatDate(isoDate, { day: "numeric", month: "short", year: "numeric" });


/* ---------- 2. Uygulama durumu ---------- */

const DEFAULT_FILTERS = {
  scope: "all",
  continent: "",
  query: "",
  month: "",
  duration: "",
  transport: [...TRANSPORT_TYPES],
  mapTransport: "", // haritadaki Uçak/Otobüs/Gemi düğmesi; liste filtreleri haritayı etkilemez
  visaFreeOnly: false,
  budget: MAX_BUDGET,
  favoritesOnly: false
};

const state = {
  ...DEFAULT_FILTERS,
  sort: "date",
  favorites: storage.get(STORAGE_KEYS.favorites, [])
};

/** Açık olan tur ve rezervasyon formunun durumu. */
let activeTour = null;
let booking = null;


/* ---------- 3. Tur hesapları ---------- */

const isFull = (tour, date) => tour.full.includes(date) || date < TODAY;

/** Dolu olmayan en yakın kalkış tarihi; yoksa son tarih. */
function nextDeparture(tour) {
  return tour.dates.find((date) => !isFull(tour, date)) ?? tour.dates[tour.dates.length - 1];
}

/** Bütçe filtresi ve sıralama için ₺ karşılığı. */
function priceInTry(tour) {
  return tour.cur === "EUR" ? tour.price * EUR_TO_TRY : tour.price;
}

function gradientFor(tour) {
  const [from, to] = tour.hue;
  return `linear-gradient(135deg, hsl(${from} 62% 42%), hsl(${to} 68% 30%))`;
}

/** Görsel varsa üstüne okunabilirlik için karartma eklenir; görsel yüklenemezse geçiş görünür. */
function posterBackground(tour) {
  if (!tour.img) return gradientFor(tour);
  return `linear-gradient(180deg, rgba(0,0,0,.2), rgba(0,0,0,.6)), url('${tour.img}') center / cover no-repeat, ${gradientFor(tour)}`;
}

const scopeName = (tour) => (tour.scope === "yurtici" ? "Yurt İçi" : "Yurt Dışı");

/** Uçaklı turun havayolu ve kalkış havalimanı bilgisi; uçuşu olmayan turlarda null. */
const flightOperator = (tour) => (tour.flight ? FLIGHT_OPERATORS[tour.scope] : null);

/** "✈ Pegasus · SAW kalkışlı", "🛳 Cruise · Galataport kalkışlı" ya da "🚌 Otobüs". */
function transportLabel(tour) {
  const icon = TRANSPORT_ICONS[tour.transport];
  const operator = flightOperator(tour);
  if (operator) return `${icon} ${operator.airline} · ${operator.airport} kalkışlı`;
  if (tour.cruise) return `${icon} Cruise · ${tour.cruise.port.split(" ")[0]} kalkışlı`;
  return `${icon} ${tour.transport}`;
}

const addDays = (isoDate, days) =>
  new Date(Date.parse(`${isoDate}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10);

/** Oda seçenekleri; gemi turlarında kabin tipleri kullanılır. factor fiyat çarpanıdır. */
const DEFAULT_ROOM_OPTIONS = [
  { value: "double", label: "Çift kişilik", factor: 1 },
  { value: "single", label: "Tek kişilik (+%40)", factor: SINGLE_ROOM_FACTOR }
];
const roomOptions = (tour) => (tour.cruise ? tour.cruise.cabins : DEFAULT_ROOM_OPTIONS);

function visaBadge(tour) {
  if (tour.scope === "yurtici") return `<span class="badge badge--ok">Yurt içi</span>`;
  if (tour.visa) return `<span class="badge badge--req">${tour.visa}</span>`;
  return `<span class="badge badge--ok">Vizesiz</span>`;
}

function calculatePrice(tour, { adults, children, room }) {
  const option = roomOptions(tour).find((item) => item.value === room);
  const adultUnit = tour.price * (option ? option.factor : 1);
  const childUnit = tour.price * CHILD_DISCOUNT;
  const adultTotal = adults * adultUnit;
  const childTotal = children * childUnit;
  const total = adultTotal + childTotal;
  return { adultUnit, childUnit, adultTotal, childTotal, total, deposit: Math.round(total * DEPOSIT_RATE) };
}


/* ---------- 4. Listeleme ---------- */

/** Arama kutusundaki (harita alanındaki) seçimler: tür, kıta, arama, ay ve süre. */
function matchesSearch(tour) {
  const query = state.query.trim().toLocaleLowerCase("tr");
  const searchable = `${tour.title} ${tour.region} ${tour.to}`.toLocaleLowerCase("tr");

  if (state.scope !== "all" && tour.scope !== state.scope) return false;
  if (state.continent && tour.continent !== state.continent) return false;
  if (query && !searchable.includes(query)) return false;
  if (state.month && !tour.dates.some((date) => date.startsWith(state.month))) return false;
  if (state.duration) {
    const [min, max] = state.duration.split("-").map(Number);
    if (tour.nights < min || tour.nights > max) return false;
  }
  return true;
}

/** Harita yalnızca kendi alanındaki seçimlere uyar; alttaki filtre paneli haritayı değiştirmez. */
const matchesMap = (tour) => matchesSearch(tour) && (!state.mapTransport || tour.transport === state.mapTransport);

function matchesFilters(tour) {
  if (!matchesSearch(tour)) return false;
  if (!state.transport.includes(tour.transport)) return false;
  if (state.visaFreeOnly && tour.visa) return false;
  if (priceInTry(tour) > state.budget) return false;
  if (state.favoritesOnly && !state.favorites.includes(tour.id)) return false;
  return true;
}

const SORTERS = {
  date: (a, b) => nextDeparture(a).localeCompare(nextDeparture(b)),
  priceAsc: (a, b) => priceInTry(a) - priceInTry(b),
  priceDesc: (a, b) => priceInTry(b) - priceInTry(a),
  nights: (a, b) => a.nights - b.nights
};

function getVisibleTours() {
  return TOURS.filter(matchesFilters).sort(SORTERS[state.sort]);
}

function posterHTML(tour, { withFavorite = false, arrivalLabel = "VARIŞ" } = {}) {
  const isFavorite = state.favorites.includes(tour.id);
  const favoriteButton = withFavorite
    ? `<button class="fav-button" type="button" data-fav="${tour.id}" aria-pressed="${isFavorite}" aria-label="Favorilere ekle">${isFavorite ? "♥" : "♡"}</button>`
    : "";

  return `
    <div class="poster" style="background: ${posterBackground(tour)}">
      ${favoriteButton}
      <div class="tags">
        <span class="tag">${scopeName(tour)}</span>
        <span class="tag">${TRANSPORT_ICONS[tour.transport]} ${tour.transport}</span>
      </div>
      <div class="route">
        <div>${tour.from}<small>KALKIŞ</small></div>
        <div class="route__arrow"></div>
        <div>${tour.to}<small>${arrivalLabel}</small></div>
      </div>
    </div>`;
}

/** Kartta başlığın altındaki ulaşım etiketi: uçuş ya da gemi bilgisi. */
function departureChipHTML(tour) {
  const operator = flightOperator(tour);
  if (operator) {
    return `
      <div class="flight-chip">
        <i style="--c: ${operator.color}"></i>
        ${operator.airline} · ${tour.flight.outbound.no}
        <span>${operator.airport} ${tour.flight.outbound.dep} kalkış</span>
      </div>`;
  }
  if (tour.cruise) {
    return `
      <div class="flight-chip flight-chip--cruise">
        <i style="--c: var(--accent)"></i>
        🛳 ${tour.cruise.ship}
        <span>${tour.cruise.port} ${tour.cruise.itinerary[0].depart} kalkış</span>
      </div>`;
  }
  return "";
}

function tourCardHTML(tour) {
  return `
    <article class="ticket" tabindex="0" data-id="${tour.id}" aria-label="${tour.title}">
      ${posterHTML(tour, { withFavorite: true })}
      <div class="perforation"></div>
      <div class="ticket__body">
        <h3>${tour.title}</h3>
        ${departureChipHTML(tour)}
        <div class="meta">
          <span>◷ ${tour.nights} gece ${tour.nights + 1} gün</span>
          <span>⌖ ${tour.region}</span>
          <span>▸ ${shortDate(nextDeparture(tour))}</span>
        </div>
        <div class="price-row">
          <div class="price">${formatMoney(tour.price, tour.cur)}<small>kişi başı, çift kişilik oda</small></div>
          ${visaBadge(tour)}
        </div>
      </div>
    </article>`;
}

function renderTours() {
  const tours = getVisibleTours();

  const emptyMessage = state.continent
    ? `<b>${continentName(state.continent)} için henüz tur yok.</b><br>Yakında yeni programlar eklenecek; başka bir kıtaya göz atın.`
    : `<b>Bu kriterlere uyan tur yok.</b><br>Bütçeyi artırmayı ya da tarih filtresini kaldırmayı deneyin.`;
  $("#tourGrid").innerHTML = tours.length
    ? tours.map(tourCardHTML).join("")
    : `<div class="empty-state">${emptyMessage}</div>`;

  syncTransportControls();
  $("#continentBar").hidden = state.scope !== "yurtdisi";
  $$("#continentBar button").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.continent === state.continent);
  });
  updateMap(TOURS.filter(matchesMap));

  $("#resultCount").innerHTML = `<b>${tours.length}</b> tur listeleniyor`;
  $("#scopeLabel").textContent = state.continent ? `${continentName(state.continent)} turları` : SCOPE_LABELS[state.scope];
  $("#favCount").textContent = state.favorites.length;
  $("#favToggle").setAttribute("aria-pressed", state.favoritesOnly);
  $("#budgetValue").textContent = state.budget >= MAX_BUDGET ? "Sınırsız" : `≤ ${formatMoney(state.budget, "TRY")}`;
  $$(".segmented button").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.scope === state.scope);
  });
}

function renderMonthOptions() {
  const months = [...new Set(TOURS.flatMap((tour) => tour.dates).map((date) => date.slice(0, 7)))].sort();
  const options = months.map((month) => {
    const label = formatDate(`${month}-15`, { month: "long", year: "numeric" });
    return `<option value="${month}">${label}</option>`;
  });
  $("#month").insertAdjacentHTML("beforeend", options.join(""));
}

function renderVisaTable() {
  $("#visaRows").innerHTML = VISA_INFO.map((row) => `
    <tr>
      <td><b>${row.country}</b></td>
      <td><span class="badge ${row.required ? "badge--req" : "badge--ok"}">${row.status}</span></td>
      <td class="mono">${row.duration}</td>
      <td>${row.documents}</td>
      <td class="mono">${row.deadline}</td>
    </tr>`).join("");
}

function toggleFavorite(id) {
  const isFavorite = state.favorites.includes(id);
  state.favorites = isFavorite ? state.favorites.filter((favId) => favId !== id) : [...state.favorites, id];
  storage.set(STORAGE_KEYS.favorites, state.favorites);
  showToast(isFavorite ? "Favorilerden çıkarıldı" : "Favorilere eklendi");
  renderTours();
}

/* Üst menünün açılır pencereleri: hangi turları gösterdiği ve tıklanınca uygulanan filtre */
const NAV_MENUS = {
  yurtici: { filter: (tour) => tour.scope === "yurtici", apply: { scope: "yurtici", transport: null } },
  yurtdisi: { filter: (tour) => tour.scope === "yurtdisi", apply: { scope: "yurtdisi", transport: null }, visaFreeLink: true },
  cruise: { filter: (tour) => tour.transport === "Gemi", apply: { scope: "all", transport: "Gemi" } }
};

function navTourHTML(tour) {
  return `
    <button type="button" class="nav-menu__item" data-tour-id="${tour.id}" role="menuitem">
      <span class="nav-menu__title">${tour.title}</span>
      <span class="nav-menu__meta">${TRANSPORT_ICONS[tour.transport]} ${tour.nights} gece · ${formatMoney(tour.price, tour.cur)}</span>
    </button>`;
}

/** Yurt dışı turları kıtaya göre sütunlara ayırır; diğer menüler tek grup. */
function renderNavMenus() {
  $$(".nav-item").forEach((item) => {
    const key = item.dataset.menu;
    const tours = TOURS.filter(NAV_MENUS[key].filter);

    const groups = key === "yurtdisi"
      ? CONTINENTS
        .map(([continent, label]) => ({ label, tours: tours.filter((tour) => tour.continent === continent) }))
        .filter((group) => group.tours.length)
      : [{ label: "", tours }];

    const groupsHTML = groups.map((group) => `
      <div class="nav-menu__group${groups.length === 1 && group.tours.length > 5 ? " nav-menu__group--wide" : ""}">
        ${group.label ? `<div class="nav-menu__heading">${group.label}</div>` : ""}
        <div class="nav-menu__list">${group.tours.map(navTourHTML).join("")}</div>
      </div>`).join("");

    const visaFreeCount = tours.filter((tour) => !tour.visa).length;
    const visaFreeHTML = NAV_MENUS[key].visaFreeLink && visaFreeCount
      ? `<button type="button" class="nav-menu__visa" data-menu-visa-free>🛂 Vizesiz turlar <small>${visaFreeCount}</small></button>`
      : "";

    item.querySelector(".nav-menu").innerHTML = `
      <div class="nav-menu__panel" role="menu">
        <div class="nav-menu__groups">${groupsHTML}</div>
        <div class="nav-menu__footer">
          ${visaFreeHTML}
          <button type="button" class="nav-menu__all" data-menu-all>Tüm ${tours.length} turu listele →</button>
        </div>
      </div>`;
  });
}

/**
 * Menü başlığına ya da "Tümünü listele"ye tıklanınca listeyi o türe göre süzer;
 * "Vizesiz turlar" aynı süzgece vize gerektirmeyenler koşulunu ekler.
 */
function applyNavMenu(key, { visaFree = false } = {}) {
  const { scope, transport } = NAV_MENUS[key].apply;
  state.scope = scope;
  state.continent = "";
  state.transport = transport ? [transport] : [...TRANSPORT_TYPES];
  state.mapTransport = transport ?? "";
  state.visaFreeOnly = visaFree;
  $("#visaFree").checked = visaFree;
  renderTours();
  document.activeElement.blur();
  $("#turlar").scrollIntoView({ behavior: "smooth" });
}

/** Tür sekmesi değişince kıta seçimi sıfırlanır. */
function setScope(scope) {
  state.scope = scope;
  state.continent = "";
  renderTours();
}

function renderContinentBar() {
  const countFor = (key) => TOURS.filter((tour) => tour.continent === key).length;
  const allIntl = TOURS.filter((tour) => tour.scope === "yurtdisi").length;
  const chip = (key, label, count) =>
    `<button type="button" data-continent="${key}" aria-pressed="false">${label} <small>${count}</small></button>`;

  $("#continentBar").innerHTML = [
    chip("", "Tüm bölgeler", allIntl),
    ...CONTINENTS.map(([key, label]) => chip(key, label, countFor(key)))
  ].join("");
}

function resetFilters() {
  Object.assign(state, DEFAULT_FILTERS);
  $("#q").value = "";
  $("#month").value = "";
  $("#duration").value = "";
  $("#visaFree").checked = false;
  $("#budget").value = MAX_BUDGET;
  renderTours();
}

/**
 * Ulaşım filtresini tek bir türe ayarlar; boş değer ya da zaten seçili olan türe
 * tekrar tıklamak tüm ulaşım türlerini geri getirir.
 */
function setTransport(type) {
  const onlyThis = state.transport.length === 1 && state.transport[0] === type;
  state.transport = !type || onlyThis ? [...TRANSPORT_TYPES] : [type];
  state.mapTransport = !type || onlyThis ? "" : type;
  renderTours();
}

/** Harita alanındaki ulaşım düğmelerini ve filtre panelindeki kutuları duruma göre işaretler. */
function syncTransportControls() {
  $$("#transportBar button").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.transport === state.mapTransport);
  });
  $$('input[name="transport"]').forEach((checkbox) => {
    checkbox.checked = state.transport.includes(checkbox.value);
  });
}

function bindListEvents() {
  $("#tourGrid").addEventListener("click", (event) => {
    const favoriteButton = event.target.closest("[data-fav]");
    if (favoriteButton) {
      toggleFavorite(favoriteButton.dataset.fav);
      return;
    }
    const card = event.target.closest(".ticket");
    if (card) openTour(card.dataset.id);
  });

  $("#tourGrid").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.classList.contains("ticket")) openTour(event.target.dataset.id);
  });

  $$(".segmented button").forEach((button) => {
    button.addEventListener("click", () => setScope(button.dataset.scope));
  });

  // Üst menü: başlığa tıklamak listeyi süzer, açılır penceredeki tura tıklamak turu açar
  $(".main-nav").addEventListener("click", (event) => {
    event.target.closest(".nav-item")?.classList.add("is-closed");
    const tourButton = event.target.closest("[data-tour-id]");
    if (tourButton) {
      document.activeElement.blur(); // açılır pencere kapansın
      openTour(tourButton.dataset.tourId);
      return;
    }
    const link = event.target.closest(".nav-item__link, [data-menu-all], [data-menu-visa-free]");
    if (link) applyNavMenu(link.closest(".nav-item").dataset.menu, { visaFree: link.hasAttribute("data-menu-visa-free") });
  });

  $$(".nav-item").forEach((item) => {
    const reopen = () => item.classList.remove("is-closed");
    item.addEventListener("mouseleave", reopen);
    item.addEventListener("focusin", reopen);
  });

  $("#transportBar").addEventListener("click", (event) => {
    const button = event.target.closest("[data-transport]");
    if (button) setTransport(button.dataset.transport);
  });

  $("#continentBar").addEventListener("click", (event) => {
    const button = event.target.closest("[data-continent]");
    if (!button) return;
    state.continent = button.dataset.continent;
    renderTours();
  });

  $("#searchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    renderTours();
    $("#turlar").scrollIntoView({ behavior: "smooth" });
  });

  $("#q").addEventListener("input", (event) => { state.query = event.target.value; renderTours(); });
  $("#month").addEventListener("change", (event) => { state.month = event.target.value; renderTours(); });
  $("#duration").addEventListener("change", (event) => { state.duration = event.target.value; renderTours(); });
  $("#sort").addEventListener("change", (event) => { state.sort = event.target.value; renderTours(); });
  $("#visaFree").addEventListener("change", (event) => { state.visaFreeOnly = event.target.checked; renderTours(); });
  $("#budget").addEventListener("input", (event) => { state.budget = Number(event.target.value); renderTours(); });

  $$('input[name="transport"]').forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      state.transport = $$('input[name="transport"]:checked').map((input) => input.value);
      renderTours();
    });
  });

  $("#favToggle").addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    renderTours();
    $("#turlar").scrollIntoView({ behavior: "smooth" });
  });

  $("#resetFilters").addEventListener("click", resetFilters);
}


/* ---------- 4a. Arama kutusundaki harita ---------- */

const HOME_CITY = { lat: 41.01, lon: 28.98, label: "İSTANBUL" };

/** createWorldMap'in döndürdüğü kontrol nesnesi (setView, setDimmed). */
let worldMap = null;

/** Haritanın üstünü kapatan sekmeler/açıklama ve alttaki arama alanları; bölge bunların arasına sığdırılır. */
function mapInsets() {
  const form = $("#searchForm").getBoundingClientRect();
  const topElements = [".segmented", ".map-legend", "#transportBar", "#continentBar"]
    .map((selector) => $(selector))
    .filter((element) => !element.hidden);
  const topEdge = Math.max(...topElements.map((element) => element.getBoundingClientRect().bottom));
  return {
    top: topEdge - form.top + 8,
    bottom: form.bottom - $(".search__row").getBoundingClientRect().top + 8
  };
}

function renderMap() {
  const markers = TOURS
    .filter((tour) => tour.coords)
    .map((tour) => ({
      id: tour.id,
      lat: tour.coords[0],
      lon: tour.coords[1],
      kind: tour.scope === "yurtici" ? "domestic" : "intl",
      city: tour.city || "",
      label: `${tour.title}, ${formatMoney(tour.price, tour.cur)}`
    }));

  worldMap = createWorldMap($("#worldMap"), {
    home: HOME_CITY,
    markers,
    insets: mapInsets,
    wheelTarget: $("#searchForm")
  });
}

/** Seçili sekmeye göre yakınlaştırır ve filtre dışındaki turları soluklaştırır. */
function updateMap(visibleTours) {
  if (!worldMap) return;
  let view = "world";
  if (state.scope === "yurtici") view = "turkey";
  if (state.scope === "yurtdisi" && state.continent) view = state.continent;

  const points = view === "world" ? [] : visibleTours
    .filter((tour) => tour.coords)
    .map(({ coords: [lat, lon] }) => [lon, lat]);

  $("#searchForm").classList.toggle("is-zoomed", view !== "world"); // yakın görünümde kutu uzar
  worldMap.setView(view, points);
  worldMap.setDimmed(new Set(visibleTours.map((tour) => tour.id)));
  hideMapTooltip();
}

function showMapTooltip(marker) {
  const tour = TOURS.find((item) => item.id === marker.dataset.id);
  const tooltip = $("#mapTooltip");
  const box = $("#searchForm").getBoundingClientRect();
  const pin = marker.querySelector(".world-map__pin").getBoundingClientRect();

  tooltip.innerHTML = `
    <b>${tour.title}</b>
    <span>${tour.nights} gece · ${formatMoney(tour.price, tour.cur)}'den</span>
    <small>Detay için tıklayın</small>`;
  tooltip.style.left = `${pin.left + pin.width / 2 - box.left}px`;
  tooltip.style.top = `${pin.top - box.top}px`;
  tooltip.hidden = false;

  // Üzerine gelinen tur ve şehri öne çıkar, diğerlerini saydamlaştır
  $("#worldMap svg").classList.add("has-hover");
  $$("#worldMap .world-map__marker").forEach((item) => {
    item.classList.toggle("is-hovered", item === marker);
  });
  $$("#worldMap .world-map__arc").forEach((arc) => {
    arc.classList.toggle("is-active", arc.dataset.id === tour.id);
  });
}

function hideMapTooltip() {
  $("#mapTooltip").hidden = true;
  $("#worldMap svg")?.classList.remove("has-hover");
  $$("#worldMap .is-hovered, #worldMap .world-map__arc.is-active").forEach((element) => {
    element.classList.remove("is-hovered", "is-active");
  });
}

function bindMapEvents() {
  const map = $("#worldMap");
  const markerFrom = (event) => event.target.closest(".world-map__marker");

  map.addEventListener("mouseover", (event) => { const m = markerFrom(event); if (m) showMapTooltip(m); });
  map.addEventListener("mouseout", (event) => {
    const marker = markerFrom(event);
    if (marker && !marker.contains(event.relatedTarget)) hideMapTooltip(); // noktanın içinde gezinirken titremesin
  });
  map.addEventListener("focusin", (event) => { const m = markerFrom(event); if (m) showMapTooltip(m); });
  map.addEventListener("focusout", hideMapTooltip);

  map.addEventListener("click", (event) => {
    const marker = markerFrom(event);
    if (!marker) return;
    hideMapTooltip();
    openTour(marker.dataset.id);
  });

  map.addEventListener("keydown", (event) => {
    const marker = markerFrom(event);
    if (marker && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openTour(marker.dataset.id);
    }
  });
}


/* ---------- 4b. Öne çıkan turlar slaytı ---------- */

const SLIDE_INTERVAL = 3000; // ms; CSS'teki ilerleme çubuğu da bu süreyi kullanır
const SWIPE_THRESHOLD = 40;  // px; dokunmatikte kaydırma sayılacak en kısa mesafe

const carousel = {
  tours: [],
  index: 0,
  timer: null,
  paused: false
};

function slideHTML(tour, index) {
  return `
    <article class="promo__slide" style="background: ${posterBackground(tour)}"
             aria-roledescription="slide" aria-label="${index + 1} / ${carousel.tours.length}: ${tour.title}">
      <div>
        ${tour.promo ? `<span class="promo__label">${tour.promo}</span>` : ""}
        <h3 class="promo__title">${tour.title}</h3>
        <p class="promo__meta">${tour.nights} gece ${tour.nights + 1} gün · ${tour.region} · ${transportLabel(tour)} · İlk kalkış ${shortDate(nextDeparture(tour))}</p>
        <div class="promo__offer">
          <div class="promo__price">${formatMoney(tour.price, tour.cur)}<small>kişi başı, başlayan fiyatlarla</small></div>
          <button class="btn promo__cta" type="button" data-open="${tour.id}">Turu incele →</button>
        </div>
      </div>
      <div class="promo__route" aria-hidden="true">${tour.from} → ${tour.to}<small>${scopeName(tour).toLocaleUpperCase("tr")}</small></div>
    </article>`;
}

function renderCarousel() {
  carousel.tours = TOURS.filter((tour) => tour.featured);
  if (!carousel.tours.length) {
    $("#promo").hidden = true;
    return;
  }

  $("#promo").style.setProperty("--slide-duration", `${SLIDE_INTERVAL}ms`);
  $("#promoTrack").innerHTML = carousel.tours.map(slideHTML).join("");
  $("#promoDots").innerHTML = carousel.tours.map((tour, index) =>
    `<button class="promo__dot" type="button" data-slide="${index}" aria-label="${tour.title}"></button>`
  ).join("");

  goToSlide(0);
  startAutoplay();
}

function goToSlide(index) {
  const count = carousel.tours.length;
  carousel.index = (index + count) % count;

  $("#promoTrack").style.transform = `translateX(-${carousel.index * 100}%)`;

  // Görünmeyen slaytlardaki butonlara klavyeyle ulaşılmasın
  $$(".promo__slide").forEach((slide, i) => {
    slide.inert = i !== carousel.index;
  });

  $$(".promo__dot").forEach((dot, i) => {
    const isActive = i === carousel.index;
    dot.setAttribute("aria-current", isActive);
    dot.classList.remove("is-active");
    if (isActive) {
      void dot.offsetWidth; // ilerleme animasyonunu baştan başlat
      dot.classList.add("is-active");
    }
  });
}

function startAutoplay() {
  stopAutoplay();
  if (carousel.paused || carousel.tours.length < 2) return;
  carousel.timer = setInterval(() => goToSlide(carousel.index + 1), SLIDE_INTERVAL);
}

function stopAutoplay() {
  clearInterval(carousel.timer);
  carousel.timer = null;
}

/** Elle geçişte süre sıfırlanır, böylece yeni slayt tam 3 saniye kalır. */
function showSlide(index) {
  goToSlide(index);
  startAutoplay();
}

function setCarouselPaused(paused) {
  carousel.paused = paused;
  $("#promo").classList.toggle("is-paused", paused);
  if (paused) {
    stopAutoplay();
  } else {
    goToSlide(carousel.index);
    startAutoplay();
  }
}

function bindCarouselEvents() {
  const promo = $("#promo");

  $("#promoPrev").addEventListener("click", () => showSlide(carousel.index - 1));
  $("#promoNext").addEventListener("click", () => showSlide(carousel.index + 1));

  $("#promoDots").addEventListener("click", (event) => {
    const dot = event.target.closest("[data-slide]");
    if (dot) showSlide(Number(dot.dataset.slide));
  });

  $("#promoTrack").addEventListener("click", (event) => {
    const cta = event.target.closest("[data-open]");
    if (cta) openTour(cta.dataset.open);
  });

  // Fare üzerindeyken ya da klavye odağı içerideyken dur
  promo.addEventListener("mouseenter", () => setCarouselPaused(true));
  promo.addEventListener("mouseleave", () => setCarouselPaused(false));
  promo.addEventListener("focusin", () => setCarouselPaused(true));
  promo.addEventListener("focusout", (event) => {
    if (!promo.contains(event.relatedTarget)) setCarouselPaused(false);
  });

  promo.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") showSlide(carousel.index - 1);
    if (event.key === "ArrowRight") showSlide(carousel.index + 1);
  });

  // Dokunmatik kaydırma
  let touchStartX = null;
  promo.addEventListener("touchstart", (event) => { touchStartX = event.touches[0].clientX; }, { passive: true });
  promo.addEventListener("touchend", (event) => {
    if (touchStartX === null) return;
    const distance = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(distance) > SWIPE_THRESHOLD) showSlide(carousel.index + (distance < 0 ? 1 : -1));
    touchStartX = null;
  });

  // Sekme arka plandayken boşuna dönmesin
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoplay();
    else if (!carousel.paused) showSlide(carousel.index);
  });
}


/* ---------- 5. Tur detay paneli ve rezervasyon ---------- */

/** [anahtar, başlık, yalnızca bu alanı olan turlarda göster] */
const DRAWER_TABS = [
  ["program", "Program"],
  ...(ROUTE_MAP_ENABLED ? [["route", "Rota Haritası"]] : []),
  ["flight", "Uçuş", "flight"],
  ["cruise", "Gemi & Limanlar", "cruise"],
  ["included", "Dahil / Hariç"],
  ["visa", "Vize & Belgeler"]
];

function openTour(id) {
  activeTour = TOURS.find((tour) => tour.id === id);
  if (!activeTour) return;

  booking = {
    date: nextDeparture(activeTour),
    adults: 2,
    children: 0,
    room: roomOptions(activeTour)[0].value,
    tab: "program",
    confirmation: null,
    phone: ""
  };

  renderDrawer();
  $("#overlay").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $(".drawer__close")?.focus(), 30);
}

function closeTour() {
  stopLiveTracking();
  destroyRouteMap();
  $("#overlay").hidden = true;
  document.body.style.overflow = "";
  activeTour = null;
}

function programTabHTML(tour) {
  const days = tour.days.map((text, index) => `<li><span>${index + 1}. GÜN</span><div>${text}</div></li>`);
  return `<ol class="days">${days.join("")}</ol>`;
}

function includedTabHTML(tour) {
  const list = (items) => items.map((item) => `<li>${item}</li>`).join("");
  return `
    <div class="included">
      <div><b class="included__yes">✓ Fiyata dahil</b><ul>${list(tour.included)}</ul></div>
      <div><b class="included__no">✕ Hariç</b><ul>${list(tour.excluded)}</ul></div>
    </div>`;
}

function visaTabHTML(tour) {
  if (tour.scope === "yurtici") {
    return `<p>Yurt içi tur: T.C. kimlik kartınız yeterlidir. 18 yaş altı yolcular için veli muvafakatnamesi gerekir.</p>`;
  }
  if (tour.visa) {
    return `<p><b>${tour.visa}</b> gereklidir (örnek bilgi). Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>`;
  }
  const note = tour.idCardOk
    ? "Çipli yeni kimlik kartıyla da seyahat edebilirsiniz."
    : "Pasaportunuzun dönüş tarihinden itibaren en az 6 ay geçerli olması yeterlidir.";
  return `<p><b>Vize gerekmez.</b> ${note}</p>`;
}

function flightLegHTML(label, date, leg, from, to, operator) {
  return `
    <div class="leg">
      <div class="leg__head">
        <span class="leg__label">${label} · ${longDate(date)}</span>
        <span class="leg__airline"><i style="--c: ${operator.color}"></i>${operator.airline} · ${leg.no}</span>
      </div>
      <div class="leg__route">
        <div class="leg__point">
          <b>${leg.dep}</b>
          <span>${from.code}</span>
          <small>${from.name}</small>
        </div>
        <div class="leg__line"><small>${leg.duration} · Direkt</small></div>
        <div class="leg__point leg__point--end">
          <b>${leg.arr}${leg.arrNextDay ? "<sup>+1</sup>" : ""}</b>
          <span>${to.code}</span>
          <small>${to.name}</small>
        </div>
      </div>
    </div>`;
}

/** Seçili kalkış tarihine göre gidiş ve dönüş uçuşları; dönüş, tur süresi kadar sonradır. */
function flightTabHTML(tour) {
  const operator = flightOperator(tour);
  const { outbound, inbound } = tour.flight;
  const home = { code: operator.airport, name: operator.airportName };

  return `
    <div class="flight">
      ${flightLegHTML("GİDİŞ", booking.date, outbound, home, { code: outbound.to, name: outbound.toName }, operator)}
      ${flightLegHTML("DÖNÜŞ", addDays(booking.date, tour.nights), inbound, { code: inbound.from, name: inbound.fromName }, home, operator)}
      <ul class="flight__facts">
        <li><b>Kalkış:</b> ${operator.airportName} (${operator.airport}), ${operator.terminal}</li>
        <li><b>Bagaj:</b> ${operator.baggage}</li>
        <li><b>Buluşma:</b> Kalkıştan ${tour.scope === "yurtici" ? "1,5" : "3"} saat önce havalimanında (örnek bilgi)</li>
      </ul>
      <p class="note">Uçuş numaraları ve saatler örnektir; kesin bilgiler biletiniz düzenlendiğinde bildirilir.</p>
      ${liveTrackingHTML()}
    </div>`;
}

/** Gemi bilgisi ve gün gün liman programı. */
function cruiseTabHTML(tour) {
  const { ship, port, boarding, itinerary } = tour.cruise;
  const rows = itinerary.map((stop, index) => `
    <tr>
      <td class="mono">${shortDate(addDays(booking.date, index))}</td>
      <td><b>${stop.port}</b></td>
      <td class="mono">${stop.arrive || "—"}</td>
      <td class="mono">${stop.depart || "—"}</td>
    </tr>`).join("");

  return `
    <div class="flight">
      <div class="leg">
        <div class="leg__head">
          <span class="leg__label">GEMİ</span>
          <span class="leg__airline"><i style="--c: var(--accent)"></i>🛳 ${ship}</span>
        </div>
        <ul class="flight__facts">
          <li><b>Kalkış limanı:</b> ${port}</li>
          <li><b>Biniş:</b> ${longDate(booking.date)}, ${boarding}; gemi ${itinerary[0].depart}'de hareket eder</li>
          <li><b>Kabin:</b> ${roomOptions(tour).map((option) => option.label.replace(/ \(.*\)/, "")).join(", ")}</li>
        </ul>
      </div>
      <div class="table-wrap">
        <table class="port-table">
          <thead><tr><th>Tarih</th><th>Liman</th><th>Varış</th><th>Kalkış</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="note">Liman saatleri örnektir; hava ve deniz koşullarına göre kaptan tarafından değiştirilebilir.</p>
    </div>`;
}

const TAB_RENDERERS = {
  program: programTabHTML,
  route: routeMapTabHTML,
  flight: flightTabHTML,
  cruise: cruiseTabHTML,
  included: includedTabHTML,
  visa: visaTabHTML
};

function dateChipsHTML(tour) {
  return tour.dates.map((date) => {
    const full = isFull(tour, date);
    return `
      <button type="button" class="chip" data-date="${date}" aria-pressed="${date === booking.date}" ${full ? "disabled" : ""}>
        <b>${shortDate(date)}</b><small>${full ? "Dolu" : "Müsait"}</small>
      </button>`;
  }).join("");
}

function stepperHTML(key, label, value) {
  return `
    <div class="field">
      <label>${label}</label>
      <div class="stepper">
        <button type="button" data-step="${key}" data-delta="-1" aria-label="${label} azalt">−</button>
        <output>${value}</output>
        <button type="button" data-step="${key}" data-delta="1" aria-label="${label} artır">+</button>
      </div>
    </div>`;
}

function priceSummaryHTML(tour) {
  const price = calculatePrice(tour, booking);
  const money = (amount) => formatMoney(amount, tour.cur);

  const childRow = booking.children
    ? `<div><span>${booking.children} çocuk × ${money(price.childUnit)}</span><span>${money(price.childTotal)}</span></div>`
    : "";
  const tryRow = tour.cur === "EUR"
    ? `<div class="summary__small"><span>Yaklaşık ₺ karşılığı (1€ = ${EUR_TO_TRY}₺)</span><span>${formatMoney(price.total * EUR_TO_TRY, "TRY")}</span></div>`
    : "";

  return `
    <div class="summary">
      <div><span>${booking.adults} yetişkin × ${money(price.adultUnit)}</span><span>${money(price.adultTotal)}</span></div>
      ${childRow}
      <div class="summary__total"><span>Toplam</span><span>${money(price.total)}</span></div>
      <div class="summary__muted"><span>Şimdi %${DEPOSIT_RATE * 100} peşinat</span><span>${money(price.deposit)}</span></div>
      ${tryRow}
    </div>`;
}

function bookingFormHTML(tour) {
  return `
    <div>
      <div class="field"><label>Kalkış tarihi</label></div>
      <div class="date-chips">${dateChipsHTML(tour)}</div>
    </div>

    <div class="form-grid">
      ${stepperHTML("adults", "Yetişkin", booking.adults)}
      ${stepperHTML("children", "Çocuk (2–11)", booking.children)}
      <div class="field form-grid__full">
        <label for="bookingRoom">${tour.cruise ? "Kabin tipi" : "Oda tipi"}</label>
        <select class="input" id="bookingRoom">
          ${roomOptions(tour).map((option) =>
            `<option value="${option.value}" ${booking.room === option.value ? "selected" : ""}>${option.label}</option>`
          ).join("")}
        </select>
      </div>
    </div>

    ${priceSummaryHTML(tour)}

    <form id="bookingForm" class="form-grid" novalidate>
      <div class="field"><label for="bookingName">Ad soyad</label><input class="input" id="bookingName" autocomplete="name"></div>
      <div class="field"><label for="bookingPhone">Telefon</label><input class="input" id="bookingPhone" type="tel" placeholder="05xx xxx xx xx" autocomplete="tel"></div>
      <div class="field form-grid__full"><label for="bookingEmail">E-posta</label><input class="input" id="bookingEmail" type="email" autocomplete="email"></div>
      <div class="form-grid__full form-actions">
        <span class="error" id="bookingError"></span>
        <button class="btn" type="submit">Ön rezervasyon yap</button>
      </div>
    </form>`;
}

function bookingSuccessHTML(tour) {
  return `
    <div class="success">
      <div class="eyebrow">Ön rezervasyon alındı</div>
      <div class="success__code">${booking.confirmation}</div>
      <p>${tour.title} · ${longDate(booking.date)}<br>
        Demo: talep hiçbir yere gönderilmedi, sizinle iletişime geçilmeyecek.</p>
      <button class="btn btn--ghost" type="button" data-action="new-booking">Yeni rezervasyon</button>
    </div>`;
}

function renderDrawer() {
  const tour = activeTour;
  const tabs = DRAWER_TABS.filter(([, , requires]) => !requires || tour[requires]).map(([key, label]) =>
    `<button type="button" role="tab" data-tab="${key}" aria-selected="${booking.tab === key}">${label}</button>`
  ).join("");

  $("#drawer").innerHTML = `
    <button class="drawer__close" type="button" aria-label="Kapat">×</button>
    ${posterHTML(tour, { arrivalLabel: tour.region.toLocaleUpperCase("tr") })}
    <div class="drawer__body">
      <div>
        <h2 id="drawerTitle">${tour.title}</h2>
        <p class="drawer__subtitle">${tour.region} · kişi başı <b>${formatMoney(tour.price, tour.cur)}</b>'den başlayan fiyatlarla</p>
      </div>
      <div>
        <div class="tabs" role="tablist">${tabs}</div>
        <div class="tab-panel">${TAB_RENDERERS[booking.tab](tour)}</div>
      </div>
      <div class="booking">
        <h3>Rezervasyon</h3>
        ${booking.confirmation ? bookingSuccessHTML(tour) : bookingFormHTML(tour)}
      </div>
    </div>`;
  syncLiveTracking();
  syncRouteMap();
}

function validateBooking({ name, phone, email }) {
  if (!name) return "Ad soyad girin.";
  if (!PHONE_PATTERN.test(phone)) return "Geçerli bir telefon numarası girin.";
  if (email && !EMAIL_PATTERN.test(email)) return "E-posta adresini kontrol edin.";
  return "";
}

function createConfirmationCode(tour) {
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `OTA-${tour.to}-${random}`;
}

function bindDrawerEvents() {
  const drawer = $("#drawer");

  drawer.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.classList.contains("drawer__close")) {
      closeTour();
      return;
    }
    if (button.dataset.routeDay) {
      selectRouteDay(Number(button.dataset.routeDay));
      return;
    }
    if (button.dataset.tab) booking.tab = button.dataset.tab;
    if (button.dataset.date) booking.date = button.dataset.date;
    if (button.dataset.step) {
      const key = button.dataset.step;
      const min = key === "adults" ? 1 : 0;
      booking[key] = Math.min(9, Math.max(min, booking[key] + Number(button.dataset.delta)));
    }
    if (button.dataset.action === "new-booking") booking.confirmation = null;

    if (button.type === "button") renderDrawer();
  });

  drawer.addEventListener("change", (event) => {
    if (event.target.id === "bookingRoom") {
      booking.room = event.target.value;
      renderDrawer();
    }
  });

  drawer.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = {
      name: $("#bookingName").value.trim(),
      phone: $("#bookingPhone").value.trim(),
      email: $("#bookingEmail").value.trim()
    };
    const error = validateBooking(form);
    if (error) {
      $("#bookingError").textContent = error;
      return;
    }
    booking.phone = form.phone;
    booking.confirmation = createConfirmationCode(activeTour);
    renderDrawer();
  });

  $("#overlay").addEventListener("click", (event) => {
    if (event.target.id === "overlay") closeTour();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeTour) closeTour();
  });
}


/* ---------- 6. İletişim, kopyalama, bildirim ---------- */

let toastTimer;

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2000);
}

function bindContactEvents() {
  $("#contactForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#contactName").value.trim();
    const phone = $("#contactPhone").value.trim();

    if (!name || !PHONE_PATTERN.test(phone)) {
      $("#contactError").textContent = "Ad soyad ve geçerli bir telefon numarası girin.";
      return;
    }
    $("#contactError").textContent = "";
    event.target.reset();
    showToast("Talebiniz alındı (demo)");
  });

  $$("[data-copy]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!navigator.clipboard) {
        showToast("Kopyalanamadı, metni seçip kopyalayın");
        return;
      }
      navigator.clipboard.writeText(button.dataset.copy).then(
        () => showToast("Kopyalandı"),
        () => showToast("Kopyalanamadı, metni seçip kopyalayın")
      );
    });
  });
}


/* ---------- 7. Tema ---------- */

function applyTheme(isDark) {
  document.documentElement.classList.toggle("dark", isDark);

  const themeSwitch = $("#themeSwitch");
  themeSwitch.setAttribute("aria-checked", isDark);
  themeSwitch.querySelector(".theme-switch__knob").textContent = isDark ? "☾" : "☀";
  themeSwitch.querySelector(".theme-switch__label").textContent = isDark ? "Karanlık" : "Aydınlık";

  storage.set(STORAGE_KEYS.theme, isDark ? "dark" : "light");
}

function bindThemeEvents() {
  $("#themeSwitch").addEventListener("click", () => {
    applyTheme(!document.documentElement.classList.contains("dark"));
  });
}


/* ---------- 8. Başlatma ---------- */

async function init() {
  applyTheme(storage.get(STORAGE_KEYS.theme, "light") === "dark");
  document.documentElement.dataset.dataSource = await loadCatalog();

  renderContinentBar();
  renderNavMenus();
  renderMap();
  renderMonthOptions();
  renderVisaTable();
  renderTours();
  renderCarousel();

  bindThemeEvents();
  bindListEvents();
  bindCarouselEvents();
  bindMapEvents();
  bindDrawerEvents();
  bindContactEvents();
}

init();
