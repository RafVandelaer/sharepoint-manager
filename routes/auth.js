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

        const expiresIn = Math.round((new Date(tokenResponse.expiresOn) - new Date()) / 1000 / 60);
        console.log(`✅ New session created: ${sessionId} (expires in ${expiresIn} minutes)`);

        // Redirect to main app with session
        res.redirect(`/?session=${sessionId}&auth=success`);
    } catch (error) {
        console.error('Error in auth callback:', error);
        res.redirect('/?auth=error');
    }
});

router.get('/token/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const tokenData = tokenCache.get(sessionId);
    
    if (!tokenData) {
        return res.status(401).json({ error: 'Session not found or expired' });
    }
    
    // Check if token is expired or will expire soon
    const expiresOn = new Date(tokenData.expiresOn);
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    if (expiresOn < now) {
        tokenCache.delete(sessionId);
        return res.status(401).json({ error: 'Token expired' });
    }
    
    // Auto-refresh if expiring soon
    if (expiresOn < fiveMinutesFromNow) {
        console.log('Token expiring soon, refreshing...');
        try {
            const newTokenResponse = await authService.getTokenSilent(tokenData.account);
            
            tokenCache.set(sessionId, {
                accessToken: newTokenResponse.accessToken,
                account: newTokenResponse.account,
                expiresOn: newTokenResponse.expiresOn
            });
            
            console.log('Token refreshed successfully via /token endpoint');
            return res.json({ 
                hasValidToken: true,
                expiresOn: newTokenResponse.expiresOn,
                refreshed: true
            });
        } catch (error) {
            console.error('Failed to refresh token:', error.message);
            tokenCache.delete(sessionId);
            return res.status(401).json({ error: 'Token refresh failed' });
        }
    }
    
    res.json({ 
        hasValidToken: true,
        expiresOn: tokenData.expiresOn,
        refreshed: false
    });
});

router.post('/logout/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    tokenCache.delete(sessionId);
    res.json({ success: true });
});

// Middleware to get token for API routes
router.getToken = async (sessionId) => {
    const tokenData = tokenCache.get(sessionId);
    if (!tokenData) return null;
    
    // Check if token will expire in the next 5 minutes
    const expiresOn = new Date(tokenData.expiresOn);
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    
    if (expiresOn < fiveMinutesFromNow) {
        console.log('Token expiring soon, attempting silent refresh...');
        try {
            const newTokenResponse = await authService.getTokenSilent(tokenData.account);
            
            // Update token in cache
            tokenCache.set(sessionId, {
                accessToken: newTokenResponse.accessToken,
                account: newTokenResponse.account,
                expiresOn: newTokenResponse.expiresOn
            });
            
            console.log('Token refreshed successfully');
            return newTokenResponse.accessToken;
        } catch (error) {
            console.error('Failed to refresh token silently:', error.message);
            // Token refresh failed, remove from cache
            tokenCache.delete(sessionId);
            return null;
        }
    }
    
    return tokenData.accessToken;
};

module.exports = router;