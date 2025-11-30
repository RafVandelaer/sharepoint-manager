const express = require('express');
const router = express.Router();
const SharePointService = require('../services/sharePointService');
const authRoutes = require('./auth');
const logger = require('../services/logger');
const auditLogger = require('../services/auditLogger');
const configService = require('../services/configService');

// Active cleanup tracking per session (multi-user support)
// Map<sessionId, { siteId, isCancelled, startTime }>
const activeCleanups = new Map();

// Helper voor SSE responses
const setupSSEResponse = (res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
};

const sendSSEEvent = (res, eventName, data) => {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
};

// Middleware to check authentication
const requireAuth = async (req, res, next) => {
    try {
        // 1) Prefer Bearer token in Authorization header
        const authHeader = req.headers['authorization'] || '';
        if (authHeader.toLowerCase().startsWith('bearer ')) {
            req.accessToken = authHeader.slice(7).trim();
            if (!req.accessToken) return res.status(401).json({ error: 'Invalid Bearer token' });
            
            // Security: Basic JWT format validation (3 parts separated by dots)
            const tokenParts = req.accessToken.split('.');
            if (tokenParts.length !== 3) {
                return res.status(401).json({ error: 'Malformed Bearer token' });
            }
            
            // Try to get sessionId from X-Session-ID header to add authService/account
            const sessionId = req.headers['x-session-id'];
            if (sessionId) {
                req.authService = authRoutes.getAuthService(sessionId);
                req.account = authRoutes.getAccount(sessionId);
            }
            
            return next();
        }

        // 2) For SSE or limited clients, allow access_token in query string
        if (req.query && req.query.access_token) {
            req.accessToken = req.query.access_token;
            
            // Try to get sessionId from query or header
            const sessionId = req.query.sessionId || req.headers['x-session-id'];
            if (sessionId) {
                req.authService = authRoutes.getAuthService(sessionId);
                req.account = authRoutes.getAccount(sessionId);
            }
            
            return next();
        }

        // 3) Backward-compat: X-Session-ID header or sessionId query param
        const sessionId = req.headers['x-session-id'] || req.query.sessionId;
        if (sessionId) {
            const token = await authRoutes.getToken(sessionId);
            if (token) {
                req.accessToken = token;
                req.authService = authRoutes.getAuthService(sessionId);
                req.account = authRoutes.getAccount(sessionId);
                return next();
            }
        }

        return res.status(401).json({ error: 'Authentication required' });
    } catch (error) {
        console.error('Error in requireAuth middleware:', error);
        return res.status(401).json({ error: 'Authentication failed' });
    }
};

// Test endpoints (moeten bovenaan staan voor ze door parameter routes worden onderschept)
router.get('/sites/test', async (req, res) => {
    console.log('Test sites endpoint called');
    
    const mockSites = [
        {
            id: 'demo-site-1',
            name: 'Demo Team Site',
            displayName: 'Demo Team Site',
            description: 'Een demo SharePoint team site voor testing',
            webUrl: 'https://demo.sharepoint.com/sites/teamsite',
            createdDateTime: '2024-01-15T10:00:00Z'
        },
        {
            id: 'demo-site-2', 
            name: 'Demo Project Hub',
            displayName: 'Demo Project Hub',
            description: 'Demo project hub site met documenten',
            webUrl: 'https://demo.sharepoint.com/sites/projecthub',
            createdDateTime: '2024-02-20T14:30:00Z'
        },
        {
            id: 'demo-site-3',
            name: 'Demo Knowledge Base',
            displayName: 'Demo Knowledge Base',
            description: 'Demo kennisbank voor organisatie informatie',
            webUrl: 'https://demo.sharepoint.com/sites/kb',
            createdDateTime: '2024-03-10T09:15:00Z'
        }
    ];
    
    res.json(mockSites);
});

// Simple test endpoint to check permissions
router.get('/sites/:siteId/test-permissions', requireAuth, async (req, res) => {
    const { siteId } = req.params;
    console.log('Testing permissions for site:', siteId);
    
    const sharePointService = new SharePointService(req.accessToken);
    const results = {};
    
    try {
        // Test 1: Basic site access
        results.siteAccess = await sharePointService.getSiteDetails(siteId);
        results.siteAccess = { success: true, name: results.siteAccess.displayName };
    } catch (e) {
        results.siteAccess = { success: false, error: e.message };
    }
    
    try {
        // Test 2: Document libraries access
        const libraries = await sharePointService.getDocumentLibraries(siteId);
        results.librariesAccess = { success: true, count: libraries.length, libraries: libraries.map(l => l.name) };
    } catch (e) {
        results.librariesAccess = { success: false, error: e.message };
    }
    
    try {
        // Test 3: Try different Graph API calls
        const directSiteCall = await sharePointService.graphClient.api(`/sites/${siteId}`).get();
        results.directSiteCall = { success: true, name: directSiteCall.displayName };
    } catch (e) {
        results.directSiteCall = { success: false, error: e.message };
    }
    
    res.json(results);
});

// Debug endpoint to test basic connectivity
router.get('/sites/:siteId/debug', requireAuth, async (req, res) => {
    try {
        const { siteId } = req.params;
        console.log('Debug endpoint called for site:', siteId);
        
        const sharePointService = new SharePointService(req.accessToken);
        
        // Test 1: Get site details
        const siteDetails = await sharePointService.getSiteDetails(siteId);
        console.log('Site details retrieved:', siteDetails.displayName);
        
        // Test 2: Get libraries
        const libraries = await sharePointService.getDocumentLibraries(siteId);
        console.log('Libraries found:', libraries.length);
        
        // Test 3: Try to get files from first library if available
        let firstLibraryFiles = [];
        if (libraries.length > 0) {
            try {
                const items = await sharePointService.graphClient.api(`/sites/${siteId}/drives/${libraries[0].id}/root/children`).get();
                firstLibraryFiles = items.value || [];
                console.log('Files in first library:', firstLibraryFiles.length);
            } catch (libError) {
                console.log('Error accessing first library:', libError.message);
            }
        }
        
        res.json({
            site: {
                id: siteId,
                name: siteDetails.displayName,
                url: siteDetails.webUrl
            },
            libraries: libraries.map(lib => ({
                id: lib.id,
                name: lib.name,
                driveType: lib.driveType
            })),
            firstLibraryFiles: firstLibraryFiles.length,
            sampleFiles: firstLibraryFiles.slice(0, 3).map(file => ({
                name: file.name,
                type: file.file ? 'file' : 'folder',
                size: file.size
            }))
        });
    } catch (error) {
        console.error('Debug endpoint error:', error);
        res.status(500).json({ 
            error: 'Debug failed', 
            details: error.message,
            code: error.code || 'unknown'
        });
    }
});

// Get root site (tenant info)
router.get('/sites/root', requireAuth, async (req, res) => {
    try {
        const sharePointService = new SharePointService(req.accessToken);
        const rootSite = await sharePointService.graphClient.api('/sites/root').get();
        res.json(rootSite);
    } catch (error) {
        console.error('Error fetching root site:', error);
        res.status(500).json({ 
            error: 'Failed to fetch root site',
            details: error.message 
        });
    }
});

router.get('/sites', requireAuth, async (req, res) => {
    try {
        console.log('Fetching SharePoint sites with token length:', req.accessToken?.length);
        
        // Log first/last chars of token for debugging
        if (req.accessToken) {
            const first = req.accessToken.substring(0, 10);
            const last = req.accessToken.substring(req.accessToken.length - 10);
            console.log(`Token: ${first}...${last}`);
        }
        
        const sharePointService = new SharePointService(req.accessToken);
        
        console.log('Initialized SharePointService, calling getAllSites()');
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout after 20 seconds')), 20000)
        );
        
        const sitesPromise = sharePointService.getAllSites();
        const sites = await Promise.race([sitesPromise, timeoutPromise]);
        
        if (!sites || sites.length === 0) {
            console.log('No sites returned from getAllSites()');
            return res.status(404).json({ 
                error: 'No SharePoint sites found',
                message: 'The API call was successful but returned no sites. This could indicate permission issues or missing admin consent.',
                hint: 'Check if admin consent is granted for Sites.Read.All, Sites.ReadWrite.All, and Sites.Manage.All in Azure Portal'
            });
        }
        
        console.log(`Successfully retrieved ${sites.length} sites`);
        res.json(sites);
    } catch (error) {
        console.error('Error fetching sites:', {
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
            body: error.body,
            requestId: error.requestId
        });
        
        // Detailed error response based on error type
        let statusCode = 500;
        let errorMessage = 'Failed to fetch SharePoint sites';
        let hint = '';
        
        if (error.statusCode === 401 || error.statusCode === 403) {
            statusCode = error.statusCode;
            errorMessage = 'Permission denied';
            hint = 'Ensure admin consent is granted for Sites.Read.All. The user may need to re-login to get a fresh token with the correct scopes.';
        } else if (error.message?.includes('timeout')) {
            statusCode = 504;
            errorMessage = 'Graph API request timed out';
            hint = 'Microsoft Graph API is not responding. Try again in a few moments.';
        }
        
        res.status(statusCode).json({ 
            error: errorMessage,
            details: error.message,
            hint,
            code: error.code,
            statusCode: error.statusCode
        });
    }
});

// Storage analytics endpoint - get storage usage for all sites
router.get('/sites/analytics/storage', requireAuth, async (req, res) => {
    try {
        const sharePointService = new SharePointService(req.accessToken);
        const sites = await sharePointService.getAllSites();
        
        if (!sites || sites.length === 0) {
            return res.json({ sites: [], total: 0 });
        }

        // Fetch storage quota for each site (parallel requests for performance)
        const storagePromises = sites.map(async (site) => {
            try {
                // Get default drive for the site
                const drive = await sharePointService.graphClient
                    .api(`/sites/${site.id}/drive`)
                    .select('id,quota')
                    .get();

                return {
                    id: site.id,
                    name: site.displayName || site.name,
                    webUrl: site.webUrl,
                    createdDateTime: site.createdDateTime,
                    lastModifiedDateTime: site.lastModifiedDateTime,
                    storage: {
                        used: drive.quota?.used || 0,
                        remaining: drive.quota?.remaining || 0,
                        total: drive.quota?.total || 0,
                        usedGB: ((drive.quota?.used || 0) / (1024 * 1024 * 1024)).toFixed(2),
                        usedMB: ((drive.quota?.used || 0) / (1024 * 1024)).toFixed(2),
                        percentage: drive.quota?.total ? 
                            ((drive.quota.used / drive.quota.total) * 100).toFixed(1) : 0
                    }
                };
            } catch (error) {
                // If drive fetch fails, return site with zero storage
                console.error(`Failed to fetch storage for site ${site.id}:`, error.message);
                return {
                    id: site.id,
                    name: site.displayName || site.name,
                    webUrl: site.webUrl,
                    createdDateTime: site.createdDateTime,
                    lastModifiedDateTime: site.lastModifiedDateTime,
                    storage: {
                        used: 0,
                        remaining: 0,
                        total: 0,
                        usedGB: '0.00',
                        usedMB: '0.00',
                        percentage: 0,
                        error: 'Unable to fetch storage data'
                    }
                };
            }
        });

        const sitesWithStorage = await Promise.all(storagePromises);
        
        // Calculate totals from sites
        const totalUsed = sitesWithStorage.reduce((sum, site) => sum + (site.storage.used || 0), 0);
        
        // Try to get tenant storage quota from Admin API
        // Note: This requires SharePoint Admin permissions and will fail for delegated user tokens
        let tenantQuota = null;
        try {
            tenantQuota = await sharePointService.getTenantStorageQuota();
        } catch (error) {
            // Expected to fail for non-admin users - silently continue
        }

        // Build a synthetic upward storage trend for analytics (Graph lacks historical quota per site)
        const buildTrend = (days = 30, baseGb = Math.max(1, parseFloat(((totalUsed / (1024 * 1024 * 1024))).toFixed(2))), dailyGrowthPct = 0.01) => {
            const trend = [];
            let current = baseGb;
            for (let i = days - 1; i >= 0; i--) {
                const noise = (Math.random() - 0.5) * 0.1; // mild noise
                const growth = current * dailyGrowthPct;
                current = Math.max(0, current + growth + noise);
                const date = new Date();
                date.setDate(date.getDate() - i);
                trend.push({ date: date.toISOString().slice(0, 10), gb: parseFloat(current.toFixed(2)) });
            }
            return trend;
        };

        res.json({
            sites: sitesWithStorage,
            total: sitesWithStorage.length,
            aggregate: {
                totalUsed,
                totalUsedGB: (totalUsed / (1024 * 1024 * 1024)).toFixed(2),
                totalQuota: tenantQuota?.StorageQuota || null,
                totalQuotaTB: tenantQuota?.StorageQuota ? (tenantQuota.StorageQuota / (1024 * 1024)).toFixed(2) : null,
                totalQuotaUsed: tenantQuota?.StorageQuotaUsed || null,
                totalQuotaUsedTB: tenantQuota?.StorageQuotaUsed ? (tenantQuota.StorageQuotaUsed / (1024 * 1024)).toFixed(2) : null,
                averageUsed: sitesWithStorage.length > 0 ? totalUsed / sitesWithStorage.length : 0,
                averageUsedGB: sitesWithStorage.length > 0 ? 
                    ((totalUsed / sitesWithStorage.length) / (1024 * 1024 * 1024)).toFixed(2) : '0.00',
                trend: buildTrend(30)
            }
        });
    } catch (error) {
        console.error('Error fetching storage analytics:', error);
        res.status(500).json({ 
            error: 'Failed to fetch storage analytics',
            details: error.message 
        });
    }
});

// Progressive: first page of storage analytics
router.get('/sites/analytics/storage/partial', requireAuth, async (req, res) => {
    try {
        const pageSize = parseInt(req.query.pageSize || '50', 10);
        const sharePointService = new SharePointService(req.accessToken);
        const { sites, nextLink } = await sharePointService.enumerateSitesPaged(pageSize);

        // Fetch storage for first page only
        const storagePromises = sites.map(async (site) => {
            try {
                const drive = await sharePointService.graphClient
                    .api(`/sites/${site.id}/drive`)
                    .select('id,quota')
                    .get();
                return {
                    id: site.id,
                    name: site.displayName || site.name,
                    webUrl: site.webUrl,
                    createdDateTime: site.createdDateTime,
                    lastModifiedDateTime: site.lastModifiedDateTime,
                    storage: {
                        used: drive.quota?.used || 0,
                        remaining: drive.quota?.remaining || 0,
                        total: drive.quota?.total || 0,
                        usedGB: ((drive.quota?.used || 0) / (1024 * 1024 * 1024)).toFixed(2),
                        usedMB: ((drive.quota?.used || 0) / (1024 * 1024)).toFixed(2),
                        percentage: drive.quota?.total ? ((drive.quota.used / drive.quota.total) * 100).toFixed(1) : 0
                    }
                };
            } catch (err) {
                return {
                    id: site.id,
                    name: site.displayName || site.name,
                    webUrl: site.webUrl,
                    createdDateTime: site.createdDateTime,
                    lastModifiedDateTime: site.lastModifiedDateTime,
                    storage: { used:0, remaining:0, total:0, usedGB:'0.00', usedMB:'0.00', percentage:0 }
                };
            }
        });
        const sitesWithStorage = await Promise.all(storagePromises);
        const totalUsed = sitesWithStorage.reduce((sum, s) => sum + (s.storage.used||0), 0);
        const buildTrend = (days = 30, baseGb = Math.max(1, parseFloat(((totalUsed / (1024 * 1024 * 1024))).toFixed(2))), dailyGrowthPct = 0.01) => {
            const trend = [];
            let current = baseGb;
            for (let i = days - 1; i >= 0; i--) {
                const noise = (Math.random() - 0.5) * 0.1;
                const growth = current * dailyGrowthPct;
                current = Math.max(0, current + growth + noise);
                const date = new Date();
                date.setDate(date.getDate() - i);
                trend.push({ date: date.toISOString().slice(0, 10), gb: parseFloat(current.toFixed(2)) });
            }
            return trend;
        };

        res.json({
            sites: sitesWithStorage,
            nextLink,
            aggregate: {
                totalUsed,
                totalUsedGB: (totalUsed / (1024 * 1024 * 1024)).toFixed(2),
                trend: buildTrend(30)
            }
        });
    } catch (error) {
        console.error('Error in partial storage analytics:', error.message);
        res.status(500).json({ error: 'Failed partial storage analytics', details: error.message });
    }
});

// Progressive: subsequent pages
router.get('/sites/analytics/storage/page', requireAuth, async (req, res) => {
    try {
        const next = req.query.next;
        if (!next) return res.status(400).json({ error: 'Missing next parameter' });
        const sharePointService = new SharePointService(req.accessToken);
        const { sites, nextLink } = await sharePointService.getSitesNext(next);
        const storagePromises = sites.map(async (site) => {
            try {
                const drive = await sharePointService.graphClient
                    .api(`/sites/${site.id}/drive`)
                    .select('id,quota')
                    .get();
                return {
                    id: site.id,
                    name: site.displayName || site.name,
                    webUrl: site.webUrl,
                    createdDateTime: site.createdDateTime,
                    lastModifiedDateTime: site.lastModifiedDateTime,
                    storage: {
                        used: drive.quota?.used || 0,
                        remaining: drive.quota?.remaining || 0,
                        total: drive.quota?.total || 0,
                        usedGB: ((drive.quota?.used || 0) / (1024 * 1024 * 1024)).toFixed(2),
                        usedMB: ((drive.quota?.used || 0) / (1024 * 1024)).toFixed(2),
                        percentage: drive.quota?.total ? ((drive.quota.used / drive.quota.total) * 100).toFixed(1) : 0
                    }
                };
            } catch (err) {
                return {
                    id: site.id,
                    name: site.displayName || site.name,
                    webUrl: site.webUrl,
                    createdDateTime: site.createdDateTime,
                    lastModifiedDateTime: site.lastModifiedDateTime,
                    storage: { used:0, remaining:0, total:0, usedGB:'0.00', usedMB:'0.00', percentage:0 }
                };
            }
        });
        const sitesWithStorage = await Promise.all(storagePromises);
        const totalUsed = sitesWithStorage.reduce((sum, s) => sum + (s.storage.used||0), 0);
        const buildTrend = (days = 30, baseGb = Math.max(1, parseFloat(((totalUsed / (1024 * 1024 * 1024))).toFixed(2))), dailyGrowthPct = 0.01) => {
            const trend = [];
            let current = baseGb;
            for (let i = days - 1; i >= 0; i--) {
                const noise = (Math.random() - 0.5) * 0.1;
                const growth = current * dailyGrowthPct;
                current = Math.max(0, current + growth + noise);
                const date = new Date();
                date.setDate(date.getDate() - i);
                trend.push({ date: date.toISOString().slice(0, 10), gb: parseFloat(current.toFixed(2)) });
            }
            return trend;
        };

        res.json({
            sites: sitesWithStorage,
            nextLink,
            aggregate: {
                totalUsed,
                totalUsedGB: (totalUsed / (1024 * 1024 * 1024)).toFixed(2),
                trend: buildTrend(30)
            }
        });
    } catch (error) {
        console.error('Error in page storage analytics:', error.message);
        res.status(500).json({ error: 'Failed page storage analytics', details: error.message });
    }
});

// Raw debug endpoint to inspect Graph enumeration failures
router.get('/sites-debug/raw', requireAuth, async (req, res) => {
    const sharePointService = new SharePointService(req.accessToken);
    const results = { tokenPresent: !!req.accessToken, attempts: [] };
    try {
        try {
            const searchResp = await sharePointService.graphClient
                .api('/sites?search=*')
                .select('id,name,displayName,webUrl')
                .top(5)
                .timeout(10000)
                .get();
            results.attempts.push({ endpoint: '/sites?search=*', success: true, count: searchResp.value?.length || 0, rawKeys: Object.keys(searchResp) });
        } catch (err) {
            results.attempts.push({ endpoint: '/sites?search=*', success: false, message: err.message, code: err.code, statusCode: err.statusCode, body: err.body?.error || err.body });
        }
        try {
            const rootSite = await sharePointService.graphClient
                .api('/sites/root')
                .timeout(10000)
                .get();
            results.attempts.push({ endpoint: '/sites/root', success: true, id: rootSite.id, webUrl: rootSite.webUrl });
        } catch (err) {
            results.attempts.push({ endpoint: '/sites/root', success: false, message: err.message, code: err.code, statusCode: err.statusCode, body: err.body?.error || err.body });
        }
        try {
            const followed = await sharePointService.graphClient
                .api('/me/followedSites')
                .timeout(10000)
                .get();
            results.attempts.push({ endpoint: '/me/followedSites', success: true, count: followed.value?.length || 0 });
        } catch (err) {
            results.attempts.push({ endpoint: '/me/followedSites', success: false, message: err.message, code: err.code, statusCode: err.statusCode, body: err.body?.error || err.body });
        }
        res.json(results);
    } catch (outer) {
        res.status(500).json({ error: 'raw debug failed', message: outer.message });
    }
});
router.get('/sites/:siteId', requireAuth, async (req, res) => {
    try {
        const { siteId } = req.params;
        const sharePointService = new SharePointService(req.accessToken);
        const site = await sharePointService.getSiteDetails(siteId);
        res.json(site);
    } catch (error) {
        console.error('Error fetching site details:', error);
        res.status(500).json({ error: 'Failed to fetch site details' });
    }
});

router.get('/sites/:siteId/libraries', requireAuth, async (req, res) => {
    try {
        const { siteId } = req.params;
        const spRestToken = req.headers['x-sharepoint-token'] || null;
        if (spRestToken) {
            console.log('Received dedicated SharePoint REST token (length):', spRestToken.length);
        }
        const sharePointService = new SharePointService(req.accessToken, spRestToken);
        const libraries = await sharePointService.getDocumentLibraries(siteId);
        
        // Transform nested versioning object to flat structure for frontend compatibility
        const transformedLibraries = libraries.map(lib => ({
            id: lib.id,
            name: lib.name,
            versioningEnabled: lib.versioning?.enabled ?? false,
            majorVersionLimit: lib.versioning?.majorLimit ?? 500,
            enableMinorVersions: lib.versioning?.minorEnabled ?? false,
            majorWithMinorVersionsLimit: lib.versioning?.minorLimit ?? 0,
            forceCheckout: lib.versioning?.forceCheckout ?? false,
            automatic: lib.versioning?.automatic ?? false,
            source: lib.versioning?.source || 'default',
            isDefault: lib.versioning?.isDefault ?? true,
            listId: lib.listId,
            driveId: lib.id,
            webUrl: lib.webUrl
        }));
        
        res.json(transformedLibraries);
    } catch (error) {
        console.error('Error fetching libraries:', error);
        res.status(500).json({ error: 'Failed to fetch document libraries' });
    }
});

// Update versioning settings for a specific library (drive)
router.patch('/sites/:siteId/libraries/:driveId/versioning', requireAuth, async (req, res) => {
    try {
        const { siteId, driveId } = req.params;
        const spRestToken = req.headers['x-sharepoint-token'] || null;
        const { enabled, minorEnabled, majorLimit, minorLimit, forceCheckout, automatic } = req.body || {};
        console.log('Versioning update request:', { siteId, driveId, enabled, minorEnabled, majorLimit, minorLimit, forceCheckout, automatic });

        // Fetch libraries to resolve listId and siteUrl
        const service = new SharePointService(req.accessToken, spRestToken);
        const libraries = await service.getDocumentLibraries(siteId);
        const target = libraries.find(l => l.id === driveId);
        if (!target) {
            return res.status(404).json({ error: 'Library not found' });
        }
        if (!target.listId) {
            return res.status(400).json({ error: 'List GUID could not be resolved for this library' });
        }
        // Basic validation ranges
        const toNumberOrUndefined = (v) => (v === undefined || v === null || v === '') ? undefined : Number(v);
        const major = toNumberOrUndefined(majorLimit);
        const minor = toNumberOrUndefined(minorLimit);
        // Skip validation if automatic mode is enabled
        if (automatic !== true) {
            if (major !== undefined && (major < 100 || major > 50000)) {
                return res.status(400).json({ error: 'majorLimit out of allowed range (100-50000, or use automatic mode)' });
            }
        }
        if (minor !== undefined && (minor < 10 || minor > 511)) {
            return res.status(400).json({ error: 'minorLimit out of allowed range (10-511)' });
        }
        const updated = await service.updateLibraryVersioningSettings(target.webUrl, target.listId, {
            enabled,
            minorEnabled,
            majorLimit: major,
            minorLimit: minor,
            forceCheckout,
            automatic
        });
        
        // Log versioning update
        const sessionId = req.headers['x-session-id'] || 'unknown';
        const userConfig = configService.getConfig(sessionId);
        
        logger.logVersioning('VERSIONING_UPDATED', sessionId, {
            siteId,
            driveId,
            libraryName: target.name,
            tenantId: userConfig?.tenantId,
            settings: {
                enabled,
                minorEnabled,
                majorLimit: major,
                minorLimit: minor,
                forceCheckout,
                automatic
            }
        });
        
        res.json({ success: true, driveId, listId: target.listId, versioning: updated });
    } catch (error) {
        console.error('Error updating versioning settings:', error.message);
        res.status(500).json({ error: 'Failed to update versioning settings', details: error.message });
    }
});

router.get('/sites/:siteId/files', requireAuth, async (req, res) => {
    try {
        const { siteId } = req.params;
        console.log(`Fetching files for site: ${siteId}`);
        
        // Test of siteId geldig is - bij demo sites gewoon fallback
        if (siteId.startsWith('demo-') || siteId.startsWith('site')) {
            console.log('Demo site detected, redirecting to test endpoint');
            return res.redirect(`/api/sharepoint/sites/${siteId}/files/test`);
        }
        
        const sharePointService = new SharePointService(req.accessToken);
        
        // Voor SSE (Server-Sent Events) - blijvende verbinding voor progress updates
        if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
            // SSE setup
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
            
            let isCancelled = false;
            let heartbeat;
            
            // Controleer of de client de verbinding verbreekt
            req.on('close', () => {
                isCancelled = true;
                if (heartbeat) clearInterval(heartbeat);
                console.log('Client closed connection for file scanning');
            });
            
            // Progress callback functies
            const progressCallback = {
                onFolderProcessing: (folderPath) => {
                    if (!isCancelled) {
                        res.write(`data: ${JSON.stringify({
                            type: 'progress', 
                            folderPath,
                            progress: Math.floor(Math.random() * 100) // Placeholder voor werkelijke progress
                        })}\n\n`);
                    }
                },
                isCancelled: () => isCancelled
            };

            // Heartbeat om de SSE-verbinding open te houden bij lange scans
            heartbeat = setInterval(() => {
                if (!isCancelled) {
                    res.write(`: heartbeat\n\n`);
                }
            }, 10000); // Elke 10 seconden een heartbeat
            
            try {
                // Eerst proberen we echte site details op te halen om te controleren of de site bestaat en toegankelijk is
                const siteDetails = await sharePointService.getSiteDetails(siteId);
                console.log('Site details retrieved:', siteDetails.displayName);
                
                // Dan proberen we de bestanden op te halen met progress updates
                const files = await sharePointService.getSiteFiles(siteId, progressCallback);
                
                if (isCancelled) {
                    console.log('File scanning was cancelled');
                    return;
                }
                
                // Stuur het eindresultaat
                res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    result: { files, totalFiles: files.length }
                })}\n\n`);
                
                // Sluit de verbinding
                clearInterval(heartbeat);
                res.end();
            } catch (error) {
                if (!isCancelled) {
                    // Stuur foutmelding
                    res.write(`data: ${JSON.stringify({
                        type: 'error',
                        message: error.message
                    })}\n\n`);
                    clearInterval(heartbeat);
                    res.end();
                }
            }
        } else {
            // Normale API call zonder realtime updates
            try {
                const siteDetails = await sharePointService.getSiteDetails(siteId);
                console.log('Site details retrieved:', siteDetails.displayName);
                
                // Dan proberen we de bestanden op te halen
                const files = await sharePointService.getSiteFiles(siteId);
                console.log('Files retrieved:', files.length);
                
                res.json(files);
            } catch (error) {
                console.error('Error fetching site files:', error);
                res.status(500).json({ error: 'Failed to fetch site files' });
            }
        }
    } catch (error) {
        console.error('Error in files endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/sites/:siteId/drives/:driveId/items/:itemId/versions', requireAuth, async (req, res) => {
    try {
        const { siteId, driveId, itemId } = req.params;
        const sharePointService = new SharePointService(req.accessToken);
        const versions = await sharePointService.getFileVersions(driveId, itemId);
        res.json(versions);
    } catch (error) {
        console.error('Error fetching file versions:', error);
        res.status(500).json({ error: 'Failed to fetch file versions' });
    }
});

// Get versions for a file by its SharePoint path within a library: path=Library/Folder/File.ext
router.get('/sites/:siteId/versions-by-path', requireAuth, async (req, res) => {
    try {
        const { siteId } = req.params;
        const { path } = req.query;
        if (!path || typeof path !== 'string') {
            return res.status(400).json({ error: 'Missing required query parameter: path' });
        }
        const sharePointService = new SharePointService(req.accessToken);
        const result = await sharePointService.getVersionsByPath(siteId, path);
        res.json(result);
    } catch (error) {
        console.error('Error fetching versions by path:', error);
        res.status(500).json({ error: 'Failed to fetch versions for the specified path', details: error.message });
    }
});

// Test endpoint voor debugging - mock data zonder authenticatie
router.get('/sites/:siteId/files/test', async (req, res) => {
    console.log('Test endpoint called for siteId:', req.params.siteId);
    
    // Mock data voor testing - meer bestanden met meer versies
    const mockFiles = [
        {
            id: 'file1',
            name: 'Jaarverslag 2024.docx',
            size: '2.4 MB',
            modified: new Date().toISOString(),
            library: 'Documents',
            path: 'Documents/Jaarverslag 2024.docx',
            driveId: 'drive1',
            versions: Array.from({ length: 15 }, (_, i) => ({
                id: `v${i+1}`,
                label: i === 0 ? 'Huidige versie' : `Versie ${15-i}`,
                date: new Date(Date.now() - i*24*60*60*1000).toLocaleString('nl-NL'),
                author: i % 2 === 0 ? 'Jan Janssen' : 'Mieke Willems',
                size: `${(2.4 - i*0.1).toFixed(1)} MB`
            }))
        },
        {
            id: 'file2',
            name: 'Presentatie Kwartaal 3.pptx',
            size: '5.7 MB',
            modified: new Date(Date.now() - 5*24*60*60*1000).toISOString(),
            library: 'Documents',
            path: 'Documents/Presentatie Kwartaal 3.pptx',
            driveId: 'drive1',
            versions: Array.from({ length: 24 }, (_, i) => ({
                id: `v${i+1}`,
                label: i === 0 ? 'Huidige versie' : `Versie ${24-i}`,
                date: new Date(Date.now() - i*12*60*60*1000).toLocaleString('nl-NL'),
                author: i % 3 === 0 ? 'Piet Pietersen' : i % 3 === 1 ? 'Sara Smits' : 'Lisa de Vries',
                size: `${(5.7 - i*0.05).toFixed(1)} MB`
            }))
        },
        {
            id: 'file3',
            name: 'Budget 2025.xlsx',
            size: '1.8 MB',
            modified: new Date(Date.now() - 2*24*60*60*1000).toISOString(),
            library: 'Financial',
            path: 'Financial/Budget 2025.xlsx',
            driveId: 'drive2',
            versions: Array.from({ length: 31 }, (_, i) => ({
                id: `v${i+1}`,
                label: i === 0 ? 'Huidige versie' : `Versie ${31-i}`,
                date: new Date(Date.now() - i*8*60*60*1000).toLocaleString('nl-NL'),
                author: i % 2 === 0 ? 'Hans Hanssen' : 'Kim Willems',
                size: `${(1.8 - i*0.02).toFixed(1)} MB`
            }))
        },
        {
            id: 'file4',
            name: 'Project Planning.xlsx',
            size: '3.2 MB',
            modified: new Date(Date.now() - 7*24*60*60*1000).toISOString(),
            library: 'Projects',
            path: 'Projects/Project Planning.xlsx',
            driveId: 'drive3',
            versions: Array.from({ length: 18 }, (_, i) => ({
                id: `v${i+1}`,
                label: i === 0 ? 'Huidige versie' : `Versie ${18-i}`,
                date: new Date(Date.now() - i*16*60*60*1000).toLocaleString('nl-NL'),
                author: i % 2 === 0 ? 'Tom van Berg' : 'Emma de Wit',
                size: `${(3.2 - i*0.08).toFixed(1)} MB`
            }))
        }
    ];
    
    res.json(mockFiles);
});

// Cancel active cleanup for current session
router.post('/cleanup/cancel', requireAuth, async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'] || 'unknown';
        
        // Security: Only allow user to cancel their own cleanup
        if (!activeCleanups.has(sessionId)) {
            return res.status(404).json({ error: 'No active cleanup found for your session' });
        }
        
        const cleanup = activeCleanups.get(sessionId);
        cleanup.isCancelled = true;
        
        console.log(`[CANCEL] Cleanup cancellation requested for session ${sessionId} (site: ${cleanup.siteName})`);
        console.log('[CANCEL] Active requests will complete, but no new libraries/files will be processed');
        
        logger.logCleanup('CLEANUP_CANCELLED', sessionId, {
            siteId: cleanup.siteId,
            siteName: cleanup.siteName,
            duration: (new Date() - new Date(cleanup.startTime)) / 1000
        });
        
        res.json({ 
            success: true, 
            message: 'Cleanup cancellation requested. Active requests will finish gracefully.',
            siteId: cleanup.siteId,
            siteName: cleanup.siteName
        });
    } catch (error) {
        console.error('Error cancelling cleanup:', error);
        res.status(500).json({ error: 'Failed to cancel cleanup' });
    }
});

router.post('/sites/:siteId/cleanup', requireAuth, async (req, res) => {
    const startTime = Date.now();
    try {
        const { siteId } = req.params;
        const { versionsToKeep = 10 } = req.body;
        const dryRun = req.query.dryRun === 'true';
        const sessionId = req.headers['x-session-id'] || 'unknown';
        const sharePointService = new SharePointService(req.accessToken);
        
        // Security: Check if user already has active cleanup (prevent multiple concurrent cleanups per session)
        if (activeCleanups.has(sessionId)) {
            const existing = activeCleanups.get(sessionId);
            return res.status(429).json({ 
                error: 'Another cleanup is already running for your session', 
                activeSiteId: existing.siteId,
                startedAt: existing.startTime 
            });
        }
        
        // Get tenant and site info for logging
        const userConfig = configService.getConfig(sessionId);
        const tenantId = userConfig?.tenantId;
        let siteName = siteId;
        
        // Try to get site display name
        try {
            const siteDetails = await sharePointService.getSiteDetails(siteId);
            siteName = siteDetails.displayName || siteDetails.name || siteId;
        } catch (e) {
            // Fallback to siteId if we can't get site details
        }
        
        // Register active cleanup for this session
        activeCleanups.set(sessionId, {
            siteId,
            siteName,
            isCancelled: false,
            startTime: new Date().toISOString()
        });
        
        // Log cleanup start with context
        logger.logCleanup(dryRun ? 'DRY_RUN_STARTED' : 'CLEANUP_STARTED', sessionId, {
            siteId,
            siteName,
            tenantId,
            versionsToKeep,
            mode: dryRun ? 'dry-run' : 'real'
        });

        // Privacy-first audit logging
        auditLogger.logAudit(
            dryRun ? 'DRY_RUN_STARTED' : 'CLEANUP_STARTED',
            sessionId,
            tenantId,
            req.account?.username,
            {
                siteId,
                siteName,
                versionsToKeep,
                mode: dryRun ? 'dry-run' : 'real'
            }
        );
        
        // Voor SSE (Server-Sent Events) - blijvende verbinding voor progress updates
        if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
            // SSE setup
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
            
            // Heartbeat om de SSE-verbinding open te houden bij lange operaties
            const heartbeat = setInterval(() => {
                const cleanup = activeCleanups.get(sessionId);
                if (cleanup && !cleanup.isCancelled) {
                    res.write(`: heartbeat\n\n`);
                }
            }, 10000); // Elke 10 seconden een heartbeat

            // Controleer of de client de verbinding verbreekt
            req.on('close', () => {
                const cleanup = activeCleanups.get(sessionId);
                if (cleanup) cleanup.isCancelled = true;
                clearInterval(heartbeat);
                console.log(`Client closed connection for session ${sessionId}`);
            });
            
            // Progress callback functies
            const progressCallback = {
                onFolderProcessing: (folderPath, stats) => {
                    const cleanup = activeCleanups.get(sessionId);
                    if (cleanup?.isCancelled) return; // Don't send progress if cancelled
                    
                    const progressData = {
                        type: 'progress', 
                        folderPath
                    };
                    
                    // Add counters if provided
                    if (stats) {
                        if (stats.filesProcessed !== undefined) progressData.filesProcessed = stats.filesProcessed;
                        if (stats.versionsToRemove !== undefined) progressData.versionsToRemove = stats.versionsToRemove;
                    }
                    
                    res.write(`data: ${JSON.stringify(progressData)}\n\n`);
                },
                isCancelled: () => {
                    const cleanup = activeCleanups.get(sessionId);
                    return cleanup ? cleanup.isCancelled : false;
                }
            };
            
            try {
                // Start de cleanup met progress updates
                const result = await sharePointService.bulkCleanupSite(siteId, versionsToKeep, dryRun, progressCallback);
                
                // Check if cancelled
                const cleanup = activeCleanups.get(sessionId);
                if (cleanup?.isCancelled) {
                    console.log(`[CLEANUP] Cleanup was cancelled for session ${sessionId}`);
                    
                    // Send cancelled event
                    res.write(`data: ${JSON.stringify({
                        type: 'cancelled',
                        message: 'Cleanup was cancelled by user',
                        partialResult: result
                    })}\n\n`);
                    
                    // Clean up session tracking
                    activeCleanups.delete(sessionId);
                    clearInterval(heartbeat);
                    res.end();
                    return;
                }
                
                // Log result
                logger.logCleanupResult(sessionId, siteId, {
                    success: true,
                    siteName,
                    tenantId,
                    filesProcessed: result.totalFilesWithVersions || 0,
                    versionsRemoved: result.totalVersionsToRemove || 0,
                    duration: Date.now() - startTime
                }, dryRun);

                // Privacy-first audit logging
                auditLogger.logAudit(
                    dryRun ? 'DRY_RUN_COMPLETED' : 'CLEANUP_COMPLETED',
                    sessionId,
                    tenantId,
                    req.account?.username,
                    {
                        siteId,
                        siteName,
                        filesProcessed: result.totalFilesWithVersions || 0,
                        versionsRemoved: result.totalVersionsToRemove || 0,
                        durationMs: Date.now() - startTime,
                        success: true
                    }
                );
                
                // Stuur het eindresultaat
                res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    result
                })}\n\n`);
                
                // Clean up session tracking
                activeCleanups.delete(sessionId);
                
                // Sluit de verbinding
                clearInterval(heartbeat);
                res.end();
            } catch (error) {
                // Log error
                logger.logError('CLEANUP', dryRun ? 'DRY_RUN_FAILED' : 'CLEANUP_FAILED', error, sessionId, {
                    siteId,
                    duration: Date.now() - startTime
                });
                
                // Stuur foutmelding
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    message: error.message
                })}\n\n`);
                
                // Clean up session tracking
                activeCleanups.delete(sessionId);
                
                clearInterval(heartbeat);
                res.end();
            }
        } else {
            // Normale API call zonder realtime updates
            const progressCallback = {
                isCancelled: () => {
                    const cleanup = activeCleanups.get(sessionId);
                    return cleanup ? cleanup.isCancelled : false;
                }
            };
            
            const result = await sharePointService.bulkCleanupSite(siteId, versionsToKeep, dryRun, progressCallback);
            
            // Log result
            logger.logCleanupResult(sessionId, siteId, {
                success: true,
                siteName,
                tenantId,
                filesProcessed: result.totalFilesWithVersions || 0,
                versionsRemoved: result.totalVersionsToRemove || 0,
                duration: Date.now() - startTime
            }, dryRun);
            
            // Clean up session tracking
            activeCleanups.delete(sessionId);
            
            res.json(result);
        }
    } catch (error) {
        const sessionId = req.headers['x-session-id'] || 'unknown';
        
        // Clean up session tracking on error
        activeCleanups.delete(sessionId);
        
        logger.logError('CLEANUP', 'CLEANUP_ERROR', error, sessionId, {
            siteId: req.params.siteId,
            duration: Date.now() - startTime
        });
        
        console.error('Error cleaning up site:', error);
        
        // Provide more specific error messages
        let statusCode = 500;
        let errorMessage = 'Failed to cleanup site versions';
        
        if (error.message && error.message.includes('404')) {
            statusCode = 404;
            errorMessage = 'Site not found or access denied';
        } else if (error.message && error.message.includes('401')) {
            statusCode = 401;
            errorMessage = 'Unauthorized - token may have expired';
        } else if (error.message && error.message.includes('429')) {
            statusCode = 429;
            errorMessage = 'Too many requests - please retry later';
        }
        
        res.status(statusCode).json({ error: errorMessage, details: error.message });
    }
});

// GET SSE endpoint for cleanup to support EventSource
router.get('/sites/:siteId/cleanup', requireAuth, async (req, res) => {
    try {
        const { siteId } = req.params;
        const versionsToKeep = parseInt(req.query.versionsToKeep || '10', 10);
        const dryRun = req.query.dryRun === 'true';
        const sharePointService = new SharePointService(req.accessToken);

        // Only SSE for this GET route
        if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            let isCancelled = false;

            const heartbeat = setInterval(() => {
                if (!isCancelled) res.write(`: heartbeat\n\n`);
            }, 10000); // Elke 10 seconden een heartbeat

            req.on('close', () => {
                isCancelled = true;
                clearInterval(heartbeat);
                console.log('Client closed cleanup SSE connection');
            });

            const progressCallback = {
                onFolderProcessing: (folderPath, data = {}) => {
                    sendSSEEvent(res, 'folder', { 
                        folderName: folderPath, 
                        folderPath,
                        filesProcessed: data.filesProcessed,
                        versionsToRemove: data.versionsToRemove
                    });
                },
                onProgress: (data) => {
                    sendSSEEvent(res, 'progress', data);
                },
                onBatchComplete: (files) => {
                    sendSSEEvent(res, 'batch', { files });
                },
                isCancelled: () => isCancelled
            };

            try {
                const result = await sharePointService.bulkCleanupSite(siteId, versionsToKeep, dryRun, progressCallback);
                sendSSEEvent(res, 'complete', result);
                clearInterval(heartbeat);
                res.end();
            } catch (error) {
                sendSSEEvent(res, 'error', { message: error.message });
                clearInterval(heartbeat);
                res.end();
            }
        } else {
            // Non-SSE GET not supported for cleanup - guide client to POST JSON API
            res.status(400).json({ error: 'Use POST for non-SSE cleanup or GET with Accept: text/event-stream for SSE' });
        }
    } catch (error) {
        console.error('Cleanup GET SSE error:', error);
        res.status(500).json({ error: 'Failed to start cleanup SSE' });
    }
});

router.post('/sites/:siteId/lists/:listId/items/:itemId/cleanup', requireAuth, async (req, res) => {
    try {
        const { siteId, listId, itemId } = req.params;
        const { versionsToKeep = 10 } = req.body;
        const sharePointService = new SharePointService(req.accessToken);
        
        const result = await sharePointService.cleanupVersions(siteId, listId, itemId, versionsToKeep);
        res.json(result);
    } catch (error) {
        console.error('Error cleaning up item versions:', error);
        res.status(500).json({ error: 'Failed to cleanup item versions' });
    }
});

// Get cleanup history
router.get('/sites/:siteId/cleanup-history', requireAuth, async (req, res) => {
    try {
        const { siteId } = req.params;
        const sharePointService = new SharePointService(req.accessToken);
        const history = sharePointService.getCleanupHistory(siteId);
        res.json(history);
    } catch (error) {
        console.error('Error fetching cleanup history:', error);
        res.status(500).json({ error: 'Failed to fetch cleanup history' });
    }
});

// Get all cleanup history
router.get('/cleanup-history', requireAuth, async (req, res) => {
    try {
        const sharePointService = new SharePointService(req.accessToken);
        const history = sharePointService.getAllCleanupHistory();
        res.json(history);
    } catch (error) {
        console.error('Error fetching all cleanup history:', error);
        res.status(500).json({ error: 'Failed to fetch cleanup history' });
    }
});

// Get storage usage report (Microsoft Reports API)
router.get('/reports/storage', requireAuth, async (req, res) => {
    try {
        const period = req.query.period || 'D7'; // Default to 7 days
        const sharePointService = new SharePointService(req.accessToken);
        const report = await sharePointService.getStorageReport(period);
        res.json(report);
    } catch (error) {
        console.error('Error fetching storage report:', error);
        res.status(500).json({ error: 'Failed to fetch storage report' });
    }
});

// Get libraries for a site
router.get('/sites/:siteId/libraries', requireAuth, async (req, res) => {
    try {
        const { siteId } = req.params;
        const sharePointService = new SharePointService(req.accessToken);
        const libraries = await sharePointService.getLibraries(siteId);
        res.json(libraries);
    } catch (error) {
        console.error('Error fetching libraries:', error);
        res.status(500).json({ error: 'Failed to fetch libraries' });
    }
});

// Update versioning settings for libraries
router.post('/sites/:siteId/versioning', requireAuth, async (req, res) => {
    try {
        const { siteId } = req.params;
        const { libraries } = req.body;
        
        if (!libraries || !Array.isArray(libraries)) {
            return res.status(400).json({ error: 'Invalid request body. Expected { libraries: [...] }' });
        }
        
        // Get SharePoint REST token from header if available
        const spRestToken = req.headers['x-sharepoint-token'] || null;
        
        // Pass authService and account to enable dynamic SharePoint token acquisition
        const sharePointService = new SharePointService(
            req.accessToken, 
            req.authService,  // AuthService instance from middleware
            req.account,      // User account from middleware
            spRestToken
        );
        
        const results = await sharePointService.updateVersioningSettings(siteId, libraries);
        
        logger.logVersioning(siteId, 'bulk_update', {
            librariesUpdated: libraries.length,
            results
        });
        
        res.json({ success: true, results });
    } catch (error) {
        console.error('Error updating versioning settings:', error);
        logger.logError('versioning_update', error.message, { siteId: req.params.siteId });
        res.status(500).json({ error: 'Failed to update versioning settings' });
    }
});

module.exports = router;