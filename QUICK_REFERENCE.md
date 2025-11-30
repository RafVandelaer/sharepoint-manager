# Sharepointer - Quick Reference

## 🎯 Access URLs

| Feature | URL | Access Level |
|---------|-----|--------------|
| Main App | http://localhost:3000/ | All Users |
| Beta UI | http://localhost:3000/beta/index.html | All Users |
| **Admin Logs Dashboard** | http://localhost:3000/admin-logs.html | **Admin Only** |
| **Tenant Analytics** | http://localhost:3000/analytics.html | All Users |

## 🔐 Security Overview

### Admin Logs Dashboard
- **Authentication**: Requires admin API key
- **Key Storage**: In-memory only (cleared on logout)
- **API Protection**: All `/api/logs` endpoints require valid admin key
- **Session Security**: No localStorage, no persistent storage

### Tenant Analytics
- **Authentication**: Requires user login (session token)
- **Permissions**: Delegated `Sites.Read.All`
- **Data Access**: User sees only their accessible sites
- **Read-Only**: No write operations

## 🔑 Admin Credentials

**Your Admin API Key:**
```
776ff79652791ac1ffbd0ba4dc4d83cbbcd368cb01ea313dd69c6e9cf06dd5ed
```

**Quick Access (Browser):**
```
http://localhost:3000/api/logs?adminKey=776ff79652791ac1ffbd0ba4dc4d83cbbcd368cb01ea313dd69c6e9cf06dd5ed
```

**Quick Access (cURL):**
```bash
curl -H "X-Admin-Key: 776ff79652791ac1ffbd0ba4dc4d83cbbcd368cb01ea313dd69c6e9cf06dd5ed" \
  http://localhost:3000/api/logs
```

## 📊 Features Comparison

| Feature | Admin Logs | Tenant Analytics |
|---------|-----------|------------------|
| **Purpose** | Monitor user actions & operations | View storage usage & trends |
| **Access** | Admin only (API key) | All logged-in users |
| **Data** | Audit trail, errors, sessions | Site sizes, growth metrics |
| **Real-time** | Yes (30s refresh) | Manual refresh |
| **Security** | High (admin key required) | Standard (session token) |

## 🎨 Admin Logs Dashboard

### What You Can See:
- 📈 **Total Events**: All logged actions
- 👥 **Active Sessions**: Unique user sessions
- 🏢 **Tenants**: Different Azure tenants accessing the app
- ❌ **Errors**: Failed operations count

### Filters:
- **Category**: TENANT, AUTH, CLEANUP, VERSIONING, SERVER
- **Date**: Any date (YYYY-MM-DD)
- **Session ID**: Track specific user session

### Log Levels:
- 🔵 **INFO**: General information
- 🟢 **SUCCESS**: Successful operations
- 🟡 **WARNING**: Potential issues
- 🔴 **ERROR**: Failed operations
- 🟣 **AUDIT**: Important security events

## 📊 Tenant Analytics Dashboard

### Metrics:
- **Total Sites**: Count of SharePoint sites
- **Total Storage**: Combined usage across all sites
- **Avg. Site Size**: Mean site storage
- **Largest Site**: Biggest site by storage

### Charts:
1. **Storage Distribution**: Top 10 sites (bar chart)
2. **Size Categories**: Small/Medium/Large breakdown (doughnut)
3. **Detailed Table**: All sites with progress bars

### Size Categories:
- 🟢 **Small**: < 1 GB
- 🟠 **Medium**: 1-10 GB
- 🔴 **Large**: > 10 GB

## 🛡️ Security Best Practices

### For Admin Key:
✅ Never commit to Git (already in `.gitignore`)
✅ Store in `.env` file only
✅ Use header auth in production (not query param)
✅ Rotate key periodically (every 90 days)
✅ Monitor access logs for unauthorized attempts

### For User Access:
✅ Always use HTTPS in production
✅ Enforce Azure AD authentication
✅ Use least-privilege permissions
✅ Enable MFA for all users
✅ Review access logs weekly

## 🔄 Common Workflows

### 1. Monitor User Activity (Admin)
```
1. Open http://localhost:3000/admin-logs.html
2. Enter admin API key
3. Filter by date/category
4. Review actions and errors
```

### 2. Check Storage Usage (User)
```
1. Login at /beta/index.html
2. Navigate to /analytics.html
3. View metrics and charts
4. Identify large sites for cleanup
```

### 3. Audit Cleanup Operations (Admin)
```
1. Open admin logs dashboard
2. Filter: Category = CLEANUP
3. Review DRY_RUN_STARTED and CLEANUP_COMPLETED
4. Check filesProcessed and versionsRemoved
```

### 4. Track Tenant Onboarding (Admin)
```
1. Open admin logs dashboard
2. Filter: Category = TENANT
3. See CONFIG_CREATED events
4. Verify tenantId and timestamps
```

## 📝 Log Examples

**Tenant Config:**
```json
{
  "action": "CONFIG_CREATED",
  "tenantId": "aaa70c2d-...",
  "clientId": "12345678..."
}
```

**User Login:**
```json
{
  "action": "LOGIN_SUCCESS",
  "account": "user@contoso.com",
  "tenantId": "aaa70c2d-...",
  "expiresInMinutes": 60
}
```

**Cleanup Operation:**
```json
{
  "action": "CLEANUP_COMPLETED",
  "siteName": "My SharePoint Site",
  "tenantId": "aaa70c2d-...",
  "filesProcessed": 150,
  "versionsRemoved": 500,
  "duration": 180000
}
```

## 🚀 Production Deployment

### Environment Variables:
```bash
# Required
ADMIN_API_KEY=your-secure-64-char-hex-key

# Optional
PORT=3000
NODE_ENV=production
```

### Generate New Admin Key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Health Check Endpoints:
- `GET /` - Main app (should return 200)
- `GET /api/logs` (with admin key) - Logs API (should return JSON)
- `GET /analytics.html` - Analytics (should return HTML)

## 📚 Documentation

- **Logging System**: `docs/LOGGING.md`
- **Analytics Feature**: `docs/ANALYTICS.md`
- **Admin Access**: `ADMIN_ACCESS.md`
- **Main README**: `README.md`

## 🆘 Troubleshooting

**Admin Logs Dashboard:**
- **401 Unauthorized**: Invalid admin key
- **403 Forbidden**: Correct format but wrong key
- **Empty logs**: No events for selected date/category

**Tenant Analytics:**
- **Not logged in**: Visit `/beta/index.html` first
- **0.00 GB storage**: User lacks drive access permissions
- **Slow loading**: Many sites cause parallel API throttling

## 📞 Support

For issues or questions:
1. Check logs in admin dashboard
2. Review `docs/` folder documentation
3. Inspect browser console for errors
4. Check server console for API errors
