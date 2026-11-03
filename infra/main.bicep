// =========================================================
// OTA Web App — Azure kaynakları (ücretsiz katmanlar)
//   • Azure Cosmos DB for NoSQL, ücretsiz katman (1000 RU/s + 25 GB)
//     veritabanı "senefe", kapsayıcılar "tours" (/scope) ve "meta" (/id)
//   • Azure Static Web Apps, Free plan: site + yönetilen Functions API
//     Cosmos bağlantı dizesi API'ye uygulama ayarı olarak verilir.
//
// Dağıtım: infra/README bölümündeki az komutlarına bakın.
// =========================================================

@description('Kaynak adlarının ön eki (küçük harf, rakam)')
param prefix string = 'senefe'

@description('Cosmos DB bölgesi')
param location string = resourceGroup().location

@description('Static Web Apps yalnızca bazı bölgelerde var: westeurope, centralus, eastus2, westus2, eastasia')
param swaLocation string = 'westeurope'

@description('Abonelik başına yalnızca bir Cosmos hesabı ücretsiz katmanda olabilir; doluysa false verin (ücretli olur).')
param cosmosFreeTier bool = true

var suffix = uniqueString(resourceGroup().id)
var databaseName = 'senefe'

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: '${prefix}-cosmos-${suffix}'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: cosmosFreeTier
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    locations: [ { locationName: location, failoverPriority: 0, isZoneRedundant: false } ]
    capacity: { totalThroughputLimit: 1000 } // ücretsiz sınırın üstüne çıkılmasın
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: databaseName
  properties: {
    resource: { id: databaseName }
    options: { throughput: 1000 } // kapsayıcılar arasında paylaşılır
  }
}

resource toursContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'tours'
  properties: {
    resource: { id: 'tours', partitionKey: { paths: [ '/scope' ], kind: 'Hash' } }
  }
}

resource metaContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'meta'
  properties: {
    resource: { id: 'meta', partitionKey: { paths: [ '/id' ], kind: 'Hash' } }
  }
}

resource site 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${prefix}-web-${suffix}'
  location: swaLocation
  sku: { name: 'Free', tier: 'Free' }
  properties: {}
}

resource siteSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: site
  name: 'appsettings'
  properties: {
    COSMOS_CONNECTION_STRING: cosmos.listConnectionStrings().connectionStrings[0].connectionString
    COSMOS_DATABASE: databaseName
  }
}

output cosmosAccountName string = cosmos.name
output staticWebAppName string = site.name
output siteUrl string = 'https://${site.properties.defaultHostname}'
