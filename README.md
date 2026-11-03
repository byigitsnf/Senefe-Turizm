# OTA Web App

Tur acentası sitesi şablonu. Site düz HTML/CSS/JS; tur verisi Azure üzerindeki bir API'den canlı olarak gelir.

Canlı adres: https://yellow-water-0a41f371e.4.azurestaticapps.net

```
index.html, css/, js/        Site (ön yüz)
  js/data.js                 Gömülü yedek veri; API'ye ulaşılamazsa kullanılır
  js/api.js                  Açılışta /api/catalog'dan veriyi çeker
  js/live.js                 Uçuş sekmesindeki anlık uçuş takibi
  js/hotels.js               Oteller: arama, oda seçimi, rezervasyon
api/                         Azure Functions (Node.js) API
  src/routes.js              API uçları
  src/store.js               Cosmos DB ya da yerel JSON veri katmanı
  src/opensky.js             OpenSky Network'ten canlı uçak konumları
  src/airports.js            Havalimanı koordinatları ve havayolu adları
  src/liteapi.js             LiteAPI (Nuitee Connect) otel arama ve rezervasyon
  seed/catalog.json          Test verisi (data.js'ten üretilir)
  scripts/seed-cosmos.js     Test verisini Cosmos DB'ye yükler
infra/main.bicep             Azure kaynakları (ücretsiz katmanlar)
scripts/                     Yerel sunucu, veri aktarma, derleme
```

## Mimari

```
Tarayıcı ──► Azure Static Web Apps (Free)
              ├─ site dosyaları (dist/)
              └─ /api/*  ──► yönetilen Azure Functions ──► Azure Cosmos DB (ücretsiz katman)
```

Site ve API aynı adreste çalışır, CORS ayarı gerekmez.

| Kaynak | Plan | Ücretsiz sınır |
|---|---|---|
| Azure Static Web Apps | Free | 100 GB/ay trafik, 2 özel alan adı |
| Azure Cosmos DB for NoSQL | Ücretsiz katman | 1000 RU/s ve 25 GB depolama, süresiz |

Abonelik başına yalnızca **bir** Cosmos DB hesabı ücretsiz katmanda olabilir. Şablon toplam kapasiteyi 1000 RU/s ile sınırlar, böylece ücretsiz sınır aşılmaz.

## API uçları

| Uç | Açıklama |
|---|---|
| `GET /api/catalog` | Turlar, vize rehberi, havayolları ve kur: sitenin kullandığı tek çağrı |
| `GET /api/tours?scope=yurtdisi&continent=avrupa&transport=Gemi` | Turlar (filtreler isteğe bağlı) |
| `GET /api/tours/{id}` | Tek tur, ör. `/api/tours/par` |
| `GET /api/visa` | Vize rehberi |
| `GET /api/live/{id}` | Turun uçuş hattında şu an havada olan İstanbul kalkışlı uçaklar, ör. `/api/live/par` |
| `GET /api/hotels?lat=&lon=&checkin=&checkout=&adults=` | Konumun çevresindeki oteller, en düşük toplam fiyatla |
| `GET /api/hotels/{id}?checkin=&checkout=&adults=` | Otel bilgisi ve oda seçenekleri |
| `POST /api/hotels/prebook` | `{ offerId }`: seçilen odanın fiyatını ve müsaitliğini doğrular |
| `POST /api/hotels/book` | `{ prebookId, firstName, lastName, email }`: rezervasyon (yalnızca sandbox) |
| `GET /api/health` | Veri kaynağı (`cosmos` ya da `memory`), OpenSky bağlantı türü ve otel servisi durumu |

## Oteller

Menüdeki **Oteller** bölümünde tur dışında otel aranır ve rezerve edilir. Veri [LiteAPI (Nuitee Connect)](https://docs.liteapi.travel/docs/booking-a-room) sandbox'ından gelir:

1. Şehir ve tarihler seçilir; çevredeki oteller en düşük toplam fiyatla listelenir (`/hotels/rates`).
2. Otel açılınca fotoğraflar, bilgiler ve tüm oda seçenekleri gelir (`/data/hotel`).
3. **Seç**'e basınca fiyat ve müsaitlik son kez doğrulanır (`/rates/prebook`).
4. Ad, soyad ve e-posta ile rezervasyon tamamlanır (`/rates/book`). Ödeme sandbox kartıyla simüle edilir; rezervasyonlar Nuitee panelinde **Sandbox** modunda **Bookings** altında görünür.

Anahtar yalnızca sunucudadır:

- **Yerelde:** proje kökünde `.env` dosyasına `LITEAPI_KEY=sand_…` satırını yazın, `npm run dev` ile başlatın. `.env` depoya eklenmez ve yerel sunucu bu dosyayı tarayıcıya sunmaz.
- **Azure'da:** Static Web App → **Ayarlar → Ortam değişkenleri → Production**'a `LITEAPI_KEY` ekleyip **Uygula**'ya basın. `/api/health` yanıtında `"hotels": "sandbox"` görünmelidir.

Rezervasyon ucu yalnızca `sand_` ile başlayan anahtarla çalışır. Canlı (`prod_`) anahtarla `ACC_CREDIT_CARD` ödemesi hesaba tanımlı kartı gerçekten tahsil ettiği için, canlıda rezervasyon ancak `LITEAPI_ALLOW_LIVE_BOOKING=true` tanımlanırsa açılır; bunu gerçek bir ödeme akışı kurmadan yapmayın.

### Kapatma ve geri alma

Tamamı tek bir commit'te (`hotels-liteapi` etiketi) durur.

- **Geçici olarak gizlemek:** `js/hotels.js` içinde `HOTELS_ENABLED = false` yapıp gönderin. Bölüm ve menü bağlantısı kaybolur, API uçları yerinde kalır.
- **Tamamen kaldırmak:** `git revert hotels-liteapi` ve ardından `git push`.

## Anlık uçuş takibi

Uçaklı turların **Uçuş** sekmesinde, İstanbul'dan (IST ya da SAW) turun varış havalimanına giden ve şu an havada olan uçaklar listelenir; panel 30 saniyede bir yenilenir. Veri [OpenSky Network](https://openskynetwork.github.io/opensky-api/rest.html)'ten gelir. OpenSky kalkış ve varış bilgisi vermediği için uçuşlar şöyle bulunur:

1. Hattın çevresindeki uçaklardan rotaya yakın olan ve varışa doğru uçanlar seçilir.
2. Uçağın canlı izinin ilk noktası İstanbul'daysa İstanbul kalkışlı sayılır.
3. OpenSky hesabı tanımlıysa dünün İstanbul kalkışlarına da bakılır: aynı çağrı kodlu uçuş dün bu havalimanına indiyse hat **doğrulanır**, başka yere indiyse uçak listeden çıkar. Hesap yoksa hat "tahmini" etiketiyle gösterilir. Örneğin doğuya giden uzun menzilli bir uçuş, Kapadokya hattının üzerinden geçerken o hatta uçuyor gibi görünebilir.

Hesap gerekmez, ama önerilir: hesapsız sorgu hakkı IP başına günde 400 kredidir ve Azure'un paylaşılan IP adresinde çabuk dolabilir. Hesapla günde 4000 krediye çıkar ve 3. adım açılır.

1. [opensky-network.org](https://opensky-network.org)'da ücretsiz hesap açın; **Account** sayfasında yeni bir **API client** oluşturun.
2. Static Web App → **Ayarlar → Ortam değişkenleri → Production**'a `OPENSKY_CLIENT_ID` ve `OPENSKY_CLIENT_SECRET` değerlerini ekleyip **Uygula**'ya basın.
3. `/api/health` yanıtında `"opensky": "hesap"` görünüyorsa tamamdır.

Sonuçlar hat başına 90 saniye (hesapla 30 saniye), bir uçağın kalkış havalimanı 3 saat önbellekte tutulur. Yeni bir uçuş noktası eklerseniz `api/src/airports.js` içindeki `AIRPORTS` listesine ICAO kodunu ve koordinatını da ekleyin.

### Kapatma ve geri alma

Bu bir deneme özelliğidir; tamamı tek bir commit'te (`major-test-feature` etiketi) durur.

- **Geçici olarak gizlemek:** `js/live.js` içinde `LIVE_TRACKING_ENABLED = false` yapıp gönderin. Panel kaybolur, API ucu yerinde kalır.
- **Tamamen kaldırmak:** proje klasöründe `git revert major-test-feature` ve ardından `git push`. Özelliğin eklediği her şey geri alınır, sonraki değişiklikler korunur.

## Yerelde çalıştırma

Yalnızca Node.js 20+ gerekir; Azure hesabı ya da ek paket gerekmez.

```powershell
npm run dev
```

http://localhost:7071 adresinde site ve API birlikte açılır. `COSMOS_CONNECTION_STRING` tanımlı değilse veriler `api/seed/catalog.json` dosyasından gelir.

## Azure'a kurulum (portal)

Şu anki kurulum bu adımlarla yapıldı: kaynak grubu `senefe-rg`, Cosmos DB West Europe / Germany West Central, Static Web App'in API bölgesi West US 2.

Bir kez gerekenler: [Azure hesabı](https://azure.microsoft.com/free/) ve Node.js 20+. Komutlar PowerShell içindir.

**1. Cosmos DB for NoSQL hesabı**

Portal → **Azure Cosmos DB → + Oluştur → Azure Cosmos DB for NoSQL**.

| Alan | Değer |
|---|---|
| Kaynak grubu | `senefe-rg` (yeni) |
| Kapasite modu | Sağlanan aktarım hızı (Serverless ücretsiz katmana girmez) |
| Ücretsiz Katman İndirimini Uygula | Uygula |
| Toplam hesap aktarım hızını sınırla | İşaretli (1000 RU/s) |
| Kullanılabilirlik alanları, coğrafi yedeklilik, çok bölgeli yazma | Devre dışı |
| Ağ | Tüm ağlar |
| Yedekleme | Periyodik, yerel olarak yedekli |

Veritabanını ve kapsayıcıları elle açmaya gerek yok; 2. adımdaki betik oluşturur.

**2. Test verisini yükleme**

Cosmos DB → **Ayarlar → Anahtarlar → Birincil bağlantı dizesi**'ni kopyalayın, sonra `api` klasöründe:

```powershell
npm install
$env:COSMOS_CONNECTION_STRING = "<birincil bağlantı dizesi>"
npm run seed
```

Beklenen çıktı: `23 tur yüklendi, 0 eski tur silindi → senefe`. Aynı pencerede `node ..\scripts\dev-server.js` ile site, Cosmos'a bağlı olarak http://localhost:7071 adresinde denenebilir.

**3. Static Web App**

Portal → **Static Web Apps → + Oluştur**.

| Alan | Değer |
|---|---|
| Kaynak grubu | `senefe-rg` |
| Plan türü | Ücretsiz |
| Dağıtım kaynağı | Diğer |
| Azure Functions API bölgesi | West Europe; seçilemiyorsa East US 2, Central US ya da West US 2 |

Oluşunca **Ayarlar → Ortam değişkenleri → Production**'a ekleyin ve **Uygula**'ya basın:

| Ad | Değer |
|---|---|
| `COSMOS_CONNECTION_STRING` | Cosmos DB birincil bağlantı dizesi |
| `COSMOS_DATABASE` | `senefe` |

**4. Yayınlama**

**Genel bakış → Dağıtım belirtecini yönet**'ten belirteci kopyalayın, sonra proje klasöründe:

```powershell
npm run build
$env:SWA_CLI_DEPLOYMENT_TOKEN = "<dağıtım belirteci>"
npx @azure/static-web-apps-cli deploy ./dist --api-location ./api --api-language node --api-version 20 --env production
```

Son satırdaki adreste `/api/health` `"source": "cosmos"` döndürüyorsa kurulum tamamdır. Site kodu değiştiğinde yalnızca bu 4. adım tekrarlanır.

### Alternatif: komut satırından tek seferde (Bicep)

[Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) kuruluysa 1. ve 3. adımları `infra/main.bicep` şablonu yapar (ortam değişkenleri dahil):

```powershell
az login
az group create --name senefe-rg --location westeurope
az deployment group create --resource-group senefe-rg --template-file infra/main.bicep
```

Ardından 2. ve 4. adımlarla devam edin; bağlantı dizesi ve belirteç şu komutlarla da alınabilir:

```powershell
az cosmosdb keys list --type connection-strings --resource-group senefe-rg --name <cosmosAccountName> --query "connectionStrings[0].connectionString" -o tsv
az staticwebapp secrets list --name <staticWebAppName> --resource-group senefe-rg --query "properties.apiKey" -o tsv
```

Aboneliğinizde zaten ücretsiz katmanda bir Cosmos hesabı varsa şablona `--parameters cosmosFreeTier=false` verin (ücretli olur). Static Web Apps bölgesi aboneliğinizde kapalıysa `--parameters swaLocation=westus2` ekleyin.

## GitHub ile otomatik yayın

`main` dalına her gönderimde `.github/workflows/deploy.yml` çalışır: önce `js/data.js`'teki turları Cosmos DB'ye aktarır, sonra siteyi ve API'yi Static Web App'e yayınlar. Yani tur eklemek, silmek ya da siteyi değiştirmek için dosyayı düzenleyip commit ve push yapmak yeterlidir.

Depoda **Settings → Secrets and variables → Actions → New repository secret** ile iki gizli değer tanımlanmalı:

| Ad | Değer |
|---|---|
| `COSMOS_CONNECTION_STRING` | Cosmos DB → Anahtarlar → birincil bağlantı dizesi |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Static Web App → Genel bakış → Dağıtım belirtecini yönet |

Çalışmaların durumu deponun **Actions** sekmesinde görünür.

## Veriyi güncelleme

- **Turları data.js'te düzenleyip veritabanına aktarmak:** commit + push (GitHub Actions aktarır) ya da elle `npm run export`, ardından `api` klasöründe `npm run seed`. Site yeniden yayımlanmadan güncel veriyi gösterir; API yanıtları 60 saniye önbelleklenir.
- **Doğrudan veritabanında düzenlemek:** Azure Portal → Cosmos DB hesabı → Veri Gezgini → `senefe` / `tours`. Site en geç 1 dakika içinde güncellenir.

## Notlar

- Claude'da yayımlanan önizleme dış adreslere bağlanamaz; orada site her zaman gömülü veriyi gösterir.
- Bağlantı dizesi ve dağıtım belirteci yalnızca Azure'daki uygulama ayarlarında ve kendi terminalinizde durur; depoya eklemeyin (`api/local.settings.json` `.gitignore`'dadır).

## Katkıda Bulunanlar

- Buğra Yiğit Şenefe: Full-Stack Geliştirici
- Claude: Otomasyon
