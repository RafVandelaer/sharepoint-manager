/**
 * Admin API Routes
 * Endpoints for audit trail, metrics, and admin dashboard
 * Requires admin authentication (ephemeral token or API key)
 */

const express = require('express');
const router = express.Router();
const requireAdmin = require('../middleware/adminAuth');
const auditLogger = require('../services/auditLogger');
const auditConfig = require('../config/audit');

/**
 * GET /api/admin/metrics
 * Get aggregate metrics for charts (NO PII)
 * Query params: startDate, endDate (ISO format)
 */
router.get('/metrics', requireAdmin, (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Log admin access
    const adminHash = auditLogger.hashIdentifier(req.ip || 'admin');
    auditLogger.logAdminAccess(adminHash, 'METRICS_VIEWED');
    
    // Exclude admin/dashboard view actions from metrics so refreshes don't inflate counts
    const metrics = auditLogger.getAggregateMetrics(startDate, endDate, { includeAdmin: false });
    
    res.json({
      success: true,
      dateRange: { startDate, endDate },
      metrics,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch metrics',
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/audit
 * Get anonymized audit trail entries
 * Query params: action, startDate, endDate, limit, offset
 */
router.get('/audit', requireAdmin, (req, res) => {
  try {
    const { action, startDate, endDate, limit, offset } = req.query;
    
    // Log admin access
    const adminHash = auditLogger.hashIdentifier(req.ip || 'admin');
    auditLogger.logAdminAccess(adminHash, 'AUDIT_TRAIL_VIEWED');
    
    const result = auditLogger.getAuditEntries({
      action,
      startDate,
      endDate,
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0
    });
    
    res.json({
      success: true,
      ...result,
      hasMore: result.offset + result.entries.length < result.total
    });
  } catch (error) {
    console.error('Error fetching audit entries:', error);
    res.status(500).json({ 
      error: 'Failed to fetch audit trail',
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/alerts
 * Get security anomaly alerts
 */
router.get('/alerts', requireAdmin, (req, res) => {
  try {
    // Log admin access
    const adminHash = auditLogger.hashIdentifier(req.ip || 'admin');
    auditLogger.logAdminAccess(adminHash, 'ALERTS_VIEWED');
    
    const alerts = auditLogger.detectAnomalies();
    
    res.json({
      success: true,
      alerts,
      alertCount: alerts.length,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error detecting anomalies:', error);
    res.status(500).json({ 
      error: 'Failed to detect anomalies',
      message: error.message 
    });
  }
});

/**
 * POST /api/admin/export
 * Export audit trail to CSV (compliance)
 * Body: { startDate, endDate }
 */
router.post('/export', requireAdmin, (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    // Log admin access
    const adminHash = auditLogger.hashIdentifier(req.ip || 'admin');
    auditLogger.logAdminAccess(adminHash, 'AUDIT_EXPORTED');
    
    const csv = auditLogger.exportToCSV(startDate, endDate);
    
    const filename = `audit-trail-${startDate || 'all'}-to-${endDate || 'now'}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting audit trail:', error);
    res.status(500).json({ 
      error: 'Failed to export audit trail',
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/access-logs
 * Get admin dashboard access logs
 * Query params: hours (default: 24)
 */
router.get('/access-logs', requireAdmin, (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    
    const accessLogs = auditLogger.getAdminAccessLogs(hours);
    
    res.json({
      success: true,
      logs: accessLogs,
      count: accessLogs.length,
      period: `Last ${hours} hours`
    });
  } catch (error) {
    console.error('Error fetching access logs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch access logs',
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/config
 * Get audit configuration (for dashboard display)
 */
router.get('/config', requireAdmin, (req, res) => {
  try {
    // Return non-sensitive config
    res.json({
      success: true,
      config: {
        retentionDays: auditConfig.AUDIT_RETENTION_DAYS,
        anomalyDetection: auditConfig.ANOMALY_DETECTION,
        sessionTimeout: auditConfig.ADMIN_SESSION_TIMEOUT_MS,
        features: {
          userTracking: auditConfig.ENABLE_USER_TRACKING,
          adminAccessLog: auditConfig.ENABLE_ADMIN_ACCESS_LOG,
          anomalyDetection: auditConfig.ENABLE_ANOMALY_DETECTION
        }
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch config',
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/stats
 * Quick stats for dashboard header
 */
router.get('/stats', requireAdmin, (req, res) => {
  try {
    // Last 30 days metrics
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const metrics = auditLogger.getAggregateMetrics(thirtyDaysAgo, null, { includeAdmin: false });
    
    // Count demo page views (DEMO_ACCESSED action)
    const allMetrics = auditLogger.getAggregateMetrics(thirtyDaysAgo, null, { includeAdmin: true });
    const demoAction = allMetrics.actionTypes.find(a => a.action === 'DEMO_ACCESSED');
    const demoViews30d = demoAction ? demoAction.count : 0;
    
    // Last 24h alerts
    const alerts = auditLogger.detectAnomalies();
    
    res.json({
      success: true,
      stats: {
        totalActions30d: metrics.totalActions,
        uniqueUsers30d: metrics.uniqueUsers,
        uniqueTenants30d: metrics.uniqueTenants,
        demoViews30d: demoViews30d,
        activeAlerts: alerts.length,
        topAction: metrics.actionTypes[0] || { action: 'N/A', count: 0 }
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch stats',
      message: error.message 
    });
  }
});

module.exports = router;
