const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const AuthService = require('../services/authService');
const configService = require('../services/configService');
const logger = require('../services/logger');
const auditLogger = require('../services/auditLogger');

// Store tokens in memory (per session, no persistence)
const tokenCache = new Map();

// Store AuthService instances per session (for dynamic SharePoint token acquisition)
const authServiceCache = new Map();

// Rate limiters for auth endpoints (prevent brute force and DDOS)
const configRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 config attempts per 15 min per IP
    message: { error: 'Too many configuration attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 login attempts per 15 min per IP
    message: { error: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

// POST /api/auth/config - User sets their Azure App Registration credentials
router.post('/config', configRateLimiter, async (req, res) => {
    try {
        const { tenantId, clientId, clientSecret, redirectUri } = req.body;
        
        if (!tenantId || !clientId || !clientSecret) {
            return res.status(400).json({ error: 'Missing required fields: tenantId, clientId, clientSecret' });
        }

        // Security: Validate GUID format for tenantId and clientId (prevent injection)
        const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!guidRegex.test(tenantId)) {
            return res.status(400).json({ error: 'Invalid tenantId format. Must be a valid GUID.' });
        }
        if (!guidRegex.test(clientId)) {
            return res.status(400).json({ error: 'Invalid clientId format. Must be a valid GUID.' });
        }

        // Security: Validate clientSecret length (Azure secrets are typically 40+ chars)
        if (clientSecret.length < 20) {
            return res.status(400).json({ error: 'Invalid clientSecret. Ensure you copied the full secret value.' });
        }

        // Security: Validate redirectUri format if provided
        if (redirectUri) {
            try {
                const url = new URL(redirectUri);
                if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                    return res.status(400).json({ error: 'Invalid redirectUri. Must use http or https.' });
                }
            } catch (e) {
                return res.status(400).json({ error: 'Invalid redirectUri format.' });
            }
        }

        // Validate permissions by attempting to create AuthService and acquire a token
        const testConfig = {
            tenantId,
            clientId,
            clientSecret,
            redirectUri: redirectUri || `${req.protocol}://${req.get('host')}/auth/callback`
        };

        try {
            const authService = new AuthService(testConfig);
            
            // Try to get an app-only token to verify credentials and permissions
            const tokenResponse = await authService.getAppOnlyToken();
            
            if (!tokenResponse || !tokenResponse.accessToken) {
                return res.status(400).json({ 
                    error: 'Failed to authenticate with provided credentials. Please verify your Azure App Registration settings.',
                    hint: 'Ensure Client Secret is valid and not expired.'
                });
            }

            // Verify that the token has the required Graph API permissions
            // We'll make a test call to Graph API to check permissions
            const { Client } = require('@microsoft/microsoft-graph-client');
            const client = Client.init({
                authProvider: (done) => {
                    done(null, tokenResponse.accessToken);
                }
            });

            try {
                // Test API call - try to list sites (requires Sites.Read.All)
                await client.api('/sites?$top=1').get();
            } catch (graphError) {
                console.error('Graph API permission check failed:', graphError);
                
                if (graphError.statusCode === 403 || graphError.statusCode === 401) {
                    return res.status(400).json({ 
                        error: 'Insufficient permissions. Please ensure your Azure App Registration has the required Microsoft Graph API permissions.',
                        requiredPermissions: [
                            'Sites.Read.All (Application)',
                            'Sites.ReadWrite.All (Application)',
                            'Sites.FullControl.All (Application)'
                        ],
                        hint: 'After adding permissions, grant admin consent in Azure Portal.'
                    });
                }
                
                // Other API errors might be transient, allow config to proceed
                console.warn('Graph API test call failed but allowing config:', graphError.message);
            }

        } catch (authError) {
            console.error('Credentials validation failed:', authError);
            return res.status(400).json({ 
                error: 'Invalid credentials. Please check your Tenant ID, Client ID, and Client Secret.',
                details: authError.message
            });
        }

        // Generate session ID for this user's config
        const sessionId = configService.generateSessionId();
        
        // Store config
        configService.setConfig(sessionId, testConfig);

        // Legacy logging
        logger.logTenantConfig('CONFIG_CREATED', sessionId, {
            tenantId,
            clientId: clientId.substring(0, 8) + '...',
            hasRedirectUri: !!redirectUri
        });

        // Privacy-first audit logging
        auditLogger.logAudit('CONFIG_CREATED', sessionId, tenantId, null, {
            hasRedirectUri: !!redirectUri,
            permissionsValidated: true
        });

        console.log(`Config set for session: ${sessionId} (credentials validated)`);

        res.json({ 
            sessionId,
            message: 'Configuration saved and validated. You can now log in.',
            validated: true
        });
    } catch (error) {
        console.error('Error setting config:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/auth/config/status - Check if user has config set
router.get('/config/status', async (req, res) => {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId) {
        return res.json({ hasConfig: false });
    }

    const hasConfig = configService.hasConfig(sessionId);
    res.json({ hasConfig });
});

// User login (delegated permissions)
router.get('/login', async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'];
        
        if (!sessionId || !configService.hasConfig(sessionId)) {
            return res.status(400).json({ 
                error: 'No configuration found. Please set your Azure App Registration credentials first.',
                needsConfig: true
            });
        }

        // Get user's config
        const config = configService.getConfig(sessionId);
        
        // Create AuthService instance with user's config
        const authService = new AuthService(config);
        const authUrl = await authService.getAuthUrl(sessionId); // Pass sessionId as state
        
        res.json({ authUrl });
    } catch (error) {
        console.error('Error getting auth URL:', error);
        res.status(500).json({ error: 'Failed to get authentication URL' });
    }
});

// OAuth callback (delegated permissions)
router.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    
    if (!code) {
        return res.status(400).json({ error: 'Authorization code not provided' });
    }

    // State should contain sessionId
    const sessionId = state;
    
    if (!sessionId || !configService.hasConfig(sessionId)) {
        return res.redirect('/?auth=error&reason=no_config');
    }

    try {
        // Get user's config
        const config = configService.getConfig(sessionId);
        
        // Create AuthService instance with user's config
        const authService = new AuthService(config);
        const tokenResponse = await authService.getTokenByCode(code);
        
        // Store token with the same session ID
        tokenCache.set(sessionId, {
            accessToken: tokenResponse.accessToken,
            account: tokenResponse.account,
            expiresOn: tokenResponse.expiresOn,
            authType: 'user'
        });

        // Store authService instance for later SharePoint token acquisition
        authServiceCache.set(sessionId, authService);

        const expiresIn = Math.round((new Date(tokenResponse.expiresOn) - new Date()) / 1000 / 60);
        
        // Legacy logging
        logger.logAuth('LOGIN_SUCCESS', sessionId, {
            authType: 'user',
            account: tokenResponse.account?.username,
            tenantId: config?.tenantId,
            expiresInMinutes: expiresIn
        });

        // Privacy-first audit logging
        auditLogger.logAudit('LOGIN_SUCCESS', sessionId, config?.tenantId, tokenResponse.account?.username, {
            authType: 'user',
            expiresInMinutes: expiresIn
        });
        
        console.log(`User authenticated for session: ${sessionId} (expires in ${expiresIn} minutes)`);

        // Redirect to UI with session
        res.redirect(`/beta/index.html?session=${sessionId}&auth=success`);
    } catch (error) {
        console.error('Error in auth callback:', error);
        res.redirect('/beta/index.html?auth=error');
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
            const cfg = configService.getConfig(sessionId);
            if (!cfg) {
                throw new Error('No configuration for session');
            }
            const authService = new AuthService(cfg);
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
                refreshed: true,
                authType: tokenData.authType || 'user'
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
        refreshed: false,
        authType: tokenData.authType || 'user'
    });
});

router.post('/logout/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    // Remove token
    const hadToken = tokenCache.has(sessionId);
    tokenCache.delete(sessionId);
    
    // Get tenant info before removing config
    const userConfig = configService.getConfig(sessionId);
    const tenantId = userConfig?.tenantId;
    
    // Remove config
    const hadConfig = configService.hasConfig(sessionId);
    configService.deleteConfig(sessionId);
    
    // Legacy logging
    logger.logAuth('LOGOUT', sessionId, {
        hadToken,
        hadConfig,
        tenantId
    });

    // Privacy-first audit logging
    auditLogger.logAudit('LOGOUT', sessionId, tenantId, null, {
        hadToken,
        hadConfig
    });
    
    console.log(`Session ${sessionId} logged out (token: ${hadToken}, config: ${hadConfig})`);
    
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
            const cfg = configService.getConfig(sessionId);
            if (!cfg) {
                throw new Error('No configuration for session');
            }
            const authService = new AuthService(cfg);
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

// Get AuthService instance for a session
router.getAuthService = (sessionId) => {
    return authServiceCache.get(sessionId);
};

// Get account for a session
router.getAccount = (sessionId) => {
    const tokenData = tokenCache.get(sessionId);
    return tokenData?.account;
};

module.exports = router;