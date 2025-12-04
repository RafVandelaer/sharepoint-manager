/**
 * Admin authentication middleware
 * Protects admin-only endpoints with API key authentication
 */

const crypto = require('crypto');

// Admin API key - MUST be set in .env (no default for security)
// Generate with: openssl rand -hex 32
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
if (!ADMIN_API_KEY) {
    console.error('🚨 SECURITY ERROR: ADMIN_API_KEY not set in .env');
    console.error('📝 Generate one with: openssl rand -hex 32');
    console.error('📄 Add to .env: ADMIN_API_KEY=<generated-key>');
    process.exit(1);
}
const adminTokenService = require('../services/adminTokenService');

// Security: Track failed authentication attempts (simple in-memory, resets on restart)
const failedAttempts = new Map(); // IP -> { count, lastAttempt }
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

/**
 * Middleware to verify admin access
 * Supports two authentication methods:
 * 1. API Key in header: X-Admin-Key
 * 2. API Key in query param: adminKey (for browser testing)
 */
function requireAdmin(req, res, next) {
    const apiKeyFromHeader = req.headers['x-admin-key'];
    const apiKeyFromQuery = req.query.adminKey;
    const ephemeralFromHeader = req.headers['x-admin-ephemeral'];
    // Accept either legacy static key OR ephemeral token
    const providedKey = apiKeyFromHeader || apiKeyFromQuery || ephemeralFromHeader;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    // Security: Check if IP is locked out
    const attempts = failedAttempts.get(clientIp);
    if (attempts && attempts.count >= MAX_FAILED_ATTEMPTS) {
        const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
        if (timeSinceLastAttempt < LOCKOUT_DURATION) {
            const remainingMinutes = Math.ceil((LOCKOUT_DURATION - timeSinceLastAttempt) / 60000);
            return res.status(429).json({ 
                error: 'Too many failed attempts',
                message: `Too many failed login attempts. Try again in ${remainingMinutes} minute(s).`,
                retryAfter: remainingMinutes
            });
        } else {
            // Reset after lockout duration
            failedAttempts.delete(clientIp);
        }
    }
    
    if (!providedKey) {
        recordFailedAttempt(clientIp);
        return res.status(401).json({ 
            error: 'Unauthorized',
            message: 'Admin authentication required. Provide X-Admin-Key header or adminKey query parameter.'
        });
    }
    // Validate ephemeral token first if header present
    let valid = false;
    if (ephemeralFromHeader && adminTokenService.validate(ephemeralFromHeader)) {
        valid = true;
    } else {
        // Fallback to legacy key comparison
        try {
            valid = crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(ADMIN_API_KEY));
        } catch { valid = false; }
    }
    if (!valid) {
        recordFailedAttempt(clientIp);
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Invalid admin credentials.'
        });
    }
    
    // Success: clear failed attempts for this IP
    failedAttempts.delete(clientIp);
    
    // Attach metadata for downstream handlers
    req.adminAuth = {
        method: ephemeralFromHeader && adminTokenService.validate(ephemeralFromHeader) ? 'ephemeral' : 'static'
    };
    // Valid credentials - proceed
    next();
}

function recordFailedAttempt(ip) {
    const current = failedAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    failedAttempts.set(ip, {
        count: current.count + 1,
        lastAttempt: Date.now()
    });
}

module.exports = requireAdmin;
