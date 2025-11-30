/**
 * Demo API Routes - Provides demo data endpoints for /demo page
 * SECURITY: Rate limited to prevent DDOS abuse
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const demoDataService = require('../services/demoDataService');
const auditLogger = require('../services/auditLogger');
const logger = require('../services/logger');

// Rate limiter: 20 requests per minute per IP
const demoRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per window
  message: { error: 'Too many demo requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.log('WARN', 'DEMO', 'RATE_LIMIT_EXCEEDED', { 
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    res.status(429).json({ error: 'Too many demo requests, please try again in 1 minute.' });
  }
});

// Apply rate limiter to all demo routes
router.use(demoRateLimiter);

/**
 * GET /api/demo/sites/analytics/storage/partial
 * Progressive loading - first page of sites
 */
router.get('/sites/analytics/storage/partial', (req, res) => {
  try {
    const pageSize = parseInt(req.query.pageSize) || 50;
    const response = demoDataService.generatePaginatedResponse(pageSize, 0);
    
    logger.log('INFO', 'DEMO', 'PARTIAL_LOAD', { pageSize, sitesCount: response.sites.length });
    // Add an upward aggregate storage trend for charts
    response.aggregate = response.aggregate || {};
    response.aggregate.trend = demoDataService.generateStorageTrend(30, 10, 0.015);
    
    res.json(response);
  } catch (error) {
    logger.log('ERROR', 'DEMO', 'PARTIAL_LOAD_FAILED', { error: error.message });
    res.status(500).json({ error: 'Failed to generate demo data' });
  }
});

/**
 * GET /api/demo/sites/analytics/storage/page
 * Progressive loading - subsequent pages
 */
router.get('/sites/analytics/storage/page', (req, res) => {
  try {
    const nextParam = req.query.next;
    
    // Parse page number from nextLink (format: "page=1")
    const pageMatch = nextParam ? nextParam.match(/page=(\d+)/) : null;
    const pageIndex = pageMatch ? parseInt(pageMatch[1]) : 1;
    
    const pageSize = 50;
    const response = demoDataService.generatePaginatedResponse(pageSize, pageIndex);
    // Ensure aggregate storage trend shows upward movement
    response.aggregate = response.aggregate || {};
    response.aggregate.trend = demoDataService.generateStorageTrend(30, 10, 0.015);
    
    logger.log('INFO', 'DEMO', 'PAGE_LOAD', { pageIndex, sitesCount: response.sites.length });
    
    res.json(response);
  } catch (error) {
    logger.log('ERROR', 'DEMO', 'PAGE_LOAD_FAILED', { error: error.message });
    res.status(500).json({ error: 'Failed to load demo page' });
  }
});

/**
 * GET /api/demo/sites/analytics/storage
 * Full analytics endpoint (fallback)
 */
router.get('/sites/analytics/storage', (req, res) => {
  try {
    const analytics = demoDataService.generateFullAnalytics();
    
    logger.log('INFO', 'DEMO', 'FULL_LOAD', { sitesCount: analytics.sites.length });
    
    res.json(analytics);
  } catch (error) {
    logger.log('ERROR', 'DEMO', 'FULL_LOAD_FAILED', { error: error.message });
    res.status(500).json({ error: 'Failed to generate demo analytics' });
  }
});

/**
 * GET /api/demo/reports/storage
 * Storage trend over time (30 days)
 */
router.get('/reports/storage', (req, res) => {
  try {
    const period = req.query.period || 'D30';
    const days = period === 'D90' ? 90 : 30;
    const trend = demoDataService.generateStorageTrend(days, 800, 0.012);
    
    // Map to labels/data format expected by frontend (oldest first)
    const labels = trend.map(t => t.date);
    const data = trend.map(t => t.gb);
    
    logger.log('INFO', 'DEMO', 'TREND_REPORT', { period, days, points: trend.length, first: data[0], last: data[data.length-1] });
    
    res.json({ labels, data });
  } catch (error) {
    logger.log('ERROR', 'DEMO', 'TREND_FAILED', { error: error.message });
    res.status(500).json({ error: 'Failed to generate storage trend' });
  }
});

/**
 * GET /api/demo/sites/:siteId
 * Site detail with libraries
 */
router.get('/sites/:siteId', (req, res) => {
  try {
    const siteDetail = demoDataService.generateSiteDetail(req.params.siteId);
    
    res.json(siteDetail);
  } catch (error) {
    logger.log('ERROR', 'DEMO', 'SITE_DETAIL_FAILED', { error: error.message });
    res.status(500).json({ error: 'Failed to generate site detail' });
  }
});

/**
 * GET /api/demo/sites/:siteId/libraries
 * Get libraries for a demo site
 */
router.get('/sites/:siteId/libraries', (req, res) => {
  try {
    const siteDetail = demoDataService.generateSiteDetail(req.params.siteId);
    
    logger.log('INFO', 'DEMO', 'LIBRARIES_FETCHED', { siteId: req.params.siteId, count: siteDetail.libraries.length });
    res.json(siteDetail.libraries);
  } catch (error) {
    logger.log('ERROR', 'DEMO', 'LIBRARIES_FAILED', { error: error.message });
    res.status(500).json({ error: 'Failed to generate libraries' });
  }
});

/**
 * POST /api/demo/sites/:siteId/cleanup
 * Simulate cleanup (dry-run or real)
 */
router.post('/sites/:siteId/cleanup', (req, res) => {
  try {
    const { siteId } = req.params;
    const { dryRun = false, versionsToKeep = 10 } = req.query;
    const isDryRun = dryRun === 'true' || dryRun === true;

    // Security: Always simulate in demo mode; never touch real data
    // Provide an SSE-like progressive result via batches
    const totalFiles = Math.floor(Math.random() * 60) + 90; // 90-150 files
    const batchSize = 25;
    const batches = Math.ceil(totalFiles / batchSize);
    const versionsRemovedTotal = Math.floor(totalFiles * (Math.random() * 0.6));

    const progress = [];
    for (let b = 0; b < batches; b++) {
      const processed = Math.min(batchSize, totalFiles - b * batchSize);
      progress.push({
        batch: b + 1,
        filesProcessed: processed,
        versionsRemoved: Math.floor(processed * (Math.random() * 0.6)),
        currentFolder: `Demo/Library/Folder_${b + 1}`
      });
    }

    const result = {
      siteId,
      dryRun: isDryRun,
      versionsKept: Number(versionsToKeep),
      filesProcessed: totalFiles,
      versionsRemoved: versionsRemovedTotal,
      durationMs: 1200 + batches * 250,
      currentFolder: progress[progress.length - 1]?.currentFolder || 'Demo/Library',
      progress
    };

    logger.log('INFO', 'DEMO', 'CLEANUP_SIMULATED', { siteId, dryRun: result.dryRun, filesProcessed: totalFiles, versionsRemoved: versionsRemovedTotal });
    res.json({ success: true, result });
  } catch (error) {
    logger.log('ERROR', 'DEMO', 'CLEANUP_SIMULATION_FAILED', { error: error.message });
    res.status(500).json({ error: 'Failed to simulate cleanup' });
  }
});

module.exports = router;
