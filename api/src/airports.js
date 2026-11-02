/* =========================================================
   Anlık uçuş takibinde kullanılan sabit veriler:
   İstanbul'un iki havalimanı, turların varış havalimanları ve
   çağrı kodunun ilk üç harfinden (ICAO kodu) havayolu adı.
   Yeni bir uçuş noktası eklenirse AIRPORTS'a koordinatı da eklenmelidir.
   ========================================================= */

/** Kalkış havalimanları: ICAO kodu ve [enlem, boylam] */
const ISTANBUL_AIRPORTS = {
  IST: { name: "İstanbul Havalimanı", icao: "LTFM", coords: [41.2753, 28.7519] },
  SAW: { name: "Sabiha Gökçen", icao: "LTFJ", coords: [40.8986, 29.3092] }
};

/** Turların varış havalimanları (IATA kodu): ICAO kodu ve [enlem, boylam] */
const AIRPORTS = {
  // Yurt içi
  NAV: { icao: "LTAZ", coords: [38.7719, 34.5345], domestic: true },
  TZX: { icao: "LTCG", coords: [40.9951, 39.7897], domestic: true },
  DLM: { icao: "LTBS", coords: [36.7131, 28.7925], domestic: true },
  MQM: { icao: "LTCR", coords: [37.2233, 40.6317], domestic: true },
  ERZ: { icao: "LTCE", coords: [39.9565, 41.1702], domestic: true },
  BJV: { icao: "LTFE", coords: [37.2506, 27.6643], domestic: true },
  // Yurt dışı
  CDG: { icao: "LFPG", coords: [49.0097, 2.5479] },
  FCO: { icao: "LIRF", coords: [41.8003, 12.2389] },
  SJJ: { icao: "LQSA", coords: [43.8246, 18.3315] },
  HND: { icao: "RJTT", coords: [35.5494, 139.7798] },
  DXB: { icao: "OMDB", coords: [25.2532, 55.3657] },
  CAI: { icao: "HECA", coords: [30.1219, 31.4056] },
  SSH: { icao: "HESH", coords: [27.9773, 34.395] },
  AMS: { icao: "EHAM", coords: [52.3105, 4.7683] },
  MUC: { icao: "EDDM", coords: [48.3538, 11.7861] },
  BCN: { icao: "LEBL", coords: [41.2974, 2.0833] },
  OSL: { icao: "ENGM", coords: [60.1976, 11.1004] },
  LHR: { icao: "EGLL", coords: [51.47, -0.4543] }
};

/** Çağrı kodu öneki → [havayolu, renk] */
const AIRLINES = {
  THY: ["Türk Hava Yolları", "#e30a17"],
  PGT: ["Pegasus", "#fdc300"],
  TKJ: ["AJet", "#0a2f6b"],
  SXS: ["SunExpress", "#f5a300"],
  AFR: ["Air France", "#002157"],
  KLM: ["KLM", "#00a1de"],
  DLH: ["Lufthansa", "#05164d"],
  BAW: ["British Airways", "#075aaa"],
  ITY: ["ITA Airways", "#0a2b5c"],
  VLG: ["Vueling", "#ffcc00"],
  UAE: ["Emirates", "#d71921"],
  FDB: ["flydubai", "#1d3c78"],
  MSR: ["EgyptAir", "#00265d"],
  NOZ: ["Norwegian", "#d81939"],
  SAS: ["SAS", "#000f9f"],
  JAL: ["Japan Airlines", "#cc0000"],
  ANA: ["All Nippon Airways", "#13448f"],
  WZZ: ["Wizz Air", "#c6007e"]
};

module.exports = { ISTANBUL_AIRPORTS, AIRPORTS, AIRLINES };
