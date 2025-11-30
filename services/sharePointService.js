const { Client } = require('@microsoft/microsoft-graph-client');
const axios = require('axios');

class SharePointService {
    constructor(accessToken, authService = null, account = null, sharePointRestToken = null) {
        this.graphClient = Client.init({
            authProvider: (done) => {
                done(null, accessToken);
            },
            debugLogging: true,
            defaultTimeout: 30000 // 30 second timeout
        });
        this.accessToken = accessToken;
        this.authService = authService; // Store AuthService instance to get SharePoint tokens
        this.account = account; // Store account for token acquisition
        this.sharePointRestToken = sharePointRestToken; // Optional dedicated SharePoint resource token
        console.log('SharePointService initialized with token:', accessToken?.substring(0, 20) + '...');
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
        console.log('getAllSites() started');
        console.log('Token present:', !!this.accessToken);

        const withTimeout = async (label, fn, ms = 15000) => {
            return await Promise.race([
                fn(),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms))
            ]);
        };

        // Attempt 1: site enumeration via search
        try {
            console.log('Attempt 1: /sites?search=*');
            // Page through all sites (Graph defaults to 50 per page)
            let allSites = [];
            let pageResp = await this.retryWithBackoff(async () => withTimeout('/sites?search=*', () => this.graphClient
                .api('/sites?search=*')
                .header('ConsistencyLevel','eventual')
                .select('id,name,displayName,webUrl,description,createdDateTime')
                .top(50)
                .get()));
            console.log('Raw /sites?search=* response keys:', Object.keys(pageResp || {}));
            if (pageResp?.value?.length) {
                allSites.push(...pageResp.value);
                let nextLink = pageResp['@odata.nextLink'];
                // Safety cap to avoid runaway loops (e.g., 5000 sites)
                const maxSites = 5000;
                while (nextLink && allSites.length < maxSites) {
                    try {
                        // Convert absolute nextLink to relative path for Graph client
                        const relative = nextLink.replace('https://graph.microsoft.com/v1.0', '');
                        pageResp = await this.retryWithBackoff(async () => withTimeout('nextLink sites page', () => this.graphClient
                            .api(relative)
                            .get()));
                        if (pageResp?.value?.length) {
                            allSites.push(...pageResp.value);
                        }
                        nextLink = pageResp['@odata.nextLink'];
                        console.log(`Paged sites: ${allSites.length} so far`);
                    } catch (pageErr) {
                        console.log('Paging /sites?search=* failed:', pageErr.message);
                        break;
                    }
                }
                console.log(`/sites?search=* returned ${allSites.length} sites in ${Math.ceil(allSites.length/50)} pages`);
                return allSites;
            }
            console.log('/sites?search=* empty or missing value array');
        } catch (err) {
            console.error('/sites?search=* failed:', { message: err.message, code: err.code, statusCode: err.statusCode, body: err.body });
        }

        // Attempt 2: root site
        try {
            console.log('Attempt 2: /sites/root');
            const rootSite = await this.retryWithBackoff(async () => withTimeout('/sites/root', () => this.graphClient
                .api('/sites/root')
                .get()));
            if (rootSite) {
                console.log('Root site retrieved');
                return [rootSite];
            }
            console.log('/sites/root returned no data');
        } catch (err) {
            console.error('/sites/root failed:', { message: err.message, code: err.code, statusCode: err.statusCode, body: err.body });
        }

        console.error('getAllSites(): All methods failed');
        throw new Error('Could not retrieve any sites through search or root methods');
    };

    // Return only first page of sites plus a nextLink for progressive loading
    enumerateSitesPaged = async (pageSize = 50) => {
        console.log('enumerateSitesPaged() starting');
        const withTimeout = async (label, fn, ms = 15000) => {
            return await Promise.race([
                fn(),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms))
            ]);
        };
        try {
            const firstPage = await this.retryWithBackoff(async () => withTimeout('paged /sites?search=*', () => this.graphClient
                .api('/sites?search=*')
                .header('ConsistencyLevel','eventual')
                .select('id,name,displayName,webUrl,description,createdDateTime')
                .top(pageSize)
                .get()));
            const nextLink = firstPage['@odata.nextLink'] ? firstPage['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null;
            return { sites: firstPage.value || [], nextLink };
        } catch (err) {
            console.error('enumerateSitesPaged() failed:', err.message);
            throw err;
        }
    };

    // Fetch a subsequent page using relative nextLink path
    getSitesNext = async (relativeNextLink) => {
        if (!relativeNextLink) throw new Error('No nextLink provided');
        console.log('getSitesNext() fetching', relativeNextLink);
        try {
            const pageResp = await this.retryWithBackoff(async () => this.graphClient.api(relativeNextLink).get());
            const nextLink = pageResp['@odata.nextLink'] ? pageResp['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null;
            return { sites: pageResp.value || [], nextLink };
        } catch (err) {
            console.error('getSitesNext() failed:', err.message);
            throw err;
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

    // Fetch detailed site information including quota and libraries
    getSiteDetails = async (siteId) => {
        try {
            console.log(`Fetching site details for ${siteId}`);
            // Basic site object
            const site = await this.retryWithBackoff(async () => {
                return await this.graphClient.api(`/sites/${siteId}`).get();
            });

            // Site drive (for quota)
            let drive = null;
            try {
                drive = await this.retryWithBackoff(async () => {
                    return await this.graphClient.api(`/sites/${siteId}/drive`).get();
                });
            } catch (driveErr) {
                console.log('Drive quota fetch failed:', driveErr.message);
            }

            // Document libraries
            let libraries = [];
            try {
                // Libraries now include real versioning settings from Graph API
                libraries = await this.getDocumentLibraries(siteId);
            } catch (libErr) {
                console.log('Library fetch failed:', libErr.message);
            }

            return {
                id: site.id,
                name: site.name,
                displayName: site.displayName || site.name,
                description: site.description || '',
                webUrl: site.webUrl,
                createdDateTime: site.createdDateTime,
                lastModifiedDateTime: site.lastModifiedDateTime,
                quota: drive?.quota || null,
                libraries
            };
        } catch (error) {
            console.error('Error in getSiteDetails:', error);
            throw error;
        }
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

    // Helper method to fetch versioning settings via SharePoint REST API
    getLibraryVersioningSettings = async (siteUrl, listId) => {
        try {
            // Sanitize GUID (remove braces if present)
            const cleanListId = listId.replace(/[{}]/g, '');
            const restUrl = `${siteUrl}/_api/web/lists(guid'${cleanListId}')?$select=Title,EnableVersioning,EnableMinorVersions,MajorVersionLimit,MajorWithMinorVersionsLimit,ForceCheckout`;
            
            const tokenForRest = this.sharePointRestToken || this.accessToken;
            if (!this.sharePointRestToken) {
                console.log('Using Graph token for REST (may lack AllSites.Read); provide X-SharePoint-Token for accurate versioning.');
            }
            const response = await axios.get(restUrl, {
                headers: {
                    'Authorization': `Bearer ${tokenForRest}`,
                    'Accept': 'application/json;odata=nometadata'
                },
                timeout: 5000
            });

            return {
                enabled: response.data.EnableVersioning === true,
                minorEnabled: response.data.EnableMinorVersions === true,
                majorLimit: response.data.MajorVersionLimit || null,
                minorLimit: response.data.MajorWithMinorVersionsLimit || null,
                forceCheckout: response.data.ForceCheckout === true,
                source: 'rest'
            };
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('SharePoint REST API 401 - missing AllSites.Read or admin consent');
                return { 
                    enabled: true,
                    minorEnabled: null,
                    majorLimit: 50,
                    minorLimit: 10,
                    forceCheckout: null,
                    source: 'default',
                    permissionMissing: true,
                    message: 'Geen rechten om versie-instellingen te lezen (voeg SharePoint AllSites.Read toe en geef admin consent).'
                };
            }
            const status = error.response?.status || error.code;
            const bodySnippet = typeof error.response?.data === 'string' ? error.response.data.substring(0,200) : JSON.stringify(error.response?.data || {}).substring(0,200);
            console.log(`REST API error (${status}): ${error.message} | URL: ${siteUrl}/_api/... listId=${listId}`);
            if (bodySnippet && bodySnippet !== '{}') {
                console.log('REST error body snippet:', bodySnippet);
            }
            return null;
        }
    };

    // Fallback: fetch versioning settings by list title (when list GUID not available)
    getLibraryVersioningSettingsByTitle = async (siteUrl, listTitle) => {
        try {
            if (!listTitle) return null;
            // Encode single quotes safely for OData (double them) then URI encode except quotes used in REST pattern
            const safeTitle = listTitle.replace(/'/g, "''");
            const restUrl = `${siteUrl}/_api/web/lists/GetByTitle('${safeTitle}')?$select=Title,EnableVersioning,EnableMinorVersions,MajorVersionLimit,MajorWithMinorVersionsLimit,ForceCheckout`;
            const tokenForRest = this.sharePointRestToken || this.accessToken;
            if (!this.sharePointRestToken) {
                console.log(`Attempting title-based REST fetch with Graph token (may fail): ${listTitle}`);
            }
            const response = await axios.get(restUrl, {
                headers: {
                    'Authorization': `Bearer ${tokenForRest}`,
                    'Accept': 'application/json;odata=nometadata'
                },
                timeout: 5000
            });
            const majorLimit = response.data.MajorVersionLimit;
            const isAutomatic = majorLimit === 0 || majorLimit >= 500;
            return {
                enabled: response.data.EnableVersioning === true,
                minorEnabled: response.data.EnableMinorVersions === true,
                majorLimit: majorLimit || null,
                minorLimit: response.data.MajorWithMinorVersionsLimit || null,
                forceCheckout: response.data.ForceCheckout === true,
                automatic: isAutomatic,
                source: 'rest'
            };
        } catch (error) {
            if (error.response?.status === 404) {
                console.log(`REST title lookup 404 for '${listTitle}'`);
                return null;
            }
            if (error.response?.status === 401) {
                console.log('SharePoint REST API 401 (title-based) - missing AllSites.Read or admin consent');
                return {
                    enabled: true,
                    minorEnabled: null,
                    majorLimit: 100,
                    minorLimit: 10,
                    forceCheckout: null,
                    automatic: false,
                    source: 'default',
                    permissionMissing: true,
                    message: 'Geen rechten om versie-instellingen (titel) te lezen.'
                };
            }
            const status = error.response?.status || error.code;
            console.log(`Title-based REST error (${status}) for '${listTitle}':`, error.message);
            return null;
        }
    };

    // Fallback: try to infer versioning from Graph API (limited info)
    getLibraryVersioningFromGraph = async (driveId) => {
        try {
            // Graph doesn't expose full versioning config, but we can check if versioning is enabled
            // by trying to get version info from a sample file
            const items = await this.graphClient
                .api(`/drives/${driveId}/root/children`)
                .select('id,name,file')
                .top(1)
                .get();

            if (items.value && items.value.length > 0 && items.value[0].file) {
                const fileId = items.value[0].id;
                const versions = await this.graphClient
                    .api(`/drives/${driveId}/items/${fileId}/versions`)
                    .get();
                
                // If we can get versions, versioning is enabled
                // But we don't know limits via Graph
                return {
                    enabled: true,
                    minorEnabled: null,
                    majorLimit: null,
                    minorLimit: null,
                    forceCheckout: null,
                    source: 'graph-inferred'
                };
            }
            
            return null;
        } catch (error) {
            // If no files or versions endpoint fails, assume defaults
            return null;
        }
    };

    getDocumentLibraries = async (siteId) => {
        try {
            console.log(`Fetching document libraries for site ${siteId}`);
            
            // First get site details to extract webUrl
            const site = await this.retryWithBackoff(async () => {
                return await this.graphClient.api(`/sites/${siteId}`).get();
            });

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
            
            // Helper to resolve list GUID from drive via sharepointIds
            const getListIdForDrive = async (driveId) => {
                try {
                    const driveMeta = await this.retryWithBackoff(async () => this.graphClient
                        .api(`/drives/${driveId}`)
                        .select('sharepointIds')
                        .get());
                    const listGuid = driveMeta?.sharepointIds?.listId;
                    if (listGuid) return listGuid.replace(/[{}]/g, '');
                } catch (e) {
                    console.log(`Failed to get listId for drive ${driveId}:`, e.message);
                }
                return null;
            };

            // Global probe (optional) - informational only
            let initialRestProbeFailed = false;
            if (response.value.length > 0) {
                const firstDriveId = response.value[0].id;
                const testListGuid = await getListIdForDrive(firstDriveId);
                if (testListGuid) {
                    const testSettings = await this.getLibraryVersioningSettings(site.webUrl, testListGuid);
                    if (!testSettings) {
                        initialRestProbeFailed = true;
                        console.log('Initial REST probe failed; will still attempt per-library REST + title fallback');
                    }
                }
            }
            
            // Enrich each library with versioning settings
            const enrichedLibraries = await Promise.all(response.value.map(async (drive) => {
                let versioningSettings = {
                    enabled: true,
                    minorEnabled: null,
                    majorLimit: 100,
                    minorLimit: 10,
                    forceCheckout: null,
                    automatic: false,
                    isDefault: true,
                    source: 'default'
                };

                // Attempt REST by GUID (even if initial probe failed)
                try {
                    const listGuid = await getListIdForDrive(drive.id);
                    let restSettings = null;
                    if (listGuid) {
                        restSettings = await this.getLibraryVersioningSettings(site.webUrl, listGuid);
                        if (!restSettings) {
                            console.log(`GUID REST returned null for ${drive.name}`);
                        }
                    } else {
                        console.log(`List GUID unresolved for ${drive.name}`);
                    }
                    // Title fallback
                    if ((!restSettings || restSettings?.source !== 'rest') && drive.name) {
                        const titleSettings = await this.getLibraryVersioningSettingsByTitle(site.webUrl, drive.name);
                        if (titleSettings) {
                            // Mark as rest-title for transparency
                            restSettings = { ...titleSettings, source: 'rest-title' };
                            console.log(`✓ Versioning (REST title fallback) for ${drive.name}`);
                        }
                    }
                    if (restSettings) {
                        if (restSettings.permissionMissing) {
                            versioningSettings = { ...versioningSettings, ...restSettings };
                            console.log(`Versioning permission missing for ${drive.name}`);
                        } else {
                            versioningSettings = {
                                enabled: restSettings.enabled,
                                minorEnabled: restSettings.minorEnabled,
                                majorLimit: restSettings.majorLimit,
                                minorLimit: restSettings.minorLimit,
                                forceCheckout: restSettings.forceCheckout,
                                isDefault: false,
                                source: restSettings.source
                            };
                            console.log(`✓ Versioning (${restSettings.source}) for ${drive.name}:`, versioningSettings);
                        }
                    } else {
                        // REST attempts failed, try Graph inference
                        try {
                            const inferred = await this.getLibraryVersioningFromGraph(drive.id);
                            if (inferred) {
                                versioningSettings = { ...versioningSettings, ...inferred, isDefault: false };
                                console.log(`✓ Versioning (Graph inferred) for ${drive.name}:`, versioningSettings);
                            } else {
                                console.log(`Using default versioning for ${drive.name}`);
                            }
                        } catch (infErr) {
                            console.log(`Graph inference failed for ${drive.name}:`, infErr.message);
                        }
                    }
                } catch (e) {
                    console.log(`Per-library REST attempts failed for ${drive.name}:`, e.message);
                }

                // Resolve list GUID and webId for use in updates and UI links
                let listGuidForUpdate = null;
                let webIdForUI = null;
                try {
                    const meta = await this.graphClient.api(`/drives/${drive.id}`).select('sharepointIds').get();
                    listGuidForUpdate = meta?.sharepointIds?.listId ? meta.sharepointIds.listId.replace(/[{}]/g,'') : null;
                    webIdForUI = meta?.sharepointIds?.webId ? meta.sharepointIds.webId.replace(/[{}]/g,'') : null;
                    
                    // Fallback: try to get list via SharePoint site if listId is null
                    if (!listGuidForUpdate) {
                        try {
                            console.log(`Attempting fallback list lookup for ${drive.name} using site ID from function parameter`);
                            const listsResponse = await this.graphClient
                                .api(`/sites/${siteId}/lists`)
                                .select('id,displayName,webUrl')
                                .get();
                            
                            console.log(`Found ${listsResponse.value.length} lists on site, matching against drive: ${drive.name}, webUrl: ${drive.webUrl}`);
                            
                            // Match by webUrl or name
                            const matchingList = listsResponse.value.find(list => {
                                const urlMatch = list.webUrl === drive.webUrl;
                                const nameMatch = list.displayName === drive.name;
                                const partialMatch = drive.webUrl && list.webUrl && drive.webUrl.includes(list.displayName);
                                console.log(`  Checking list "${list.displayName}": urlMatch=${urlMatch}, nameMatch=${nameMatch}, partialMatch=${partialMatch}`);
                                return urlMatch || nameMatch || partialMatch;
                            });
                            
                            if (matchingList) {
                                listGuidForUpdate = matchingList.id.replace(/[{}]/g,'');
                                console.log(`✓ Found list GUID via fallback for ${drive.name}: ${listGuidForUpdate}`);
                            } else {
                                console.log(`✗ No matching list found for ${drive.name}`);
                            }
                        } catch (fallbackErr) {
                            console.log(`Fallback list lookup failed for ${drive.name}:`, fallbackErr.message);
                        }
                    }
                    
                    console.log(`Drive ${drive.name}: listId=${listGuidForUpdate}, webId=${webIdForUI}`);
                } catch (e) {
                    console.log('Could not resolve list GUID for update:', drive.id, e.message);
                }
                return {
                    id: drive.id,
                    name: drive.name,
                    driveType: drive.driveType,
                    webUrl: drive.webUrl,
                    listId: listGuidForUpdate,
                    webId: webIdForUI,
                    versioning: versioningSettings
                };
            }));

            return enrichedLibraries;
        } catch (error) {
            console.error('Error fetching document libraries:', error);
            throw error;
        }
    };

    // Update versioning settings for a library via REST API (requires proper SharePoint delegated token)
    updateLibraryVersioningSettings = async (siteUrl, listId, settings = {}) => {
        const {
            enabled,
            minorEnabled,
            majorLimit,
            minorLimit,
            forceCheckout,
            automatic
        } = settings;
        if (!listId) throw new Error('List ID is required for updating versioning settings');
        const cleanListId = listId.replace(/[{}]/g,'');
        const restUrl = `${siteUrl}/_api/web/lists(guid'${cleanListId}')`;
        const tokenForRest = this.sharePointRestToken || this.accessToken;
        if (!this.sharePointRestToken) {
            console.log('Updating with Graph token (may fail if missing SharePoint resource scope)');
        }
        const body = {
            __metadata: { type: 'SP.List' }
        };
        if (enabled !== undefined) body.EnableVersioning = !!enabled;
        if (minorEnabled !== undefined) body.EnableMinorVersions = !!minorEnabled;
        // If automatic is true, set to 0 (Microsoft-managed), otherwise use provided limit (min 100)
        if (automatic === true) {
            body.MajorVersionLimit = 0;
        } else if (majorLimit !== undefined) {
            body.MajorVersionLimit = Number(majorLimit);
        }
        if (minorLimit !== undefined) body.MajorWithMinorVersionsLimit = Number(minorLimit);
        if (forceCheckout !== undefined) body.ForceCheckout = !!forceCheckout;
        try {
            await axios.post(restUrl, body, {
                headers: {
                    'Authorization': `Bearer ${tokenForRest}`,
                    'Accept': 'application/json;odata=nometadata',
                    'Content-Type': 'application/json;odata=verbose',
                    'IF-MATCH': '*',
                    'X-HTTP-Method': 'MERGE'
                },
                timeout: 8000
            });
            // Return fresh settings
            const updated = await this.getLibraryVersioningSettings(siteUrl, cleanListId);
            return updated || { source: 'unknown' };
        } catch (error) {
            const status = error.response?.status || error.code;
            const snippet = typeof error.response?.data === 'string' ? error.response.data.substring(0,200) : JSON.stringify(error.response?.data || {}).substring(0,200);
            console.log(`Update versioning failed (${status}) listId=${listId}:`, error.message);
            if (snippet && snippet !== '{}') console.log('Update error body snippet:', snippet);
            if (status === 401 || status === 403) {
                throw new Error('Permission denied updating versioning (missing AllSites.FullControl or admin consent)');
            }
            throw new Error(`Failed to update versioning settings: ${error.message}`);
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
            let usingCache = false;
            if (this.siteScanCache.has(cacheKey)) {
                const cached = this.siteScanCache.get(cacheKey);
                if (now - cached.timestamp < this.scanCacheTimeout) {
                    console.log(`Using cached scan data for site ${siteId} (${Math.round((now - cached.timestamp) / 1000)}s old)`);
                    scanData = cached.data;
                    usingCache = true;
                    
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
                        progressCallback.onFolderProcessing('Using cached scan data - recalculating versions...', {
                            filesProcessed: 0,
                            versionsToRemove: 0
                        });
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
                
                // CPU throttling: Add delay between batches to limit CPU usage to ~5%
                // Process for ~50ms, then idle for ~950ms = 5% CPU usage
                const BATCH_WORK_TIME = 50; // ms of work
                const BATCH_IDLE_TIME = 950; // ms of idle
                let batchStartTime = Date.now();
                
                const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
                    while (index < items.length && !checkCancelled()) {
                        const current = items[index++];
                        
                        // CPU throttling: Check if we've been working too long
                        const elapsedWorkTime = Date.now() - batchStartTime;
                        if (elapsedWorkTime >= BATCH_WORK_TIME) {
                            // Pause to limit CPU usage
                            await new Promise(resolve => setTimeout(resolve, BATCH_IDLE_TIME));
                            batchStartTime = Date.now();
                        }
                        
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
                    progressCallback.onFolderProcessing(`Scanning: ${displayPath}`, {
                        filesProcessed: 0,
                        versionsToRemove: 0
                    });
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
                        progressCallback.onFolderProcessing(`Scanning ${displayPath} (${totalFetched} items, page ${pageCount})`, {
                            filesProcessed: 0,
                            versionsToRemove: 0
                        });
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
                        progressCallback.onFolderProcessing(folderPath, {
                            filesProcessed: totalFiles,
                            versionsToRemove: versionsToRemove
                        });
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
                            progressCallback.onFolderProcessing(`${folderPath} (${fileItems.length} files, ${folderItems.length} folders)`, {
                                filesProcessed: totalFiles,
                                versionsToRemove: versionsToRemove
                            });
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
                            
                            // Don't log if cancelled
                            if (!checkCancelled()) {
                                console.log(`Processing ${itemPath} - ${numVersions} versions found (dry run: ${dryRun})`); // Debug logging
                            }

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
                            // Suppress timeout errors after cancellation
                            if (!checkCancelled()) {
                                console.warn(`Error processing item ${item?.name || 'unknown'}:`, itemError?.message || itemError);
                            }
                        }
                    }, 8);

                    await runWithConcurrency(folderItems, async (sub) => {
                        if (checkCancelled()) return;
                        if (progressCallback?.onFolderProcessing) {
                            progressCallback.onFolderProcessing(`${folderPath}/${sub.name}`, {
                                filesProcessed: totalFiles,
                                versionsToRemove: versionsToRemove
                            });
                        }
                        await processFolder(driveId, sub.id, `${folderPath}/${sub.name}`);
                    }, 4);
                    
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    if (!checkCancelled()) {
                        console.log(`[DONE] Processed ${folderPath} in ${elapsed}s (${fileItems.length} files)`);
                    }
                } catch (folderError) {
                    // Suppress errors after cancellation
                    if (!checkCancelled()) {
                        console.error(`[ERROR] Failed to process folder ${folderPath}:`, folderError.message);
                    }
                }
            };

            // Variables for library tracking
            const totalLibraries = scanData.libraries.length;
            let processedLibraries = 0;

            // If using cached data, recalculate counters by going through cached items
            if (usingCache && scanData.items && scanData.itemVersions) {
                console.log('[CACHE] Recalculating counters from cached data...');
                
                for (const [folderKey, folderData] of Object.entries(scanData.items)) {
                    if (checkCancelled()) {
                        isCancelled = true;
                        break;
                    }
                    
                    const folderPath = folderKey.split(':')[1] || 'unknown';
                    const libraryName = folderPath.split('/')[0];
                    
                    // Initialize library details if not exists
                    if (!details[libraryName]) {
                        details[libraryName] = {
                            totalFiles: 0,
                            totalVersions: 0,
                            versionsToRemove: 0,
                            storageSavingsBytes: 0,
                            files: []
                        };
                    }
                    
                    // Send progress event
                    if (progressCallback?.onFolderProcessing) {
                        progressCallback.onFolderProcessing(folderPath, {
                            filesProcessed: totalFiles,
                            versionsToRemove: versionsToRemove
                        });
                    }
                    
                    // Process cached files
                    for (const file of folderData.files || []) {
                        const driveId = folderKey.split(':')[0];
                        const versionCacheKey = `${driveId}:${file.id}`;
                        const versions = scanData.itemVersions[versionCacheKey];
                        
                        if (versions && versions.length > 0) {
                            totalFiles++;
                            totalVersions += versions.length;
                            details[libraryName].totalFiles++;
                            details[libraryName].totalVersions += versions.length;
                            
                            const toRemove = Math.max(0, versions.length - versionsToKeep);
                            if (toRemove > 0) {
                                versionsToRemove += toRemove;
                                details[libraryName].versionsToRemove += toRemove;
                                
                                const versionsToDelete = versions.slice(0, toRemove);
                                let fileStorageSavings = 0;
                                for (const v of versionsToDelete) {
                                    const vSize = v.size || 0;
                                    totalStorageSavingsBytes += vSize;
                                    fileStorageSavings += vSize;
                                }
                                details[libraryName].storageSavingsBytes += fileStorageSavings;
                                
                                details[libraryName].files.push({
                                    name: file.name,
                                    path: folderPath,
                                    totalVersions: versions.length,
                                    versionsToRemove: toRemove,
                                    storageSavings: this.formatFileSize(fileStorageSavings)
                                });
                            }
                        }
                    }
                }
                
                console.log(`[CACHE] Recalculation complete: ${totalFiles} files, ${versionsToRemove} versions to remove`);
                
                // Set processedLibraries to total since we processed all from cache
                processedLibraries = totalLibraries;
            } else {
                // Process all libraries and their contents recursively (normal flow)
                for (const library of scanData.libraries) {
                    // Check cancellation status before each library
                    if (checkCancelled()) {
                        console.log('[CANCELLED] Stopping cleanup - no new libraries will be processed');
                        break;
                    }

                    if (this.shouldSkipLibrary(library.name)) {
                        console.log(`[SKIP] Library: ${library.name} (matches skip pattern)`);
                        continue;
                    }
                    
                    processedLibraries++;
                    console.log(`\n[LIBRARY ${processedLibraries}/${totalLibraries}] Processing: ${library.name}`);
                    
                    if (progressCallback?.onFolderProcessing) {
                        progressCallback.onFolderProcessing(`[${processedLibraries}/${totalLibraries}] ${library.name}`, {
                            filesProcessed: totalFiles,
                            versionsToRemove: versionsToRemove
                        });
                    }
                    
                    try {
                        await processFolder(library.id, 'root', library.name);
                        if (!checkCancelled()) {
                            console.log(`[LIBRARY ${processedLibraries}/${totalLibraries}] ✓ Completed: ${library.name}`);
                        }
                    } catch (libraryError) {
                        // Suppress errors after cancellation
                        if (!checkCancelled()) {
                            console.error(`[LIBRARY ${processedLibraries}/${totalLibraries}] ✗ Error in ${library.name}:`, libraryError.message);
                        }
                        continue;
                    }
                }
            }
            
            if (isCancelled) {
                console.log('\n' + '='.repeat(60));
                console.log('[CANCELLED] Bulk cleanup process was cancelled by user');
                console.log('[INFO] Timeout errors after cancellation are normal and can be ignored');
                console.log('[INFO] Active Graph API requests will complete, but no new work started');
                console.log('='.repeat(60) + '\n');
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

    // Get storage report from Microsoft Reports API
    async getStorageReport(period = 'D7') {
        try {
            console.log(`Fetching storage report for period: ${period}`);
            // Microsoft Reports API endpoint
            const endpoint = `/reports/getSharePointSiteUsageStorage(period='${period}')`;
            const response = await this.graphClient.api(endpoint).get();
            
            console.log('Storage report response type:', typeof response);
            console.log('Storage report response keys:', Object.keys(response || {}).slice(0, 5));
            
            // Check if response is string (CSV) or already parsed
            let csvContent = typeof response === 'string' ? response : '';
            
            // If response is an object, it might be wrapped
            if (typeof response === 'object' && response.value) {
                // Some Graph API responses wrap the CSV in a value property
                csvContent = response.value;
            } else if (typeof response === 'object') {
                // Log the actual structure for debugging
                console.log('Unexpected response format. Sample:', JSON.stringify(response).substring(0, 200));
                // Try to extract if it's a ReadableStream or other format
                if (response.constructor && response.constructor.name === 'ReadableStream') {
                    console.log('Response is ReadableStream - reading stream...');
                    const reader = response.getReader();
                    const chunks = [];
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        chunks.push(value);
                    }
                    const decoder = new TextDecoder();
                    csvContent = chunks.map(chunk => decoder.decode(chunk)).join('');
                    console.log('CSV from stream (first 200 chars):', csvContent.substring(0, 200));
                } else {
                    console.warn('Reports API returned object format - may need app-only permissions for full data');
                    return { labels: [], data: [], error: 'Unexpected response format' };
                }
            }
            
            if (!csvContent) {
                console.warn('No CSV content extracted from response');
                return { labels: [], data: [], error: 'No CSV content' };
            }
            
            console.log('CSV content (first 300 chars):', csvContent.substring(0, 300));
            
            // Parse CSV response - handle both \r\n and \n line endings
            const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
            console.log(`CSV has ${lines.length} lines`);
            
            if (lines.length < 2) {
                console.warn('CSV has insufficient lines');
                return { labels: [], data: [], error: 'Insufficient CSV lines' };
            }
            
            // Split header line and clean up
            const headers = lines[0].split(',').map(h => h.trim().replace(/\r/g, ''));
            console.log('CSV headers:', headers);
            
            // Look for "Report Date" column (the actual date of the data point)
            // NOT "Report Period" (just the number like "30" or "90")
            // NOT "Report Refresh Date" (when the report was generated)
            let dateIndex = headers.findIndex(h => h === 'Report Date');
            if (dateIndex === -1) {
                // Fallback to any column with "Date" but not "Period" or "Refresh"
                dateIndex = headers.findIndex(h => 
                    h.toLowerCase().includes('date') && 
                    !h.toLowerCase().includes('refresh') &&
                    !h.toLowerCase().includes('period')
                );
            }
            const storageIndex = headers.findIndex(h => h.toLowerCase().includes('storage') && h.toLowerCase().includes('byte'));
            
            console.log(`Date column index: ${dateIndex} (${headers[dateIndex]}), Storage column index: ${storageIndex} (${headers[storageIndex]})`);
            
            if (dateIndex === -1 || storageIndex === -1) {
                console.warn('Could not find date or storage columns in CSV headers');
                return { labels: [], data: [], error: 'Missing required CSV columns' };
            }
            
            const data = [];
            const labels = [];
            
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const values = lines[i].split(',').map(v => v.trim().replace(/\r/g, ''));
                if (values.length > Math.max(dateIndex, storageIndex)) {
                    const rawDate = values[dateIndex];
                    const rawStorage = values[storageIndex];
                    
                    // Debug first 3 rows
                    if (i <= 3) {
                        console.log(`Row ${i}: Date="${rawDate}", Storage="${rawStorage}"`);
                    }
                    
                    // Skip rows with empty or invalid dates
                    if (!rawDate || rawDate === '' || rawDate.length < 5) {
                        console.log(`Skipping row ${i} - invalid date: "${rawDate}"`);
                        continue;
                    }
                    
                    // Format date to DD/MM/YYYY for better readability
                    let formattedDate = rawDate;
                    try {
                        const dateObj = new Date(rawDate);
                        if (!isNaN(dateObj.getTime()) && dateObj.getFullYear() > 2000) {
                            formattedDate = dateObj.toLocaleDateString('nl-NL', { 
                                day: '2-digit', 
                                month: '2-digit', 
                                year: 'numeric' 
                            });
                        } else {
                            console.log(`Invalid date object for "${rawDate}": year=${dateObj.getFullYear()}, using raw date`);
                            // Use raw date if year is invalid, but don't skip
                            formattedDate = rawDate;
                        }
                    } catch (e) {
                        console.log(`Error parsing date "${rawDate}":`, e.message, '- using raw date');
                        // Use raw date if parsing fails
                        formattedDate = rawDate;
                    }
                    labels.push(formattedDate);
                    // Convert bytes to GB
                    const bytes = parseInt(rawStorage) || 0;
                    data.push((bytes / (1024 * 1024 * 1024)).toFixed(2));
                }
            }
            
            console.log(`Parsed ${data.length} data points from CSV`);
            console.log('First 3 labels:', labels.slice(0, 3));
            console.log('First 3 data points (GB):', data.slice(0, 3));
            console.log('Last 3 labels:', labels.slice(-3));
            console.log('Last 3 data points (GB):', data.slice(-3));
            return { labels, data };
        } catch (error) {
            console.error('Storage report error:', error.message, error.stack);
            // Return error info for frontend debugging
            return { labels: [], data: [], error: error.message };
        }
    }

    // Get libraries (document libraries) for a site
    async getLibraries(siteId) {
        try {
            console.log(`Getting libraries for site: ${siteId}`);
            
            const lists = await this.graphClient
                .api(`/sites/${siteId}/lists`)
                .filter('list/template eq "documentLibrary"')
                .select('id,displayName,name,webUrl,createdDateTime')
                .get();
            
            console.log(`Found ${lists.value.length} document libraries`);
            
            const libraries = [];
            const siteUrl = await this.getSiteUrl(siteId);
            
            for (const list of lists.value) {
                console.log(`\n=== Processing library: ${list.displayName} ===`);
                
                // Try multiple REST API endpoints
                let libraryData = null;
                
                // Method 1: Direct list endpoint with select
                try {
                    const restUrl = `${siteUrl}/_api/web/lists(guid'${list.id}')?$select=EnableVersioning,MajorVersionLimit,EnableMinorVersions,MajorWithMinorVersionsLimit,Title`;
                    console.log(`Method 1 - Trying: ${restUrl}`);
                    
                    const response = await axios.get(restUrl, {
                        headers: {
                            'Authorization': `Bearer ${this.accessToken}`,
                            'Accept': 'application/json;odata=nometadata'
                        },
                        timeout: 10000
                    });
                    
                    libraryData = response.data;
                    console.log(`✓ Method 1 SUCCESS - Response:`, JSON.stringify(libraryData, null, 2));
                } catch (error1) {
                    console.log(`✗ Method 1 failed:`, error1.response?.status, error1.message);
                    
                    // Method 2: Try with odata=verbose
                    try {
                        const restUrl = `${siteUrl}/_api/web/lists(guid'${list.id}')`;
                        console.log(`Method 2 - Trying verbose: ${restUrl}`);
                        
                        const response = await axios.get(restUrl, {
                            headers: {
                                'Authorization': `Bearer ${this.accessToken}`,
                                'Accept': 'application/json;odata=verbose'
                            },
                            timeout: 10000
                        });
                        
                        libraryData = response.data.d;
                        console.log(`✓ Method 2 SUCCESS - Response:`, JSON.stringify(libraryData, null, 2));
                    } catch (error2) {
                        console.log(`✗ Method 2 failed:`, error2.response?.status, error2.message);
                        console.log(`Error details:`, error2.response?.data);
                    }
                }
                
                if (libraryData) {
                    libraries.push({
                        id: list.id,
                        name: list.displayName || list.name,
                        versioningEnabled: libraryData.EnableVersioning || false,
                        majorVersionLimit: libraryData.MajorVersionLimit || 500,
                        enableMinorVersions: libraryData.EnableMinorVersions || false,
                        majorWithMinorVersionsLimit: libraryData.MajorWithMinorVersionsLimit || 0,
                        source: 'REST API'
                    });
                    console.log(`Added library with REST data: Versioning=${libraryData.EnableVersioning}, Limit=${libraryData.MajorVersionLimit}`);
                } else {
                    // Fallback to estimated values
                    console.log(`Using fallback (estimated) values for ${list.displayName}`);
                    libraries.push({
                        id: list.id,
                        name: list.displayName || list.name,
                        versioningEnabled: true,  // Most libraries have versioning enabled
                        majorVersionLimit: 500,
                        enableMinorVersions: false,
                        majorWithMinorVersionsLimit: 0,
                        source: 'Estimated (REST API unavailable)',
                        warning: 'Could not retrieve actual versioning settings from SharePoint REST API'
                    });
                }
            }
            
            console.log(`\nReturning ${libraries.length} libraries with versioning info`);
            return libraries;
        } catch (error) {
            console.error('Error fetching libraries:', error);
            throw error;
        }
    }

    // Get site URL from site ID
    async getSiteUrl(siteId) {
        try {
            const site = await this.graphClient.api(`/sites/${siteId}`).get();
            return site.webUrl;
        } catch (error) {
            console.error('Error getting site URL:', error);
            throw error;
        }
    }

    // Get tenant storage quota from SharePoint Admin Center API
    async getTenantStorageQuota() {
        try {
            // Get root site to determine tenant admin URL
            const rootSite = await this.graphClient.api('/sites/root').get();
            const tenantUrl = rootSite.webUrl; // e.g., https://contoso.sharepoint.com
            const adminUrl = tenantUrl.replace('.sharepoint.com', '-admin.sharepoint.com');
            
            // SharePoint Admin Center API endpoint
            const apiUrl = `${adminUrl}/_api/SPOStorage/GetTenantStorageMetrics`;
            
            // Note: This requires SharePoint Admin permissions - will fail for delegated user tokens
            const response = await axios.get(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json;odata=verbose'
                },
                timeout: 5000 // Quick timeout since this often fails
            });
            
            const data = response.data.d;
            
            return {
                TotalTenantStorage: data.TotalTenantStorage,
                CurrentUsage: data.CurrentUsage,
                StorageQuota: data.StorageQuota,
                StorageQuotaUsed: data.StorageQuotaUsed,
                StorageQuotaAllocated: data.StorageQuotaAllocated
            };
        } catch (error) {
            // Expected to fail for non-admin delegated permissions - this is normal
            // Don't log as error to avoid confusion
            return null;
        }
    }

    // Update versioning settings for multiple libraries
    async updateVersioningSettings(siteId, libraries) {
        // IMPORTANT: SharePoint versioning settings can only be updated via SharePoint REST API,
        // which requires a SharePoint-scoped token (not Graph-scoped).
        // Microsoft Graph API does NOT support updating versioning settings.
        // 
        // Options for users:
        // 1. Use SharePoint UI: Site Settings → Library Settings → Versioning settings
        // 2. Use SharePoint PowerShell PnP module with appropriate permissions
        // 3. Request SharePoint Administrator access for direct REST API calls
        
        const results = [];
        
        for (const lib of libraries) {
            results.push({
                libraryId: lib.libraryId,
                success: false,
                error: 'Versioning settings can only be updated via SharePoint UI or PowerShell.\n\nSteps:\n1. Go to SharePoint site\n2. Open library settings\n3. Click "Versioning settings"\n4. Set major versions limit\n\nTechnical: Requires SharePoint-scoped token, not Graph API token.'
            });
        }
        
        return results;
    }

}

module.exports = SharePointService;