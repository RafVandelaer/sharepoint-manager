# Analytics Expandable Accordion Feature

## Overview
The Analytics page now features expandable site rows that reveal site management options inline, providing a streamlined interface for version cleanup and settings management.

## Features

### ✅ Expandable Site Details
- **Click to Expand**: Click any site row to reveal management options
- **Single Row Expansion**: Only one row can be expanded at a time
- **Smooth Animation**: `slideDown` animation (0.3s) for pleasant UX
- **Visual Feedback**: Active row highlighted with `#e6e9ff` background

### 🎯 Site Management Actions

#### 1. **Version Cleanup**
- **Dry Run**: Preview cleanup without executing
  - Shows number of files to process
  - Shows total versions to delete
  - No changes made to site
  
- **Execute Cleanup**: Permanently delete old versions
  - Configurable versions to keep (1-500)
  - Confirmation dialog before execution
  - Real-time progress feedback
  - Automatic analytics refresh after completion

#### 2. **Version Settings**
- **Manage Versioning**: Configure version limits and policies (coming soon)
- **Open in SharePoint**: Direct link to site in new tab

## Technical Implementation

### HTML Structure
```html
<tr class="site-row active" onclick="toggleSiteDetails(siteId, index)">
  <!-- Site info: name, storage, percentage, category -->
</tr>
<tr class="site-details-row expanded">
  <td colspan="5">
    <div class="site-details-panel">
      <!-- Detail cards grid -->
      <!-- Action buttons -->
    </div>
  </td>
</tr>
```

### CSS Classes
- `.site-row`: Clickable site row with hover effects
- `.site-row.active`: Highlighted expanded row
- `.site-details-row`: Hidden details row (display: none by default)
- `.site-details-row.expanded`: Visible details row with slideDown animation
- `.site-details-panel`: Container for details and actions
- `.details-grid`: CSS Grid layout for site info cards
- `.action-btn-primary`: Gradient background (cleanup actions)
- `.action-btn-secondary`: Outlined button (dry run, external links)
- `.action-btn-danger`: Red button (destructive cleanup)

### JavaScript Functions

#### `toggleSiteDetails(siteId, index)`
- Manages row expansion state
- Closes previously expanded row
- Toggles `.active` and `.expanded` classes
- Updates global `expandedSiteId` state

#### `runDryRun(siteId, index)`
- Calls `/api/sharepoint/sites/:siteId/cleanup?dryRun=true`
- Validates input (1-500 versions)
- Shows alert with preview results
- No site modifications

#### `runCleanup(siteId, index)`
- Calls `/api/sharepoint/sites/:siteId/cleanup`
- Requires confirmation (destructive action)
- Shows success message with stats
- Refreshes analytics after completion

#### `openVersionSettings(siteId)`
- Placeholder for future versioning modal
- Shows informational alert for now

## Security Features

### Input Validation
- Versions to keep: `min="1" max="500"`
- JavaScript validation before API calls
- Type checking (`parseInt()`, `isNaN()` guards)

### Event Handling
- `event.stopPropagation()` on action buttons
- Prevents row toggle when clicking buttons
- Prevents event bubbling

### Authentication
- All API calls use `api.request()` wrapper
- Automatic Bearer token injection
- Session validation via `X-Session-ID` header
- 401 errors trigger re-authentication flow

### Confirmation Dialogs
- Destructive cleanup requires explicit confirmation
- Warning message shows impact (versions to delete)
- "Cannot be undone" disclaimer

## API Endpoints Used

### `POST /api/sharepoint/sites/:siteId/cleanup?dryRun=true`
**Request:**
```javascript
{
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'X-Session-ID': '<sessionId>'
  }
}
```

**Response:**
```json
{
  "filesToProcess": [
    { "name": "file.docx", "versionsToDelete": 45 }
  ],
  "totalVersions": 245
}
```

### `POST /api/sharepoint/sites/:siteId/cleanup`
**Request:** Same as dry run, without `?dryRun=true`

**Response:**
```json
{
  "filesToProcess": [...],
  "totalVersionsDeleted": 245,
  "success": true
}
```

## User Experience Flow

1. **Navigate to Analytics** (`/analytics.html`)
2. **View all sites** in table with storage stats
3. **Click a site row** → Details panel slides down
4. **Configure versions to keep** (default: 50)
5. **Click "Dry Run"** → Preview results in alert
6. **Click "Execute Cleanup"** → Confirm → Cleanup runs
7. **Success message** → Analytics refreshes automatically
8. **Click row again** → Details panel collapses

## Design Language

### Colors
- **Primary Gradient**: `#667eea → #764ba2`
- **Active Row**: `#e6e9ff` (light purple)
- **Hover**: `#f7fafc` (light gray)
- **Success**: `#48bb78` (green)
- **Warning**: `#ed8936` (orange)
- **Danger**: `#f56565` (red)

### Typography
- **Site Name**: 16px bold
- **Storage**: 18px bold
- **Detail Labels**: 12px uppercase gray
- **Detail Values**: 18px bold dark

### Spacing
- **Card Padding**: 24px
- **Grid Gap**: 16px
- **Button Gap**: 12px
- **Section Margin**: 24px

### Transitions
- **Row Hover**: `translateY(-2px)` on action buttons
- **Animation**: `slideDown 0.3s ease-out`
- **Background**: `all 0.2s` on row hover

## Browser Compatibility
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

**CSS Features Used:**
- CSS Grid (`auto-fit`, `minmax()`)
- Custom animations (`@keyframes`)
- Linear gradients
- Box shadows with multiple layers
- Transform transitions

## Future Enhancements

### Planned Features
- [ ] **Versioning Modal**: Full library versioning settings UI
- [ ] **Bulk Selection**: Select multiple sites for cleanup
- [ ] **Progress Bars**: Real-time cleanup progress indicators
- [ ] **History Tracking**: Show previous cleanup operations
- [ ] **Scheduled Cleanup**: Configure automatic cleanup rules

### Performance Optimizations
- [ ] **Virtual Scrolling**: Render only visible rows (1000+ sites)
- [ ] **Lazy Loading**: Load details on expand, not on page load
- [ ] **Debounced Input**: Delay validation on typing
- [ ] **Cached Results**: Store dry run results temporarily

## Testing Checklist

### Manual Tests
- [x] Click site row → details expand
- [x] Click same row → details collapse
- [x] Click different row → previous closes, new opens
- [x] Click "Dry Run" → alert shows preview
- [x] Click "Execute Cleanup" → confirmation required
- [x] Click "Open in SharePoint" → new tab opens
- [x] Input validation: min 1, max 500 versions
- [x] Event bubbling: buttons don't toggle row
- [x] Animation smoothness: slideDown 0.3s

### Error Scenarios
- [x] Invalid input (0, 501, text) → validation error
- [x] Network error → friendly error message
- [x] Unauthenticated → 401 handled by api.request()
- [x] Server error → error logged, alert shown

## Maintenance Notes

### Code Locations
- **HTML Template**: `/public/analytics.html` (lines 769-840)
- **CSS Styles**: `/public/analytics.html` (lines 148-305)
- **JavaScript Logic**: `/public/analytics.html` (lines 844-924)
- **API Endpoints**: `/routes/sharepoint.js` (cleanup routes)

### Dependencies
- **MSAL Browser**: 2.32.2 (authentication)
- **Chart.js**: 4.4.0 (visualizations)
- **Font Awesome**: 6.0.0 (icons)
- **Microsoft Graph API**: v1.0 (SharePoint operations)

### Configuration
- Default versions to keep: **50**
- Min versions to keep: **1**
- Max versions to keep: **500**
- Animation duration: **0.3s**
- Session timeout: **8 hours**

---

**Last Updated**: December 2024  
**Feature Status**: ✅ Production Ready  
**Security Review**: ✅ Passed  
**Documentation**: ✅ Complete
