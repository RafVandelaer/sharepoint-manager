# Logging Systeem

## Overzicht

Het logging systeem houdt alle belangrijke acties bij op server-side niveau voor auditing en debugging doeleinden.

## Gelogde Events

### Tenant Configuration
- **CONFIG_CREATED**: Wanneer een gebruiker zijn Azure App Registration configureert
  - Bevat: sessionId, **tenantId**, clientId (afgekapt), redirectUri

### Authentication
- **LOGIN_SUCCESS**: Succesvolle authenticatie
  - Bevat: sessionId, authType, gebruikersnaam, **tenantId**, verlooptijd
- **LOGOUT**: Uitloggen
  - Bevat: sessionId, hadToken, hadConfig, **tenantId**

### Cleanup/Scan Operations
- **DRY_RUN_STARTED**: Start van een dry run scan
  - Bevat: sessionId, siteId, **siteName**, **tenantId**, versionsToKeep
- **DRY_RUN_COMPLETED**: Dry run afgerond
  - Bevat: sessionId, siteId, **siteName**, **tenantId**, filesProcessed, versionsRemoved, duration
- **CLEANUP_STARTED**: Start van een echte cleanup
  - Bevat: sessionId, siteId, **siteName**, **tenantId**, versionsToKeep
- **CLEANUP_COMPLETED**: Cleanup afgerond
  - Bevat: sessionId, siteId, **siteName**, **tenantId**, filesProcessed, versionsRemoved, duration
- **CLEANUP_FAILED**: Cleanup mislukt
  - Bevat: sessionId, siteId, error, stack trace

### Versioning Changes
- **VERSIONING_UPDATED**: Versioning instellingen gewijzigd
  - Bevat: sessionId, siteId, driveId, **libraryName**, **tenantId**, settings (enabled, automatic, majorLimit, etc.)

### Server Events
- **SERVER.STARTING**: Server wordt opgestart
- **SERVER.STARTED**: Server succesvol gestart
  - Bevat: port, url, timestamp

## Log Bestanden

Logs worden weggeschreven naar de `/logs` directory:

### Bestandsstructuur
```
logs/
  ├── app-2025-11-23.log          # Alle events van vandaag
  ├── tenant-2025-11-23.log       # Alleen tenant config events
  ├── auth-2025-11-23.log         # Alleen authenticatie events
  ├── cleanup-2025-11-23.log      # Alleen cleanup/scan events
  └── versioning-2025-11-23.log   # Alleen versioning events
```

### Log Formaat
Elk log entry is een JSON object per regel:
```json
{
  "timestamp": "2025-11-23T14:30:00.123Z",
  "level": "INFO|SUCCESS|WARNING|ERROR|AUDIT",
  "category": "TENANT|AUTH|CLEANUP|VERSIONING|SERVER",
  "action": "CONFIG_CREATED",
  "sessionId": "abc123...",
  "tenantId": "tenant-guid",
  "siteName": "My SharePoint Site",
  "clientId": "client-id...",
  ...extra data
}
```

**Belangrijke velden:**
- `tenantId`: Welke Azure tenant (aanwezig bij bijna alle events)
- `siteName`: Menselijk leesbare site naam (bij cleanup events)
- `libraryName`: Document library naam (bij versioning events)
- `account`: Gebruikersnaam (bij auth events)
- `filesProcessed`, `versionsRemoved`: Cleanup metrics
- `duration`: Hoe lang de operatie duurde (in milliseconds)

## API Endpoints

### Logs opvragen (Admin Only)

⚠️ **Authenticatie vereist**: Dit endpoint is alleen toegankelijk voor admins met een geldige API key.

```bash
# Met header (aanbevolen)
GET /api/logs?date=2025-11-23&category=CLEANUP
Header: X-Admin-Key: your-admin-api-key

# Met query parameter (voor browser testing)
GET /api/logs?date=2025-11-23&adminKey=your-admin-api-key
```

**Authenticatie:**
- Vereist: `X-Admin-Key` header of `adminKey` query parameter
- API key instellen: zie "Admin Configuratie" sectie hieronder

**Query Parameters:**
- `date` (optioneel): YYYY-MM-DD formaat, default = vandaag
- `category` (optioneel): TENANT|AUTH|CLEANUP|VERSIONING|SERVER
- `sessionId` (optioneel): Filter op specifieke sessie
- `adminKey` (optioneel): Admin API key (alternatief voor header)

**Response (Success):**
```json
{
  "logs": [
    {
      "timestamp": "2025-11-23T14:30:00.123Z",
      "level": "INFO",
      "category": "CLEANUP",
      "action": "DRY_RUN_STARTED",
      "sessionId": "abc123",
      "siteId": "site-id",
      "versionsToKeep": 10
    }
  ],
  "count": 1
}
```

**Response (Unauthorized):**
```json
{
  "error": "Unauthorized",
  "message": "Admin authentication required. Provide X-Admin-Key header or adminKey query parameter."
}
```

**Response (Forbidden):**
```json
{
  "error": "Forbidden",
  "message": "Invalid admin key."
}
```

## Console Output

Logs worden ook naar de console geschreven met kleurcodering:

- **INFO**: Cyan
- **SUCCESS**: Groen
- **WARNING**: Geel
- **ERROR**: Rood
- **AUDIT**: Magenta

Voorbeeld:
```
[2025-11-23T14:30:00.123Z] [AUDIT] [TENANT] CONFIG_CREATED {"sessionId":"abc123","tenantId":"..."}
[2025-11-23T14:31:00.456Z] [SUCCESS] [AUTH] LOGIN_SUCCESS {"sessionId":"abc123","authType":"user"}
[2025-11-23T14:32:00.789Z] [INFO] [CLEANUP] DRY_RUN_STARTED {"sessionId":"abc123","siteId":"..."}
```

## Admin Configuratie

### API Key Instellen

1. **Genereer een veilige admin key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

2. **Stel de environment variable in:**

**.env bestand (development):**
```bash
ADMIN_API_KEY=jouw-gegenereerde-key-hier
```

**Productie (Azure App Service, Heroku, etc.):**
Stel de environment variable in via de platform configuratie.

3. **Herstart de server** om de nieuwe key te activeren.

### Logs Opvragen met cURL

```bash
# Met header (aanbevolen voor scripts)
curl -H "X-Admin-Key: jouw-admin-key" \
  "http://localhost:3000/api/logs?date=2025-11-23&category=CLEANUP"

# Met query parameter (handig voor browser testing)
curl "http://localhost:3000/api/logs?adminKey=jouw-admin-key&date=2025-11-23"
```

### Logs Opvragen in Browser

Open in je browser:
```
http://localhost:3000/api/logs?adminKey=jouw-admin-key
http://localhost:3000/api/logs?adminKey=jouw-admin-key&category=CLEANUP
http://localhost:3000/api/logs?adminKey=jouw-admin-key&sessionId=abc123
```

⚠️ **Beveiligingstip**: Gebruik query parameter alleen voor testing in development. In productie altijd de header methode gebruiken.

## Retentie

Standaard worden logs 30 dagen bewaard. Oudere log bestanden kunnen automatisch worden verwijderd door de `cleanupOldLogs()` methode aan te roepen.

## Privacy & Security

- **Client secrets worden NOOIT gelogd** (alleen afgekapte versie)
- **Access tokens worden NOOIT gelogd**
- Session IDs zijn crypto-secure random strings
- Logs bevatten alleen metadata, geen gevoelige documenten/content
- Gebruikersnamen worden alleen gelogd bij authenticatie events

## Gebruik in Code

```javascript
const logger = require('./services/logger');

// Log tenant config
logger.logTenantConfig('CONFIG_CREATED', sessionId, {
  tenantId: 'xxx',
  clientId: 'yyy'
});

// Log cleanup
logger.logCleanup('DRY_RUN_STARTED', sessionId, {
  siteId: 'abc',
  versionsToKeep: 10
});

// Log cleanup result
logger.logCleanupResult(sessionId, siteId, {
  success: true,
  filesProcessed: 100,
  versionsRemoved: 500,
  duration: 30000
}, dryRun = true);

// Log versioning
logger.logVersioning('VERSIONING_UPDATED', sessionId, {
  siteId: 'abc',
  libraryName: 'Documents',
  settings: { automatic: true }
});

// Log errors
logger.logError('CLEANUP', 'SCAN_FAILED', error, sessionId, {
  siteId: 'abc'
});
```

## Troubleshooting

### Logs worden niet geschreven
- Controleer of de `/logs` directory bestaat (wordt automatisch aangemaakt)
- Controleer schrijfrechten op de directory
- Check server console voor "Failed to write to log file" errors

### Te grote log bestanden
- Implementeer log rotatie (dagelijks per bestand)
- Gebruik `cleanupOldLogs(30)` om oude logs te verwijderen
- Overweeg externe log aggregatie (ELK stack, Splunk, etc.)

### Logs opvragen (met admin authenticatie)
```bash
# Vandaag alle logs
curl -H "X-Admin-Key: jouw-admin-key" http://localhost:3000/api/logs

# Specifieke datum en categorie
curl -H "X-Admin-Key: jouw-admin-key" \
  "http://localhost:3000/api/logs?date=2025-11-23&category=CLEANUP"

# Sessie logs
curl -H "X-Admin-Key: jouw-admin-key" \
  "http://localhost:3000/api/logs?sessionId=abc123"

# Browser (met query parameter)
# http://localhost:3000/api/logs?adminKey=jouw-admin-key
```
