# 🔐 Admin Audit Dashboard - Documentatie

## Overzicht

Privacy-first persistent audit trail systeem voor SharePoint Manager met:
- **Anonymized user tracking** (SHA-256 hashing)
- **Immutable audit logs** (append-only archive)
- **Real-time analytics** (charts, trends, anomaly detection)
- **GDPR-compliant** logging (data minimization, no PII)

---

## 🎯 Features

### 1. **Privacy-First Architecture**
- ✅ User identifiers → SHA-256 hash (irreversible)
- ✅ Same user → same hash (trend analysis mogelijk)
- ✅ Admin ziet patronen, niet wie exact
- ✅ Geen IP-adressen, geen PII opgeslagen

### 2. **Persistent Audit Trail**
- 📁 **Archive directory**: `logs/archive/`
- 📄 **Format**: JSONL (1 event per lijn)
- 📅 **Organization**: `audit-YYYY-MM.jsonl` (monthly files)
- ♾️ **Retention**: 730 dagen (2 jaar) standaard
- 🔒 **Immutable**: Append-only, nooit verwijderd

### 3. **Analytics Dashboard**
- 📊 **Daily activity trend** (line chart)
- 🥧 **Actions by type** (doughnut chart)
- 🕐 **Peak usage hours** (bar chart - 24h heatmap)
- 📈 **Quick stats**: Total actions, unique users, tenants, alerts

### 4. **Security Alerts**
- 🚨 **Failed login spike** (>5 in 24h)
- 📈 **Scan volume spike** (3x daily average)
- ⚠️ **Cleanup errors** (>10 in 24h)

### 5. **Audit Trail Table**
- 🔍 **Anonymized entries** (hash only, no user IDs)
- 🎯 **Filters**: Action type, date range
- 📄 **Pagination**: 50 entries per page
- 📥 **CSV export** (compliance)

---

## 🚀 Getting Started

### **Access Dashboard**

1. Open: `http://localhost:3000/admin-dashboard.html`
2. Enter **ephemeral admin token** of **API key**
3. Dashboard laadt automatisch

### **Get Ephemeral Token**

**Via API:**
```bash
curl -X POST http://localhost:3000/api/admin/ephemeral \
  -H "X-Admin-Key: your-secure-admin-key-change-me" \
  -H "Content-Type: application/json" \
  -d '{"ttlMs": 3600000}'
```

**Response:**
```json
{
  "token": "a1b2c3d4e5f6...",
  "expiresAt": "2025-11-28T14:00:00.000Z"
}
```

**Token gebruiken:**
```bash
curl http://localhost:3000/api/admin/stats \
  -H "X-Admin-Ephemeral: a1b2c3d4e5f6..."
```

---

## 📊 API Endpoints

### **GET /api/admin/stats**
Quick stats voor dashboard header

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalActions30d": 1247,
    "uniqueUsers30d": 34,
    "uniqueTenants30d": 8,
    "activeAlerts": 0,
    "topAction": {
      "action": "LOGIN_SUCCESS",
      "count": 523
    }
  }
}
```

### **GET /api/admin/metrics**
Aggregate metrics voor charts

**Query params:**
- `startDate` (ISO): bijv. `2025-11-01`
- `endDate` (ISO): bijv. `2025-11-30`

**Response:**
```json
{
  "success": true,
  "metrics": {
    "totalActions": 1247,
    "uniqueUsers": 34,
    "uniqueTenants": 8,
    "actionTypes": [
      { "action": "LOGIN_SUCCESS", "count": 523 },
      { "action": "SCAN_STARTED", "count": 312 }
    ],
    "dailyTrend": [
      { "date": "2025-11-01", "count": 42 },
      { "date": "2025-11-02", "count": 38 }
    ],
    "hourlyDistribution": [0, 0, 2, 5, 12, ...]
  }
}
```

### **GET /api/admin/audit**
Anonymized audit trail entries

**Query params:**
- `action` (string): filter by action type
- `startDate` (ISO)
- `endDate` (ISO)
- `limit` (int): default 100
- `offset` (int): default 0

**Response:**
```json
{
  "success": true,
  "entries": [
    {
      "timestamp": "2025-11-28T12:00:00.000Z",
      "action": "LOGIN_SUCCESS",
      "userHash": "a1b2c3d4e5f6...",
      "tenantHash": "f6e5d4c3b2a1...",
      "metadata": { "authType": "user" }
    }
  ],
  "total": 1247,
  "offset": 0,
  "limit": 100,
  "hasMore": true
}
```

### **GET /api/admin/alerts**
Security anomaly alerts

**Response:**
```json
{
  "success": true,
  "alerts": [
    {
      "type": "FAILED_LOGIN_SPIKE",
      "severity": "HIGH",
      "message": "7 failed login attempts in last 24h",
      "count": 7
    }
  ],
  "alertCount": 1
}
```

### **POST /api/admin/export**
Export audit trail to CSV

**Body:**
```json
{
  "startDate": "2025-11-01",
  "endDate": "2025-11-30"
}
```

**Response:** CSV file download

---

## 🔧 Configuration

### **config/audit.js**

```javascript
module.exports = {
  // Data retention
  AUDIT_RETENTION_DAYS: 730, // 2 years

  // Hash salt (CHANGE IN PRODUCTION!)
  AUDIT_SALT: process.env.AUDIT_SALT || 'sharepoint-manager-audit-v1-2025',

  // Feature flags
  ENABLE_USER_TRACKING: true,
  ENABLE_ADMIN_ACCESS_LOG: true,
  ENABLE_ANOMALY_DETECTION: true,

  // Anomaly thresholds
  ANOMALY_DETECTION: {
    failedLoginThreshold: 5,
    scanSpikeMultiplier: 3,
    cleanupErrorThreshold: 10
  },

  // Admin session
  ADMIN_SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 min
  ADMIN_TOKEN_TTL_MS: 60 * 60 * 1000 // 1 hour
};
```

### **Environment Variables**

```bash
# .env file
AUDIT_SALT=change-me-in-production-to-random-string
ADMIN_API_KEY=your-secure-admin-key-change-me
```

⚠️ **CRITICAL**: Wijzig `AUDIT_SALT` in productie naar een random string (bijv. `openssl rand -hex 32`)

---

## 🔒 Security Best Practices

### **1. Hash Salt Rotation**
Bij salt wijziging worden oude hashes onbruikbaar → nieuwe hashes voor nieuwe events.

**Aanbeveling:** Gebruik 1 salt gedurende de volledige retention periode (2 jaar).

### **2. Admin Token Management**

**Ephemeral tokens (recommended):**
- ✅ Auto-expire (1 uur)
- ✅ Roteer regelmatig
- ✅ Geen persistence

**Static API key (fallback):**
- ⚠️ Nooit in code committen
- ⚠️ Gebruik environment variables
- ⚠️ Wijzig regelmatig

### **3. Access Control**

Admin dashboard toegang wordt automatisch gelogd:
```json
{
  "action": "ADMIN_DASHBOARD_ACCESSED",
  "userHash": "admin-hash",
  "timestamp": "..."
}
```

### **4. HTTPS in Productie**

```javascript
// server.js
if (process.env.NODE_ENV === 'production') {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}
```

---

## 📝 Audit Event Types

| Event | Beschrijving |
|-------|--------------|
| `CONFIG_CREATED` | User configureerde Azure App Registration |
| `LOGIN_SUCCESS` | Succesvolle authenticatie |
| `LOGIN_FAILED` | Mislukte login poging |
| `LOGOUT` | User logged uit |
| `SCAN_STARTED` | Site scan gestart |
| `DRY_RUN_STARTED` | Cleanup dry-run gestart |
| `DRY_RUN_COMPLETED` | Dry-run succesvol afgerond |
| `CLEANUP_STARTED` | Real cleanup gestart |
| `CLEANUP_COMPLETED` | Cleanup succesvol afgerond |
| `CLEANUP_FAILED` | Cleanup error |
| `CLEANUP_CANCELLED` | User annuleerde cleanup |
| `ADMIN_DASHBOARD_ACCESSED` | Admin dashboard geopend |
| `METRICS_VIEWED` | Admin bekeek metrics |
| `AUDIT_TRAIL_VIEWED` | Admin bekeek audit trail |
| `AUDIT_EXPORTED` | Audit trail geëxporteerd |

---

## 🧪 Testing

### **Generate Test Audit Data**

```javascript
// Test script
const auditLogger = require('./services/auditLogger');

// Simulate user activity
for (let i = 0; i < 100; i++) {
  auditLogger.logAudit(
    'LOGIN_SUCCESS',
    `session-${i}`,
    `tenant-${i % 5}`,
    `user${i}@example.com`,
    { authType: 'user' }
  );
}
```

### **View Archive Files**

```bash
cd logs/archive
ls -lah
# Output: audit-2025-11.jsonl

# View entries
cat audit-2025-11.jsonl | head -n 5
```

### **Test Anonymization**

```javascript
const auditLogger = require('./services/auditLogger');

const email = 'john.doe@example.com';
const hash1 = auditLogger.hashIdentifier(email);
const hash2 = auditLogger.hashIdentifier(email);

console.log(hash1 === hash2); // true (consistent)
console.log(hash1); // "a1b2c3d4e5f6g7h8" (irreversible)
```

---

## 🛠️ Troubleshooting

### **Dashboard niet bereikbaar**

1. Check server logs: `npm run dev`
2. Verify admin token: `curl http://localhost:3000/api/admin/stats -H "X-Admin-Ephemeral: YOUR_TOKEN"`
3. Check browser console voor errors

### **Geen audit entries**

1. Check archive directory: `ls logs/archive/`
2. Verify events worden gelogd: Bekijk console tijdens login/scans
3. Check date filters in dashboard (default: last 7 days)

### **Charts niet geladen**

1. Verify Chart.js CDN: Open browser dev tools → Network tab
2. Check metrics endpoint: `curl http://localhost:3000/api/admin/metrics?startDate=2025-11-01`
3. Refresh dashboard met Ctrl+Shift+R

### **CSV export faalt**

1. Check browser popup blocker
2. Verify date range is valid
3. Check server logs voor errors

---

## 📈 Future Enhancements

- [ ] **Archief compressie** (gzip oude maanden)
- [ ] **Elasticsearch integratie** (large-scale search)
- [ ] **Slack/Teams notificaties** voor alerts
- [ ] **Custom alert regels** (via UI)
- [ ] **User behavior analytics** (ML anomaly detection)
- [ ] **Audit log replicatie** (multi-region backup)

---

## 🤝 Contributing

**Pull requests welkom!**

Verbeterpunten:
- Extra anomaly detection regels
- Extra chart types (geografische heatmap, user journey)
- Performance optimalisaties (caching, indexing)
- UI/UX verbeteringen

---

## 📄 License

MIT License - See LICENSE file

---

## 💡 Tips

1. **Bekijk metrics wekelijks** om trends te spotten
2. **Monitor alerts dagelijks** voor security issues
3. **Export audit trail maandelijks** voor compliance
4. **Review top actions** om user behavior te begrijpen
5. **Check peak hours** voor capacity planning

---

**Dashboard URL:** `http://localhost:3000/admin-dashboard.html`

**Vragen?** Open een issue op GitHub! 🚀
