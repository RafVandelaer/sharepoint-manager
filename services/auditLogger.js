/**
 * Audit Logger Service - Privacy-First Persistent Audit Trail
 * 
 * Features:
 * - SHA-256 hashing for user anonymization
 * - Immutable append-only audit archive
 * - Aggregate metrics for analytics (no PII)
 * - GDPR-compliant data minimization
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AuditLogger {
  constructor() {
    this.logsDir = path.join(__dirname, '..', 'logs');
    this.archiveDir = path.join(this.logsDir, 'archive');
    this.ensureDirectories();
    
    // Audit salt for privacy protection (required in .env)
    this.auditSalt = process.env.AUDIT_SALT;
    if (!this.auditSalt) {
      console.error('🚨 SECURITY ERROR: AUDIT_SALT not set in .env');
      console.error('Generate one with: openssl rand -hex 32');
      console.error('AUDIT_SALT is required for GDPR-compliant user anonymization');
      throw new Error('AUDIT_SALT environment variable required for privacy');
    }
  }

  ensureDirectories() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }
  }

  /**
   * Hash user identifiers for privacy (SHA-256)
   * Same input → same hash (for trend analysis)
   * Irreversible (admin cannot trace back to user)
   */
  hashIdentifier(identifier) {
    if (!identifier || identifier === 'ANONYMOUS') return 'ANONYMOUS';
    
    return crypto.createHash('sha256')
      .update(identifier + this.auditSalt)
      .digest('hex')
      .substring(0, 16); // 16 chars = 64-bit collision resistance
  }

  /**
   * Get current timestamp in ISO format
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Enhanced audit log with privacy hash
   */
  logAudit(action, sessionId, tenantId, userEmail, data = {}) {
    const hashedUser = this.hashIdentifier(userEmail || sessionId);
    const hashedTenant = this.hashIdentifier(tenantId);
    const timestamp = this.getTimestamp();

    const auditEntry = {
      timestamp,
      action,
      userHash: hashedUser,
      tenantHash: hashedTenant,
      metadata: this.sanitizeMetadata(data)
    };

    // Write to permanent audit archive (never auto-deleted)
    this.writeToAuditArchive(auditEntry);

    // Also write to daily console log (for real-time monitoring)
    this.logToConsole(auditEntry);
  }

  /**
   * Write to permanent audit archive (append-only)
   * Files organized by year-month for manageable size
   */
  writeToAuditArchive(entry) {
    const yearMonth = new Date().toISOString().substring(0, 7); // 2025-11
    const archiveFile = path.join(this.archiveDir, `audit-${yearMonth}.jsonl`);
    
    const logLine = JSON.stringify(entry) + '\n';
    
    fs.appendFile(archiveFile, logLine, (err) => {
      if (err) {
        console.error('Failed to write to audit archive:', err);
      }
    });
  }

  /**
   * Write to console with color coding
   */
  logToConsole(entry) {
    const color = '\x1b[35m'; // Magenta for audit
    const reset = '\x1b[0m';
    
    console.log(`${color}[AUDIT] ${entry.timestamp} ${entry.action} (User: ${entry.userHash})${reset}`);
  }

  /**
   * Sanitize metadata to remove sensitive data
   */
  sanitizeMetadata(data) {
    if (!data || typeof data !== 'object') return {};
    
    const sanitized = { ...data };
    const sensitiveKeys = ['clientSecret', 'password', 'token', 'accessToken', 'secret', 'apiKey', 'bearer'];
    
    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeMetadata(sanitized[key]);
      }
    }
    
    return sanitized;
  }

  /**
   * Get audit entries with filters
   */
  getAuditEntries(options = {}) {
    const { action, startDate, endDate, limit = 100, offset = 0 } = options;
    
    // Determine which archive files to read
    const files = this.getArchiveFilesInRange(startDate, endDate);
    
    let allEntries = [];
    
    for (const file of files) {
      const filePath = path.join(this.archiveDir, file);
      
      if (!fs.existsSync(filePath)) continue;
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const entries = content.split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return null;
          }
        })
        .filter(entry => entry !== null);
      
      allEntries = allEntries.concat(entries);
    }

    // Apply filters
    if (action) {
      allEntries = allEntries.filter(e => e.action === action);
    }

    if (startDate) {
      const start = new Date(startDate);
      allEntries = allEntries.filter(e => new Date(e.timestamp) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      allEntries = allEntries.filter(e => new Date(e.timestamp) <= end);
    }

    // Sort by timestamp descending (newest first)
    allEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply pagination
    const total = allEntries.length;
    const paginated = allEntries.slice(offset, offset + limit);

    return { entries: paginated, total, offset, limit };
  }

  /**
   * Get archive files in date range
   */
  getArchiveFilesInRange(startDate, endDate) {
    if (!fs.existsSync(this.archiveDir)) return [];
    
    const allFiles = fs.readdirSync(this.archiveDir)
      .filter(f => f.startsWith('audit-') && f.endsWith('.jsonl'));

    if (!startDate && !endDate) {
      // Return last 3 months if no range specified
      return allFiles.slice(-3);
    }

    // Filter files by date range in filename (audit-2025-11.jsonl)
    return allFiles.filter(file => {
      const match = file.match(/audit-(\d{4}-\d{2})\.jsonl/);
      if (!match) return false;
      
      const fileMonth = match[1];
      
      if (startDate && fileMonth < startDate.substring(0, 7)) return false;
      if (endDate && fileMonth > endDate.substring(0, 7)) return false;
      
      return true;
    });
  }

  /**
   * Get aggregate metrics (for charts, NO user identification)
   */
  getAggregateMetrics(startDate, endDate, options = {}) {
    const { includeAdmin = false } = options;
    const entries = this.getAuditEntries({ startDate, endDate, limit: 100000 }).entries;

    // Optionally exclude admin/dashboard view actions from metrics
    const isAdminAction = (action) => {
      if (!action || typeof action !== 'string') return false;
      return action.startsWith('ADMIN_') || [
        'METRICS_VIEWED',
        'AUDIT_TRAIL_VIEWED',
        'ALERTS_VIEWED',
        'AUDIT_EXPORTED'
      ].includes(action);
    };

    const filtered = includeAdmin ? entries : entries.filter(e => !isAdminAction(e.action));
    
    const metrics = {
      totalActions: filtered.length,
      uniqueUsers: new Set(),
      uniqueTenants: new Set(),
      actionsByType: {},
      actionsByDay: {},
      actionsByHour: Array(24).fill(0),
      topActions: []
    };

    filtered.forEach(entry => {
      // Count unique users (anonymized)
      if (entry.userHash && entry.userHash !== 'ANONYMOUS') {
        metrics.uniqueUsers.add(entry.userHash);
      }

      // Count unique tenants (anonymized)
      if (entry.tenantHash && entry.tenantHash !== 'ANONYMOUS') {
        metrics.uniqueTenants.add(entry.tenantHash);
      }

      // Actions by type
      const action = entry.action || 'UNKNOWN';
      metrics.actionsByType[action] = (metrics.actionsByType[action] || 0) + 1;

      // Actions by day
      const day = entry.timestamp.substring(0, 10); // YYYY-MM-DD
      metrics.actionsByDay[day] = (metrics.actionsByDay[day] || 0) + 1;

      // Actions by hour
      const hour = new Date(entry.timestamp).getHours();
      metrics.actionsByHour[hour]++;
    });

    // Convert to arrays for easier charting
    const actionTypes = Object.entries(metrics.actionsByType)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);

    const dailyTrend = Object.entries(metrics.actionsByDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalActions: metrics.totalActions,
      uniqueUsers: metrics.uniqueUsers.size,
      uniqueTenants: metrics.uniqueTenants.size,
      actionTypes,
      dailyTrend,
      hourlyDistribution: metrics.actionsByHour
    };
  }

  /**
   * Detect security anomalies
   */
  detectAnomalies() {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const entries = this.getAuditEntries({ startDate: last24h, limit: 10000 }).entries;

    const alerts = [];

    // Check for failed login spikes
    const failedLogins = entries.filter(e => e.action === 'LOGIN_FAILED' || e.action === 'AUTH_FAILED');
    if (failedLogins.length > 5) {
      alerts.push({
        type: 'FAILED_LOGIN_SPIKE',
        severity: 'HIGH',
        message: `${failedLogins.length} failed login attempts in last 24h`,
        count: failedLogins.length
      });
    }

    // Check for unusual scan volume
    const scans = entries.filter(e => e.action === 'SCAN_STARTED' || e.action === 'DRY_RUN_STARTED');
    const avgScansPerDay = 50; // Baseline (can be configured)
    
    if (scans.length > avgScansPerDay * 3) {
      alerts.push({
        type: 'SCAN_VOLUME_SPIKE',
        severity: 'MEDIUM',
        message: `Unusually high scan volume: ${scans.length} scans in 24h`,
        count: scans.length
      });
    }

    // Check for cleanup errors
    const cleanupErrors = entries.filter(e => e.action === 'CLEANUP_FAILED');
    if (cleanupErrors.length > 10) {
      alerts.push({
        type: 'CLEANUP_ERRORS',
        severity: 'MEDIUM',
        message: `${cleanupErrors.length} cleanup operations failed in last 24h`,
        count: cleanupErrors.length
      });
    }

    return alerts;
  }

  /**
   * Export audit trail to CSV (for compliance)
   */
  exportToCSV(startDate, endDate) {
    const { entries } = this.getAuditEntries({ startDate, endDate, limit: 100000 });

    const headers = ['Timestamp', 'Action', 'User Hash', 'Tenant Hash', 'Metadata'];
    const rows = entries.map(entry => [
      entry.timestamp,
      entry.action,
      entry.userHash,
      entry.tenantHash,
      JSON.stringify(entry.metadata || {})
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csv;
  }

  /**
   * Log admin dashboard access
   */
  logAdminAccess(adminHash, action = 'ADMIN_DASHBOARD_ACCESSED') {
    this.logAudit(action, adminHash, null, null, {
      timestamp: Date.now(),
      userAgent: 'admin'
    });
  }

  /**
   * Get admin access logs
   */
  getAdminAccessLogs(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { entries } = this.getAuditEntries({ startDate: since, limit: 1000 });
    
    return entries.filter(e => 
      e.action.startsWith('ADMIN_') || 
      e.action === 'LOGS_VIEWED' ||
      e.action === 'METRICS_VIEWED'
    );
  }
}

// Export singleton instance
module.exports = new AuditLogger();
