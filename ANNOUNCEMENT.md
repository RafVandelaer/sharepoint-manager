# 🎉 Introducing Sharepointer

**A modern web application for SharePoint file version management and storage optimization via Microsoft Graph API**

## 🚀 What is Sharepointer?

Sharepointer is a powerful, user-friendly tool designed to help organizations manage and optimize their SharePoint Online storage by intelligently cleaning up old file versions. Built with security and ease of use in mind, it provides both individual site management and bulk operations across your entire tenant.

## ✨ Key Features

### 🔐 Secure Authentication
- **Browser-based Azure AD configuration** - No server-side credentials storage
- **Multi-tenant support** - Each user brings their own Azure App Registration
- **Delegated permissions** - Operates under user's own access rights
- **Ephemeral sessions** - Credentials stored in-memory only, never persisted to disk

### 📊 Comprehensive Site Management
- **Automatic site discovery** - Scans all SharePoint sites in your tenant
- **Real-time analytics** - View total files, versions, and storage usage
- **Site-level insights** - Drill down into individual libraries and folders
- **Visual progress tracking** - Live updates during scan and cleanup operations

### 🧹 Intelligent Version Cleanup
- **Dry run mode** - Preview changes before applying them
- **Configurable retention** - Keep as many versions as you need (default: 50)
- **Bulk operations** - Process multiple sites simultaneously
- **Smart version protection** - Current file version is ALWAYS preserved
- **Automatic retries** - Handles API throttling and temporary failures gracefully

### 📈 Advanced Analytics
- **Storage metrics** - Total size, version count, potential savings
- **Site comparison** - Identify storage-heavy sites at a glance
- **Cleanup history** - Audit trail of all operations with timestamps
- **Export capabilities** - Download reports for compliance and documentation

### 🎨 Modern User Interface
- **Responsive design** - Works seamlessly on desktop, tablet, and mobile
- **Dark mode support** - Easy on the eyes during extended sessions
- **Real-time SSE streaming** - Server-Sent Events for live progress updates
- **Intuitive navigation** - Clean, professional interface built with accessibility in mind

### 🛡️ Enterprise-Ready
- **No hardcoded credentials** - Users configure their own Azure App Registration
- **Admin dashboard** - Monitor operations, view audit logs, manage access
- **Production deployment guide** - Complete documentation for VPS/Azure deployment
- **PM2 cluster mode** - High availability with automatic restarts
- **Nginx reverse proxy** - SSL/TLS, rate limiting, security headers
- **Comprehensive logging** - Audit trails, error tracking, performance metrics

## 🎮 Try It Out - Demo Mode

Want to explore Sharepointer without setting up Azure? We've got you covered!

**Demo Data Available:**
- Pre-populated SharePoint sites with realistic data
- Mock file versions and storage metrics
- Full UI experience without authentication
- Perfect for evaluating features before deployment

Access demo endpoints:
```
GET /api/sharepoint/sites/test
```

Includes sample sites with:
- Various document libraries (Documents, Shared Resources, HR Policies)
- Different file types (DOCX, XLSX, PPTX, PDF, images)
- Multiple version scenarios (over-versioned files, moderate versioning)
- Storage usage patterns for testing cleanup strategies

## 🏗️ Architecture Highlights

### Technology Stack
- **Backend**: Node.js + Express
- **Frontend**: Vanilla JavaScript (modular ES6)
- **Authentication**: MSAL (Microsoft Authentication Library)
- **API Integration**: Microsoft Graph API v1.0
- **Real-time Updates**: Server-Sent Events (SSE)
- **Deployment**: PM2, Nginx, Ubuntu 22.04 LTS

### Security Features
- **No environment variables** for Azure credentials (browser-based config)
- **In-memory session management** via ConfigService
- **Crypto-secure session IDs** (64-char hex tokens)
- **GUID validation** for tenant/client IDs
- **Secret redaction** in all logs
- **HTTPS enforced** in production
- **Rate limiting** to prevent abuse

### Performance Optimizations
- **Request throttling** (100ms minimum interval between Graph calls)
- **Exponential backoff** retry logic (max 3 attempts)
- **Response caching** (version info: 5min, site scans: 30min)
- **Async generators** for streaming large datasets
- **Batch processing** (50 files per SSE batch)
- **Request timeout** protection (10 minutes max)

## 📦 Quick Start

### Prerequisites
- Node.js 18+ or 20 LTS
- Azure Entra ID (Azure AD) tenant
- SharePoint Online subscription

### Installation (5 minutes)
```bash
# 1. Clone the repository
git clone https://github.com/RafVandelaer/sharepoint-manager.git
cd sharepoint-manager

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev

# 4. Open browser
open http://localhost:3000

# 5. Configure Azure App Registration via web UI
# Follow the step-by-step guide in the configuration modal
```

### Azure App Registration Setup
The app guides you through:
1. Creating an Azure App Registration
2. Setting redirect URI: `https://yourdomain.com/auth/callback`
3. Configuring delegated permissions:
   - `Sites.Read.All` - Read site metadata, files, versions
   - `Sites.ReadWrite.All` - Delete file versions
   - `Sites.FullControl.All` - Update library versioning settings
4. Creating a client secret (24-month expiry recommended)
5. Granting admin consent

**No server configuration needed** - users bring their own credentials!

## 🌟 Use Cases

### Storage Optimization
Organizations using SharePoint Online often accumulate thousands of file versions over time, consuming significant storage. Sharepointer helps identify and clean up old versions while preserving version history that matters.

**Typical savings**: 30-60% storage reduction on heavily versioned sites

### Compliance & Governance
- Implement version retention policies across all sites
- Generate audit reports of cleanup operations
- Maintain compliance with data retention regulations
- Track who performed cleanup operations and when

### Cost Reduction
SharePoint Online storage costs add up. By optimizing version storage:
- Reduce SharePoint storage tier costs
- Avoid overage charges
- Defer storage capacity upgrades
- Allocate budget to other priorities

### IT Administration
- Bulk operations across hundreds of sites
- Centralized management console
- Real-time progress monitoring
- Automated retry logic for failed operations

## 📋 Key Workflows

### Site Version Cleanup
1. Login with Azure AD credentials
2. Select a SharePoint site from the discovered list
3. Run dry run to preview cleanup (versions to keep: 50)
4. Review files and versions to be removed
5. Execute actual cleanup with one click
6. View results and storage savings in history log

### Bulk Site Processing
1. Access bulk cleanup modal
2. Select multiple sites (or all sites)
3. Set global version retention policy
4. Run bulk dry run across all sites
5. Review aggregated results per site
6. Execute bulk cleanup operation
7. Monitor real-time progress via SSE
8. Download comprehensive cleanup report

### Analytics Dashboard
1. View tenant-wide storage metrics
2. Sort sites by total storage, file count, or version count
3. Identify over-versioned files (e.g., >100 versions)
4. Compare before/after cleanup statistics
5. Export data for executive reports

## 🔧 Deployment Options

### 1️⃣ VPS (Ubuntu 22.04 + Nginx)
Complete guide included in `DEPLOYMENT.md`:
- PM2 process management (cluster mode, 2 instances)
- Nginx reverse proxy with SSL/TLS (Let's Encrypt)
- Security hardening (fail2ban, rate limiting, CSP headers)
- Logrotate for log management
- Quick update methods (SSH one-liner, git hooks, aliases)

### 2️⃣ Azure App Service
- Deploy directly to Azure
- Managed scaling and availability
- Built-in SSL certificates
- Easy environment variable management

### 3️⃣ Docker Container
- Containerized deployment
- Environment variable injection
- Cloud-agnostic (AWS ECS, Azure Container Instances, GCP Cloud Run)

### 4️⃣ Kubernetes
- Enterprise-grade orchestration
- Horizontal pod autoscaling
- Secret management via Kubernetes Secrets
- Health checks and self-healing

## 📖 Documentation

- **README.md** - Full project documentation (Dutch)
- **DEPLOYMENT.md** - Production deployment guide with security best practices
- **AZURE_SETUP.md** - Azure App Registration configuration
- **ADMIN_ACCESS.md** - Admin dashboard access and token management
- **QUICK_REFERENCE.md** - API endpoints and common operations

## 🛠️ API Highlights

### REST Endpoints
```javascript
// Authentication
POST   /api/auth/config              // Submit Azure credentials (browser-based)
GET    /api/auth/login               // Initiate OAuth flow
GET    /api/auth/callback            // OAuth callback handler
POST   /api/auth/logout              // Clear session

// SharePoint Operations
GET    /api/sharepoint/sites         // List all sites
GET    /api/sharepoint/sites/:id     // Get site details
POST   /api/sharepoint/sites/:id/cleanup  // Cleanup versions (dry run or real)
GET    /api/sharepoint/sites/:id/libraries // List document libraries
GET    /api/sharepoint/sites/:id/libraries/:libId/files // List files

// Bulk Operations (SSE streaming)
POST   /api/sharepoint/bulk-dry-run  // Multi-site dry run with real-time progress
POST   /api/sharepoint/continue-bulk-dry-run // Resume incomplete bulk scan

// Admin (ephemeral token auth)
GET    /api/admin/audit              // Audit log entries
GET    /api/admin/stats              // Usage statistics
POST   /api/admin/token              // Generate ephemeral admin token
```

## 🎯 Version Safety Guarantee

**The current version of a file is NEVER deleted!**

How we guarantee this:
1. Microsoft Graph `/versions` API only returns **historical versions**
2. The current/active version is the file itself (via `/items/{id}`)
3. Our cleanup logic only processes items from `/versions` endpoint
4. Minimum 1 historical version always retained (`Math.max(1, versionsToKeep)`)
5. Versions sorted by `lastModifiedDateTime` (newest preserved first)

**Example:**
- File has 10 historical versions + 1 current = 11 total
- Setting: keep 3 versions
- Result: 7 oldest historical versions deleted, 3 newest historical + current preserved
- **Current version is ALWAYS safe!** ✅

## 🤝 Contributing

We welcome contributions! Areas for improvement:
- Additional language translations (currently Dutch + English)
- Enhanced analytics visualizations
- Custom retention policies per library
- Integration with Power Automate
- Scheduled cleanup automation

## 📜 License

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)**.

**You are free to:**
- ✅ Share and redistribute
- ✅ Adapt and build upon the code
- ✅ Use for personal, educational, or research purposes

**You may NOT:**
- ❌ Use for commercial purposes
- ❌ Sell or monetize this software
- ❌ Use in commercial SaaS offerings

See the LICENSE file for full details.

## 🙏 Acknowledgments

Built with:
- [Microsoft Graph API](https://developer.microsoft.com/en-us/graph)
- [MSAL for Node.js](https://github.com/AzureAD/microsoft-authentication-library-for-js)
- [Express.js](https://expressjs.com/)
- Modern vanilla JavaScript (ES6+)

Special thanks to the Microsoft Graph API team for comprehensive documentation and the SharePoint community for inspiration.

## 📞 Support & Contact

- **Issues**: [GitHub Issues](https://github.com/RafVandelaer/sharepoint-manager/issues)
- **Discussions**: [GitHub Discussions](https://github.com/RafVandelaer/sharepoint-manager/discussions)
- **Website**: https://sharepointer.be

---

**Ready to optimize your SharePoint storage?** Start with demo mode today and see the difference Sharepointer can make for your organization! 🚀
