# Tenant Analytics Dashboard

## Overzicht

De Tenant Analytics pagina geeft een gedetailleerd overzicht van storage usage en groei trends voor alle SharePoint sites in je tenant.

## URL

**Live Dashboard:** [http://localhost:3000/analytics.html](http://localhost:3000/analytics.html)

## Features

### 📊 Key Metrics
- **Total Sites**: Aantal SharePoint sites in tenant
- **Total Storage**: Totale gebruikte storage over alle sites
- **Avg. Site Size**: Gemiddelde site grootte
- **Largest Site**: Grootste site (naam + grootte)

### 📈 Charts & Visualisaties
1. **Storage Distribution**: Top 10 sites op storage gebruik (bar chart)
2. **Site Categories**: Verdeling Small/Medium/Large sites (doughnut chart)
3. **Detailed Table**: Alle sites met storage info, progress bars, categorieën

### Size Categories
- **Small**: < 1 GB (groen badge)
- **Medium**: 1-10 GB (oranje badge)
- **Large**: > 10 GB (rood badge)

## Hoe het werkt

### Backend API

**Endpoint:** `GET /api/sharepoint/sites/analytics/storage`

**Authenticatie:** Vereist Bearer token (user moet ingelogd zijn)

**Response:**
```json
{
  "sites": [
    {
      "id": "site-id",
      "name": "Site Name",
      "webUrl": "https://...",
      "storage": {
        "used": 5368709120,
        "remaining": 10737418240,
        "total": 16106127360,
        "usedGB": "5.00",
        "usedMB": "5120.00",
        "percentage": "33.3"
      }
    }
  ],
  "total": 50,
  "aggregate": {
    "totalUsed": 268435456000,
    "totalUsedGB": "250.00",
    "totalAvailable": 805306368000,
    "totalAvailableGB": "750.00",
    "averageUsed": 5368709120,
    "averageUsedGB": "5.00"
  }
}
```

### Data Source

Storage data wordt opgehaald via Microsoft Graph API:
- **Endpoint**: `/sites/{site-id}/drive`
- **Fields**: `quota.used`, `quota.remaining`, `quota.total`
- **Permissions vereist**: `Sites.Read.All` (delegated)

### Security

✅ **User-level permissions**: Alleen sites zichtbaar waartoe user toegang heeft
✅ **Session-based**: Gebruikt session token, geen admin rechten nodig
✅ **Read-only**: Geen write operaties, puur analytics
✅ **Error handling**: Sites zonder storage data worden gracefully geskipt

## Performance

- **Parallel fetching**: Alle site storage data wordt parallel opgehaald
- **Error tolerance**: Individuele site errors blokkeren niet de hele query
- **Caching**: Overweeg frontend caching voor 5-10 minuten
- **Pagination**: Voor tenants met 100+ sites kan dit traag worden

### Performance Tips

Voor grote tenants (100+ sites):
1. Implementeer server-side caching (5 min TTL)
2. Voeg pagination toe aan API endpoint
3. Overweeg background job voor pre-calculation
4. Gebruik Redis voor caching storage analytics

## Gebruik

1. **Login**: Ga eerst naar hoofdapp en log in met je Azure credentials
2. **Open Analytics**: Navigeer naar `/analytics.html`
3. **View Data**: Dashboard laadt automatisch alle storage data
4. **Refresh**: Klik refresh button voor actuele data

## Troubleshooting

**"Not logged in" error:**
- Ga naar `/beta/index.html` en log in
- Controleer of je sessionId in state aanwezig is

**"No sites found" error:**
- Controleer Azure AD permissions: `Sites.Read.All` moet granted zijn
- Re-login om fresh token te krijgen

**Sites tonen "0.00 GB":**
- User heeft geen toegang tot die site's drive
- Site heeft geen default document library
- Graph API permissions onvoldoende

**Slow loading:**
- Veel sites (50+) duurt langer door parallel API calls
- Graph API throttling kan optreden
- Implementeer caching in backend

## Toekomstige Features

🔮 **Mogelijk voor v2:**
- 📈 Growth trends (historische data tracking)
- 🔔 Storage alerts (when site > 80% full)
- 📊 Export to Excel/CSV
- 📅 Storage forecast (projected growth)
- 🗂️ Breakdown by library (Documents vs. other)
- 👥 User contribution metrics
- 📉 Storage cleanup recommendations
- ⏱️ Caching layer voor performance

## Development

### Toevoegen van features

**Frontend** (`public/analytics.html`):
- Chart.js voor visualisaties
- Vanilla JS (ES6 modules)
- Gebruikt shared `/beta/lib/api.js` voor auth

**Backend** (`routes/sharepoint.js`):
- Express route: `/sites/analytics/storage`
- Microsoft Graph client voor data fetching
- Error handling per site (graceful degradation)

### Testing

```bash
# Test storage endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/sharepoint/sites/analytics/storage

# Check quota for single site
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://graph.microsoft.com/v1.0/sites/{site-id}/drive?$select=quota"
```

## Security Checklist

✅ User authentication required
✅ Delegated permissions (no app-only)
✅ Read-only operations
✅ No PII exposure (only site names + storage)
✅ Error messages don't leak sensitive data
✅ No cross-user data leakage
✅ Session-based isolation

## Credits

- **Charts**: Chart.js v4.4.0
- **API**: Microsoft Graph API v1.0
- **Auth**: Azure AD OAuth 2.0 (delegated flow)
