const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config(); // Load .env file for ADMIN_API_KEY
const logger = require('./services/logger');
const requireAdmin = require('./middleware/adminAuth');
const adminTokenService = require('./services/adminTokenService');
// NOTE: No .env file loading for Azure credentials. All Azure credentials are provided by users via browser (browser-based config).

const authRoutes = require('./routes/auth');
const sharePointRoutes = require('./routes/sharepoint');
const optimizedRoutes = require('./routes/optimizedSharepoint');
const adminRoutes = require('./routes/admin');
const demoRoutes = require('./routes/demo');
const auditLogger = require('./services/auditLogger');

const app = express();
const PORT = process.env.PORT || 3000;

// NO environment variable validation needed - users set their own Azure config via browser
logger.log('INFO', 'SERVER', 'STARTING', { port: PORT, mode: 'multi-user' });
console.log('✓ Sharepointer starting in multi-user mode');
console.log('✓ Users will configure their own Azure App Registration via the web interface');

// Increase timeout for long-running requests
app.timeout = 10 * 60 * 1000; // 10 minutes

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Security: Add security headers
app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    // Prevent MIME sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Enable XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Strict transport security (HTTPS only in production)
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

// Rate limiter for demo page (prevent scraping/DDOS)
const demoPageLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 page loads per minute per IP
    message: 'Too many requests to demo page, please try again in 1 minute',
    standardHeaders: true,
    legacyHeaders: false
});

// Main route - Analytics is the new home (BEFORE static middleware to override index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'analytics.html'));
});

// Demo route - Public demo with fake data (RATE LIMITED)
app.get('/demo', demoPageLimiter, (req, res) => {
    // Log demo access with anonymized IP
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    auditLogger.logAudit('DEMO_ACCESSED', null, null, null, {
        ip: auditLogger.hashIdentifier(ip),
        userAgent: userAgent.substring(0, 100), // Truncate UA
        timestamp: new Date().toISOString()
    });
    
    logger.log('INFO', 'DEMO', 'ACCESSED', { ip: auditLogger.hashIdentifier(ip) });
    
    res.sendFile(path.join(__dirname, 'public', 'analytics.html'));
});

// Legacy route for old index.html (redirect to analytics)
app.get('/index.html', (req, res) => {
    res.redirect('/');
});

// Beta routes redirect to root
app.get('/beta', (req, res) => {
    res.redirect('/');
});

app.get('/beta/index.html', (req, res) => {
    res.redirect('/');
});

// Serve static files (AFTER route handlers to prevent index.html override)
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authRoutes); // Verplaats naar /api/auth zodat frontend werkt
app.use('/auth', authRoutes); // Behoud ook oude pad voor backward compatibility
app.use('/api/sharepoint', sharePointRoutes);
app.use('/api/sharepoint-v2', optimizedRoutes); // Optimized routes with streaming support
app.use('/api/admin', adminRoutes); // Admin audit dashboard routes
app.use('/api/demo', demoRoutes); // Demo data endpoints (no auth required)

// Logs endpoint (admin only - requires X-Admin-Key header) - Legacy support
app.get('/api/logs', requireAdmin, (req, res) => {
    try {
        const { date, category, sessionId } = req.query;
        
        if (sessionId) {
            const logs = logger.getSessionLogs(sessionId, date);
            return res.json({ logs, count: logs.length });
        }
        
        const logs = logger.getLogs(date, category);
        res.json({ logs, count: logs.length });
    } catch (error) {
        logger.logError('SERVER', 'LOGS_FETCH_FAILED', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// Admin ephemeral token management (no deletion of legacy key)
// POST /api/admin/ephemeral { rotate?: boolean, ttlMs?: number }
app.post('/api/admin/ephemeral', requireAdmin, (req, res) => {
    try {
        const { rotate, ttlMs } = req.body || {};
        let token;
        if (!adminTokenService.currentToken || rotate) {
            token = adminTokenService.autoRotate(ttlMs);
        } else {
            token = adminTokenService.currentToken; // return existing
        }
        res.json({ token, expiresAt: adminTokenService.expiresAt.toISOString(), method: req.adminAuth.method });
    } catch (e) {
        res.status(500).json({ error: 'Failed to set ephemeral token', message: e.message });
    }
});

// GET status
app.get('/api/admin/ephemeral', requireAdmin, (req, res) => {
    res.json({ status: adminTokenService.status(), method: req.adminAuth.method });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
    logger.log('SUCCESS', 'SERVER', 'STARTED', { 
        port: PORT, 
        url: `http://localhost:${PORT}`,
        timestamp: new Date().toISOString()
    });
    
    console.log(`\nSharepointer running on http://localhost:${PORT}`);
    console.log('Browser-based configuration: Users set their own Azure App Registration credentials');
    console.log('Security: No shared secrets, each user brings their own config');
    console.log('👥 Multi-user ready: Full session isolation per user\n');
});

module.exports = app;
