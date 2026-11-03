/* =========================================================
   OTA Web App — içerik verisi
   Turları, fiyatları ve vize bilgilerini yalnızca bu dosyadan düzenleyin.
   Site API'ye bağlıyken veriler Cosmos DB'den gelir; bu dosya yedek veridir.
   Değişiklikleri veritabanına aktarmak için: npm run export, ardından api'de npm run seed.
   ========================================================= */

/** Yurt dışı fiyatların ₺ karşılığı için kullanılan örnek kur (1 € = ? ₺). API güncel değeri verirse değişir. */
let EUR_TO_TRY = 38;

/**
 * Uçaklı turlarda kalkış havalimanı ve havayolu, turun türüne göre belirlenir:
 * yurt içi Sabiha Gökçen'den Pegasus, yurt dışı İstanbul Havalimanı'ndan THY.
 * Uçuş numarası ve saatleri her turun flight alanındadır.
 */
const FLIGHT_OPERATORS = {
  yurtici: {
    airline: "Pegasus",
    color: "#fdc300",
    airport: "SAW",
    airportName: "İstanbul Sabiha Gökçen",
    terminal: "İç Hatlar Terminali",
    baggage: "15 kg bagaj + 1 kabin çantası pakete dahil"
  },
  yurtdisi: {
    airline: "Türk Hava Yolları",
    color: "#e30a17",
    airport: "IST",
    airportName: "İstanbul Havalimanı",
    terminal: "Dış Hatlar",
    baggage: "23 kg bagaj + 8 kg kabin bagajı pakete dahil"
  }
};

/**
 * Tur alanları
 *  id         Benzersiz kısa kod
 *  scope      "yurtici" | "yurtdisi"
 *  img        Görsel yolu. Görseli images/ klasörüne koyup yolunu yazın,
 *             ör. img: "images/dubai.jpg". Yatay, en az 1200×800 px önerilir.
 *             Boş kalırsa kart, hue renklerinden oluşan geçişle gösterilir.
 *  from, to   Rota kodları (havalimanı IATA kodu; otobüs turlarında plaka kodu)
 *  transport  "Uçak" | "Otobüs" | "Tren" | "Gemi"
 *  flight     Uçaklı turlarda gidiş (outbound) ve dönüş (inbound) uçuşu:
 *             no, dep/arr (yerel saat), varış/dönüş havalimanı kodu ve adı, duration;
 *             arrNextDay: true ise iniş ertesi gün olur. Havayolu FLIGHT_OPERATORS'tan gelir.
 *  cruise     Gemi turlarında gemi adı, kalkış limanı, biniş saati, kabin tipleri
 *             (factor: fiyat çarpanı) ve gün gün liman programı (itinerary)
 *  price/cur  Kişi başı fiyat, çift kişilik oda; para birimi "TRY" | "EUR"
 *  visa       Yurt dışı turlarda vize türü; vizesizse null
 *  hue        Görsel yokken kullanılan renk geçişinin iki tonu (0–360)
 *  dates      Kalkış tarihleri (YYYY-AA-GG); full: dolu tarihler
 *  coords     Varış noktasının [enlem, boylam] değeri; arama kutusundaki haritada işaretlenir
 *  city       Haritada yakınlaştırınca noktanın yanında yazan şehir adı
 *  continent  Yurt dışı turlarda kıta: "avrupa" | "asya" | "afrika" | "amerika" | "okyanusya"
 *  featured   true ise tur, listenin üstündeki "Öne çıkanlar" slaytında gösterilir
 *  promo      Slaytta başlığın üstünde çıkan kısa kampanya yazısı (featured turlar için)
 */
const TOURS = [
  /* ---------- Yurt içi ---------- */
  {
    id: "kap",
    coords: [38.64,34.83], // harita: [enlem, boylam]
    city: "Nevşehir",
    scope: "yurtici",
    img: "images/kap.jpg", 
    featured: true,
    promo: "Balon sezonu açıldı",
    title: "Kapadokya Balon & Vadiler",
    region: "Nevşehir",
    from: "SAW", to: "NAV",
    transport: "Uçak",
    flight: {
      outbound: { no: "PC2690", dep: "07:15", arr: "08:35", to: "NAV", toName: "Nevşehir Kapadokya", duration: "1 sa 20 dk" },
      inbound: { no: "PC2691", dep: "20:40", arr: "22:00", from: "NAV", fromName: "Nevşehir Kapadokya", duration: "1 sa 20 dk" }
    },
    nights: 2,
    price: 14900, cur: "TRY",
    hue: [18, 40],
    dates: ["2026-11-14", "2026-11-28", "2026-12-12", "2027-01-09"],
    full: ["2026-11-14"],
    days: [
      "İstanbul'dan Nevşehir uçuşu, Göreme Açık Hava Müzesi, Uçhisar Kalesi.",
      "Opsiyonel balon turu, Derinkuyu Yeraltı Şehri, Ihlara Vadisi yürüyüşü.",
      "Paşabağ, Avanos çömlek atölyesi, akşam dönüş uçuşu."
    ],
    included: ["Gidiş-dönüş ekonomi uçuşu", "2 gece mağara otel, kahvaltı", "Profesyonel rehber", "Program dahili transferler"],
    excluded: ["Balon turu (~€180)", "Müze girişleri", "Öğle ve akşam yemekleri"]
  },
  {
    id: "kdz",
    coords: [40.98,40.54], // harita: [enlem, boylam]
    city: "Trabzon",
    scope: "yurtici",
    img: "images/kdz.jpg", 
    title: "Karadeniz Yaylalar & Batum",
    region: "Trabzon · Rize · Artvin",
    from: "SAW", to: "TZX",
    transport: "Uçak",
    flight: {
      outbound: { no: "PC2840", dep: "06:50", arr: "08:45", to: "TZX", toName: "Trabzon", duration: "1 sa 55 dk" },
      inbound: { no: "PC2841", dep: "19:30", arr: "21:30", from: "TZX", fromName: "Trabzon", duration: "2 sa" }
    },
    nights: 4,
    price: 22500, cur: "TRY",
    hue: [150, 190],
    dates: ["2027-05-15", "2027-06-05", "2027-06-19"],
    full: [],
    days: [
      "Trabzon'a varış, Sümela Manastırı, Uzungöl'de konaklama.",
      "Ayder Yaylası, Zil Kale, Fırtına Vadisi.",
      "Kimlikle Batum'a geçiş, şehir turu.",
      "Macahel ve Borçka Karagöl.",
      "Trabzon'dan dönüş uçuşu."
    ],
    included: ["Uçak bileti", "4 gece otel, yarım pansiyon", "Rehberlik ve transferler"],
    excluded: ["Batum'da ekstra harcamalar", "Müze girişleri"]
  },
  {
    id: "lik",
    coords: [36.62,29.12], // harita: [enlem, boylam]
    city: "Fethiye",
    scope: "yurtici",
    img: "images/lik.jpg", 
    title: "Likya Yolu & Kelebekler Vadisi",
    region: "Fethiye · Kaş",
    from: "SAW", to: "DLM",
    transport: "Uçak",
    flight: {
      outbound: { no: "PC2160", dep: "08:10", arr: "09:25", to: "DLM", toName: "Dalaman", duration: "1 sa 15 dk" },
      inbound: { no: "PC2161", dep: "18:45", arr: "20:00", from: "DLM", fromName: "Dalaman", duration: "1 sa 15 dk" }
    },
    nights: 3,
    price: 18750, cur: "TRY",
    hue: [195, 215],
    dates: ["2027-04-10", "2027-04-24", "2027-05-08"],
    full: [],
    days: [
      "Dalaman'a varış, Ölüdeniz, Kayaköy.",
      "Likya Yolu Faralya–Kabak etabı (11 km).",
      "Kaş, Kekova tekne turu, batık şehir.",
      "Saklıkent Kanyonu ve dönüş."
    ],
    included: ["Uçak bileti", "3 gece butik otel, kahvaltı", "Yürüyüş rehberi", "Kekova tekne turu"],
    excluded: ["Öğle yemekleri", "Kişisel ekipman"]
  },
  {
    id: "gap",
    coords: [37.31,40.74], // harita: [enlem, boylam]
    city: "Mardin",
    scope: "yurtici",
    img: "images/gap.jpg", 
    title: "Mardin, Midyat & Göbeklitepe",
    region: "Mardin · Şanlıurfa",
    from: "SAW", to: "MQM",
    transport: "Uçak",
    flight: {
      outbound: { no: "PC2620", dep: "06:40", arr: "08:50", to: "MQM", toName: "Mardin", duration: "2 sa 10 dk" },
      inbound: { no: "PC2633", dep: "21:10", arr: "23:15", from: "GNY", fromName: "Şanlıurfa GAP", duration: "2 sa 5 dk" }
    },
    nights: 3,
    price: 19900, cur: "TRY",
    hue: [28, 10],
    dates: ["2026-11-20", "2026-12-04", "2027-03-19"],
    full: [],
    days: [
      "Mardin'e varış, Kasımiye Medresesi, Mardin çarşısı.",
      "Midyat, Mor Gabriel Manastırı, Dara Antik Kenti.",
      "Şanlıurfa, Balıklıgöl, Harran evleri.",
      "Göbeklitepe ve Şanlıurfa'dan dönüş."
    ],
    included: ["Uçak bileti", "3 gece taş konak otel", "Yöresel akşam yemeği (1 akşam)", "Rehberlik"],
    excluded: ["Müze girişleri", "Diğer öğünler"]
  },
  {
    id: "dex",
    coords: [40.60,43.10], // harita: [enlem, boylam]
    city: "Kars",
    scope: "yurtici",
    img: "images/dex.jpg", 
    title: "Turistik Doğu Ekspresi & Kars",
    region: "Ankara · Kars",
    from: "ANK", to: "KSY",
    transport: "Tren",
    nights: 4,
    price: 27400, cur: "TRY",
    hue: [220, 250],
    dates: ["2026-12-18", "2027-01-15", "2027-02-12"],
    full: ["2026-12-18"],
    days: [
      "Ankara Gar'dan yataklı vagonla hareket.",
      "İliç ve Erzincan duraklarında kısa turlar.",
      "Kars'a varış, Kars Kalesi, kaz yemeği.",
      "Ani Ören Yeri, Çıldır Gölü'nde atlı kızak.",
      "Kars'tan Ankara'ya dönüş uçuşu."
    ],
    included: ["2 kişilik yataklı kompartıman", "2 gece otel", "Dönüş uçuşu", "Rehberlik"],
    excluded: ["Trende yemek", "Atlı kızak"]
  },
  {
    id: "saf",
    coords: [41.25,32.69], // harita: [enlem, boylam]
    city: "Safranbolu",
    scope: "yurtici",
    img: "images/saf.jpg", 
    title: "Safranbolu & Amasra Hafta Sonu",
    region: "Karabük · Bartın",
    from: "34", to: "78",
    transport: "Otobüs",
    nights: 1,
    price: 6450, cur: "TRY",
    hue: [95, 60],
    dates: ["2026-11-07", "2026-11-21", "2026-12-05", "2026-12-19"],
    full: [],
    days: [
      "İstanbul'dan sabah hareket, Safranbolu çarşısı, Kaymakamlar Evi.",
      "Amasra, Bartın, Yörük Köyü ve akşam İstanbul'a dönüş."
    ],
    included: ["Lüks otobüs", "1 gece konak otel, kahvaltı", "Rehberlik"],
    excluded: ["Yemekler", "Müze girişleri"]
  },

  {
    id: "dgi",
    coords: [38.50, 43.38], // harita: [enlem, boylam]
    city: "Van",
    scope: "yurtici",
    img: "images/dgi.jpg", 
    title: "Doğunun İncileri: Erzurum, Kars & Van",
    region: "Erzurum · Kars · Ağrı · Van",
    from: "SAW", to: "ERZ",
    transport: "Uçak",
    flight: {
      outbound: { no: "PC2650", dep: "07:30", arr: "09:30", to: "ERZ", toName: "Erzurum", duration: "2 sa" },
      inbound: { no: "PC2687", dep: "20:15", arr: "22:30", from: "VAN", fromName: "Van Ferit Melen", duration: "2 sa 15 dk" }
    },
    nights: 5,
    price: 31900, cur: "TRY",
    hue: [200, 235],
    dates: ["2027-05-22", "2027-06-12", "2027-07-03", "2027-08-14"],
    full: [],
    days: [
      "Erzurum'a varış, Çifte Minareli Medrese, Üç Kümbetler, cağ kebabı.",
      "Kars'a geçiş, Kars Kalesi, Kafkas mimarisi şehir turu.",
      "Ani Ören Yeri ve Arpaçay kanyonu.",
      "Doğubayazıt, Ağrı Dağı manzarası, İshak Paşa Sarayı.",
      "Muradiye Şelalesi, Van Kalesi ve Akdamar Adası.",
      "Van kahvaltısı, Van kedisi evi ve dönüş uçuşu."
    ],
    included: ["Pegasus gidiş-dönüş uçuşu", "5 gece otel, kahvaltı", "Özel otobüsle tüm transferler", "Profesyonel rehber"],
    excluded: ["Akdamar tekne bileti", "Ören yeri girişleri", "Öğle ve akşam yemekleri"]
  },
  {
    id: "bod",
    coords: [37.03, 27.43], // harita: [enlem, boylam]
    city: "Bodrum",
    scope: "yurtici",
    img: "images/bod.jpg", 
    title: "Bodrum Koyları & Gümüşlük",
    region: "Muğla · Bodrum",
    from: "SAW", to: "BJV",
    transport: "Uçak",
    flight: {
      outbound: { no: "PC2210", dep: "09:00", arr: "10:10", to: "BJV", toName: "Milas-Bodrum", duration: "1 sa 10 dk" },
      inbound: { no: "PC2211", dep: "19:40", arr: "20:50", from: "BJV", fromName: "Milas-Bodrum", duration: "1 sa 10 dk" }
    },
    nights: 3,
    price: 16900, cur: "TRY",
    hue: [190, 170],
    dates: ["2027-05-14", "2027-06-04", "2027-06-25", "2027-09-10"],
    full: ["2027-06-25"],
    days: [
      "Bodrum'a varış, Bodrum Kalesi ve Sualtı Arkeoloji Müzesi, marina yürüyüşü.",
      "Tam gün tekne turu: Karaada, Akvaryum Koyu ve Orak Adası.",
      "Gümüşlük, Yalıkavak ve Türkbükü koyları, gün batımında balık.",
      "Serbest zaman ve dönüş uçuşu."
    ],
    included: ["Pegasus gidiş-dönüş uçuşu", "3 gece butik otel, kahvaltı", "Öğle yemekli tekne turu", "Transferler ve rehberlik"],
    excluded: ["Müze girişleri", "Akşam yemekleri"]
  },
  {
    id: "esb",
    coords: [39.78, 30.52], // harita: [enlem, boylam]
    city: "Eskişehir",
    scope: "yurtici",
    img: "images/esb.webp", 
    title: "Eskişehir & Bursa Hafta Sonu",
    region: "Bursa · Eskişehir",
    from: "34", to: "26",
    transport: "Otobüs",
    nights: 1,
    price: 5250, cur: "TRY",
    hue: [30, 355],
    dates: ["2026-11-14", "2026-11-28", "2026-12-12", "2027-01-16", "2027-02-20"],
    full: ["2026-11-14"],
    days: [
      "İstanbul'dan sabah hareket; Bursa Ulu Cami, Koza Han, Cumalıkızık köyü ve İskender öğle yemeği. Akşam Eskişehir'de konaklama.",
      "Odunpazarı evleri, Kurşunlu Külliyesi, Porsuk Çayı'nda gondol, Sazova Parkı ve akşam İstanbul'a dönüş."
    ],
    included: ["Lüks otobüs", "1 gece otel, kahvaltı", "Rehberlik"],
    excluded: ["Yemekler", "Gondol ve müze girişleri"]
  },

  /* ---------- Yurt dışı ---------- */
  {
    id: "par",
    coords: [48.86,2.35], // harita: [enlem, boylam]
    city: "Paris",
    continent: "avrupa",
    scope: "yurtdisi",
    img: "images/par.webp", 
    featured: true,
    promo: "Yılbaşı Paris'te",
    title: "Paris & Normandiya",
    region: "Fransa",
    from: "IST", to: "CDG",
    transport: "Uçak",
    flight: {
      outbound: { no: "TK1821", dep: "07:45", arr: "10:30", to: "CDG", toName: "Paris Charles de Gaulle", duration: "3 sa 45 dk" },
      inbound: { no: "TK1824", dep: "18:20", arr: "23:05", from: "CDG", fromName: "Paris Charles de Gaulle", duration: "3 sa 45 dk" }
    },
    nights: 5,
    price: 1290, cur: "EUR",
    visa: "Schengen",
    hue: [230, 330],
    dates: ["2026-12-26", "2027-02-14", "2027-04-17"],
    full: [],
    days: [
      "Paris'e varış, panoramik şehir turu.",
      "Louvre ve Marais, akşam Seine tekne turu.",
      "Normandiya: Mont-Saint-Michel günü.",
      "Versay Sarayı.",
      "Serbest gün, Montmartre.",
      "Dönüş uçuşu."
    ],
    included: ["THY ekonomi uçuşu", "5 gece 4★ otel, kahvaltı", "Vize işlemleri takibi", "Türkçe rehber"],
    excluded: ["Vize harcı (€90)", "Yurt dışı çıkış harcı", "Ekstra turlar"]
  },
  {
    id: "ita",
    coords: [41.90,12.50], // harita: [enlem, boylam]
    city: "Roma",
    continent: "avrupa",
    scope: "yurtdisi",
    img: "images/ita.jpg", 
    title: "Roma, Floransa & Toskana",
    region: "İtalya",
    from: "IST", to: "FCO",
    transport: "Uçak",
    flight: {
      outbound: { no: "TK1861", dep: "08:05", arr: "09:50", to: "FCO", toName: "Roma Fiumicino", duration: "2 sa 45 dk" },
      inbound: { no: "TK1328", dep: "19:35", arr: "23:20", from: "FLR", fromName: "Floransa Peretola", duration: "2 sa 45 dk" }
    },
    nights: 6,
    price: 1390, cur: "EUR",
    visa: "Schengen",
    hue: [12, 45],
    dates: ["2027-03-27", "2027-04-10", "2027-05-01"],
    full: ["2027-04-10"],
    days: [
      "Roma'ya varış, Trevi, İspanyol Merdivenleri.",
      "Vatikan ve Kolezyum.",
      "Siena ve San Gimignano.",
      "Floransa: Duomo, Uffizi.",
      "Pisa ve Lucca.",
      "Chianti şarap rotası.",
      "Floransa'dan dönüş."
    ],
    included: ["Uçak bileti", "6 gece otel, kahvaltı", "Şehirlerarası özel otobüs", "Türkçe rehber"],
    excluded: ["Vize harcı", "Müze girişleri", "Şehir vergisi"]
  },
  {
    id: "bal",
    coords: [43.86,18.41], // harita: [enlem, boylam]
    city: "Saraybosna",
    continent: "avrupa",
    scope: "yurtdisi",
    img: "images/bal.jpg", 
    title: "Balkanlar: Saraybosna'dan Kotor'a",
    region: "Bosna Hersek · Karadağ · Sırbistan",
    from: "IST", to: "SJJ",
    transport: "Uçak",
    flight: {
      outbound: { no: "TK1021", dep: "09:20", arr: "10:05", to: "SJJ", toName: "Saraybosna", duration: "1 sa 45 dk" },
      inbound: { no: "TK1084", dep: "17:55", arr: "20:25", from: "BEG", fromName: "Belgrad Nikola Tesla", duration: "1 sa 30 dk" }
    },
    nights: 5,
    price: 749, cur: "EUR",
    visa: null,
    hue: [170, 210],
    dates: ["2026-11-26", "2027-03-12", "2027-04-02", "2027-05-21"],
    full: [],
    days: [
      "Saraybosna'ya varış, Başçarşı.",
      "Mostar Köprüsü ve Blagaj Tekkesi.",
      "Dubrovnik manzarası eşliğinde Kotor.",
      "Budva ve Sveti Stefan.",
      "Belgrad'a geçiş, Kalemegdan.",
      "Belgrad'dan dönüş."
    ],
    included: ["Uçak bileti", "5 gece otel, kahvaltı", "Tüm transferler", "Rehberlik"],
    excluded: ["Yurt dışı çıkış harcı", "Öğle/akşam yemekleri"]
  },
  {
    id: "jpn",
    coords: [35.68,139.69], // harita: [enlem, boylam]
    city: "Tokyo",
    continent: "asya",
    scope: "yurtdisi",
    img: "images/jpn.webp", 
    featured: true,
    promo: "Sakura dönemi",
    title: "Japonya: Tokyo, Kyoto & Fuji",
    region: "Japonya",
    from: "IST", to: "HND",
    transport: "Uçak",
    flight: {
      outbound: { no: "TK198", dep: "01:55", arr: "19:30", to: "HND", toName: "Tokyo Haneda", duration: "11 sa 35 dk" },
      inbound: { no: "TK87", dep: "22:30", arr: "05:20", from: "KIX", fromName: "Osaka Kansai", duration: "13 sa 50 dk", arrNextDay: true }
    },
    nights: 8,
    price: 2890, cur: "EUR",
    visa: null,
    hue: [340, 10],
    dates: ["2027-03-28", "2027-04-04", "2027-11-14"],
    full: ["2027-03-28"],
    days: [
      "Tokyo'ya varış.",
      "Shibuya, Asakusa, Meiji Tapınağı.",
      "Hakone ve Fuji Dağı manzarası.",
      "Shinkansen ile Kyoto.",
      "Fushimi Inari, Gion.",
      "Arashiyama bambu ormanı.",
      "Nara geyik parkı.",
      "Osaka Dotonbori.",
      "Osaka'dan dönüş."
    ],
    included: ["Uçak bileti", "8 gece otel", "Shinkansen bileti", "Türkçe rehber"],
    excluded: ["Öğle/akşam yemekleri", "Kişisel harcamalar"]
  },
  {
    id: "dxb",
    coords: [25.20,55.27], // harita: [enlem, boylam]
    city: "Dubai",
    continent: "asya",
    scope: "yurtdisi",
    img: "images/dxb.webp", 
    featured: true,
    promo: "Kışın güneşe kaçış",
    title: "Dubai & Abu Dabi",
    region: "BAE",
    from: "IST", to: "DXB",
    transport: "Uçak",
    flight: {
      outbound: { no: "TK760", dep: "10:05", arr: "15:40", to: "DXB", toName: "Dubai", duration: "4 sa 35 dk" },
      inbound: { no: "TK763", dep: "17:10", arr: "21:00", from: "DXB", fromName: "Dubai", duration: "4 sa 50 dk" }
    },
    nights: 4,
    price: 899, cur: "EUR",
    visa: "e-Vize",
    hue: [35, 15],
    dates: ["2026-12-02", "2026-12-30", "2027-02-03"],
    full: [],
    days: [
      "Dubai'ye varış, Dubai Marina.",
      "Burj Khalifa, Dubai Mall, fıskiye gösterisi.",
      "Çöl safarisi ve barbekü akşam yemeği.",
      "Abu Dabi: Şeyh Zayed Camii, Louvre Abu Dhabi.",
      "Dönüş uçuşu."
    ],
    included: ["Uçak bileti", "4 gece 4★ otel, kahvaltı", "Çöl safarisi", "e-Vize işlemleri"],
    excluded: ["Turizm vergisi (otelde ödenir)", "Burj Khalifa girişi"]
  },
  {
    id: "bat",
    coords: [41.64,41.64], // harita: [enlem, boylam]
    city: "Batum",
    continent: "asya",
    scope: "yurtdisi",
    img: "images/bat.jpg", 
    title: "Batum & Tiflis Kimlikle",
    region: "Gürcistan",
    from: "34", to: "GE",
    transport: "Otobüs",
    nights: 4,
    price: 389, cur: "EUR",
    visa: null,
    idCardOk: true,
    hue: [120, 160],
    dates: ["2026-11-12", "2026-12-10", "2027-01-28"],
    full: [],
    days: [
      "İstanbul'dan hareket, gece yolculuğu.",
      "Sarp sınır kapısı, Batum şehir turu.",
      "Tiflis'e geçiş, Narikala Kalesi, kükürt hamamları.",
      "Mtskheta ve Kazbegi günübirlik.",
      "Dönüş yolculuğu."
    ],
    included: ["Lüks otobüs", "2 gece otel, kahvaltı", "Rehberlik"],
    excluded: ["Kazbegi jip turu", "Yemekler"]
  },

  /* ---------- Yurt dışı: Afrika ---------- */
  {
    id: "cai",
    coords: [30.04, 31.24], // harita: [enlem, boylam]
    city: "Kahire",
    continent: "afrika",
    scope: "yurtdisi",
    img: "images/cai.jpeg", 
    title: "Mısır: Kahire, Piramitler & Nil",
    region: "Mısır",
    from: "IST", to: "CAI",
    transport: "Uçak",
    flight: {
      outbound: { no: "TK690", dep: "08:40", arr: "10:30", to: "CAI", toName: "Kahire", duration: "2 sa 50 dk" },
      inbound: { no: "TK695", dep: "16:55", arr: "20:35", from: "CAI", fromName: "Kahire", duration: "2 sa 40 dk" }
    },
    nights: 4,
    price: 749, cur: "EUR",
    visa: "Mısır vizesi",
    hue: [40, 20],
    dates: ["2026-11-19", "2026-12-17", "2027-01-21", "2027-02-25", "2027-03-25"],
    full: [],
    days: [
      "Kahire'ye varış, Tahrir ve Nil kıyısında akşam yürüyüşü.",
      "Gize Piramitleri, Sfenks ve Büyük Mısır Müzesi.",
      "Sakkara basamaklı piramidi ve Memfis antik kenti.",
      "Eski Kahire, Muizz Caddesi, Han el-Halili çarşısı ve akşam Nil'de feluka turu.",
      "Kahvaltı ve dönüş uçuşu."
    ],
    included: ["THY gidiş-dönüş uçuşu", "4 gece 4★ otel, kahvaltı", "Vize işlemleri takibi", "Türkçe rehber"],
    excluded: ["Vize harcı", "Müze ve piramit içi girişleri", "Yurt dışı çıkış harcı"]
  },
  {
    id: "ssh",
    coords: [27.92, 34.33], // harita: [enlem, boylam]
    city: "Şarm El Şeyh",
    continent: "afrika",
    scope: "yurtdisi",
    img: "images/ssh.jpg", 
    title: "Şarm El Şeyh Kızıldeniz Tatili",
    region: "Mısır · Sina",
    from: "IST", to: "SSH",
    transport: "Uçak",
    flight: {
      outbound: { no: "TK716", dep: "09:15", arr: "11:20", to: "SSH", toName: "Şarm El Şeyh", duration: "3 sa 5 dk" },
      inbound: { no: "TK717", dep: "12:30", arr: "16:20", from: "SSH", fromName: "Şarm El Şeyh", duration: "2 sa 50 dk" }
    },
    nights: 5,
    price: 689, cur: "EUR",
    visa: "Mısır vizesi",
    hue: [180, 205],
    dates: ["2026-12-05", "2027-01-09", "2027-02-13", "2027-03-13", "2027-04-10"],
    full: ["2026-12-05"],
    days: [
      "Şarm El Şeyh'e varış, her şey dahil otele yerleşme.",
      "Ras Muhammed Milli Parkı'nda şnorkel turu.",
      "Serbest gün: plaj ve mercan resifleri.",
      "Opsiyonel: Sina Dağı'nda gün doğumu ve Aziz Katerina Manastırı.",
      "Naama Koyu ve Eski Pazar'da akşam.",
      "Dönüş uçuşu."
    ],
    included: ["THY gidiş-dönüş uçuşu", "5 gece 5★ otel, her şey dahil", "Ras Muhammed tekne turu", "Havalimanı transferleri"],
    excluded: ["Vize harcı", "Sina Dağı turu", "Dalış ekipmanı"]
  },

  /* ---------- Yurt dışı: Avrupa ---------- */
  {
    id: "bnl",
    coords: [50.85, 4.35], // harita: [enlem, boylam]
    city: "Brüksel",
    continent: "avrupa",
    scope: "yurtdisi",
    img: "images/bnl.webp",
    title: "Benelüks Rüyası: Hollanda, Belçika & Lüksemburg",
    region: "Hollanda · Belçika · Lüksemburg",
    from: "IST", to: "AMS",
    transport: "Uçak",
    flight: {
      outbound: { no: "TK1951", dep: "07:35", arr: "10:15", to: "AMS", toName: "Amsterdam Schiphol", duration: "3 sa 40 dk" },
      inbound: { no: "TK1828", dep: "18:45", arr: "23:15", from: "LUX", fromName: "Lüksemburg", duration: "3 sa 30 dk" }
    },
    nights: 5,
    price: 1190, cur: "EUR",
    visa: "Schengen",
    hue: [25, 210],
    dates: ["2027-04-15", "2027-04-29", "2027-05-13", "2027-09-16"],
    full: ["2027-04-15"],
    days: [
      "Amsterdam'a varış, kanal turu ve Dam Meydanı.",
      "Keukenhof lale bahçeleri, Zaanse Schans yel değirmenleri.",
      "Rotterdam üzerinden Brüksel, Grand Place ve Atomium.",
      "Brugge kanalları ve Gent.",
      "Lüksemburg, Eski Şehir ve Bock kazamatları.",
      "Lüksemburg'dan dönüş uçuşu."
    ],
    included: ["THY gidiş-dönüş uçuşu", "5 gece 4★ otel, kahvaltı", "Şehirlerarası özel otobüs", "Türkçe rehber"],
    excluded: ["Vize harcı", "Keukenhof girişi", "Şehir vergileri"]
  },
  {
    id: "bav",
    coords: [48.14, 11.58], // harita: [enlem, boylam]
    city: "Münih",
    continent: "avrupa",
    scope: "yurtdisi",
    img: "images/bav.webp", 
    title: "Güney Almanya: Münih, Neuschwanstein & Kara Orman",
    region: "Bavyera · Baden-Württemberg",
    from: "IST", to: "MUC",
    transport: "Uçak",
    flight: {
      outbound: { no: "TK1629", dep: "08:15", arr: "10:05", to: "MUC", toName: "Münih", duration: "2 sa 50 dk" },
      inbound: { no: "TK1704", dep: "19:20", arr: "23:40", from: "STR", fromName: "Stuttgart", duration: "3 sa 20 dk" }
    },
    nights: 5,
    price: 1090, cur: "EUR",
    visa: "Schengen",
    hue: [215, 250],
    dates: ["2026-12-03", "2026-12-10", "2027-05-20", "2027-06-17"],
    full: [],
    days: [
      "Münih'e varış, Marienplatz ve Viktualienmarkt.",
      "Neuschwanstein ve Hohenschwangau şatoları.",
      "Romantik Yol: Füssen ve Rothenburg ob der Tauber.",
      "Heidelberg Şatosu ve eski köprü.",
      "Kara Orman: Triberg şelaleleri ve guguklu saat atölyesi.",
      "Stuttgart'tan dönüş uçuşu."
    ],
    included: ["THY gidiş-dönüş uçuşu", "5 gece 4★ otel, kahvaltı", "Özel otobüs", "Türkçe rehber"],
    excluded: ["Vize harcı", "Şato girişleri", "Öğle ve akşam yemekleri"]
  },
  {
    id: "bcn",
    coords: [41.39, 2.17], // harita: [enlem, boylam]
    city: "Barselona",
    continent: "avrupa",
    scope: "yurtdisi",
    img: "images/bcn.webp", 
    title: "Barselona & Katalonya",
    region: "İspanya",
    from: "IST", to: "BCN",
    transport: "Uçak",
    flight: {
      outbound: { no: "TK1853", dep: "07:55", arr: "10:35", to: "BCN", toName: "Barselona El Prat", duration: "3 sa 40 dk" },
      inbound: { no: "TK1856", dep: "17:30", arr: "22:20", from: "BCN", fromName: "Barselona El Prat", duration: "3 sa 50 dk" }
    },
    nights: 4,
    price: 990, cur: "EUR",
    visa: "Schengen",
    hue: [10, 40],
    dates: ["2027-03-18", "2027-04-22", "2027-05-27", "2027-10-07"],
    full: [],
    days: [
      "Barselona'ya varış, La Rambla ve Gotik Mahalle.",
      "Sagrada Familia, Park Güell ve Casa Batlló.",
      "Montserrat Manastırı ve dağ treni.",
      "Serbest gün: Barceloneta plajı, Camp Nou.",
      "Dönüş uçuşu."
    ],
    included: ["THY gidiş-dönüş uçuşu", "4 gece 4★ otel, kahvaltı", "Montserrat turu", "Türkçe rehber"],
    excluded: ["Vize harcı", "Sagrada Familia ve Park Güell girişleri", "Şehir vergisi"]
  },
  {
    id: "gre",
    coords: [36.39, 25.46], // harita: [enlem, boylam]
    city: "Santorini",
    continent: "avrupa",
    scope: "yurtdisi",
    img: "images/gre.jpg", 
    featured: true,
    promo: "Ege'de 7 günlük cruise",
    title: "Yunan Adaları Cruise: Mikonos, Santorini & Atina",
    region: "Ege Denizi · Yunanistan",
    from: "IST", to: "GR",
    transport: "Gemi",
    cruise: {
      ship: "Aegean Pearl",
      port: "Galataport İstanbul",
      boarding: "15:00",
      cabins: [
        { value: "inside", label: "İç kabin", factor: 1 },
        { value: "oceanview", label: "Deniz manzaralı (+%20)", factor: 1.2 },
        { value: "balcony", label: "Balkonlu (+%45)", factor: 1.45 }
      ],
      itinerary: [
        { port: "İstanbul (Galataport)", arrive: "", depart: "18:00" },
        { port: "Denizde · Çanakkale Boğazı geçişi", arrive: "", depart: "" },
        { port: "Mikonos", arrive: "08:00", depart: "23:00" },
        { port: "Santorini", arrive: "07:00", depart: "21:00" },
        { port: "Pire (Atina)", arrive: "07:00", depart: "19:00" },
        { port: "Rodos", arrive: "12:00", depart: "20:00" },
        { port: "İstanbul (Galataport)", arrive: "15:00", depart: "" }
      ]
    },
    nights: 6,
    price: 1290, cur: "EUR",
    visa: "Schengen",
    hue: [205, 190],
    dates: ["2027-05-29", "2027-06-19", "2027-07-10", "2027-09-04"],
    full: ["2027-07-10"],
    days: [
      "Galataport'ta biniş, kabinlere yerleşme ve İstanbul Boğazı manzarasında hareket.",
      "Denizde gün: Çanakkale Boğazı geçişi, gemide havuz, spa ve gösteriler.",
      "Mikonos: yel değirmenleri, Küçük Venedik ve gece hayatı.",
      "Santorini: Fira'ya teleferik, Oia'da gün batımı.",
      "Pire limanı: Atina'da Akropolis ve Plaka turu.",
      "Rodos: Şövalyeler Sarayı ve ortaçağ surları.",
      "Sabah denizde, öğleden sonra Galataport'a varış."
    ],
    included: ["6 gece kabin konaklama, tam pansiyon", "Liman vergileri", "Gemi içi gösteri ve etkinlikler", "Türkçe rehber"],
    excluded: ["Vize harcı", "Kara turları ve müze girişleri", "Servis ücreti (bahşiş)", "Alkollü içecekler"]
  },
  {
    id: "nor",
    coords: [60.39, 5.32], // harita: [enlem, boylam]
    city: "Bergen",
    continent: "avrupa",
    scope: "yurtdisi",
    img: "images/nor.jpg", 
    title: "Norveç Fiyortları: Oslo, Flåm & Bergen",
    region: "Norveç",
    from: "IST", to: "OSL",
    transport: "Uçak",
    flight: {
      outbound: { no: "TK1751", dep: "08:10", arr: "10:45", to: "OSL", toName: "Oslo Gardermoen", duration: "3 sa 35 dk" },
      inbound: { no: "TK1754", dep: "12:00", arr: "17:30", from: "OSL", fromName: "Oslo Gardermoen", duration: "3 sa 30 dk" }
    },
    nights: 6,
    price: 1890, cur: "EUR",
    visa: "Schengen",
    hue: [195, 225],
    dates: ["2027-06-05", "2027-06-26", "2027-07-17", "2027-08-07"],
    full: [],
    days: [
      "Oslo'ya varış, Opera Binası ve Vigeland Parkı.",
      "Bergen Demiryolu ile dağ geçidi, Myrdal'a varış.",
      "Flåm Demiryolu ve Nærøyfjord tekne turu.",
      "Bergen, Bryggen rıhtımı ve Fløyen teleferiği.",
      "Hardangerfjord ve Vøringsfossen şelalesi.",
      "Trenle Oslo'ya dönüş.",
      "Dönüş uçuşu."
    ],
    included: ["THY gidiş-dönüş uçuşu", "Norveç demiryolu biletleri", "Fiyort tekne turu", "6 gece otel, kahvaltı", "Türkçe rehber"],
    excluded: ["Vize harcı", "Akşam yemekleri", "Fløyen teleferiği"]
  },
  {
    id: "lon",
    coords: [51.51, -0.13], // harita: [enlem, boylam]
    city: "Londra",
    continent: "avrupa",
    scope: "yurtdisi",
    img: "images/lon.jpg", 
    title: "Londra & Oxford",
    region: "Birleşik Krallık",
    from: "IST", to: "LHR",
    transport: "Uçak",
    flight: {
      outbound: { no: "TK1979", dep: "08:25", arr: "10:35", to: "LHR", toName: "Londra Heathrow", duration: "4 sa 10 dk" },
      inbound: { no: "TK1984", dep: "18:00", arr: "23:50", from: "LHR", fromName: "Londra Heathrow", duration: "3 sa 50 dk" }
    },
    nights: 4,
    price: 1240, cur: "EUR",
    visa: "İngiltere vizesi",
    hue: [350, 230],
    dates: ["2027-04-08", "2027-05-06", "2027-06-10", "2027-09-23"],
    full: [],
    days: [
      "Londra'ya varış, Westminster, Big Ben ve London Eye.",
      "British Museum, Covent Garden ve Soho.",
      "Oxford üniversite kolejleri ve Cotswolds köyleri.",
      "Londra Kulesi, Tower Bridge ve Borough Market.",
      "Dönüş uçuşu."
    ],
    included: ["THY gidiş-dönüş uçuşu", "4 gece 4★ otel, kahvaltı", "Oxford günübirlik turu", "Türkçe rehber"],
    excluded: ["İngiltere vize harcı", "Londra Kulesi ve London Eye girişleri", "Toplu taşıma kartı"]
  }
];

/** Vize rehberi tablosu. required: true ise turuncu "vize gerekli" rozeti gösterilir. */
const VISA_INFO = [
  { country: "Avrupa Birliği - Schengen", required: true, status: "Vize gerekli", duration: "15–45 gün",
    documents: "Pasaport, banka dökümü, SGK, işveren yazısı, seyahat sigortası", deadline: "Kalkıştan 45 gün önce" },
  { country: "Birleşik Krallık", required: true, status: "Vize gerekli", duration: "15–30 gün",
    documents: "Online başvuru, pasaport, banka dökümü, işveren yazısı, biyometri randevusu", deadline: "Kalkıştan 45 gün önce" },
  { country: "Mısır", required: true, status: "Vize gerekli", duration: "7–15 gün",
    documents: "Pasaport, biyometrik fotoğraf, otel rezervasyonu", deadline: "Kalkıştan 30 gün önce" },
  { country: "Birleşik Arap Emirlikleri", required: true, status: "e-Vize", duration: "3–5 iş günü",
    documents: "Pasaport taraması, biyometrik fotoğraf", deadline: "Kalkıştan 10 gün önce" },
  { country: "Japonya", required: false, status: "Vizesiz (90 gün)", duration: "—",
    documents: "En az 6 ay geçerli pasaport", deadline: "—" },
  { country: "Bosna Hersek / Karadağ / Sırbistan", required: false, status: "Vizesiz", duration: "—",
    documents: "Pasaport", deadline: "—" },
  { country: "Gürcistan", required: false, status: "Kimlikle giriş", duration: "—",
    documents: "Çipli yeni kimlik kartı veya pasaport", deadline: "—" }
];
