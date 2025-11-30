// Ephemeral admin token service (in-memory only)
// Keeps a transient admin token set via runtime endpoint; expires automatically.
// Does NOT remove legacy ADMIN_API_KEY usage; middleware will accept either.

const crypto = require('crypto');

class AdminTokenService {
    constructor() {
        this.currentToken = null; // raw token value
        this.expiresAt = null; // Date
        this.ttlMs = 8 * 60 * 60 * 1000; // 8h default TTL
        this.rotationHistory = []; // { tokenHash, rotatedAt }
    }

    generateToken() {
        return crypto.randomBytes(32).toString('hex'); // 64 char hex
    }

    setToken(token, ttlMs) {
        this.currentToken = token;
        this.ttlMs = ttlMs && ttlMs > 5 * 60 * 1000 ? ttlMs : this.ttlMs; // min 5min
        this.expiresAt = new Date(Date.now() + this.ttlMs);
        this.rotationHistory.push({ tokenHash: this._hash(token), rotatedAt: new Date().toISOString() });
    }

    autoRotate(ttlMs) {
        const token = this.generateToken();
        this.setToken(token, ttlMs);
        return token;
    }

    _hash(value) {
        return crypto.createHash('sha256').update(value).digest('hex');
    }

    validate(token) {
        if (!token) return false;
        if (!this.currentToken) return false;
        if (this.expiresAt && Date.now() > this.expiresAt.getTime()) {
            // Expired -> clear
            this.currentToken = null;
            return false;
        }
        // Constant time compare
        try {
            return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(this.currentToken));
        } catch { return false; }
    }

    status() {
        return {
            hasToken: !!this.currentToken,
            expiresAt: this.expiresAt ? this.expiresAt.toISOString() : null,
            ttlMs: this.ttlMs,
            rotations: this.rotationHistory.slice(-5)
        };
    }
}

module.exports = new AdminTokenService();
