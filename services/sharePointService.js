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
        // Cache voor cleanup geschiedenis
        this.cleanupHistory = new Map();
        // Configuratie
        this.cacheTimeout = 5 * 60 * 1000; // 5 minuten cache
        this.scanCacheTimeout = 30 * 60 * 1000; // 30 minuten cache voor scans
        this.historyLimit = 50; // Maximum aantal historie items per site
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

    addCleanupHistoryEntry = (siteId, data) => {
        if (!this.cleanupHistory.has(siteId)) {
            this.cleanupHistory.set(siteId, []);
        }
        
        const history = this.cleanupHistory.get(siteId);
        const entry = {
            timestamp: new Date().toISOString(),
            ...data
        };
        
        // Voeg nieuwe entry toe aan het begin
        history.unshift(entry);
        
        // Beperk de geschiedenis tot historyLimit items
        if (history.length > this.historyLimit) {
            history.length = this.historyLimit;
        }
        
        this.cleanupHistory.set(siteId, history);
        return entry;
    };

    getCleanupHistory = (siteId) => {
        return this.cleanupHistory.get(siteId) || [];
    };

    getAllCleanupHistory = () => {
        const allHistory = [];
        for (const [siteId, history] of this.cleanupHistory.entries()) {
            allHistory.push(...history.map(entry => ({
                ...entry,
                siteId
            })));
        }
        return allHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    };

    getVersionsByPath = async (siteId, spPath) => {
        try {
            console.log(`Getting versions for path: ${spPath}`);
            
            // Split the path into library name and file path
            const pathParts = spPath.split('/');
            const libraryName = pathParts[0];
            const filePath = pathParts.slice(1).join('/');
            
            // Eerst de library ID ophalen
            const libraries = await this.getDocumentLibraries(siteId);
            const library = libraries.find(lib => lib.name === libraryName);
            
            if (!library) {
                throw new Error(`Library '${libraryName}' not found`);
            }
            
            // Het bestand zoeken in de library
            const driveId = library.id;
            let currentPath = 'root';
            let currentItem = null;
            
            for (const pathPart of pathParts.slice(1)) {
                const items = await this.graphClient
                    .api(`/drives/${driveId}/items/${currentPath}/children`)
                    .filter(`name eq '${pathPart}'`)
                    .get();
                
                if (!items.value || items.value.length === 0) {
                    throw new Error(`Path part '${pathPart}' not found`);
                }
                
                currentItem = items.value[0];
                currentPath = currentItem.id;
            }
            
            if (!currentItem) {
                throw new Error('File not found');
            }
            
            // Nu de versies ophalen
            const versions = await this.graphClient
                .api(`/drives/${driveId}/items/${currentItem.id}/versions`)
                .select('id,size,lastModifiedDateTime,lastModifiedBy')
                .get();
                
            // Sorteer de versies zelf
            versions.value.sort((a, b) => 
                new Date(b.lastModifiedDateTime) - new Date(a.lastModifiedDateTime)
            );
            
            return {
                file: {
                    name: currentItem.name,
                    path: spPath,
                    id: currentItem.id,
                    driveId: driveId
                },
                versions: versions.value.map(v => ({
                    id: v.id,
                    size: v.size,
                    modified: v.lastModifiedDateTime,
                    modifiedBy: v.lastModifiedBy?.user?.displayName || 'Onbekend',
                    sizeFormatted: this.formatFileSize(v.size)
                }))
            };
            
        } catch (error) {
            console.error('getVersionsByPath error:', error);
            throw error;
        }
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
        const scanStartTime = Date.now();
        
        try {
            let scanData;
            // Cache key is alleen gebaseerd op site ID, niet op dryRun of versionsToKeep
            const cacheKey = `site-${siteId}`;
            const now = Date.now();
            
            console.log(`\n[START] Bulk cleanup for site ${siteId} (dry run: ${dryRun}, keep: ${versionsToKeep} versions)`);

            // Check of we gecachte scan data hebben
            if (this.siteScanCache.has(cacheKey)) {
                const cached = this.siteScanCache.get(cacheKey);
                if (now - cached.timestamp < this.scanCacheTimeout) {
                    console.log(`Using cached scan data for site ${siteId} (${Math.round((now - cached.timestamp) / 1000)}s old)`);
                    scanData = cached.data;
                    
                    // Als alleen het aantal versies is veranderd, gebruik dan de bestaande scan
                    if (scanData.originalVersionsToKeep !== versionsToKeep) {
                        console.log(`Versions to keep changed from ${scanData.originalVersionsToKeep} to ${versionsToKeep}. Using cached scan data.`);
                        scanData.originalVersionsToKeep = versionsToKeep;
                        // Update de cache met het nieuwe aantal versies
                        this.siteScanCache.set(cacheKey, {
                            data: scanData,
                            timestamp: cached.timestamp // Behoud de originele timestamp
                        });
                    }
                    
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
                try {
                    const libraries = await this.getDocumentLibraries(siteId);
                    scanData = { 
                        libraries,
                        items: {},
                        itemVersions: {}, // Cache voor versie informatie per item
                        originalVersionsToKeep: versionsToKeep, // Onthoud voor welk aantal versies we gescand hebben
                        timestamp: Date.now()
                    };
                    // Cache direct opslaan
                    this.siteScanCache.set(cacheKey, {
                        data: scanData,
                        timestamp: Date.now()
                    });
                } catch (libError) {
                    console.error(`Failed to get document libraries for site ${siteId}:`, libError.message);
                    // Return empty result instead of throwing - site might be inaccessible but bulk scan should continue
                    if (libError.message && libError.message.includes('Access')) {
                        console.warn(`Access denied to site ${siteId} - skipping this site`);
                        return {
                            success: false,
                            dryRun,
                            totalFiles: 0,
                            totalVersions: 0,
                            versionsToRemove: 0,
                            totalStorageSavings: '0 B',
                            totalStorageSavingsBytes: 0,
                            details: {},
                            error: `Access denied to site: ${libError.message}`,
                            skipped: true
                        };
                    }
                    throw libError;
                }
            }

            const checkCancelled = () => {
                if (progressCallback && typeof progressCallback.isCancelled === 'function') {
                    return progressCallback.isCancelled();
                }
                return false;
            };

            const withBackoff = async (fn, { retries = 5, baseDelay = 250, timeoutMs = 120000 } = {}) => {
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
                        const retryable = code === 429 || code === 503 || err.message === 'Timeout';
                        if (!retryable || attempt >= retries || checkCancelled()) throw err;
                        const delay = baseDelay * Math.pow(2, attempt);
                        console.log(`Retry attempt ${attempt + 1}/${retries} after ${delay}ms delay (error: ${err.message})`);
                        await new Promise(r => setTimeout(r, delay));
                        attempt++;
                    }
                }
            };

            const runWithConcurrency = async (items, worker, limit = 5) => {
                const results = [];
                let index = 0;
                let completed = 0;
                const total = items.length;
                
                const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
                    while (index < items.length && !checkCancelled()) {
                        const current = items[index++];
                        try {
                            const r = await worker(current);
                            results.push(r);
                            completed++;
                            
                            // Update progress elke 10 items of bij laatste item
                            if (completed % 10 === 0 || completed === total) {
                                if (progressCallback?.onProgress) {
                                    progressCallback.onProgress({
                                        completed,
                                        total,
                                        percentage: Math.round((completed / total) * 100)
                                    });
                                }
                            }
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
                }, { timeoutMs: 120000 });
                
                all.push(...(first.value || []));
                let next = first['@odata.nextLink'];
                let totalFetched = all.length;
                let pageCount = 1;
                
                while (next && !checkCancelled()) {
                    pageCount++;
                    const page = await withBackoff(() => this.graphClient
                        .api(next.replace('https://graph.microsoft.com/v1.0', ''))
                        .get(), { timeoutMs: 120000 });
                    all.push(...(page.value || []));
                    totalFetched += page.value?.length || 0;
                    
                    if (progressCallback?.onFolderProcessing) {
                        const displayPath = currentPath || 'root';
                        progressCallback.onFolderProcessing(`Scanning ${displayPath} (${totalFetched} items, page ${pageCount})`);
                    }
                    next = page['@odata.nextLink'];
                }
                
                console.log(`Fetched ${totalFetched} items from ${currentPath || 'root'} in ${pageCount} pages`);
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
                
                const startTime = Date.now();
                
                try {
                    console.log(`[SCAN] Processing folder: ${folderPath}`);
                    
                    if (progressCallback?.onFolderProcessing) {
                        progressCallback.onFolderProcessing(folderPath);
                    }

                    // Als we cached data hebben, sla de folder scan over
                    let fileItems = [];
                    let folderItems = [];
                    
                    const folderCacheKey = `${driveId}:${folderPath}`;
                    
                    if (scanData.items[folderCacheKey]) {
                        const cachedItems = scanData.items[folderCacheKey];
                        fileItems = cachedItems.files;
                        folderItems = cachedItems.folders;
                        console.log(`[CACHE] Using cached data: ${fileItems.length} files, ${folderItems.length} folders`);
                    } else {
                        const value = await fetchAllChildren(driveId, folderId, folderPath);
                        
                        fileItems = value.filter(i => i.file && !shouldSkipFile(i));
                        folderItems = value.filter(i => i.folder && !shouldSkipFolder(i));

                        // Log het aantal overgeslagen items voor debugging
                        const skippedFiles = value.filter(i => i.file && shouldSkipFile(i)).length;
                        const skippedFolders = value.filter(i => i.folder && shouldSkipFolder(i)).length;
                        console.log(`[SCAN] Found ${fileItems.length} files, ${folderItems.length} folders (skipped: ${skippedFiles} files, ${skippedFolders} folders)`);
                        
                        if (progressCallback?.onFolderProcessing) {
                            progressCallback.onFolderProcessing(`${folderPath} (${fileItems.length} files, ${folderItems.length} folders)`);
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
                            // Check de cache voor versie informatie
                            const versionCacheKey = `${driveId}:${item.id}`;
                            let versions;
                            
                            if (scanData.itemVersions && scanData.itemVersions[versionCacheKey]) {
                                versions = scanData.itemVersions[versionCacheKey];
                            } else {
                                // BELANGRIJK: De /versions endpoint geeft ALLEEN historische versies terug.
                                // De HUIDIGE/ACTIEVE versie van het bestand zit NIET in deze lijst.
                                // De huidige versie is het bestand zelf (accessed via /items/{id}).
                                // Dit betekent dat we NOOIT de huidige versie verwijderen, alleen oude versies.
                                versions = await withBackoff(() => this.graphClient
                                    .api(`/drives/${driveId}/items/${item.id}/versions`)
                                    .select('id,size,lastModifiedDateTime')
                                    .get(), { timeoutMs: 60000 });
                                
                                // Cache de versie informatie
                                if (!scanData.itemVersions) scanData.itemVersions = {};
                                scanData.itemVersions[versionCacheKey] = versions;
                                
                                // Update de cache
                                this.siteScanCache.set(cacheKey, {
                                    data: scanData,
                                    timestamp: now
                                });
                            }

                            if (!versions.value || versions.value.length === 0) return;

                            const numVersions = versions.value.length;
                            const itemPath = `${folderPath}/${item.name}`;

                            totalFiles++;
                            totalVersions += numVersions;
                            
                            console.log(`Processing ${itemPath} - ${numVersions} versions found (dry run: ${dryRun})`); // Debug logging

                            if (numVersions > versionsToKeep) {
                                // Sorteer versies van nieuwste naar oudste (op basis van lastModifiedDateTime)
                                // VEILIGHEID: De huidige versie zit NIET in deze lijst, alleen historische versies
                                const sorted = [...(versions.value || [])].sort((a, b) => {
                                    const ad = a.lastModifiedDateTime ? new Date(a.lastModifiedDateTime).getTime() : 0;
                                    const bd = b.lastModifiedDateTime ? new Date(b.lastModifiedDateTime).getTime() : 0;
                                    return bd - ad;
                                });
                                
                                // Behoud de N nieuwste historische versies
                                // VEILIGHEID: keepCount is minimaal 1, dus we verwijderen nooit alle versies
                                const keepCount = Math.max(1, versionsToKeep);
                                
                                // Versies die verwijderd moeten worden (oudste versies)
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
                    
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    console.log(`[DONE] Processed ${folderPath} in ${elapsed}s (${fileItems.length} files)`);
                } catch (folderError) {
                    console.error(`[ERROR] Failed to process folder ${folderPath}:`, folderError.message);
                }
            };

            // Process all libraries and their contents recursively
            const totalLibraries = scanData.libraries.length;
            let processedLibraries = 0;
            
            for (const library of scanData.libraries) {
                if (isCancelled) {
                    break;
                }

                if (this.shouldSkipLibrary(library.name)) {
                    console.log(`[SKIP] Library: ${library.name} (matches skip pattern)`);
                    continue;
                }
                
                processedLibraries++;
                console.log(`\n[LIBRARY ${processedLibraries}/${totalLibraries}] Processing: ${library.name}`);
                
                if (progressCallback?.onFolderProcessing) {
                    progressCallback.onFolderProcessing(`[${processedLibraries}/${totalLibraries}] ${library.name}`);
                }
                
                try {
                    await processFolder(library.id, 'root', library.name);
                    console.log(`[LIBRARY ${processedLibraries}/${totalLibraries}] ✓ Completed: ${library.name}`);
                } catch (libraryError) {
                    console.error(`[LIBRARY ${processedLibraries}/${totalLibraries}] ✗ Error in ${library.name}:`, libraryError.message);
                    continue;
                }
            }
            
            if (isCancelled) {
                console.log('[CANCELLED] Bulk cleanup process was cancelled by user');
            }

            // Update cache with latest scan data
            if (!isCancelled) {
                this.siteScanCache.set(cacheKey, {
                    data: scanData,
                    timestamp: Date.now()
                });
            }

            const totalStorageSavings = this.formatFileSize(totalStorageSavingsBytes);

            // Maak resultaat object
            const totalElapsedSeconds = ((Date.now() - scanStartTime) / 1000).toFixed(1);
            
            console.log('\n' + '='.repeat(60));
            console.log(`[SUMMARY] Bulk Cleanup ${dryRun ? '(DRY RUN)' : 'COMPLETED'}`);
            console.log('='.repeat(60));
            console.log(`Total files processed: ${totalFiles}`);
            console.log(`Total versions found: ${totalVersions}`);
            console.log(`Versions to remove: ${versionsToRemove}`);
            console.log(`Storage savings: ${this.formatFileSize(totalStorageSavingsBytes)}`);
            console.log(`Time elapsed: ${totalElapsedSeconds}s`);
            console.log(`Libraries processed: ${processedLibraries}/${totalLibraries}`);
            console.log('='.repeat(60) + '\n');
            
            const results = {
                success: true,
                dryRun,
                totalFiles,
                totalVersions,
                versionsToRemove,
                totalStorageSavings: this.formatFileSize(totalStorageSavingsBytes),
                totalStorageSavingsBytes,
                details,
                usedCache: !!scanData,
                cacheInfo: {
                    timestamp: scanData?.timestamp,
                    age: scanData ? Math.round((now - scanData.timestamp) / 1000) : 0,
                    originalVersionsToKeep: scanData?.originalVersionsToKeep
                }
            };

            // Voeg toe aan geschiedenis als het geen dry run was
            if (!dryRun) {
                this.addCleanupHistoryEntry(siteId, {
                    totalFiles,
                    totalVersions,
                    versionsRemoved: versionsToRemove,
                    storageSaved: totalStorageSavings,
                    storageSavedBytes: totalStorageSavingsBytes,
                    versionsToKeep
                });
            }

            return results;

        } catch (error) {
            console.error('Error in bulk cleanup:', error);
            console.error('Error details:', {
                message: error.message,
                status: error.status,
                statusCode: error.statusCode,
                code: error.code,
                name: error.name
            });
            throw error;
        }
    };
}

module.exports = SharePointService;