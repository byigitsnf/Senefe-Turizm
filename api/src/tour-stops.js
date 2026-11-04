/* =========================================================
   Turların programa göre durakları. Rotalar bu listeden sunucuda hesaplanır
   (api/src/location.js). Yeni tur eklerken buraya da ekleyin.

   Satır: [gün, ad, enlem, boylam, ulaşım, ara noktalar]
     ulaşım  Önceki duraktan buraya nasıl gidildiği:
             yazılmazsa karayolu (rota hesaplanır), "walk" yürüyüş (rota
             hesaplanır); "rail", "sea", "boat" kesikli düz çizgi
     ara noktalar  Düz çizginin karadan geçmemesi için [enlem, boylam] listesi
   ========================================================= */

const ISTANBUL = [41.0082, 28.9784];
const GALATAPORT = [41.026, 28.983];

const TOUR_STOPS = {
  kap: [
    [1, "Nevşehir Kapadokya Havalimanı", 38.7719, 34.5345],
    [1, "Göreme", 38.6431, 34.8289],
    [1, "Uçhisar", 38.6305, 34.806],
    [2, "Derinkuyu", 38.3736, 34.7347],
    [2, "Ihlara Vadisi", 38.245, 34.299],
    [3, "Paşabağ", 38.671, 34.8535],
    [3, "Avanos", 38.7155, 34.8467],
    [3, "Nevşehir Kapadokya Havalimanı", 38.7719, 34.5345]
  ],
  kdz: [
    [1, "Trabzon Havalimanı", 40.9951, 39.7897],
    [1, "Sümela Manastırı", 40.6903, 39.6583],
    [1, "Uzungöl", 40.6198, 40.29],
    [2, "Ayder Yaylası", 40.952, 41.105],
    [2, "Zil Kale", 40.974, 41.035],
    [3, "Batum", 41.6168, 41.6367],
    [4, "Macahel", 41.41, 41.96],
    [4, "Borçka Karagöl", 41.382, 41.863],
    [5, "Trabzon Havalimanı", 40.9951, 39.7897]
  ],
  lik: [
    [1, "Dalaman Havalimanı", 36.7131, 28.7925],
    [1, "Ölüdeniz", 36.55, 29.115],
    [1, "Kayaköy", 36.577, 29.088],
    [2, "Faralya", 36.497, 29.13],
    [2, "Kabak", 36.464, 29.126, "walk"],
    [3, "Kaş", 36.2, 29.64],
    [3, "Üçağız", 36.196, 29.849],
    [3, "Kekova Batık Şehir", 36.173, 29.865, "boat"],
    [4, "Saklıkent Kanyonu", 36.471, 29.403],
    [4, "Dalaman Havalimanı", 36.7131, 28.7925]
  ],
  gap: [
    [1, "Mardin Havalimanı", 37.2233, 40.6317],
    [1, "Mardin", 37.312, 40.735],
    [2, "Midyat", 37.419, 41.37],
    [2, "Mor Gabriel Manastırı", 37.32, 41.543],
    [2, "Dara Antik Kenti", 37.178, 40.943],
    [3, "Şanlıurfa", 37.147, 38.786],
    [3, "Harran", 36.863, 39.031],
    [4, "Göbeklitepe", 37.2232, 38.9224],
    [4, "Şanlıurfa GAP Havalimanı", 37.445, 38.895]
  ],
  dex: [
    [1, "Ankara Garı", 39.9365, 32.844],
    [2, "İliç", 39.453, 38.564, "rail"],
    [2, "Erzincan", 39.75, 39.492, "rail"],
    [3, "Kars", 40.6013, 43.095, "rail"],
    [4, "Ani Ören Yeri", 40.5077, 43.5727],
    [4, "Çıldır Gölü", 41.05, 43.2],
    [5, "Kars Harakani Havalimanı", 40.5622, 43.115]
  ],
  saf: [
    [1, "İstanbul", ...ISTANBUL],
    [1, "Safranbolu", 41.253, 32.694],
    [2, "Amasra", 41.749, 32.386],
    [2, "Bartın", 41.6344, 32.3375],
    [2, "Yörük Köyü", 41.289, 32.782],
    [2, "İstanbul", ...ISTANBUL]
  ],
  dgi: [
    [1, "Erzurum Havalimanı", 39.9565, 41.1702],
    [1, "Erzurum", 39.905, 41.277],
    [2, "Kars", 40.6013, 43.095],
    [3, "Ani Ören Yeri", 40.5077, 43.5727],
    [4, "İshak Paşa Sarayı", 39.52, 44.117],
    [5, "Muradiye Şelalesi", 39.045, 43.77],
    [5, "Van Kalesi", 38.502, 43.338],
    [5, "Gevaş İskelesi", 38.339, 43.111],
    [5, "Akdamar Adası", 38.341, 43.034, "boat"],
    [6, "Van", 38.4942, 43.38],
    [6, "Van Ferit Melen Havalimanı", 38.4682, 43.3323]
  ],
  bod: [
    [1, "Milas-Bodrum Havalimanı", 37.2506, 27.6643],
    [1, "Bodrum Kalesi", 37.032, 27.429],
    [2, "Karaada", 36.996, 27.464, "boat"],
    [2, "Akvaryum Koyu", 36.981, 27.402, "boat"],
    [2, "Orak Adası", 36.993, 27.565, "boat"],
    [2, "Bodrum Kalesi", 37.032, 27.429, "boat"],
    [3, "Gümüşlük", 37.054, 27.233],
    [3, "Yalıkavak", 37.106, 27.292],
    [3, "Türkbükü", 37.124, 27.382],
    [4, "Milas-Bodrum Havalimanı", 37.2506, 27.6643]
  ],
  esb: [
    [1, "İstanbul", ...ISTANBUL],
    [1, "Bursa Ulu Cami", 40.184, 29.062],
    [1, "Cumalıkızık", 40.175, 29.172],
    [1, "Eskişehir", 39.7767, 30.5206],
    [2, "Odunpazarı", 39.762, 30.526],
    [2, "Sazova Parkı", 39.779, 30.483],
    [2, "İstanbul", ...ISTANBUL]
  ],
  par: [
    [1, "Paris Charles de Gaulle", 49.0097, 2.5479],
    [1, "Paris", 48.8566, 2.3522],
    [2, "Louvre", 48.8606, 2.3376],
    [2, "Marais", 48.859, 2.362],
    [3, "Mont-Saint-Michel", 48.6361, -1.5115],
    [4, "Versay Sarayı", 48.8049, 2.1204],
    [5, "Montmartre", 48.8867, 2.3431],
    [6, "Paris Charles de Gaulle", 49.0097, 2.5479]
  ],
  ita: [
    [1, "Roma Fiumicino", 41.8003, 12.2389],
    [1, "Trevi Çeşmesi", 41.9009, 12.4833],
    [2, "Vatikan", 41.9022, 12.4539],
    [2, "Kolezyum", 41.8902, 12.4922],
    [3, "Siena", 43.3188, 11.3308],
    [3, "San Gimignano", 43.4677, 11.0432],
    [4, "Floransa", 43.7731, 11.256],
    [5, "Pisa", 43.723, 10.3966],
    [5, "Lucca", 43.8429, 10.5027],
    [6, "Chianti", 43.584, 11.317],
    [7, "Floransa Havalimanı", 43.81, 11.2051]
  ],
  bal: [
    [1, "Saraybosna Havalimanı", 43.8246, 18.3315],
    [1, "Başçarşı", 43.8596, 18.431],
    [2, "Mostar", 43.3373, 17.815],
    [2, "Blagaj", 43.257, 17.889],
    [3, "Kotor", 42.4247, 18.7712],
    [4, "Budva", 42.2864, 18.84],
    [4, "Sveti Stefan", 42.2558, 18.8916],
    [5, "Belgrad", 44.823, 20.45],
    [6, "Belgrad Havalimanı", 44.8184, 20.3091]
  ],
  jpn: [
    [1, "Tokyo Haneda", 35.5494, 139.7798],
    [1, "Tokyo", 35.6812, 139.7671],
    [2, "Shibuya", 35.6595, 139.7005],
    [2, "Asakusa", 35.7148, 139.7967],
    [2, "Meiji Tapınağı", 35.6764, 139.6993],
    [3, "Hakone", 35.2324, 139.1069],
    [4, "Kyoto", 34.9858, 135.7588, "rail"],
    [5, "Fushimi Inari", 34.9671, 135.7727],
    [5, "Gion", 35.0037, 135.7788],
    [6, "Arashiyama", 35.017, 135.6713],
    [7, "Nara", 34.6851, 135.843],
    [8, "Osaka Dotonbori", 34.6687, 135.5013],
    [9, "Osaka Kansai Havalimanı", 34.432, 135.2304]
  ],
  dxb: [
    [1, "Dubai Havalimanı", 25.2532, 55.3657],
    [1, "Dubai Marina", 25.0805, 55.1403],
    [2, "Burj Khalifa", 25.1972, 55.2744],
    [3, "Dubai Çölü", 24.9, 55.35],
    [4, "Şeyh Zayed Camii", 24.4128, 54.475],
    [4, "Louvre Abu Dhabi", 24.5336, 54.3983],
    [5, "Dubai Havalimanı", 25.2532, 55.3657]
  ],
  bat: [
    [1, "İstanbul", ...ISTANBUL],
    [2, "Sarp Sınır Kapısı", 41.518, 41.549],
    [2, "Batum", 41.6168, 41.6367],
    [3, "Tiflis", 41.688, 44.809],
    [4, "Mtskheta", 41.8425, 44.719],
    [4, "Kazbegi", 42.6566, 44.641],
    [5, "İstanbul", ...ISTANBUL]
  ],
  cai: [
    [1, "Kahire Havalimanı", 30.1219, 31.4056],
    [1, "Tahrir Meydanı", 30.0444, 31.2357],
    [2, "Gize Piramitleri", 29.9773, 31.1325],
    [2, "Büyük Mısır Müzesi", 29.9946, 31.1189],
    [3, "Sakkara", 29.8713, 31.2164],
    [3, "Memfis", 29.849, 31.255],
    [4, "Han el-Halili", 30.0477, 31.2622],
    [5, "Kahire Havalimanı", 30.1219, 31.4056]
  ],
  ssh: [
    [1, "Şarm El Şeyh Havalimanı", 27.9773, 34.395],
    [1, "Naama Koyu", 27.9158, 34.33],
    [2, "Ras Muhammed", 27.73, 34.254],
    [3, "Naama Koyu", 27.9158, 34.33],
    [4, "Aziz Katerina Manastırı", 28.5561, 33.976],
    [5, "Eski Pazar", 27.861, 34.288],
    [6, "Şarm El Şeyh Havalimanı", 27.9773, 34.395]
  ],
  bnl: [
    [1, "Amsterdam Schiphol", 52.3105, 4.7683],
    [1, "Dam Meydanı", 52.3731, 4.8926],
    [2, "Keukenhof", 52.2698, 4.546],
    [2, "Zaanse Schans", 52.474, 4.818],
    [3, "Rotterdam", 51.9244, 4.4777],
    [3, "Brüksel", 50.8467, 4.3525],
    [4, "Brugge", 51.2093, 3.2247],
    [4, "Gent", 51.0543, 3.7174],
    [5, "Lüksemburg", 49.6116, 6.1319],
    [6, "Lüksemburg Havalimanı", 49.6233, 6.2044]
  ],
  bav: [
    [1, "Münih Havalimanı", 48.3538, 11.7861],
    [1, "Marienplatz", 48.1374, 11.5755],
    [2, "Neuschwanstein", 47.5576, 10.7498],
    [3, "Füssen", 47.571, 10.701],
    [3, "Rothenburg ob der Tauber", 49.377, 10.179],
    [4, "Heidelberg", 49.4106, 8.7154],
    [5, "Triberg", 48.129, 8.231],
    [6, "Stuttgart Havalimanı", 48.6899, 9.222]
  ],
  bcn: [
    [1, "Barselona El Prat", 41.2974, 2.0833],
    [1, "La Rambla", 41.3809, 2.173],
    [2, "Sagrada Familia", 41.4036, 2.1744],
    [2, "Park Güell", 41.4145, 2.1527],
    [2, "Casa Batlló", 41.3917, 2.1649],
    [3, "Montserrat", 41.5932, 1.8373],
    [4, "Barceloneta", 41.3784, 2.1925],
    [4, "Camp Nou", 41.3809, 2.1228],
    [5, "Barselona El Prat", 41.2974, 2.0833]
  ],
  gre: [
    [1, "Galataport", ...GALATAPORT],
    [2, "Çanakkale Boğazı", 40.15, 26.4, "sea", [[40.72, 27.9], [40.42, 26.72]]],
    [3, "Mikonos", 37.4467, 25.3289, "sea", [[39.0, 25.9]]],
    [4, "Santorini", 36.4167, 25.432, "sea"],
    [5, "Pire (Atina)", 37.942, 23.6465, "sea", [[37.45, 24.2]]],
    [6, "Rodos", 36.451, 28.227, "sea", [[36.9, 25.9]]],
    [7, "Galataport", ...GALATAPORT, "sea", [[37.3, 26.75], [39.0, 25.9], [40.0, 26.15], [40.42, 26.72], [40.72, 27.9]]]
  ],
  nor: [
    [1, "Oslo Gardermoen", 60.1976, 11.1004],
    [1, "Oslo Opera Binası", 59.9075, 10.753],
    [2, "Myrdal", 60.735, 7.122, "rail"],
    [3, "Flåm", 60.863, 7.114, "rail"],
    [3, "Gudvangen", 60.872, 6.841, "boat"],
    [4, "Bergen", 60.3975, 5.324],
    [5, "Vøringsfossen", 60.426, 7.251],
    [6, "Oslo", 59.9111, 10.7528, "rail"],
    [7, "Oslo Gardermoen", 60.1976, 11.1004]
  ],
  lon: [
    [1, "Londra Heathrow", 51.47, -0.4543],
    [1, "Westminster", 51.4995, -0.1248],
    [2, "British Museum", 51.5194, -0.127],
    [3, "Oxford", 51.752, -1.2577],
    [3, "Cotswolds", 51.885, -1.759],
    [4, "Londra Kulesi", 51.5081, -0.0759],
    [5, "Londra Heathrow", 51.47, -0.4543]
  ]
};

module.exports = { TOUR_STOPS };
