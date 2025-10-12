const { Client } = require('@microsoft/microsoft-graph-client');
const axios = require('axios');

class SharePointService {
    constructor(accessToken) {
        this.graphClient = Client.init({
            authProvider: (done) => {
                done(null, accessToken);
            },
            debugLogging: true
        });
        this.accessToken = accessToken;
        // Cache voor versie informatie
        this.versionCache = new Map();
        // Cache voor site scan resultaten
        this.siteScanCache = new Map();
        // Configuratie
        this.cacheTimeout = 5 * 60 * 1000; // 5 minuten cache
        this.scanCacheTimeout = 30 * 60 * 1000; // 30 minuten cache voor scans
        this.lastRequestTime = 0;
        this.minRequestInterval = 100; // Minimum tijd tussen requests in ms
        this.maxRetries = 3;
        this.baseDelay = 1000;
    }

    async retryWithBackoff(fn, maxRetries = this.maxRetries) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.throttleRequest(() => fn());
            } catch (error) {
                console.log(`Attempt ${attempt} failed:`, error.message);
                if (attempt === maxRetries) throw error;
                await new Promise(resolve => setTimeout(resolve, this.baseDelay * Math.pow(2, attempt - 1)));
            }
        }
    }

    async throttleRequest(requestFn) {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.minRequestInterval) {
            await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
        }
        
        this.lastRequestTime = Date.now();
        return requestFn();
        this.requestDelay = 50;
        this.batchSize = 50;
        this.maxConcurrent = 3;

        if (accessToken) {
            console.log('SharePoint service initialized with token (length:', accessToken.length, ')');
            const firstChars = accessToken.substring(0, 10);
            const lastChars = accessToken.substring(accessToken.length - 10);
            console.log(`Token: ${firstChars}...${lastChars}`);
        } else {
            console.log('WARNING: SharePoint service initialized without access token!');
        }
    }

    clearScanCache = () => {
        console.log('Clearing scan cache');
        this.siteScanCache.clear();
    };

    getAllSites = async () => {
        try {
            console.log('Getting all sites...');
            
            // Methode 1: Gebruik /sites?search=*
            try {
                const sites = await this.retryWithBackoff(async () => {
                    const response = await this.graphClient.api('/sites?search=*')
                        .header('ConsistencyLevel', 'eventual')
                        .get();
                    return response;
                });
                
                if (sites?.value?.length > 0) {
                    console.log(`Found ${sites.value.length} sites via /sites?search=*`);
                    return sites.value;
                }
            } catch (searchError) {
                console.log('Search sites failed:', searchError.message);
            }

                        // Methode 2: Probeer via /me/followedSites
            try {
                console.log('Trying /me/followedSites endpoint...');
                const followedSites = await this.retryWithBackoff(async () => {
                    const response = await this.graphClient.api('/me/followedSites').get();
                    return response;
                });
                
                if (followedSites?.value?.length > 0) {
                    console.log(`Found ${followedSites.value.length} sites via followed sites`);
                    return followedSites.value;
                }
            } catch (followedError) {
                console.log('Followed sites failed:', followedError.message);
            }

            // Als alle methodes falen, probeer een specifieke site root
            try {
                console.log('Trying to get root site as final attempt...');
                const rootSite = await this.retryWithBackoff(async () => {
                    const response = await this.graphClient.api('/sites/root').get();
                    return response;
                });
                
                if (rootSite) {
                    console.log('Retrieved root site');
                    return [rootSite];
                }
            } catch (rootError) {
                console.log('Root site failed:', rootError.message);
            }

            // Methode 3: Probeer via /me/followedSites
            try {
                console.log('Trying /me/followedSites as last resort...');
                const followedSites = await retryWithBackoff(() => 
                    this.graphClient.api('/me/followedSites')
                    .get()
                );
                
                if (followedSites?.value?.length > 0) {
                    console.log(`Found ${followedSites.value.length} sites via followed sites`);
                    return followedSites.value;
                }
            } catch (followedError) {
                console.log('Followed sites failed:', followedError.message);
            }

            // Als alle methodes falen, probeer een specifieke site root
            try {
                console.log('Trying to get root site as final attempt...');
                const rootSite = await retryWithBackoff(() => 
                    this.graphClient.api('/sites/root')
                    .get()
                );
                
                if (rootSite) {
                    console.log('Retrieved root site');
                    return [rootSite];
                }
            } catch (rootError) {
                console.log('Root site failed:', rootError.message);
            }

            throw new Error('Could not retrieve any sites through available methods');
        } catch (error) {
            console.error('Error fetching sites (all methods failed):', error);
            throw error;
        }
    };

    formatFileSize = (bytes) => {
        if (!bytes || isNaN(bytes)) return '0 B';
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    };

    shouldSkipLibrary = (libraryName) => {
        // Lijst van libraries die we willen overslaan
        const skipPatterns = [
            /^Vorm\s*bibliotheek$/i,        // Form Templates
            /^Style\s*Library$/i,           // Style Library
            /^Prullenbak$/i,               // Recycle Bin
            /^Recycling\s*Bin$/i,          // Recycle Bin (EN)
            /^Site\s*Assets$/i,            // Site Assets
            /^Site\s*Pages$/i,             // Site Pages
            /^Site\s*Collection\s*Images$/i, // Site Collection Images
            /^Site\s*Collection\s*Documents$/i, // Site Collection Documents
            /_catalogs$/i,                 // Catalogs
            /^FORMS$/i,                    // Forms directory
            /^SitePages$/i,                // Modern Site Pages
            /^Preservation\s*Hold\s*Library$/i, // Preservation Hold Library
            /^Project\s*Policy\s*Library$/i     // Project Policy Library
        ];
        
        // Check of de naam matched met een van de patronen
        return skipPatterns.some(pattern => pattern.test(libraryName));
    };

    getDocumentLibraries = async (siteId) => {
        try {
            console.log(`Fetching document libraries for site ${siteId}`);
            const response = await this.retryWithBackoff(async () => {
                const result = await this.graphClient.api(`/sites/${siteId}/drives`)
                    .filter("driveType eq 'documentLibrary'")
                    .get();
                return result;
            });

            if (!response?.value) {
                console.log('No document libraries found');
                return [];
            }

            console.log(`Found ${response.value.length} document libraries`);
            return response.value.map(drive => ({
                id: drive.id,
                name: drive.name,
                driveType: drive.driveType,
                webUrl: drive.webUrl
            }));
        } catch (error) {
            console.error('Error fetching document libraries:', error);
            throw error;
        }
    };

    bulkCleanupSite = async (siteId, versionsToKeep = 10, dryRun = false, progressCallback = null) => {
        try {
            let scanData;
            const cacheKey = `site-${siteId}`;
            const now = Date.now();

            // Check of we gecachte scan data hebben
            if (this.siteScanCache.has(cacheKey)) {
                const cached = this.siteScanCache.get(cacheKey);
                if (now - cached.timestamp < this.scanCacheTimeout) {
                    console.log(`Using cached scan data for site ${siteId} (${Math.round((now - cached.timestamp) / 1000)}s old)`);
                    scanData = cached.data;
                    // Stuur progress update dat we cache gebruiken
                    if (progressCallback?.onFolderProcessing) {
                        progressCallback.onFolderProcessing('Using cached scan data - recalculating versions...');
                    }
                }
            }

            let totalFiles = 0;
            let totalVersions = 0;
            let versionsToRemove = 0;
            let totalStorageSavingsBytes = 0;
            const details = {};
            let isCancelled = false;

            // Als we geen cache hebben, voer dan een nieuwe scan uit
            if (!scanData) {
                console.log('No cache available, performing new scan');
                const libraries = await this.getDocumentLibraries(siteId);
                scanData = { 
                    libraries,
                    items: {},
                    timestamp: Date.now()
                };
            }

            const checkCancelled = () => {
                if (progressCallback && typeof progressCallback.isCancelled === 'function') {
                    return progressCallback.isCancelled();
                }
                return false;
            };

            const withBackoff = async (fn, { retries = 4, baseDelay = 250, timeoutMs = 30000 } = {}) => {
                let attempt = 0;
                while (true) {
                    try {
                        const run = () => fn();
                        if (timeoutMs && Number.isFinite(timeoutMs)) {
                            return await Promise.race([
                                run(),
                                new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Timeout'), { status: 503 })), timeoutMs))
                            ]);
                        }
                        return await run();
                    } catch (err) {
                        const code = err?.statusCode || err?.status;
                        const retryable = code === 429 || code === 503;
                        if (!retryable || attempt >= retries || checkCancelled()) throw err;
                        const delay = baseDelay * Math.pow(2, attempt);
                        await new Promise(r => setTimeout(r, delay));
                        attempt++;
                    }
                }
            };

            const runWithConcurrency = async (items, worker, limit = 8) => {
                const results = [];
                let index = 0;
                const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
                    while (index < items.length && !checkCancelled()) {
                        const current = items[index++];
                        try {
                            const r = await worker(current);
                            results.push(r);
                        } catch (e) {
                            console.warn('Worker error:', e.message || e);
                        }
                    }
                });
                await Promise.all(runners);
                return results;
            };

            const fetchAllChildren = async (driveId, folderId, currentPath = '') => {
                const all = [];
                const baseSelect = 'id,name,size,file,folder,lastModifiedDateTime,lastModifiedBy';
                
                if (progressCallback?.onFolderProcessing) {
                    const displayPath = currentPath || 'root';
                    progressCallback.onFolderProcessing(`Scanning: ${displayPath}`);
                }
                
                const first = await withBackoff(() => {
                    if (folderId === 'root') {
                        return this.graphClient
                            .api(`/drives/${driveId}/root/children`)
                            .select(baseSelect)
                            .top(200)
                            .get();
                    }
                    return this.graphClient
                        .api(`/drives/${driveId}/items/${folderId}/children`)
                        .select(baseSelect)
                        .top(200)
                        .get();
                }, { timeoutMs: 45000 });
                
                all.push(...(first.value || []));
                let next = first['@odata.nextLink'];
                let totalFetched = all.length;
                
                while (next && !checkCancelled()) {
                    const page = await withBackoff(() => this.graphClient
                        .api(next.replace('https://graph.microsoft.com/v1.0', ''))
                        .get(), { timeoutMs: 45000 });
                    all.push(...(page.value || []));
                    totalFetched += page.value.length;
                    
                    if (progressCallback?.onFolderProcessing) {
                        const displayPath = currentPath || 'root';
                        progressCallback.onFolderProcessing(`Scanning ${displayPath} (${totalFetched} items found)`);
                    }
                    next = page['@odata.nextLink'];
                }
                return all;
            };

            const shouldSkipFile = (file) => {
                const skipPatterns = [
                    /^~/,               // Tijdelijke bestanden
                    /^\./,              // Verborgen bestanden
                    /^desktop\.ini$/i,  // Windows systeem bestand
                    /^thumbs\.db$/i,    // Windows thumbnail cache
                    /^\.DS_Store$/i,    // macOS systeem bestand
                    /\.tmp$/i,          // Tijdelijke bestanden
                    /\.bak$/i,          // Backup bestanden
                    /\$recycle\.bin/i,  // Windows prullenbak
                ];
                return skipPatterns.some(pattern => pattern.test(file.name));
            };

            const shouldSkipFolder = (folder) => {
                const skipPatterns = [
                    /^forms$/i,         // SharePoint systeemmappen
                    /^_catalogs$/i,     // SharePoint systeemmappen
                    /^_hidden$/i,       // Verborgen mappen
                    /^_private$/i,      // Private mappen
                    /^_layouts$/i,      // SharePoint systeemmappen
                    /^_vti_/i,         // SharePoint systeemmappen
                    /^_windows$/i,      // Windows systeemmappen
                    /^_mac$/i,          // macOS systeemmappen
                    /recycle\s*bin/i,   // Prullenbakken
                    /prullenbak/i,
                    /papierenmand/i,
                    /deleted\s*items/i,
                    /verwijderde\s*items/i
                ];
                return skipPatterns.some(pattern => pattern.test(folder.name));
            };

            const processFolder = async (driveId, folderId, folderPath) => {
                if (checkCancelled()) {
                    isCancelled = true;
                    return;
                }
                
                try {
                    console.log(`Processing folder: ${folderPath}`);
                    
                    if (progressCallback?.onFolderProcessing) {
                        progressCallback.onFolderProcessing(folderPath);
                    }

                    // Als we cached data hebben, sla de folder scan over
                    let fileItems = [];
                    let folderItems = [];
                    
                    const folderCacheKey = `${driveId}:${folderPath}`;
                    
                    if (scanData.items[folderCacheKey]) {
                        console.log(`Using cached items for folder: ${folderPath}`);
                        const cachedItems = scanData.items[folderCacheKey];
                        fileItems = cachedItems.files;
                        folderItems = cachedItems.folders;
                    } else {
                        console.log(`Scanning folder: ${folderPath}`);
                        const value = await fetchAllChildren(driveId, folderId, folderPath);
                        
                        if (progressCallback?.onFolderProcessing) {
                            progressCallback.onFolderProcessing(`${folderPath} (${value.length} items processed)`);
                        }
                        
                        fileItems = value.filter(i => i.file && !shouldSkipFile(i));
                        folderItems = value.filter(i => i.folder && !shouldSkipFolder(i));

                        // Log het aantal overgeslagen items voor debugging
                        const skippedFiles = value.filter(i => i.file && shouldSkipFile(i)).length;
                        const skippedFolders = value.filter(i => i.folder && shouldSkipFolder(i)).length;
                        if (skippedFiles > 0 || skippedFolders > 0) {
                            console.log(`Skipped ${skippedFiles} files and ${skippedFolders} folders in ${folderPath}`);
                        }

                        // Sla de items op in de scanData voor hergebruik
                        scanData.items[folderCacheKey] = {
                            files: fileItems,
                            folders: folderItems,
                            timestamp: Date.now()
                        };
                    }

                    await runWithConcurrency(fileItems, async (item) => {
                        if (checkCancelled()) return;
                        try {
                            const versions = await withBackoff(() => this.graphClient
                                .api(`/drives/${driveId}/items/${item.id}/versions`)
                                .select('id,size,lastModifiedDateTime')
                                .get(), { timeoutMs: 30000 });

                            if (!versions.value || versions.value.length === 0) return;

                            const numVersions = versions.value.length;
                            const itemPath = `${folderPath}/${item.name}`;

                            totalFiles++;
                            totalVersions += numVersions;

                            if (numVersions > versionsToKeep) {
                                const sorted = [...(versions.value || [])].sort((a, b) => {
                                    const ad = a.lastModifiedDateTime ? new Date(a.lastModifiedDateTime).getTime() : 0;
                                    const bd = b.lastModifiedDateTime ? new Date(b.lastModifiedDateTime).getTime() : 0;
                                    return bd - ad;
                                });
                                const keepCount = Math.max(1, versionsToKeep);
                                const versionsToDelete = sorted.slice(keepCount);
                                const numToRemove = versionsToDelete.length;
                                versionsToRemove += numToRemove;

                                let versionSizeBytes = 0;
                                for (const version of versionsToDelete) {
                                    if (version.size) versionSizeBytes += version.size;
                                }
                                totalStorageSavingsBytes += versionSizeBytes;

                                details[itemPath] = {
                                    totalVersions: numVersions,
                                    versionsToKeep: versionsToKeep,
                                    versionsToRemove: numToRemove,
                                    path: itemPath,
                                    storageSavings: this.formatFileSize(versionSizeBytes),
                                    storageSavingsBytes: versionSizeBytes
                                };

                                if (!dryRun && versionsToDelete.length > 0) {
                                    await runWithConcurrency(versionsToDelete, (v) => withBackoff(() => this.graphClient
                                        .api(`/drives/${driveId}/items/${item.id}/versions/${v.id}`)
                                        .delete()), 6);
                                }
                            }
                        } catch (itemError) {
                            console.warn(`Error processing item ${item?.name || 'unknown'}:`, itemError?.message || itemError);
                        }
                    }, 8);

                    await runWithConcurrency(folderItems, async (sub) => {
                        if (checkCancelled()) return;
                        if (progressCallback?.onFolderProcessing) {
                            progressCallback.onFolderProcessing(`${folderPath}/${sub.name}`);
                        }
                        await processFolder(driveId, sub.id, `${folderPath}/${sub.name}`);
                    }, 4);
                } catch (folderError) {
                    console.warn(`Error processing folder ${folderPath}:`, folderError);
                }
            };

            // Process all libraries and their contents recursively
            for (const library of scanData.libraries) {
                if (isCancelled) {
                    break;
                }

                if (this.shouldSkipLibrary(library.name)) {
                    console.log(`Skipping library (matches skip pattern): ${library.name}`);
                    continue;
                }
                
                try {
                    await processFolder(library.id, 'root', library.name);
                } catch (libraryError) {
                    console.warn(`Error processing library ${library.name}:`, libraryError);
                    continue;
                }
            }
            
            if (isCancelled) {
                console.log('Bulk cleanup process was cancelled by user');
            }

            // Update cache with latest scan data
            if (!isCancelled) {
                this.siteScanCache.set(cacheKey, {
                    data: scanData,
                    timestamp: Date.now()
                });
            }

            const totalStorageSavings = this.formatFileSize(totalStorageSavingsBytes);

            return {
                success: true,
                dryRun,
                totalFiles,
                totalVersions,
                versionsToRemove,
                totalStorageSavings,
                totalStorageSavingsBytes,
                details,
                usedCache: !!scanData
            };

        } catch (error) {
            console.error('Error in bulk cleanup:', error);
            throw error;
        }
    };
}

module.exports = SharePointService;