/* =========================================================
   Şenefe Turizm — Oteller (LiteAPI sandbox)
   Tur dışında otel araması ve rezervasyonu. Akış:
     arama → otel paneli ve odalar → ön rezervasyon (fiyat doğrulama)
     → misafir bilgisi → rezervasyon onayı
   Veri /api/hotels uçlarından gelir; LiteAPI anahtarı yalnızca sunucudadır.

   Deneme özelliğidir. Kapatmak için HOTELS_ENABLED = false yapın;
   tamamen kaldırmak için README'deki "Oteller" bölümüne bakın.
   ========================================================= */

const HOTELS_ENABLED = true;
const HOTEL_TIMEOUT_MS = 30_000;
const HOTEL_DEFAULT_LEAD_DAYS = 21;
const HOTEL_DEFAULT_NIGHTS = 3;

/** Turlar dışında da aranabilecek şehirler; turların şehirleri bunlara eklenir. */
const EXTRA_HOTEL_CITIES = [
  { city: "İstanbul", coords: [41.0082, 28.9784] },
  { city: "Antalya", coords: [36.8969, 30.7133] }
];

const hotels = {
  destinations: [],
  search: null,       // { key, checkin, checkout, adults }
  results: null,      // API yanıtı
  error: null,
  loading: false,
  requestId: 0,
  view: null          // açık otel paneli: { id, data, error, step, prebook, booking, formError, busy }
};

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

/** Yalnızca https görsel adreslerine izin verir. */
const safeImage = (url) => (typeof url === "string" && /^https:\/\//.test(url) ? escapeHTML(url) : "");

const nightsBetween = (checkin, checkout) => Math.round((Date.parse(checkout) - Date.parse(checkin)) / 864e5);
const starsText = (stars) => (stars ? "★".repeat(Math.min(5, Math.round(stars))) : "");

function moneyHTML(price, { approx = true } = {}) {
  if (!price) return "—";
  const main = formatMoney(price.amount, price.currency);
  const tl = approx && price.currency === "EUR" ? ` <small>≈ ${formatMoney(price.amount * EUR_TO_TRY, "TRY")}</small>` : "";
  return `${main}${tl}`;
}

async function hotelApi(path, body) {
  const options = { signal: AbortSignal.timeout(HOTEL_TIMEOUT_MS) };
  if (body) Object.assign(options, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Sunucu hatası (${response.status})`);
  return data;
}

const errorText = (error) => (error.name === "TimeoutError" ? "Otel servisi zamanında yanıt vermedi, yeniden deneyin" : error.message);


/* ---------- Arama formu ve sonuçlar ---------- */

function buildDestinations() {
  const seen = new Set();
  const list = [];
  for (const { city, coords } of [...EXTRA_HOTEL_CITIES, ...TOURS.filter((tour) => tour.coords && tour.city)]) {
    if (seen.has(city)) continue;
    seen.add(city);
    list.push({ key: city, city, coords });
  }
  return list.sort((a, b) => a.city.localeCompare(b.city, "tr"));
}

function renderHotelForm() {
  const checkin = addDays(TODAY, HOTEL_DEFAULT_LEAD_DAYS);
  $("#hotelDest").innerHTML = hotels.destinations
    .map((dest) => `<option value="${escapeHTML(dest.key)}">${escapeHTML(dest.city)}</option>`)
    .join("");
  Object.assign($("#hotelCheckin"), { min: addDays(TODAY, 1), value: checkin });
  Object.assign($("#hotelCheckout"), { min: addDays(checkin, 1), value: addDays(checkin, HOTEL_DEFAULT_NIGHTS) });
}

function hotelCardHTML(hotel) {
  const photo = safeImage(hotel.photo);
  const nights = nightsBetween(hotels.results.checkin, hotels.results.checkout);
  const rating = hotel.rating ? `<span>⭐ ${hotel.rating.toLocaleString("tr-TR")}${hotel.reviews ? ` (${hotel.reviews.toLocaleString("tr-TR")})` : ""}</span>` : "";

  return `
    <article class="ticket hotel-card" data-hotel="${escapeHTML(hotel.id)}" tabindex="0" role="button" aria-label="${escapeHTML(hotel.name)} odalarını gör">
      <div class="poster hotel-card__photo" ${photo ? `style="background-image: url('${photo}')"` : ""}>
        <div class="tags">
          ${hotel.stars ? `<span class="tag">${starsText(hotel.stars)}</span>` : ""}
          ${hotel.refundable ? `<span class="tag">Ücretsiz iptal</span>` : ""}
        </div>
      </div>
      <div class="ticket__body">
        <h3>${escapeHTML(hotel.name)}</h3>
        <div class="meta">
          ${hotel.address ? `<span>📍 ${escapeHTML(hotel.address)}</span>` : ""}
          ${rating}
        </div>
        <div class="price-row">
          <span class="hotel-card__board">${escapeHTML(hotel.board)}</span>
          <span class="price">${formatMoney(hotel.price.amount, hotel.price.currency)}<small>${nights} gece toplam, en düşük</small></span>
        </div>
      </div>
    </article>`;
}

function renderHotelResults() {
  const status = $("#hotelStatus");
  const grid = $("#hotelGrid");

  if (document.documentElement.dataset.dataSource === "embedded") {
    status.textContent = "Otel araması için sitenin sunucu üzerinden açılması gerekir.";
    grid.innerHTML = "";
    return;
  }
  if (hotels.loading) {
    status.textContent = "Oteller ve güncel fiyatlar aranıyor…";
    grid.innerHTML = "";
    return;
  }
  if (hotels.error) {
    status.textContent = hotels.error;
    grid.innerHTML = "";
    return;
  }
  if (!hotels.results) {
    status.textContent = "";
    grid.innerHTML = "";
    return;
  }

  const { hotels: list, checkin, checkout, adults, sandbox } = hotels.results;
  const destination = hotels.destinations.find((dest) => dest.key === hotels.search.key)?.city ?? "";
  status.innerHTML = list.length
    ? `${escapeHTML(destination)} · ${shortDate(checkin)} – ${shortDate(checkout)} · ${adults} yetişkin: <b>${list.length}</b> otel${sandbox ? ` <span class="hotel-badge">Sandbox</span>` : ""}`
    : `${escapeHTML(destination)} için bu tarihlerde müsait otel bulunamadı. Başka tarih deneyin.`;
  grid.innerHTML = list.map(hotelCardHTML).join("");
}

async function runHotelSearch(search) {
  const destination = hotels.destinations.find((dest) => dest.key === search.key);
  if (!destination) return;

  const requestId = ++hotels.requestId;
  Object.assign(hotels, { search, loading: true, error: null, results: null });
  renderHotelResults();

  const params = new URLSearchParams({
    lat: destination.coords[0],
    lon: destination.coords[1],
    checkin: search.checkin,
    checkout: search.checkout,
    adults: search.adults
  });
  try {
    const results = await hotelApi(`/hotels?${params}`);
    if (requestId !== hotels.requestId) return;
    hotels.results = results;
  } catch (error) {
    if (requestId !== hotels.requestId) return;
    hotels.error = errorText(error);
  }
  hotels.loading = false;
  renderHotelResults();
}


/* ---------- Otel paneli ---------- */

function hotelRoomHTML(room) {
  const cancel = room.refundable
    ? `<span class="hotel-room__ok">✓ Ücretsiz iptal${room.freeCancelUntil ? `: ${longDate(room.freeCancelUntil.slice(0, 10))} tarihine kadar` : ""}</span>`
    : `<span class="hotel-room__no">İade edilemez</span>`;
  const atHotel = room.payAtHotel ? `<small>+ otelde ödenecek ${formatMoney(room.payAtHotel, room.price.currency)}</small>` : "";

  return `
    <li class="hotel-room">
      <div>
        <b>${escapeHTML(room.name)}</b>
        <div class="meta"><span>🍽 ${escapeHTML(room.board || "Belirtilmemiş")}</span>${room.maxOccupancy ? `<span>👤 en fazla ${room.maxOccupancy}</span>` : ""}</div>
        ${cancel}
      </div>
      <div class="hotel-room__buy">
        <span class="price">${formatMoney(room.price.amount, room.price.currency)}</span>
        ${atHotel}
        <button class="btn" type="button" data-offer="${escapeHTML(room.offerId)}" ${hotels.view.busy ? "disabled" : ""}>Seç</button>
      </div>
    </li>`;
}

function hotelCheckoutHTML() {
  const { prebook, formError, busy, guest = {} } = hotels.view;
  return `
    <div class="booking">
      <h3>Rezervasyonu tamamla</h3>
      <div class="summary">
        <div><span>${escapeHTML(prebook.room)}${prebook.board ? ` · ${escapeHTML(prebook.board)}` : ""}</span></div>
        <div><span>${longDate(prebook.checkin)} – ${longDate(prebook.checkout)}</span><span>${nightsBetween(prebook.checkin, prebook.checkout)} gece</span></div>
        <div class="summary__total"><span>Toplam</span><span>${moneyHTML(prebook.price)}</span></div>
        <div class="summary__muted"><span>${prebook.refundable ? "Ücretsiz iptal edilebilir" : "İade edilemez"}</span></div>
      </div>
      ${prebook.priceChanged ? `<p class="hotel-warn">Fiyat, arama sonucundan bu yana değişti; yukarıdaki güncel tutardır.</p>` : ""}
      <form id="hotelBookingForm" class="form-grid" novalidate>
        <div class="field"><label for="hotelFirstName">Ad</label><input class="input" id="hotelFirstName" autocomplete="given-name" value="${escapeHTML(guest.firstName)}"></div>
        <div class="field"><label for="hotelLastName">Soyad</label><input class="input" id="hotelLastName" autocomplete="family-name" value="${escapeHTML(guest.lastName)}"></div>
        <div class="field form-grid__full"><label for="hotelEmail">E-posta</label><input class="input" id="hotelEmail" type="email" autocomplete="email" value="${escapeHTML(guest.email)}"></div>
        <div class="form-grid__full form-actions">
          <span class="error" id="hotelFormError">${escapeHTML(formError ?? "")}</span>
          <button class="btn" type="submit" ${busy ? "disabled" : ""}>${busy ? "Gönderiliyor…" : "Rezervasyonu onayla"}</button>
        </div>
      </form>
      <p class="note">${prebook.sandbox ? "Sandbox: ödeme simüle edilir, gerçek rezervasyon ve tahsilat yapılmaz." : "Bu bir deneme sayfasıdır."}
        <button class="link-button" type="button" data-action="hotel-back">Oda seçimine dön</button></p>
    </div>`;
}

function hotelDoneHTML() {
  const { booking } = hotels.view;
  return `
    <div class="booking success">
      <div class="eyebrow">${booking.sandbox ? "Test rezervasyonu oluşturuldu" : "Rezervasyon oluşturuldu"}</div>
      <div class="success__code">${escapeHTML(booking.bookingId)}</div>
      <p>${escapeHTML(booking.hotelName)} · ${longDate(booking.checkin)} – ${longDate(booking.checkout)}<br>
        Toplam ${moneyHTML(booking.price, { approx: false })}${booking.hotelConfirmationCode ? ` · Otel onay kodu: ${escapeHTML(booking.hotelConfirmationCode)}` : ""}</p>
      <button class="btn btn--ghost" type="button" data-action="hotel-close">Kapat</button>
    </div>`;
}

function renderHotelDrawer() {
  const view = hotels.view;
  const drawer = $("#hotelDrawer");
  if (!view) return;

  if (!view.data) {
    drawer.innerHTML = `
      <button class="drawer__close" type="button" data-action="hotel-close" aria-label="Kapat">×</button>
      <div class="drawer__body"><h2 id="hotelTitle">${escapeHTML(view.name)}</h2>
        <p class="note">${view.error ? escapeHTML(view.error) : "Odalar ve fiyatlar yükleniyor…"}</p></div>`;
    return;
  }

  const { hotel, rooms, checkin, checkout, adults } = view.data;
  const [cover, ...gallery] = hotel.photos.map(safeImage).filter(Boolean);
  const rating = hotel.rating ? ` · ⭐ ${hotel.rating.toLocaleString("tr-TR")}${hotel.reviews ? ` (${hotel.reviews.toLocaleString("tr-TR")} yorum)` : ""}` : "";
  const times = [hotel.checkin && `Giriş ${escapeHTML(hotel.checkin)}`, hotel.checkout && `çıkış ${escapeHTML(hotel.checkout)}`].filter(Boolean).join(", ");

  const step = {
    rooms: () => rooms.length
      ? `<ul class="hotel-rooms">${rooms.map(hotelRoomHTML).join("")}</ul>`
      : `<p class="live__empty">Bu tarihlerde müsait oda kalmadı.</p>`,
    checkout: hotelCheckoutHTML,
    done: hotelDoneHTML
  }[view.step]();

  drawer.innerHTML = `
    <button class="drawer__close" type="button" data-action="hotel-close" aria-label="Kapat">×</button>
    <div class="poster hotel-cover" ${cover ? `style="background-image: url('${cover}')"` : ""}>
      <div class="tags">${hotel.stars ? `<span class="tag">${starsText(hotel.stars)}</span>` : ""}</div>
    </div>
    ${gallery.length ? `<div class="hotel-gallery">${gallery.map((src) => `<img src="${src}" alt="" loading="lazy">`).join("")}</div>` : ""}
    <div class="drawer__body">
      <div>
        <h2 id="hotelTitle">${escapeHTML(hotel.name)}</h2>
        <p class="drawer__subtitle">${escapeHTML(hotel.address)}${rating}</p>
        <p class="drawer__subtitle"><b>${longDate(checkin)} – ${longDate(checkout)}</b> · ${nightsBetween(checkin, checkout)} gece · ${adults} yetişkin</p>
      </div>
      ${view.error ? `<p class="hotel-warn">${escapeHTML(view.error)}</p>` : ""}
      ${step}
      <details class="hotel-about">
        <summary>Otel hakkında</summary>
        ${hotel.description ? `<p>${escapeHTML(hotel.description)}</p>` : ""}
        ${times ? `<p><b>Saatler:</b> ${times}</p>` : ""}
        ${hotel.facilities.length ? `<ul class="hotel-facilities">${hotel.facilities.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>` : ""}
      </details>
    </div>`;
}

async function openHotel(id) {
  const summary = hotels.results?.hotels.find((hotel) => hotel.id === id);
  if (!summary || !hotels.search) return;

  hotels.view = { id, name: summary.name, data: null, error: null, step: "rooms", prebook: null, booking: null, formError: null, busy: false };
  renderHotelDrawer();
  $("#hotelOverlay").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#hotelDrawer .drawer__close")?.focus(), 30);

  const { checkin, checkout, adults } = hotels.search;
  try {
    const data = await hotelApi(`/hotels/${encodeURIComponent(id)}?${new URLSearchParams({ checkin, checkout, adults })}`);
    if (hotels.view?.id === id) hotels.view.data = data;
  } catch (error) {
    if (hotels.view?.id === id) hotels.view.error = errorText(error);
  }
  renderHotelDrawer();
}

function closeHotel() {
  hotels.view = null;
  $("#hotelOverlay").hidden = true;
  document.body.style.overflow = "";
}

async function selectHotelRoom(offerId) {
  const view = hotels.view;
  Object.assign(view, { busy: true, error: null });
  renderHotelDrawer();
  try {
    const prebook = await hotelApi("/hotels/prebook", { offerId });
    if (hotels.view !== view) return;
    Object.assign(view, { prebook, step: "checkout", formError: null });
  } catch (error) {
    if (hotels.view !== view) return;
    view.error = `${errorText(error)}. Başka bir oda seçebilirsiniz.`;
  }
  view.busy = false;
  renderHotelDrawer();
}

async function submitHotelBooking() {
  const view = hotels.view;
  const guest = {
    firstName: $("#hotelFirstName").value.trim(),
    lastName: $("#hotelLastName").value.trim(),
    email: $("#hotelEmail").value.trim()
  };
  const formError = !guest.firstName || !guest.lastName ? "Ad ve soyadı girin."
    : !EMAIL_PATTERN.test(guest.email) ? "Geçerli bir e-posta adresi girin." : "";
  if (formError) {
    $("#hotelFormError").textContent = formError;
    return;
  }

  Object.assign(view, { guest, busy: true, formError: null });
  renderHotelDrawer();

  try {
    const booking = await hotelApi("/hotels/book", { prebookId: view.prebook.prebookId, ...guest });
    if (hotels.view !== view) return;
    Object.assign(view, { booking, step: "done" });
  } catch (error) {
    if (hotels.view !== view) return;
    view.formError = errorText(error);
  }
  view.busy = false;
  renderHotelDrawer();
}


/* ---------- Olaylar ---------- */

function bindHotelEvents() {
  const checkinInput = $("#hotelCheckin");
  const checkoutInput = $("#hotelCheckout");

  checkinInput.addEventListener("change", () => {
    if (!checkinInput.value) return;
    checkoutInput.min = addDays(checkinInput.value, 1);
    if (!checkoutInput.value || checkoutInput.value <= checkinInput.value) {
      checkoutInput.value = addDays(checkinInput.value, HOTEL_DEFAULT_NIGHTS);
    }
  });

  $("#hotelSearch").addEventListener("submit", (event) => {
    event.preventDefault();
    const search = {
      key: $("#hotelDest").value,
      checkin: checkinInput.value,
      checkout: checkoutInput.value,
      adults: Number($("#hotelAdults").value)
    };
    if (!search.checkin || !search.checkout || search.checkout <= search.checkin) {
      $("#hotelStatus").textContent = "Çıkış tarihi giriş tarihinden sonra olmalı.";
      return;
    }
    runHotelSearch(search);
  });

  const grid = $("#hotelGrid");
  grid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-hotel]");
    if (card) openHotel(card.dataset.hotel);
  });
  grid.addEventListener("keydown", (event) => {
    const card = event.target.closest("[data-hotel]");
    if (card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openHotel(card.dataset.hotel);
    }
  });

  const drawer = $("#hotelDrawer");
  drawer.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || !hotels.view) return;
    if (button.dataset.action === "hotel-close") closeHotel();
    else if (button.dataset.action === "hotel-back") {
      Object.assign(hotels.view, { step: "rooms", prebook: null, error: null });
      renderHotelDrawer();
    } else if (button.dataset.offer && !hotels.view.busy) selectHotelRoom(button.dataset.offer);
  });
  drawer.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.target.id === "hotelBookingForm" && !hotels.view?.busy) submitHotelBooking();
  });

  $("#hotelOverlay").addEventListener("click", (event) => {
    if (event.target.id === "hotelOverlay") closeHotel();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && hotels.view) closeHotel();
  });
}

function initHotels() {
  if (!HOTELS_ENABLED) return;
  $("#oteller").hidden = false;
  $("#navHotels").hidden = false;
  hotels.destinations = buildDestinations();
  renderHotelForm();
  renderHotelResults();
  bindHotelEvents();
}

initHotels();
