const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
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

// Cookie encryption for persistent sessions (survives server restart)
// Uses AES-256-GCM for authenticated encryption
const COOKIE_SECRET = process.env.COOKIE_SECRET || (() => {
  const secret = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  No COOKIE_SECRET in .env. Generated temporary secret.');
  console.warn('⚠️  Add this to .env for session persistence across restarts:');
  console.warn(`COOKIE_SECRET=${secret}`);
  return secret;
})();

// Encryption helpers for session data
const SESSION_ALGORITHM = 'aes-256-gcm';
function encryptSession(data) {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(COOKIE_SECRET, 'hex');
  const cipher = crypto.createCipheriv(SESSION_ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSession(encryptedData) {
  try {
    const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const key = Buffer.from(COOKIE_SECRET, 'hex');
    
    const decipher = crypto.createDecipheriv(SESSION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return JSON.parse(decrypted.toString('utf8'));
  } catch (err) {
    logger.log('ERROR', 'SESSION', 'DECRYPT_FAILED', { error: err.message });
    return null;
  }
}

// Make encryption helpers available to routes
app.locals.encryptSession = encryptSession;
app.locals.decryptSession = decryptSession;

// Increase timeout for long-running requests
app.timeout = 10 * 60 * 1000; // 10 minutes

// Middleware
app.use(cors({
  origin: true,
  credentials: true // Enable cookies for CORS
}));
app.use(cookieParser(COOKIE_SECRET)); // Signed cookies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Security: Enforce HTTPS in production (redirect HTTP -> HTTPS)
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.header('x-forwarded-proto') !== 'https') {
            return res.redirect(301, `https://${req.header('host')}${req.url}`);
        }
        next();
    });
}

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
    // Content Security Policy
    res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' https://cdn.jsdelivr.net https://alcdn.msauth.net https://cdnjs.cloudflare.com 'unsafe-inline'; " +
        "style-src 'self' https://cdnjs.cloudflare.com 'unsafe-inline'; " +
        "font-src 'self' https://cdnjs.cloudflare.com data:; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' https://graph.microsoft.com https://login.microsoftonline.com https://cdn.jsdelivr.net; " +
        "frame-ancestors 'none';"
    );
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

// Admin dashboard rate limiter (prevent brute force of admin key)
const adminRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Max 50 admin requests per 15 min per IP
    message: { error: 'Too many admin requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false // Count all requests (failed auth attempts too)
});

// Cleanup rate limiter (prevent resource exhaustion)
const cleanupRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Max 10 cleanup operations per hour per IP
    message: { error: 'Too many cleanup requests. Please wait an hour before trying again.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false
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
app.use('/api/admin', adminRateLimiter, adminRoutes); // Admin audit dashboard routes (rate limited)
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

// 404 handler - serve custom 404 page
app.use((req, res, next) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
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
