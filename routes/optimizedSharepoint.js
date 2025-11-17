const express = require('express');
const router = express.Router();
const OptimizedSharePointService = require('../services/optimizedSharePointService');
const authRoutes = require('./auth');

module.exports = router;

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
const requireAuth = async (req, res, next) => {
    const sessionId = req.headers['x-session-id'] || req.query.sessionId;
    
    try {
        const token = await authRoutes.getToken(sessionId);
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        req.accessToken = token;
        next();
    } catch (error) {
        console.error('Error in requireAuth middleware:', error);
        return res.status(401).json({ error: 'Authentication failed' });
    }
};

// Geoptimaliseerde files endpoint met streaming
router.get('/sites/:siteId/files', requireAuth, async (req, res) => {
    const siteId = req.params.siteId;
    
    try {
        console.log(`Starting optimized file scan for site: ${siteId}`);
        const sharePointService = new OptimizedSharePointService(req.accessToken);

        setupSSEResponse(res);
        let isCancelled = false;
        
        // Handler voor als de client de verbinding verbreekt
        res.on('close', () => {
            isCancelled = true;
            console.log('Client closed connection for file scanning');
        });

        // Progress callback met verschillende events
        const progressCallback = {
            onProgress: (stats) => {
                if (!isCancelled) {
                    sendSSEEvent(res, 'progress', stats);
                }
            },
            onFolderProcessing: (folderPath) => {
                if (!isCancelled) {
                    sendSSEEvent(res, 'folder', { path: folderPath });
                }
            },
            onBatchComplete: (batch) => {
                if (!isCancelled) {
                    sendSSEEvent(res, 'batch', {
                        files: batch,
                        timestamp: Date.now()
                    });
                }
            },
            isCancelled: () => isCancelled
        };
        
        // Heartbeat om de verbinding open te houden
        const heartbeatInterval = setInterval(() => {
            if (!isCancelled) {
                res.write(':\n\n'); // SSE comment als heartbeat
                res.flush();
            }
        }, 15000);

        try {
            let totalFiles = 0;
            let totalVersions = 0;
            
            // Stream files in batches
            for await (const batch of sharePointService.generateSiteFiles(siteId, progressCallback)) {
                if (isCancelled) break;
                
                totalFiles += batch.length;
                totalVersions += batch.reduce((sum, file) => sum + (file.versions?.length || 0), 0);
                
                // Stuur voortgangsupdate
                progressCallback.onProgress({
                    totalFiles,
                    totalVersions,
                    timestamp: Date.now()
                });
            }

            if (!isCancelled) {
                // Stuur eindresultaat
                sendSSEEvent(res, 'complete', {
                    status: 'success',
                    stats: {
                        totalFiles,
                        totalVersions
                    }
                });
            }
        } catch (error) {
            if (!isCancelled) {
                console.error('Error during file scanning:', error);
                sendSSEEvent(res, 'error', {
                    error: 'Failed to scan files',
                    details: error.message
                });
            }
        } finally {
            clearInterval(heartbeatInterval);
            res.end();
        }
    } catch (error) {
        console.error('Error in files endpoint:', error);
        if (!res.headersSent) {
            sendSSEEvent(res, 'error', { error: error.message });
        }
        res.end();
    }
});