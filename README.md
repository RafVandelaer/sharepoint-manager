# 📁 Sharepointer

> **A modern web application for managing SharePoint Online sites and cleaning up file versions using Microsoft Graph API**

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-sharepointer.be-blue?style=for-the-badge)](https://sharepointer.be)
[![GitHub](https://img.shields.io/badge/GitHub-RafVandelaer-black?style=for-the-badge&logo=github)](https://github.com/RafVandelaer)

---

## 🚀 Try it Now

**👉 [https://sharepointer.be](https://sharepointer.be)** - Working production instance  
**🎮 [Demo Mode](https://sharepointer.be/demo.html)** - Test with sample data (no Azure setup required)

### 🔒 Privacy & Security

**Sharepointer.be stores ZERO sensitive data:**
- ✅ **No credentials stored** - You bring your own Azure App Registration
- ✅ **No data persistence** - All config & tokens are in-memory only
- ✅ **Session-based** - Server restart clears all sessions
- ✅ **Client-side config** - Credentials entered via browser, never saved to disk
- ✅ **Delegated permissions** - Your own Microsoft Graph token, not shared
- ✅ **Open source** - Full transparency, audit the code yourself

**How it works:**
1. You create an Azure App Registration in your tenant
2. You enter the credentials in the browser
3. You authenticate via Microsoft OAuth (delegated access)
4. The server uses your token to call Microsoft Graph API
5. No data is stored anywhere - everything is ephemeral

---

## ✨ Features

- 🔐 **Azure AD Authentication** - Secure delegated login via Microsoft OAuth
- 🌐 **Multi-Tenant Support** - Each user brings their own Azure App Registration
- 📊 **Site Discovery** - Automatically scan all SharePoint sites in your tenant
- 🗂️ **Version Cleanup** - Bulk deletion of old file versions (with dry-run preview)
- 📈 **Analytics Dashboard** - Storage distribution, size categories, trend charts
- 🎨 **Modern UI** - Responsive design with dark mode support
- 🌍 **Multilingual** - English & Dutch translations
- 🔄 **Real-time Progress** - Server-Sent Events for live cleanup progress
- 🎯 **Granular Control** - Per-site or bulk operations

---

## 🎮 Demo Mode

Want to try the interface without setting up Azure? Use the **[Demo Mode](https://sharepointer.be/demo.html)**:
- Explore the full UI with sample data
- Test all features (dry-run only)
- No Azure App Registration needed
- Perfect for evaluation before deployment

---

## 🛠️ Self-Hosting

### Prerequisites

- Node.js 16+ 
- Azure AD App Registration (see setup below)
- SharePoint Online tenant

### Quick Start (5 minutes)

```bash
# 1. Clone the repository
git clone https://github.com/RafVandelaer/sharepoint-manager.git
cd sharepoint-manager

# 2. Install dependencies
npm install

# 3. Start the server
npm run dev

# 4. Open http://localhost:3000
# 5. Enter your Azure App Registration credentials in the browser
# 6. Start managing your SharePoint sites!
```

**Note:** No `.env` file needed! All configuration is done via the browser UI.

---

## 🔑 Azure App Registration Setup

Each user needs their own Azure App Registration. Here's how:

### Option 1: Automated Script (Recommended)

```bash
./scripts/provision-app.sh
```

This script:
- Creates/updates an App Registration named `SharePointManager`
- Configures redirect URI: `http://localhost:3000/auth/callback`
- Adds required Microsoft Graph **delegated** permissions:
  - `Sites.Read.All` - Read sites and versions
  - `Sites.ReadWrite.All` - Delete versions
  - `Sites.FullControl.All` - Update versioning settings (optional)
- Generates a client secret
- Outputs credentials ready to paste in the browser

### Option 2: Manual Setup

1. Go to [Azure Portal → App Registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **New registration**
3. Name: `Sharepointer` (or your choice)
4. Supported account types: **Accounts in this organizational directory only**
5. Redirect URI: **Web** → `https://yourdomain.com/auth/callback`
6. Click **Register**
7. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**
8. Add: `Sites.Read.All`, `Sites.ReadWrite.All`, `Sites.FullControl.All`
9. Click **Grant admin consent** (requires Global Admin)
10. Go to **Certificates & secrets** → **New client secret** → Copy the value
11. Copy **Application (client) ID** and **Directory (tenant) ID** from Overview

---

## 📖 Usage

### First Time Setup

1. Open the app in your browser
2. Click **Add Tenant** or the config modal will appear automatically
3. Fill in your Azure App Registration details:
   - **Tenant Name** - A friendly name (e.g., "My Company")
   - **Tenant ID** - Your Azure Directory ID
   - **Client ID** - Your App Registration Application ID
   - **Client Secret** - The secret you generated
4. Click **Save**
5. Click **Login** to authenticate via Microsoft

### Managing Sites

1. After login, the app will scan all SharePoint sites
2. View analytics: storage distribution, size categories, trends
3. Select sites for cleanup
4. Configure versions to keep (default: 50)
5. Run **Dry Run** to preview changes
6. Review results and click **Execute Cleanup** to delete old versions

### Bulk Operations

1. Select multiple sites using checkboxes
2. Click **Bulk Cleanup** or **Bulk Versioning Settings**
3. Configure options for all selected sites
4. Monitor real-time progress via Server-Sent Events

---

## 🏗️ Architecture

### Multi-User Session Model

- **Browser-based config** - Users enter Azure credentials via web UI
- **In-memory storage** - Config & tokens stored per `sessionId` in memory
- **Delegated permissions** - Each user gets their own Graph API token
- **Stateless** - Server restart clears all sessions (by design)
- **No shared secrets** - Each user uses their own App Registration

### Security Principles

- **Least privilege** - Only delegated scopes, no application permissions
- **Credential isolation** - No cross-session data leakage
- **Secret redaction** - Client secrets never logged
- **HTTPS enforced** - In production (via App Service/reverse proxy)
- **No persistence** - Credentials never written to disk or database

---

## 🚀 Production Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment guides:

- Azure App Service (recommended)
- Docker containers
- VPS/dedicated server
- Nginx reverse proxy
- SSL/TLS configuration
- Health monitoring

---

## 🤝 Contributing

Contributions are welcome! Feel free to:

- 🐛 Report bugs via [GitHub Issues](https://github.com/RafVandelaer/sharepoint-manager/issues)
- 💡 Suggest features
- 🔧 Submit pull requests
- 📖 Improve documentation

---

## 📄 License

This project is open source and available under the MIT License.

---

## 👤 Author

**Raf Vandelaer**

- GitHub: [@RafVandelaer](https://github.com/RafVandelaer)
- Website: [sharepointer.be](https://sharepointer.be)

---

## 🙏 Acknowledgments

- Built with [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/)
- UI powered by vanilla JavaScript & [Font Awesome](https://fontawesome.com/)
- Charts by [Chart.js](https://www.chartjs.org/)
- Authentication via [MSAL.js](https://github.com/AzureAD/microsoft-authentication-library-for-js)
- Icons & design inspired by Microsoft Fluent

---

**⭐ Star this repo if you find it useful!**
Set environment variables in **Configuration > Application settings**:
```
TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLIENT_ID=yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
CLIENT_SECRET=Z123~secretValue
REDIRECT_URI=https://yourdomain.com/auth/callback
GRAPH_API_URL=https://graph.microsoft.com/v1.0
```

Enable **Always On** en set **Node version** naar 18+ in General settings.

#### 2️⃣ Docker Container
Build met secret injection via environment:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

Run met env file of inline:
```bash
docker run -p 3000:3000 \
  -e TENANT_ID=$TENANT_ID \
  -e CLIENT_ID=$CLIENT_ID \
  -e CLIENT_SECRET=$CLIENT_SECRET \
  -e REDIRECT_URI=https://yourdomain.com/auth/callback \
  sharepoint-manager
```

#### 3️⃣ Azure Key Vault Integration (enterprise)
Install `@azure/keyvault-secrets` + `@azure/identity` en wijzig `server.js` om secrets te laden:
```javascript
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const credential = new DefaultAzureCredential();
const client = new SecretClient(`https://<vault-name>.vault.azure.net`, credential);

async function loadConfig() {
  const [clientId, clientSecret, tenantId] = await Promise.all([
    client.getSecret('CLIENT-ID'),
    client.getSecret('CLIENT-SECRET'),
    client.getSecret('TENANT-ID')
  ]);
  process.env.CLIENT_ID = clientId.value;
  process.env.CLIENT_SECRET = clientSecret.value;
  process.env.TENANT_ID = tenantId.value;
}
```

Enable **Managed Identity** in Azure App Service en geef RBAC role "Key Vault Secrets User" aan de identity.

#### 4️⃣ Kubernetes (advanced)
Use **Secrets** for credentials:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: sharepoint-secrets
type: Opaque
stringData:
  TENANT_ID: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  CLIENT_ID: "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
  CLIENT_SECRET: "Z123~secretValue"
---
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: sharepoint-manager
        envFrom:
        - secretRef:
            name: sharepoint-secrets
```

### Handmatige Setup (klassiek / legacy)

### Stap 1: Nieuwe App Registratie
1. Ga naar [Azure Portal - App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Klik op "New registration"
3. Vul in:
   - **Naam**: Sharepointer
   - **Redirect URI**: `http://localhost:3000/auth/callback`

### Stap 2: API Permissions
Voeg de volgende Microsoft Graph permissions toe:
- `Sites.Read.All` (Application)
- `Sites.ReadWrite.All` (Application)  
- `Sites.Manage.All` (Application)

**Belangrijk: Vergeet niet om admin consent te geven!**

### Stap 3: Client Secret
1. Ga naar "Certificates & secrets"
2. Maak een nieuwe client secret aan
3. Kopieer de waarde (deze is maar één keer zichtbaar)

### Stap 4: Configuratie
Vul `.env` bestand in met de waarden uit Azure Portal (of provisioning script output):
```env
TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLIENT_ID=yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
CLIENT_SECRET=Z123~superSecretValueCopiedFromPortal
REDIRECT_URI=http://localhost:3000/auth/callback
GRAPH_API_URL=https://graph.microsoft.com/v1.0
PORT=3000
```

Admin consent niet vergeten anders falen Graph/SharePoint calls met 401 of missing consent errors.

> Let op: Het verificatie script (`verifyAppRegistration.js`) is gearchiveerd; de voorkeursflow is nu user-supplied credentials in de UI.

### Ephemeral Admin Tokens
Naast de legacy `ADMIN_API_KEY` (uit `.env`) ondersteunt de server nu **ephemeral** in-memory admin tokens:

Endpoints:
```
POST /api/admin/ephemeral  (headers: X-Admin-Key: <legacy> of X-Admin-Ephemeral: <huidig>)
Body: { rotate?: true, ttlMs?: number }
Response: { token, expiresAt, method }

GET  /api/admin/ephemeral  (auth headers zoals boven)
Response: { status: { hasToken, expiresAt, ttlMs, rotations[] }, method }
```

Gebruik (voorbeeld):
```bash
# Eerste rotatie met legacy key
curl -X POST http://localhost:3000/api/admin/ephemeral \
   -H "X-Admin-Key: $ADMIN_API_KEY" \
   -H 'Content-Type: application/json' \
   -d '{"rotate": true, "ttlMs": 14400000}'

# Status ophalen met ephemeral token
curl http://localhost:3000/api/admin/ephemeral \
   -H "X-Admin-Ephemeral: <nieuw-token>"
```

Aanbevelingen:
- Vervang gebruik van statische key door ephemeral token voor lagere impact bij compromittering.
- TTL standaard 8 uur; verkort voor striktere security (min 5 minuten).
- Niet loggen van volledige token; indien logging gewenst alleen hash.

Migratieplan:
1. Genereer eerste ephemeral token met legacy key.
2. Update admin tooling (Postman/scripts) naar `X-Admin-Ephemeral` header.
3. Verwijder later `ADMIN_API_KEY` uit `.env` en runtime als niet meer nodig.

## Gebruik

1. **Start de applicatie**
   ```bash
   npm start
   ```
   
   Voor development met auto-reload:
   ```bash
   npm run dev
   ```

2. **Open de browser**
   
   Ga naar `http://localhost:3000`

3. **Authenticatie**
   - Klik op "Inloggen"
   - Log in met je Microsoft account
   - Geef toestemming voor de gevraagde permissions

4. **Sites beheren**
   - Bekijk alle SharePoint sites in je tenant
   - Gebruik de zoekfunctie om specifieke sites te vinden
   - Klik op een site voor details en opschoning opties

5. **Versies opschonen**
   - Selecteer een site
   - Stel in hoeveel versies je wilt behouden (standaard: 10)
   - Start de opschoning
   - Bekijk de resultaten

## Technische Details

### Backend
- **Express.js** - Web server framework
- **@azure/msal-node** - Microsoft Authentication Library
- **@microsoft/microsoft-graph-client** - Microsoft Graph API client

### Frontend
- **Vanilla JavaScript** - Geen complexe frameworks
- **Modern CSS** - Responsive design met CSS Grid/Flexbox
- **Font Awesome** - Icons

### API Endpoints
- `GET /auth/login` - Start authenticatie flow
- `GET /auth/callback` - Authenticatie callback
- `GET /api/sites` - Haal alle SharePoint sites op
- `POST /api/sites/:siteId/cleanup` - Start versie opschoning

## Ontwikkeling

### Project Structuur
```
sharepoint-manager/
├── public/           # Frontend bestanden
│   ├── index.html     # Hoofdpagina (laadt ES modules)
│   ├── styles.css     # Styling
│   ├── app.js         # Legacy hoofdlogica (wordt modulair geïmporteerd)
│   └── js/            # Modulaire frontend code (ES Modules)
│       ├── index.js   # Bootstrap entrypoint, importeert app.js
│       ├── state.js   # Centrale state en helpers
│       ├── ui.js      # UI/DOM hulpfuncties (status, progress, knoppen)
│       ├── api.js     # Fetch wrapper + API endpoints
│       ├── sse.js     # Server-Sent Events helper
│       └── cleanup.js # Verwerking en rendering van cleanup/dry-run resultaten
├── routes/          # API routes
│   ├── auth.js      # Authenticatie routes
│   └── sharepoint.js # SharePoint API routes
├── services/        # Business logic
│   ├── authService.js      # Authenticatie service
│   └── sharePointService.js # SharePoint operations
├── server.js        # Hoofdserver bestand
└── package.json     # Dependencies en scripts
```

### Frontend laden (ES Modules)
- `public/index.html` laadt nu de app via: `<script type="module" src="js/index.js"></script>`
- `js/index.js` importeert `../app.js`, zodat bestaande logica blijft werken terwijl we stap voor stap naar modules migreren.
- Inline event-handlers blijven functioneren omdat `app.js` de instantie exporteert naar `window.app`.

### Dependencies
- `express` - Web framework
- `@azure/msal-node` - Microsoft authenticatie
- `@microsoft/microsoft-graph-client` - Graph API client
- `axios` - HTTP client
- `dotenv` - Omgevingsvariabelen
- `cors` - Cross-origin requests
- `body-parser` - Request parsing

## Veiligheid

- Tokens worden tijdelijk in memory opgeslagen (niet persistent)
- HTTPS wordt aanbevolen voor productie
- Client secrets moeten veilig worden opgeslagen
- Regelmatige token vernieuwing

### Versie Veiligheid

**Belangrijke garantie: De huidige versie van een bestand wordt NOOIT verwijderd!**

Dit is gegarandeerd door hoe de Microsoft Graph API werkt:

1. **De `/versions` API endpoint**
   - Geeft ALLEEN historische/oude versies terug
   - De huidige/actieve versie zit NIET in deze lijst
   - De huidige versie is het bestand zelf (via `/items/{id}`)

2. **Onze implementatie**
   ```javascript
   // We vragen alleen historische versies op
   GET /drives/{driveId}/items/{itemId}/versions
   
   // Sorteer van nieuwste naar oudste historische versie
   // Behoud de N nieuwste historische versies
   // Verwijder alleen de oudste historische versies
   ```

3. **Extra veiligheidsmaatregelen**
   - Minimaal 1 historische versie wordt altijd behouden (`Math.max(1, versionsToKeep)`)
   - Dry run modus om te testen voordat je daadwerkelijk versies verwijdert
   - Sortering op `lastModifiedDateTime` zorgt dat nieuwste versies behouden blijven

**Voorbeeld:**
- Bestand heeft 10 historische versies + 1 huidige versie = 11 totaal
- Instelling: behoud 3 versies
- Resultaat: 7 oude versies worden verwijderd, 3 nieuwste historische versies + huidige versie blijven
- De huidige versie is ALTIJD veilig! ✅

## Troubleshooting

### Algemene Problemen

#### "Authentication required" fout
- Controleer of je .env bestand correct is geconfigureerd
- Verifieer dat de app registratie permissions heeft
- Clear browser cache en cookies van `localhost:3000`

#### "Failed to fetch SharePoint sites"
- Controleer admin consent voor de app permissions
- Verifieer dat je tenant SharePoint sites heeft
- Controleer of je gebruiker globale admin of SharePoint admin bent

#### Versie opschoning werkt niet
- Controleer of je `Sites.ReadWrite.All` permissions hebt
- Sommige sites kunnen extra permissions vereisen
- Privé sites kunnen beperkte access hebben

#### "Access denied" bij bulk dry run
- Niet alle sites zijn even toegankelijk voor de app
- De bulk dry run zal deze sites **skiippen** en doorgaan met andere sites
- Controleer de site permissions in SharePoint Admin Center

### Logging en Debugging

#### Server-side logging
Start de applicatie met:
```bash
npm run dev
```

Controleer console output voor foutmeldingen en debug info. Logging toont:
- Authenticatie events
- API calls naar Microsoft Graph
- Versie opschoning voortgang
- Cache hits/misses

#### Browser console logging
Open DevTools (F12) en check de Browser Console voor:
- API request/response details
- Frontend state changes
- UI updates

#### Bulk dry run debugging
Bij problamen met bulk dry run:
1. Open DevTools Console
2. Let op "Attempt X/3" berichten - dit toont retries
3. Berichten met "⊘ Skipped" geven aan welke sites geen access hadden
4. "Site X completed" toont succesvolle sites

### Performance Tips

- **Bulk dry run voor veel sites**: De eerste scan kan lang duren (minutes)
  - Scan wordt gecached voor 30 minuten
  - Volgende scans op dezelfde site zijn veel sneller
  - Gebruik 3 versies om te behouden voor snellere verwerking

- **Browser performance**: 
  - Sluit andere tabs die veel resources gebruiken
  - Vernieuw de pagina als het traag wordt

## Geavanceerd Gebruik

### Bulk Dry Run Met Resumption

De applicatie ondersteunt het hervatten van incomplete bulk dry runs:

1. **Start een bulk dry run**
   - Selecteer meerdere sites
   - Klik "Bulk Dry Run"
   - De voortgang wordt automatisch opgeslagen

2. **Bij page refresh/crash**
   - De app detecteert de incomplete run
   - Vraagt of je wilt doorgaan waar je was gebleven
   - Dit werkt zolang je dezelfde browser session gebruikt

3. **Voortgang opslaan**
   - Elke 2 sites wordt progress opgeslagen
   - Bij errors wordt direct opgeslagen
   - Lokaal opgeslagen via browser localStorage

### API Documentatie

#### Authenticatie Flow
```
POST /api/auth/login
→ Retourneert: { authUrl: "https://login.microsoftonline.com/..." }
→ Redirect naar Azure AD
→ Callback: GET /auth/callback?code=XXX
→ Retourneert: Session token in URL
```

#### Sites Ophalen
```
GET /api/sharepoint/sites
Headers: { X-Session-ID: <sessionId> }
→ Retourneert: [{ id, name, webUrl, ... }]
```

#### Bulk Cleanup (Dry Run)
```
POST /api/sharepoint/sites/{siteId}/cleanup?dryRun=true
Headers: { X-Session-ID: <sessionId> }
Body: { versionsToKeep: 3 }
→ Retourneert: { 
    success: true,
    totalFiles: 42,
    totalVersions: 127,
    versionsToRemove: 85,
    totalStorageSavings: "2.3 GB",
    details: { ... }
  }
```

### Caching Mechanismes

De applicatie gebruikt meerdere caching lagen:

| Cache | TTL | Doel |
|-------|-----|------|
| Token cache | Session | Authenticatie tokens |
| Version cache | 5 min | File version info |
| Site scan cache | 30 min | Complete site scans |
| Cleanup history | N/A | Lokale audit trail |
| Browser localStorage | N/A | Incomplete task state |

### Error Recovery

De applicatie implementeert automatische error recovery:

1. **Exponential Backoff Retry**
   - Tot 3 pogingen voor transiente errors (500, 503)
   - Delays: 1s → 2s → 4s (max 10s)
   - Permanente errors (401, 404) worden niet herhaald

2. **Graceful Degradation**
   - Gefaalde sites veroorzaken geen totale failure
   - Scan gaat door met volgende sites
   - Finale statistieken tonen succesvolle vs gefaalde sites

3. **Session Recovery**
   - Onvoltooide bulk runs worden opgeslagen
   - Kan hervatten na page reload
   - Tot 30 seconden timeout per site

## Ondersteuning

Bij vragen of problemen:
1. Controleer deze README en troubleshooting sectie
2. Check de browser console voor errors
3. Raadpleeg de Azure Portal logs
4. Maak een issue aan met gedetailleerde omschrijving

## Veelgestelde Vragen (FAQ)

### Q: Kan ik alle versies verwijderen?
**A:** Nee, dit is veilig voorkomen! De huidige versie van het bestand wordt **ALTIJD** behouden. Je kan alleen historische versies verwijderen.

### Q: Hoe lang duurt een bulk dry run?
**A:** Dit hangt af van het aantal sites en bestanden:
- Eerste run: 1-5 minuten (afhankelijk van tenant grootte)
- Volgende runs: Veel sneller (cache hit)
- Cache geldig voor 30 minuten

### Q: Kan ik de bulk dry run onderbreken?
**A:** Ja! Klik op "Stop Cleanup" knop. De voortgang wordt opgeslagen en je kan later hervatten.

### Q: Wat als een site "Access denied" geeft?
**A:** Dit is normaal voor sommige sites:
- De bulk dry run zal deze sites skiippen
- Andere sites worden normaal verwerkt
- Controleer site permissions in SharePoint Admin Center

### Q: Hoe reset ik mijn sessie?
**A:** 
- Log uit via de "Logout" knop
- Of vernieuw de pagina en log opnieuw in
- Browser cookies kunnen handmatig verwijderd worden via DevTools

### Q: Kan ik versies van meerdere sites tegelijk verwijderen?
**A:** Ja! Dit is precies wat de "Bulk Dry Run" en "Bulk Cleanup" features doen. Selecteer meerdere sites en start een bulk operatie.

### Q: Zijn mijn tokens veilig?
**A:** Ja:
- Tokens worden in-memory opgeslagen (niet in cookies)
- Vervallen na session timeout
- Gebruikt HTTPS in productie (zelf in te stellen)
- Client secret mag nooit naar frontend gestuurd worden

### Q: Kan ik dit gebruiken voor productie?
**A:** Ja, met voorzichtigheid:
- Configureer HTTPS (use Let's Encrypt)
- Deploy op veilige server
- Bescherm de .env bestand
- Enable audit logging
- Backup kritieke data voordat je opschoning doet

## Performance Optimalisatie

### Frontend
- Lazy loading van site lijsten (maximaal 50 tegelijk)
- Virtual scrolling voor grote lijsten
- CSS minimization in productie
- Gzip compressie voor responses

### Backend
- Connection pooling voor Graph API
- Request throttling (100ms minimum interval)
- Exponential backoff retry logic
- Batch processing (50 files per batch)
- Caching van resultaten (5-30 min TTL)

### Tips voor Snellere Verwerking
1. Selecteer kleinere aantal sites per run
2. Stel versionsToKeep lager in (3 in plaats van 10)
3. Voer runs uit buiten piekuren
4. Gebruik test sites eerst voor debugging

## Best Practices

### Veiligheid
- Altijd `npm start` of `npm run dev` gebruiken (niet rechtstreeks node server.js)
- `.env` bestand in `.gitignore` toevoegen (geheim!)
- Regelmatig admin consent vernieuwing checken
- Test eerst met dry run voordat je echt versies verwijdert
- Backup kritieke data

### Efficiëntie
- Groepeer site cleanups om servers niet te overbelasten
- Voer bulk operations uit in offpiek uren
- Controleer cache status vóór herhaalde runs
- Monitor Graph API quotas in Azure Portal

### Maintenance
- Update Node.js en dependencies regelmatig
- Review server logs voor errors
- Clear browser cache als je UI problemen hebt
- Verwijder oude localStorage data (DevTools → Application)

## Architectuur Overwegingen

### Warum Vanilla JavaScript?
- Geen complexe build pipeline vereist
- Snelle development cycle
- Laag overhead voor eenvoudige app
- Gemakkelijk debuggen

### Waarom Server-Sent Events?
- Real-time progress updates voor lange operaties
- One-directional (server → client)
- Perfekt voor status/monitoring streams
- Auto-reconnect built-in

### Waarom MSAL?
- Officiële Microsoft authentication library
- Token refresh automatisch
- Multi-tenant support
- Best practices built-in

## Projectplanning & Roadmap

### Voltooid ✅
- [x] Azure AD authenticatie
- [x] Site discovery en selectie
- [x] Single site versie cleanup
- [x] Bulk versie cleanup
- [x] Dry run testing
- [x] Progress tracking
- [x] Error recovery
- [x] Incomplete task resumption
- [x] Rate limiting & throttling
- [x] Graceful error handling

### Geplanned (Toekomstig) 📋
- [ ] Cleanup scheduling (automation)
- [ ] Webhook notifications
- [ ] Detailed audit logging
- [ ] Multi-tenant support
- [ ] Export cleanup reports
- [ ] Selective folder cleanup
- [ ] File type filtering
- [ ] Retention policies

## Licentie

Dit project is beschikbaar onder de ISC licentie.

## Bijdragen

Bijdragen zijn welkom! Maak een pull request of open een issue voor bugs en feature requests.