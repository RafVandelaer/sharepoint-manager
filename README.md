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
- ✅ **No credentials on disk** - You bring your own Azure App Registration
- ✅ **Encrypted session cookies** - Config stored in encrypted session cookies (server restart resilient)
- ✅ **Session cookies only** - Cookies cleared on browser restart for maximum privacy
- ✅ **Tokens in-memory only** - OAuth tokens never persisted
- ✅ **Client-side config** - Credentials entered via browser
- ✅ **Delegated permissions** - Your own Microsoft Graph token, not shared
- ✅ **Open source** - Full transparency, audit the code yourself

**How it works:**
1. You create an Azure App Registration in your tenant
2. You enter the credentials in the browser
3. Your config is encrypted (AES-256-GCM) and stored in a session cookie
4. You authenticate via Microsoft OAuth (delegated access)
5. The server uses your token to call Microsoft Graph API
6. **Server restart?** No problem! Your session restores automatically from the encrypted cookie 🎉
7. **Browser restart?** Cookie is cleared - fresh start for maximum privacy 🔒

---

## ✨ Features

- 🔐 **Azure AD Authentication** - Secure delegated login via Microsoft OAuth
- 🔒 **Persistent Sessions** - Encrypted cookies survive server restarts (no re-login!)
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

# 3. Generate required secrets
echo "COOKIE_SECRET=$(openssl rand -hex 32)" >> .env
echo "ADMIN_API_KEY=$(openssl rand -hex 32)" >> .env
echo "AUDIT_SALT=$(openssl rand -hex 32)" >> .env

# 4. Start the server
npm run dev

# 5. Open http://localhost:3000
# 6. Enter your Azure App Registration credentials in the browser
# 7. Start managing your SharePoint sites!
```

**Note:** Three secrets are required in `.env`:
- `COOKIE_SECRET` - Session encryption (AES-256-GCM)
- `ADMIN_API_KEY` - Admin dashboard access (required for /api/admin endpoints)
- `AUDIT_SALT` - Privacy hashing for audit logs (GDPR compliance)

All Azure credentials are configured via the browser UI and stored in encrypted cookies.

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

### Multi-User Session Model with Session Cookies

- **Browser-based config** - Users enter Azure credentials via web UI
- **Encrypted session cookies** - Config stored in AES-256-GCM encrypted cookies
- **Session lifetime** - Cookies cleared on browser restart (no persistent storage)
- **In-memory tokens** - OAuth tokens stored per `sessionId` in memory (ephemeral)
- **Delegated permissions** - Each user gets their own Graph API token
- **Server restart resilience** - Sessions restore automatically from cookies ✨
- **No shared secrets** - Each user uses their own App Registration

### Session Cookie Flow

```
1. User enters Azure credentials → Server encrypts → Stores in HttpOnly session cookie
2. Server restart → In-memory cache cleared → Cookie still exists
3. User makes API request → Cookie sent automatically
4. Server decrypts cookie → Restores config to memory
5. User continues working seamlessly (no re-login needed!)
6. Browser restart → Session cookie cleared → User must re-configure
7. Logout → Cookie explicitly deleted → Clean state
```

### Security Principles

- **Least privilege** - Only delegated scopes, no application permissions
- **Military-grade encryption** - AES-256-GCM for cookie data
- **HttpOnly session cookies** - No JavaScript access, cleared on browser close
- **CSRF protection** - SameSite=Lax attribute
- **Credential isolation** - No cross-session data leakage
- **Secret redaction** - Client secrets never logged
- **HTTPS enforced** - Secure flag in production, HTTP→HTTPS 301 redirect
- **No disk persistence** - Only encrypted session cookies, no database/files
- **XSS protection** - All user-controlled data sanitized via textContent/createElement
- **Admin authentication** - ADMIN_API_KEY required for dashboard access, no hardcoded fallbacks
- **Security audit** - Regular vulnerability assessments, see SECURITY_AUDIT_2025-12-01.md

### Recent Security Enhancements

**December 2025:**
- ✅ Removed hardcoded admin credential fallbacks (CVSS 9.8 → FIXED)
- ✅ Enforced HTTPS redirect in production (CVSS 7.5 → FIXED)
- ✅ Created XSS protection utilities (public/js/xss-protection.js)
- ✅ Fixed XSS vulnerabilities in admin-dashboard.html, app.js, analytics-features.js
- 🔄 In progress: analytics.html XSS remediation (19 instances remaining)
- See SECURITY_TODOS.md for detailed remediation tracker

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

---

## ❓ FAQ

### Q: What happens on server restart?
**A:** Nothing! 🎉 Your session persists thanks to encrypted cookies. Credentials are auto-restored and you can continue working without re-login.

### Q: What happens on browser restart?
**A:** Session is cleared 🔒 Cookies are session-based and disappear on browser close. This is more secure than persistent cookies. You'll need to reconfigure after browser restart.

### Q: Are my Azure credentials safe in cookies?
**A:** Absolutely! 
- AES-256-GCM military-grade encryption
- HttpOnly flag (no JavaScript access)
- Secure flag in production (HTTPS only)
- SameSite=Lax (CSRF protection)
- **Session cookie** - Clears on browser restart (maximum privacy)
- Never stored in plaintext

### Q: Can I delete all versions?
**A:** No, safely prevented! The current file version is **ALWAYS** kept. You can only delete historical versions.

### Q: How long does a bulk dry run take?
**A:** Depends on site count and file count:
- First run: 1-5 minutes (depending on tenant size)
- Subsequent runs: Much faster (cache hit)
- Cache valid for 30 minutes

### Q: How do I reset my session?
**A:** 
- **Easiest**: Close browser → Session cookie auto-deleted
- **Or**: Click "Logout" button → Cookie explicitly removed
- **Or**: DevTools → Application → Cookies → Delete `sp_session` cookie

### Q: What if my COOKIE_SECRET leaks?
**A:**
1. Generate new secret: `openssl rand -hex 32`
2. Update `.env` file
3. Restart server
4. All users must reconfigure (old cookies become invalid)
5. This is a feature, not a bug - extra security!

---

## 🔧 Troubleshooting

### Session lost after server restart
- ✅ **This should NOT happen anymore!** Sessions survive server restarts
- Check `COOKIE_SECRET` exists in `.env`
- Verify `sp_session` cookie in DevTools → Application → Cookies
- Clear cookies and reconfigure if cookie is corrupted

### Authentication errors
- Verify `.env` is configured correctly
- Check app registration has required permissions
- Admin consent must be granted
- Clear browser cache and cookies

### Failed to fetch SharePoint sites
- Verify admin consent for app permissions
- Check user has Global Admin or SharePoint Admin role
- Verify tenant has SharePoint sites

### Version cleanup not working
- Check `Sites.ReadWrite.All` permission granted
- Some sites may require additional permissions
- Private sites may have restricted access

---

## 🏗️ Project Structure

```
sharepoint-manager/
├── public/              # Frontend files
│   ├── index.html       # Main page (ES modules)
│   ├── styles.css       # Styling
│   ├── app.js           # Main app logic
│   └── js/              # Modular frontend (ES Modules)
│       ├── index.js     # Bootstrap entrypoint
│       ├── state.js     # Central state
│       ├── ui.js        # UI/DOM helpers
│       ├── api.js       # Fetch wrapper
│       ├── sse.js       # Server-Sent Events
│       └── cleanup.js   # Cleanup result processing
├── routes/              # API routes
│   ├── auth.js          # Authentication
│   └── sharepoint.js    # SharePoint operations
├── services/            # Business logic
│   ├── authService.js         # Auth service
│   ├── sharePointService.js   # SharePoint ops
│   └── configService.js       # Session management
├── server.js            # Main server
└── package.json         # Dependencies
```

---

## 🔐 Security Best Practices

### COOKIE_SECRET Management
- Generate with `openssl rand -hex 32`
- Store safely in `.env` (never commit!)
- Rotate regularly (monthly in production)
- On compromise: rotate immediately

### Cookie Security
- **Type**: Session cookie (cleared on browser restart)
- **Lifetime**: Until browser close or logout
- HttpOnly + Secure flags in production
- SameSite=Lax for CSRF protection
- No persistent storage → maximum privacy

### General Security
- Always use `npm start` or `npm run dev`
- Add `.env` to `.gitignore`
- Test with dry run before actual cleanup
- Backup critical data

---

## ⚡ Performance Tips

### Caching Layers

| Cache | TTL | Purpose |
|-------|-----|---------|
| Config | Session | Per-user Azure credentials |
| Token cache | Session | Auth tokens in-memory |
| Version cache | 5 min | File version info |
| Site scan cache | 30 min | Complete site scans |
| Cleanup history | N/A | Local audit trail |

### Optimization
- Lazy loading (max 50 sites at once)
- Virtual scrolling for large lists
- Request throttling (100ms min interval)
- Exponential backoff retry logic
- Batch processing (50 files per batch)

---

## 📚 API Reference

### Authentication Flow
```
POST /api/auth/config → Store encrypted credentials
GET /api/auth/login → Get Azure AD URL
Redirect → Azure AD auth
GET /auth/callback?code=XXX → Exchange code for token
```

### Sites
```
GET /api/sharepoint/sites
Headers: { X-Session-ID: <sessionId> }
→ Returns: [{ id, name, webUrl, ... }]
```

### Cleanup (Dry Run)
```
POST /api/sharepoint/sites/{siteId}/cleanup?dryRun=true
Headers: { X-Session-ID: <sessionId> }
Body: { versionsToKeep: 3 }
→ Returns: { 
    totalFiles: 42,
    totalVersions: 127,
    versionsToRemove: 85,
    totalStorageSavings: "2.3 GB"
  }
```

---