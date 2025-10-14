const express = require('express');
const router = express.Router();
const SharePointService = require('../services/sharePointService');
const authRoutes = require('./auth');

// Helper voor SSE responses
const setupSSEResponse = (res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
};

const sendSSEEvent = (res, eventName, data) => {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    res.flush();
};

// Middleware to check authentication
const requireAuth = (req, res, next) => {
    // Prefer header, but fall back to query param for SSE where custom headers aren't sent reliably
    const sessionId = req.headers['x-session-id'] || req.query.sessionId;
    const token = authRoutes.getToken(sessionId);
    
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    req.accessToken = token;
    next();
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

router.get('/sites', requireAuth, async (req, res) => {
    try {
        console.log('Fetching SharePoint sites with token length:', req.accessToken?.length);
        const sharePointService = new SharePointService(req.accessToken);
        
        console.log('Initialized SharePointService, calling getAllSites()');
        const sites = await sharePointService.getAllSites();
        
        if (!sites || sites.length === 0) {
            console.log('No sites returned from getAllSites()');
            return res.status(404).json({ 
                error: 'No SharePoint sites found',
                message: 'The API call was successful but returned no sites. This could indicate permission issues.'
            });
        }
        
        console.log(`Successfully retrieved ${sites.length} sites`);
        res.json(sites);
    } catch (error) {
        console.error('Error fetching sites:', {
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
            stack: error.stack
        });
        
        // Meer specifieke error responses
        if (error.statusCode === 401 || error.code === 'InvalidAuthenticationToken') {
            return res.status(401).json({ 
                error: 'Authentication failed',
                message: 'Your session may have expired. Please try logging in again.',
                details: error.message
            });
        }
        
        if (error.statusCode === 403 || error.code === 'AccessDenied') {
            return res.status(403).json({ 
                error: 'Access denied',
                message: 'You do not have permission to view SharePoint sites. Please contact your administrator.',
                details: error.message
            });
        }
        
        // Generic 500 voor andere errors
        res.status(500).json({ 
            error: 'Failed to fetch SharePoint sites',
            message: error.message,
            code: error.code || 'unknown'
        });
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
        const sharePointService = new SharePointService(req.accessToken);
        const libraries = await sharePointService.getDocumentLibraries(siteId);
        res.json(libraries);
    } catch (error) {
        console.error('Error fetching libraries:', error);
        res.status(500).json({ error: 'Failed to fetch document libraries' });
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

router.post('/sites/:siteId/cleanup', requireAuth, async (req, res) => {
    try {
        const { siteId } = req.params;
        const { versionsToKeep = 10 } = req.body;
        const dryRun = req.query.dryRun === 'true';
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
            
            // Heartbeat om de SSE-verbinding open te houden bij lange operaties
            const heartbeat = setInterval(() => {
                if (!isCancelled) {
                    res.write(`: heartbeat\n\n`);
                }
            }, 10000); // Elke 10 seconden een heartbeat

            // Controleer of de client de verbinding verbreekt
            req.on('close', () => {
                isCancelled = true;
                clearInterval(heartbeat);
                console.log('Client closed connection');
            });
            
            // Progress callback functies
            const progressCallback = {
                onFolderProcessing: (folderPath) => {
                    res.write(`data: ${JSON.stringify({
                        type: 'progress', 
                        folderPath
                    })}\n\n`);
                },
                isCancelled: () => isCancelled
            };
            
            try {
                // Start de cleanup met progress updates
                const result = await sharePointService.bulkCleanupSite(siteId, versionsToKeep, dryRun, progressCallback);
                
                // Stuur het eindresultaat
                res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    result
                })}\n\n`);
                
                // Sluit de verbinding
                clearInterval(heartbeat);
                res.end();
            } catch (error) {
                // Stuur foutmelding
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    message: error.message
                })}\n\n`);
                clearInterval(heartbeat);
                res.end();
            }
        } else {
            // Normale API call zonder realtime updates
            const result = await sharePointService.bulkCleanupSite(siteId, versionsToKeep, dryRun);
            res.json(result);
        }
    } catch (error) {
        console.error('Error cleaning up site:', error);
        res.status(500).json({ error: 'Failed to cleanup site versions' });
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
                onFolderProcessing: (folderPath) => {
                    res.write(`data: ${JSON.stringify({ type: 'progress', folderPath })}\n\n`);
                },
                isCancelled: () => isCancelled
            };

            try {
                const result = await sharePointService.bulkCleanupSite(siteId, versionsToKeep, dryRun, progressCallback);
                res.write(`data: ${JSON.stringify({ type: 'complete', result })}\n\n`);
                clearInterval(heartbeat);
                res.end();
            } catch (error) {
                res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
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

module.exports = router;