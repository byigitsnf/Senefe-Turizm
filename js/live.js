/* =========================================================
   OTA Web App — anlık uçuş takibi
   Tur detayındaki Uçuş sekmesinde, turun uçuş hattında şu an havada olan
   İstanbul kalkışlı uçakları gösterir. Veri /api/live/{tur} ucundan
   (OpenSky Network) gelir; sekme açıkken 30 saniyede bir yenilenir.

   Deneme özelliğidir (placeholder API çalışması). Kapatmak için
   LIVE_TRACKING_ENABLED = false yapın; tamamen kaldırmak için README'deki
   "Anlık uçuş takibi" bölümünde anlatılan git revert komutunu kullanın.
   ========================================================= */

const LIVE_TRACKING_ENABLED = true;
const LIVE_REFRESH_MS = 30_000;
const LIVE_TIMEOUT_MS = 20_000;

const live = { tourId: null, data: null, error: null, timer: null };

const TR_TIME = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const formatNumber = (value) => value.toLocaleString("tr-TR");

function liveTrackingHTML() {
  if (!LIVE_TRACKING_ENABLED) return "";
  return `<section class="live" id="liveTracking" aria-live="polite">${liveBodyHTML(activeTour)}</section>`;
}

function liveFlightHTML(flight, tour) {
  const percent = Math.round(flight.progress * 100);
  const eta = TR_TIME.format(Date.now() + flight.etaMinutes * 60_000);
  const departed = flight.departedAt ? `Kalkış ${TR_TIME.format(new Date(flight.departedAt))} · ` : "";
  const climbing = flight.verticalRate > 2 ? " ↗" : flight.verticalRate < -2 ? " ↘" : "";
  const airline = flight.airline
    ? `<span class="leg__airline"><i style="--c: ${flight.color}"></i>${flight.airline}</span>`
    : `<span class="live__country">${flight.country}</span>`;

  return `
    <li class="live__flight">
      <div class="live__head">
        <b class="mono">${flight.callsign}</b>
        ${airline}
        ${flight.routeConfirmed ? "" : `<span class="live__tag" title="Hat, konum ve yöne göre tahmin edildi">tahmini</span>`}
        <span class="live__stats mono">${flight.altitude == null ? "—" : `${formatNumber(flight.altitude)} m`}${climbing} · ${formatNumber(flight.speed)} km/sa</span>
      </div>
      <div class="live__track">
        <span class="mono">${flight.from ?? "IST"}</span>
        <div class="live__bar" style="--p: ${percent}%"><span class="live__plane" aria-hidden="true">✈</span></div>
        <span class="mono">${tour.flight.outbound.to}</span>
      </div>
      <small class="live__meta">${departed}%${percent} tamamlandı · kalan ${formatNumber(flight.remainingKm)} km · tahmini iniş ~${eta} (TSİ)</small>
    </li>`;
}

function liveBodyHTML(tour) {
  const { outbound } = tour.flight;
  const title = `
    <div class="live__title">
      <span class="live__dot" aria-hidden="true"></span>
      <b>Anlık uçuş takibi</b>
      <span class="live__route">İstanbul → ${outbound.toName}</span>
    </div>`;

  if (!SERVED_FROM_SERVER) {
    return `${title}<p class="note">Canlı uçuş verisi için sitenin sunucu üzerinden açılması gerekir.</p>`;
  }
  const current = live.tourId === tour.id;
  const data = current ? live.data : null;
  const error = current ? live.error : null;
  if (!data && !error) {
    return `${title}<p class="note">Hattaki uçaklar aranıyor…</p>`;
  }
  if (!data) {
    return `${title}<p class="note">Şu an canlı veri alınamıyor (${error}). Birazdan yeniden denenecek.</p>`;
  }

  const { flights, updatedAt } = data;
  const seconds = Math.max(0, Math.round((Date.now() - new Date(updatedAt)) / 1000));
  const list = flights.length
    ? `<ul class="live__list">${flights.map((flight) => liveFlightHTML(flight, tour)).join("")}</ul>`
    : `<p class="live__empty">Şu an bu hatta havada İstanbul kalkışlı uçak görünmüyor.</p>`;

  return `
    ${title}
    <p class="live__summary">Şu an havada <b>${flights.length}</b> uçak · ${seconds} sn önce güncellendi${error ? " · son yenileme başarısız" : ""}</p>
    ${list}
    <p class="note">Veri: <a href="https://opensky-network.org" target="_blank" rel="noopener">The OpenSky Network</a> (ADS-B).
      Uçağın İstanbul'dan kalktığı canlı izinden doğrulanır; hattı konum ve yönden tahmin edilir.
      Kapsama dışındaki bölgelerde uçaklar görünmeyebilir. Tur uçuşunuzu göstermez.</p>`;
}

function paintLiveTracking() {
  const panel = $("#liveTracking");
  if (panel && activeTour) panel.innerHTML = liveBodyHTML(activeTour);
}

async function refreshLiveTracking() {
  clearTimeout(live.timer);
  const tourId = live.tourId;
  if (!tourId) return;

  if (!document.hidden) {
    try {
      const response = await fetch(`${API_BASE}/live/${encodeURIComponent(tourId)}`, { signal: AbortSignal.timeout(LIVE_TIMEOUT_MS) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `API ${response.status}`);
      if (live.tourId !== tourId) return;
      live.data = body;
      live.error = null;
    } catch (error) {
      if (live.tourId !== tourId) return;
      live.error = error.name === "TimeoutError" ? "zaman aşımı" : error.message;
    }
    paintLiveTracking();
  }
  live.timer = setTimeout(refreshLiveTracking, LIVE_REFRESH_MS);
}

/** Çekmece her çizildiğinde çağrılır: takip paneli görünüyorsa yenilemeyi başlatır, değilse durdurur. */
function syncLiveTracking() {
  const visible = Boolean($("#liveTracking")) && SERVED_FROM_SERVER;
  if (!visible) return stopLiveTracking();
  if (live.tourId === activeTour.id) return;

  stopLiveTracking();
  live.tourId = activeTour.id;
  refreshLiveTracking();
}

function stopLiveTracking() {
  clearTimeout(live.timer);
  Object.assign(live, { tourId: null, data: null, error: null, timer: null });
}

// Sekme arka plandan dönünce beklemeden yenile
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && live.tourId) refreshLiveTracking();
});
