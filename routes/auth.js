const express = require('express');
const router = express.Router();
const AuthService = require('../services/authService');

const authService = new AuthService();

// Store tokens in memory (in production, use proper session management)
const tokenCache = new Map();

router.get('/login', async (req, res) => {
    try {
        const authUrl = await authService.getAuthUrl();
        res.json({ authUrl });
    } catch (error) {
        console.error('Error getting auth URL:', error);
        res.status(500).json({ error: 'Failed to get authentication URL' });
    }
});

router.get('/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.status(400).json({ error: 'Authorization code not provided' });
    }

    try {
        const tokenResponse = await authService.getTokenByCode(code);
        
        // Store token with a simple session ID (in production, use proper session management)
        const sessionId = Math.random().toString(36).substring(7);
        tokenCache.set(sessionId, {
            accessToken: tokenResponse.accessToken,
            account: tokenResponse.account,
            expiresOn: tokenResponse.expiresOn
        });

        // Redirect to main app with session
        res.redirect(`/?session=${sessionId}&auth=success`);
    } catch (error) {
        console.error('Error in auth callback:', error);
        res.redirect('/?auth=error');
    }
});

router.get('/token/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const tokenData = tokenCache.get(sessionId);
    
    if (!tokenData) {
        return res.status(401).json({ error: 'Session not found or expired' });
    }
    
    // Check if token is expired
    if (new Date() > new Date(tokenData.expiresOn)) {
        tokenCache.delete(sessionId);
        return res.status(401).json({ error: 'Token expired' });
    }
    
    res.json({ 
        hasValidToken: true,
        expiresOn: tokenData.expiresOn 
    });
});

router.post('/logout/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    tokenCache.delete(sessionId);
    res.json({ success: true });
});

// Middleware to get token for API routes
router.getToken = (sessionId) => {
    const tokenData = tokenCache.get(sessionId);
    return tokenData ? tokenData.accessToken : null;
};

module.exports = router;