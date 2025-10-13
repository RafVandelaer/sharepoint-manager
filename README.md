# SharePoint Manager

Een moderne web applicatie voor het beheren van SharePoint sites en het opschonen van bestandsversies via de Microsoft Graph API.

## Functionaliteiten

- 🔐 **Azure AD Authenticatie** - Veilige login via Microsoft
- 🌐 **Site Discovery** - Automatisch scannen van alle SharePoint sites in je tenant
- 🎯 **Site Selectie** - Eenvoudige interface voor site selectie
- 🧹 **Versie Opschoning** - Bulk verwijdering van oude bestandsversies
- 💻 **Moderne UI** - Responsieve en gebruiksvriendelijke interface
- ⚡ **Lokaal Development** - Geen complexe deployment vereist

## Vereisten

- Node.js (versie 16 of hoger)
- Azure AD App Registratie met juiste permissions
- SharePoint Online tenant

## Installatie

1. **Clone het project**
   ```bash
   git clone <repository-url>
   cd sharepoint-manager
   ```

2. **Installeer dependencies**
   ```bash
   npm install
   ```

3. **Configureer omgevingsvariabelen**
   
   Kopieer `.env.example` naar `.env` en vul de waarden in:
   ```bash
   cp .env.example .env
   ```

## Azure App Registratie Setup

### Stap 1: Nieuwe App Registratie
1. Ga naar [Azure Portal - App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Klik op "New registration"
3. Vul in:
   - **Naam**: SharePoint Manager
   - **Redirect URI**: `http://localhost:3000/auth/callback`

### Stap 2: API Permissions
Voeg de volgende Microsoft Graph permissions toe:
- `Sites.Read.All` (Application)
- `Sites.ReadWrite.All` (Application)  
- `Sites.Manage.All` (Application)

**⚠️ Belangrijk: Vergeet niet om admin consent te geven!**

### Stap 3: Client Secret
1. Ga naar "Certificates & secrets"
2. Maak een nieuwe client secret aan
3. Kopieer de waarde (deze is maar één keer zichtbaar)

### Stap 4: Configuratie
Vul je `.env` bestand in met de verkregen waarden:
```env
TENANT_ID=jouw-tenant-id-hier
CLIENT_ID=jouw-client-id-hier
CLIENT_SECRET=jouw-client-secret-hier
PORT=3000
REDIRECT_URI=http://localhost:3000/auth/callback
GRAPH_API_URL=https://graph.microsoft.com/v1.0
```

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

### ✅ Versie Veiligheid

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
1. **"Authentication required" fout**
   - Controleer of je .env bestand correct is geconfigureerd
   - Verifieer dat de app registratie permissions heeft

2. **"Failed to fetch SharePoint sites"**
   - Controleer admin consent voor de app permissions
   - Verifieer dat je tenant SharePoint sites heeft

3. **Versie opschoning werkt niet**
   - Controleer of je `Sites.ReadWrite.All` permissions hebt
   - Sommige sites kunnen extra permissions vereisen

### Logging
De applicatie logt belangrijke events naar de console. Start de applicatie met:
```bash
npm start
```
En bekijk de console output voor foutmeldingen.

## Licentie

Dit project is beschikbaar onder de ISC licentie.

## Bijdragen

Bijdragen zijn welkom! Maak een pull request of open een issue voor bugs en feature requests.