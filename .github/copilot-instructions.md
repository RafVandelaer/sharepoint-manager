<!-- SharePoint Manager Project - Copilot Instructions -->

## Architectuur Overzicht

**Stack**: Node.js/Express backend + Vanilla JS frontend, Microsoft Graph API integratie, Azure AD auth

**KRITIEK: GEEN ENVIRONMENT VARIABLES**
Alle Azure App Registration credentials (TENANT_ID, CLIENT_ID, CLIENT_SECRET) worden **door eindgebruikers zelf ingesteld via de browser**. De server heeft GEEN hardcoded credentials, geen .env files, en geen environment variables nodig. Elke gebruiker brengt zijn eigen Azure config mee.

**Kritieke gegevensstromen**:
1. Gebruiker opent web app → vult Azure App Registration credentials in via config modal
2. POST `/api/auth/config` → `configService` slaat config op in memory per sessionId
3. GET `/api/auth/login` (met `X-Session-ID` header) → AuthService wordt dynamisch aangemaakt met user's config
4. Frontend → `/api/auth/login` → Azure AD → callback met sessionId in `state` parameter
5. Frontend stores sessionId in `state.sessionId`; alle API calls voegen `X-Session-ID` header toe via `fetchJson()`
6. Backend haalt config uit `configService.getConfig(sessionId)`, maakt AuthService instance, haalt token
7. SharePointService gebruikt Microsoft Graph client voor alle site/file/version operations

## Architecturale Componenten

### Backend (Node.js/Express)
- **`server.js`**: Express app setup, static files, auth/sharepoint route mounting; **GEEN env var validation**
- **`routes/auth.js`**: OAuth flow + config management; POST `/api/auth/config` voor user credentials
- **`routes/sharepoint.js`**: Hoofd API endpoints; SSE-streaming voor long-running cleanup tasks
- **`routes/optimizedSharepoint.js`**: Geoptimaliseerde versie met async generators voor streaming file scans
- **`services/configService.js`**: **NIEUW** - In-memory config store per sessionId (tenantId, clientId, clientSecret)
- **`services/authService.js`**: MSAL node wrapper; accepts dynamic config in constructor (no env vars)
- **`services/sharePointService.js`**: Microsoft Graph client wrapper; batch scanning, retrying, caching, throttling

### Frontend (Vanilla JS, gemodulariseerd)
- **`app.js`**: Hoofd app class; initialiseert UI, auth checks, globale event listeners
- **`js/state.js`**: Centrale state object (`sessionId`, `sites`, `currentSite`, cleanup flags, caches)
- **`js/api.js`**: Fetch wrapper; injecteert automatisch sessionId headers, error handling
- **`js/config.js`**: **NIEUW** - Config modal management, Azure setup instructions, credential validation
- **`js/ui.js`**: DOM helpers ($, show/hide, status messages, progress bar updates)
- **`js/cleanup.js`**: Dry run result processing, file version rendering, icon mapping
- **`js/sse.js`**: Server-Sent Events verbinding; luistert naar progress/batch/folder events van server
- **`js/history.js`**: Lokale storage voor cleanup history per site
- **`js/optimizedScan.js`**: Frontend SSE client voor geoptimaliseerde file scans

## Kritieke Workflows

### Configuratie & Authenticatie Flow (Browser-Based)
```
1. User opent app → geen sessionId of config → config modal verschijnt automatisch
2. User vult in:
   - Tenant ID (Azure Entra Directory ID)
   - Client ID (App Registration Application ID)
   - Client Secret (from Certificates & secrets)
3. POST /api/auth/config → configService.setConfig(sessionId, { tenantId, clientId, clientSecret, redirectUri })
4. Frontend slaat sessionId op in localStorage
5. User klikt "Inloggen" → app.login()
6. GET /api/auth/login (header: X-Session-ID) → AuthService(config) instantiated
7. Backend retourneert Azure AD URL (met state=sessionId)
8. Azure redirects naar /auth/callback?code=XXX&state=sessionId
9. Backend haalt config via sessionId, wisselt code voor token, slaat token op in tokenCache
10. Redirect naar UI met session=sessionId
11. Alle toekomstige requests voegen "X-Session-ID" header toe
```

**Multi-user architectuur:**
- Elke gebruiker krijgt eigen sessionId bij config setup
- ConfigService.configCache: Map<sessionId, { tenantId, clientId, clientSecret, redirectUri }>
- TokenCache: Map<sessionId, { accessToken, account, expiresOn }>
- Volledige isolatie: user A's config/token != user B's config/token
- Delegated tokens: elke user heeft Graph permissions namens zichzelf
- **GEEN** server-side secrets storage; config en tokens alleen in-memory tijdens sessie
- Bij server restart: alle sessies verloren, users moeten opnieuw config invoeren
- App Registration instructies zichtbaar in config modal voor self-service setup

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

## Developer Workflows

### Development starten
```bash
npm run dev  # Starts nodemon, watch mode, port 3000
# OF
npm start    # Direct node server.js
```

**GEEN environment variables nodig!** Server start zonder config. Users brengen hun eigen Azure App Registration mee via de browser.

### Configuratie & Security (Browser-Based, GEEN env vars)

**Core Principe:**
Er worden **GEEN** environment variables of `.env` files gebruikt voor Azure credentials. Elke gebruiker configureert zijn eigen Azure App Registration via een webformulier. Credentials worden in-memory opgeslagen per sessie (ConfigService) en **nooit** gepersisteerd op disk of in environment vars.

**Waarom geen .env of env vars:**
- Voorkomt per ongeluk committen van secrets
- Vermijdt verspreiding van secrets tussen developers
- Elke user gebruikt zijn eigen tenant/app registration
- Geen shared secrets = betere security posture
- Self-service: geen IT-ticketing voor credentials

**User Configuratie Flow:**
1. Gebruiker opent web app
2. Config modal verschijnt met setup instructies
3. Gebruiker maakt Azure App Registration aan (via Azure Portal)
4. Gebruiker vult in browser in:
   - Tenant ID
   - Client ID
   - Client Secret
5. Credentials worden ge-POST naar `/api/auth/config`
6. Server genereert sessionId, slaat config op in-memory
7. Bij logout of server restart: config verloren, user moet opnieuw invoeren

**Azure App Registration Setup (via browser instructies):**
- Name: SharePoint Manager (of naar keuze user)
- Supported account types: "Accounts in this organizational directory only"
- Redirect URI: Web → `https://<jouw-domein>/auth/callback`
- Delegated permissions:
  - `Sites.Read.All`
  - `Sites.ReadWrite.All`
  - `Sites.Manage.All`
- Client secret: 24 months expiry (recommended)

**Security Principes:**
- Least privilege: alleen delegated scopes (Sites.Read.All, Sites.ReadWrite.All, Sites.Manage.All)
- Credentials **nooit** loggen (client secret altijd redacted in logs)
- Tokens + config uitsluitend in-memory (`tokenCache` + `configCache` Maps)
- Geen persistence naar disk, database, of external storage
- SessionId is crypto-secure random (64 chars hex)
- Config validatie: GUID format check voor tenantId/clientId
- HTTPS enforced in productie (redirect URI validation)
- Geen cross-session leakage door strict Map key isolation

**Multi-user Impact:**
- Elke login → eigen delegated token (user's tenant/permissions)
- Geen server-side shared credentials
- Geen cross-tenant access
- User A (Tenant 1) != User B (Tenant 2) volledig geïsoleerd
- Bij server restart: alle users moeten opnieuw config invoeren (stateless design)

**Deployment Checklist (prod):**
1. **GEEN** Azure App Registration nodig op server-side
2. **GEEN** environment variables instellen
3. HTTPS enforced (App Service / reverse proxy level)
4. Observability: basic request + error logging (redact secrets)
5. Optioneel: Rate limiting om brute-force config guessing te voorkomen
6. Optioneel: Session timeout (bijv. 8 uur inactivity → configCache.delete)
7. Documenteer voor users: "Je moet je eigen Azure App Registration aanmaken"

### Test endpoints
- `GET /api/sharepoint/sites/test` → Mock sites (geen auth vereist)
- `GET /api/sharepoint/sites/:siteId/test-permissions` → Permissions check

## Microsoft Graph Integratie

**Authenticatie scopes** (in authService.js, delegated):
- `Sites.Read.All` — lezen site metadata
- `Sites.ReadWrite.All` — lezen/schrijven site content
- `Sites.Manage.All` — manage site lifecycle

**Retry/Throttling strategy** (sharePointService.js):
- `retryWithBackoff()` — exponential backoff (max 3 pogingen)
- `throttleRequest()` — throttle API calls (100ms min interval)
- Request timeout: 10 minuten op server niveau

## Caching Patterns

| Cache | TTL | Gebruik | Opslaglocatie |
|-------|-----|---------|------|
| Config | Session lifetime | Per-user Azure credentials | `configCache` Map in configService |
| Token | expiresOn field | Sessie-gebaseerd in memory | `tokenCache` Map in auth.js |
| Version info | 5 min | De-dupliqueer Graph calls | `versionCache` in SharePointService |
| Site scan results | 30 min | Hergebruik grote scans | `siteScanCache` in SharePointService |
| Cleanup history | N/A | Lokale audit trail | Browser localStorage (history.js) |

## Veelvoorkomende Pitfalls

1. **Config verlies bij server restart**: In-memory config; users moeten opnieuw invoeren. Overwegen: cookie-based persistence (encrypted) of localStorage met server-side decryption.
2. **Token expiratie**: Frontend checkt niet automatisch; SSE disconnect → 401. User moet re-login
3. **SSE heartbeats**: Server stuurt heartbeat (`:` comment) elke 15s om connection alive te houden
4. **Batch size**: Async generator yields 50 files per batch om memory overhead te beperken
5. **Session cleanup**: configCache.delete() + tokenCache.delete() niet automatisch. Implementeer TTL of cron job.
6. **Graph API throttling**: Geen rate-limit handling; kan 429 returen bij hoge load
7. **Bulk scan resumption**: Bij app restart kunnen gelijktijdige requests naar dezelfde site → 500 errors. Oplossing: retry logic met exponential backoff (3 pogingen, max 10s) in `continueBulkDryRun()` + 500ms delay tussen requests
8. **Error recovery**: Gefaalde sites worden skip (niet thrown) zodat bulk scan doorgaat met resterende sites
9. **SharePoint REST permissions**: Delegated token voor Graph werkt mogelijk niet voor SharePoint REST `/_api` endpoints. Vereist AllSites.Read of Sites.FullControl.All delegated permission. Bij 401: defaults (50/10) gebruikt.
10. **GUID validatie**: Frontend valideert GUID format voor tenantId/clientId. Backend moet ook valideren om injection te voorkomen.

## Key Files for Quick Navigation

- **Config management**: `services/configService.js` (in-memory store), `js/config.js` (frontend modal)
- **Auth flow**: `routes/auth.js` (config + token management), `services/authService.js` (MSAL dynamic config)
- **API cleanup logic**: `routes/sharepoint.js` (line 446+), `services/sharePointService.js` (bulkCleanupSite method)
- **Frontend state**: `js/state.js` (centraal), `app.js` constructor (initialization)
- **Real-time updates**: `js/sse.js` (EventSource client), `routes/sharepoint.js` sendSSEEvent helpers
- **Demo mode**: `/api/sharepoint/sites/test` endpoint (test data)

## Aanbevolen Conventions

- Use `setupSSEResponse()` + `sendSSEEvent()` helpers voor streaming endpoints
- Import state modules als ES6 modules in frontend; backend uses CommonJS
- Wrap alle Graph calls in `retryWithBackoff()` voor reliability
- Injecteert `X-Session-ID` header in alle frontend API calls via fetchJson wrapper
- Cleanup operaties stuurt progress events elke N files (in app.js progressCallback)
- **Config validatie**: altijd GUID format checken (frontend + backend)
- **Secret redaction**: log nooit client secret; truncate tokens in logs (8 chars max)
- **Session hygiene**: implementeer logout route die configCache + tokenCache opruimt
