<!-- SharePoint Manager Project - Copilot Instructions -->

## 🏗️ Architectuur Overzicht

**Stack**: Node.js/Express backend + Vanilla JS frontend, Microsoft Graph API integratie, Azure AD auth

**Kritieke gegevensstromen**:
1. Frontend → `/api/auth/login` → Azure AD → callback met sessionId in URL
2. Frontend stores sessionId in `state.sessionId`; alle API calls voegen `X-Session-ID` header toe via `fetchJson()`
3. Backend haalt token uit `tokenCache.get(sessionId)` in auth middleware (`requireAuth`)
4. SharePointService gebruikt Microsoft Graph client voor alle site/file/version operations

## 📁 Architecturale Componenten

### Backend (Node.js/Express)
- **`server.js`**: Express app setup, static files, auth/sharepoint route mounting
- **`routes/auth.js`**: OAuth flow (login → callback → token storage); sessie-gebaseerd token cache
- **`routes/sharepoint.js`**: Hoofd API endpoints; SSE-streaming voor long-running cleanup tasks
- **`routes/optimizedSharepoint.js`**: Geoptimaliseerde versie met async generators voor streaming file scans
- **`services/authService.js`**: MSAL node wrapper voor token acquisition (code, silent, refresh)
- **`services/sharePointService.js`**: Microsoft Graph client wrapper; batch scanning, retrying, caching, throttling

### Frontend (Vanilla JS, gemodulariseerd)
- **`app.js`**: Hoofd app class; initialiseert UI, auth checks, globale event listeners
- **`js/state.js`**: Centrale state object (`sessionId`, `sites`, `currentSite`, cleanup flags, caches)
- **`js/api.js`**: Fetch wrapper; injecteert automatisch sessionId headers, error handling
- **`js/ui.js`**: DOM helpers ($, show/hide, status messages, progress bar updates)
- **`js/cleanup.js`**: Dry run result processing, file version rendering, icon mapping
- **`js/sse.js`**: Server-Sent Events verbinding; luistert naar progress/batch/folder events van server
- **`js/history.js`**: Lokale storage voor cleanup history per site
- **`js/optimizedScan.js`**: Frontend SSE client voor geoptimaliseerde file scans

## 🔄 Kritieke Workflows

### Authenticatie Flow
```
1. User klikt "Inloggen" → app.login() → fetch /api/auth/login
2. Backend retourneert Azure AD URL → redirect naar Azure
3. Azure redirects naar /auth/callback?code=XXX
4. Backend wisselt code voor token, slaat op in tokenCache, redirect naar /?session=XXX
5. Frontend haalt sessionId uit URL, slaat op in state.sessionId
6. Alle toekomstige requests voegen "X-Session-ID: XXX" header toe
```

### Versie Cleanup (Dry-run → Real)
```
POST /api/sharepoint/sites/:siteId/cleanup?dryRun=true
  → SharePointService.bulkCleanupSite(siteId, versionsToKeep, dryRun=true)
  → Scans alle libraries, genereerde batch SSE events (onFolderProcessing, onBatchComplete, onProgress)
  → Frontend luistert via EventSource, accumuleert file/version info
  → Toont resultaten met "Dry Run" label
  
POST /api/sharepoint/sites/:siteId/cleanup (zonder ?dryRun=true)
  → Dezelfde logica maar verwijdert daadwerkelijk versies
```

## 🚀 Developer Workflows

### Development starten
```bash
npm run dev  # Starts nodemon, watch mode, port 3000
# OF
npm start    # Direct node server.js
```

### .env Configuratie vereist
```env
TENANT_ID=<azure-tenant-id>
CLIENT_ID=<azure-app-id>
CLIENT_SECRET=<azure-app-secret>
PORT=3000
REDIRECT_URI=http://localhost:3000/auth/callback
GRAPH_API_URL=https://graph.microsoft.com/v1.0
```

### Test endpoints
- `GET /api/sharepoint/sites/test` → Mock sites (geen auth vereist)
- `GET /api/sharepoint/sites/:siteId/test-permissions` → Permissions check

## 🔌 Microsoft Graph Integratie

**Authenticatie scopes** (in authService.js):
- `Sites.Read.All` — lezen site metadata
- `Sites.ReadWrite.All` — lezen/schrijven site content
- `Sites.Manage.All` — manage site lifecycle

**Retry/Throttling strategy** (sharePointService.js):
- `retryWithBackoff()` — exponential backoff (max 3 pogingen)
- `throttleRequest()` — throttle API calls (100ms min interval)
- Request timeout: 10 minuten op server niveau

## 📊 Caching Patterns

| Cache | TTL | Gebruik | Opslaglocatie |
|-------|-----|---------|------|
| Token | expiresOn field | Sessie-gebaseerd in memory | `tokenCache` Map in auth.js |
| Version info | 5 min | De-dupliqueer Graph calls | `versionCache` in SharePointService |
| Site scan results | 30 min | Hergebruik grote scans | `siteScanCache` in SharePointService |
| Cleanup history | N/A | Lokale audit trail | Browser localStorage (history.js) |

## ⚠️ Veelvoorkomende Pitfalls

1. **Token expiratie**: Frontend checkt niet automatisch; SSE disconnect → 401. User moet re-login
2. **SSE heartbeats**: Server stuurt heartbeat (`:` comment) elke 15s om connection alive te houden
3. **Batch size**: Async generator yields 50 files per batch om memory overhead te beperken
4. **Session cleanup**: tokenCache.delete() niet automatisch (geen TTL). Sessions ophopen in memory
5. **Graph API throttling**: Geen rate-limit handling; kan 429 returen bij hoge load
6. **Bulk scan resumption**: Bei app restart kunnen gelijktijdige requests naar dezelfde site → 500 errors. Oplossing: retry logic met exponential backoff (3 pogingen, max 10s) in `continueBulkDryRun()` + 500ms delay tussen requests
7. **Error recovery**: Gefaalde sites worden skip (niet thrown) zodat bulk scan doorgaat met resterende sites

## 🔧 Key Files for Quick Navigation

- **Auth flow**: `routes/auth.js` (token management), `services/authService.js` (MSAL)
- **API cleanup logic**: `routes/sharepoint.js` (line 446+), `services/sharePointService.js` (bulkCleanupSite method)
- **Frontend state**: `js/state.js` (centraal), `app.js` constructor (initialization)
- **Real-time updates**: `js/sse.js` (EventSource client), `routes/sharepoint.js` sendSSEEvent helpers
- **Demo mode**: `/api/sharepoint/sites/test` endpoint (test data)

## 💡 Aanbevolen Conventions

- Use `setupSSEResponse()` + `sendSSEEvent()` helpers voor streaming endpoints
- Import state modules als ES6 modules in frontend; backend uses CommonJS
- Wrap alle Graph calls in `retryWithBackoff()` voor reliability
- Injecteert `X-Session-ID` header in alle frontend API calls via fetchJson wrapper
- Cleanup operaties stuurt progress events elke N files (in app.js progressCallback)