const crypto = require('crypto');

/**
 * ConfigService: Manages per-user Azure App Registration configuration
 * Stores tenant/client credentials in-memory per session (no env vars, no persistence)
 */
class ConfigService {
    constructor() {
        // sessionId -> { tenantId, clientId, clientSecret, redirectUri, createdAt }
        this.configCache = new Map();
        this.encryptionKey = crypto.randomBytes(32); // Generate on startup, lost on restart (stateless)
        
        // Security: Session timeout (8 hours of inactivity)
        this.SESSION_TIMEOUT = 8 * 60 * 60 * 1000;
        
        // Cleanup expired sessions every hour
        setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000);
    }

    /**
     * Store user's Azure config for their session
     */
    setConfig(sessionId, config) {
        const { tenantId, clientId, clientSecret, redirectUri } = config;
        
        if (!tenantId || !clientId || !clientSecret) {
            throw new Error('Missing required config: tenantId, clientId, clientSecret');
        }

        this.configCache.set(sessionId, {
            tenantId,
            clientId,
            clientSecret,
            redirectUri: redirectUri || `${process.env.BASE_URL || 'http://localhost:3000'}/auth/callback`,
            createdAt: Date.now(),
            lastAccessed: Date.now()
        });

        return sessionId;
    }

    /**
     * Get user's config by sessionId
     */
    getConfig(sessionId) {
        const config = this.configCache.get(sessionId);
        if (config) {
            // Update last accessed time
            config.lastAccessed = Date.now();
        }
        return config;
    }

    /**
     * Security: Cleanup expired sessions
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [sessionId, config] of this.configCache.entries()) {
            const age = now - (config.lastAccessed || config.createdAt);
            if (age > this.SESSION_TIMEOUT) {
                this.configCache.delete(sessionId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`Security: Cleaned up ${cleaned} expired session(s)`);
        }
    }

    /**
     * Check if user has valid config
     */
    hasConfig(sessionId) {
        return this.configCache.has(sessionId);
    }

    /**
     * Remove config (logout)
     */
    deleteConfig(sessionId) {
        this.configCache.delete(sessionId);
    }

    /**
     * Generate a new session ID
     */
    generateSessionId() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Encrypt sensitive data for client-side storage (optional)
     */
    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    /**
     * Decrypt sensitive data from client-side storage (optional)
     */
    decrypt(text) {
        const parts = text.split(':');
        const iv = Buffer.from(parts.shift(), 'hex');
        const encryptedText = parts.join(':');
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}

module.exports = new ConfigService();
