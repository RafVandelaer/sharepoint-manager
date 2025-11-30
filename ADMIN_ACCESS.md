# Admin Access - SharePoint Manager

## Je Admin Credentials

**Admin API Key:**
```
776ff79652791ac1ffbd0ba4dc4d83cbbcd368cb01ea313dd69c6e9cf06dd5ed
```

⚠️ **Belangrijk:** Bewaar deze key veilig! Dit is de enige manier om toegang te krijgen tot de admin logs.

## 📊 Admin Logs Dashboard

**URL:** [http://localhost:3000/admin-logs.html](http://localhost:3000/admin-logs.html)

Een interactief dashboard voor real-time log monitoring:

### Features:
- 🔐 **Beveiligde login** met admin API key
- 📊 **Live statistieken**: Total events, active sessions, tenants, errors
- 🔍 **Filters**: Category, datum, session ID
- 🎨 **Kleurgecodeerd**: INFO (blauw), SUCCESS (groen), WARNING (oranje), ERROR (rood), AUDIT (paars)
- 🔄 **Auto-refresh**: Elke 30 seconden automatische update
- 📱 **Responsive**: Werkt op desktop, tablet en mobiel

### Security:
- ✅ Admin key wordt **alleen in memory** opgeslagen (nooit localStorage)
- ✅ Bij logout wordt key volledig gewist
- ✅ Alle API calls vereisen admin authenticatie
- ✅ Geen credentials in URL (behalve tijdens API calls via query param)

## Logs Bekijken

### In de Browser
Open één van deze URLs in je browser:

**Alle logs (vandaag):**
```
http://localhost:3000/api/logs?adminKey=776ff79652791ac1ffbd0ba4dc4d83cbbcd368cb01ea313dd69c6e9cf06dd5ed
```

**Alleen cleanup logs:**
```
http://localhost:3000/api/logs?adminKey=776ff79652791ac1ffbd0ba4dc4d83cbbcd368cb01ea313dd69c6e9cf06dd5ed&category=CLEANUP
```

**Alleen auth logs:**
```
http://localhost:3000/api/logs?adminKey=776ff79652791ac1ffbd0ba4dc4d83cbbcd368cb01ea313dd69c6e9cf06dd5ed&category=AUTH
```

**Logs van specifieke datum:**
```
http://localhost:3000/api/logs?adminKey=776ff79652791ac1ffbd0ba4dc4d83cbbcd368cb01ea313dd69c6e9cf06dd5ed&date=2025-11-23
```

### Met cURL (Terminal)
Voor server/productie gebruik met header authenticatie:

```bash
# Alle logs
curl -H "X-Admin-Key: 776ff79652791ac1ffbd0ba4dc4d83cbbcd368cb01ea313dd69c6e9cf06dd5ed" \
  http://localhost:3000/api/logs

# Cleanup logs
curl -H "X-Admin-Key: 776ff79652791ac1ffbd0ba4dc4d83cbbcd368cb01ea313dd69c6e9cf06dd5ed" \
  "http://localhost:3000/api/logs?category=CLEANUP"

# Logs van specifieke sessie
curl -H "X-Admin-Key: 776ff79652791ac1ffbd0ba4dc4d83cbbcd368cb01ea313dd69c6e9cf06dd5ed" \
  "http://localhost:3000/api/logs?sessionId=abc123"
```

## Beschikbare Filters

| Parameter | Beschrijving | Voorbeeld |
|-----------|--------------|-----------|
| `category` | Filter op categorie: TENANT, AUTH, CLEANUP, VERSIONING, SERVER | `category=CLEANUP` |
| `date` | Filter op datum (YYYY-MM-DD), default = vandaag | `date=2025-11-23` |
| `sessionId` | Filter op specifieke user sessie | `sessionId=abc123...` |

## Gelogde Events

**TENANT:**
- `CONFIG_CREATED` - Wanneer een user zijn Azure App Registration configureert

**AUTH:**
- `LOGIN_SUCCESS` - Succesvolle login
- `LOGOUT` - User logt uit

**CLEANUP:**
- `DRY_RUN_STARTED` - Dry run scan gestart
- `DRY_RUN_COMPLETED` - Dry run succesvol afgerond
- `CLEANUP_STARTED` - Echte cleanup gestart
- `CLEANUP_COMPLETED` - Cleanup succesvol afgerond
- `CLEANUP_FAILED` - Cleanup mislukt

**VERSIONING:**
- `VERSIONING_UPDATED` - Versioning instellingen gewijzigd

**SERVER:**
- `STARTING` - Server wordt opgestart
- `STARTED` - Server succesvol gestart

### Voorbeeld Log Entries

**Tenant Config:**
```json
{
  "timestamp": "2025-11-23T14:30:00.123Z",
  "level": "AUDIT",
  "category": "TENANT",
  "action": "CONFIG_CREATED",
  "sessionId": "abc123...",
  "tenantId": "aaa70c2d-7ae2-4ad3-a05a-3748de704ce0",
  "clientId": "12345678...",
  "hasRedirectUri": true
}
```

**Login:**
```json
{
  "timestamp": "2025-11-23T14:31:00.456Z",
  "level": "SUCCESS",
  "category": "AUTH",
  "action": "LOGIN_SUCCESS",
  "sessionId": "abc123...",
  "authType": "user",
  "account": "user@contoso.com",
  "tenantId": "aaa70c2d-7ae2-4ad3-a05a-3748de704ce0",
  "expiresInMinutes": 60
}
```

**Cleanup Scan:**
```json
{
  "timestamp": "2025-11-23T14:32:00.789Z",
  "level": "INFO",
  "category": "CLEANUP",
  "action": "DRY_RUN_STARTED",
  "sessionId": "abc123...",
  "siteId": "sebastianmortelmans.sharepoint.com,aaa70c2d...",
  "siteName": "My SharePoint Site",
  "tenantId": "aaa70c2d-7ae2-4ad3-a05a-3748de704ce0",
  "versionsToKeep": 10,
  "mode": "dry-run"
}
```

**Cleanup Result:**
```json
{
  "timestamp": "2025-11-23T14:35:00.123Z",
  "level": "SUCCESS",
  "category": "CLEANUP",
  "action": "DRY_RUN_COMPLETED",
  "sessionId": "abc123...",
  "siteId": "sebastianmortelmans.sharepoint.com,aaa70c2d...",
  "siteName": "My SharePoint Site",
  "tenantId": "aaa70c2d-7ae2-4ad3-a05a-3748de704ce0",
  "filesProcessed": 150,
  "versionsRemoved": 500,
  "duration": 180000
}
```

**Versioning Update:**
```json
{
  "timestamp": "2025-11-23T14:40:00.456Z",
  "level": "AUDIT",
  "category": "VERSIONING",
  "action": "VERSIONING_UPDATED",
  "sessionId": "abc123...",
  "siteId": "sebastianmortelmans.sharepoint.com,aaa70c2d...",
  "driveId": "b!LQynquJ600qgWjdI3nBM4HTc...",
  "libraryName": "Documents",
  "tenantId": "aaa70c2d-7ae2-4ad3-a05a-3748de704ce0",
  "settings": {
    "enabled": true,
    "minorEnabled": false,
    "majorLimit": 100,
    "minorLimit": null,
    "forceCheckout": false,
    "automatic": true
  }
}
```

**Key velden voor monitoring:**
- `tenantId`: Welke Azure tenant (bijna altijd aanwezig)
- `siteName`: Menselijk leesbare site naam
- `libraryName`: Document library naam
- `account`: Gebruikersnaam
- `filesProcessed` / `versionsRemoved`: Cleanup metrics
- `duration`: Operatie duur in milliseconds (180000 = 3 minuten)

## Beveiliging

✅ Zonder admin key: `401 Unauthorized`
✅ Met verkeerde key: `403 Forbidden`
✅ Met correcte key: `200 OK` met log data

De key is opgeslagen in `.env` (niet in git) en wordt nooit gelogd.

## Admin Key Wijzigen

Als je de admin key wilt wijzigen:

1. Genereer nieuwe key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

2. Update `.env`:
```bash
ADMIN_API_KEY=jouw-nieuwe-key-hier
```

3. Herstart de server:
```bash
npm run dev
```

## Troubleshooting

**403 Forbidden bij correcte key?**
- Check of `.env` file bestaat in project root
- Check of `ADMIN_API_KEY` correct is ingesteld
- Herstart de server na het wijzigen van `.env`

**Logs niet zichtbaar?**
- Check of de `/logs` directory bestaat
- Check of er vandaag al events zijn gelogd
- Probeer een andere datum: `?date=2025-11-23`
