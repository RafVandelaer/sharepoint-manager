const { Client } = require('@microsoft/microsoft-graph-client');

class OptimizedSharePointService {
    constructor(accessToken) {
        this.graphClient = Client.init({
            authProvider: (done) => {
                done(null, accessToken);
            },
            debugLogging: true
        });
        this.accessToken = accessToken;
        
        // Configuration
        this.batchSize = 50;
        this.maxConcurrent = 3;
        this.requestDelay = 50;
        this.lastRequestTime = 0;
    }

    async throttleRequest() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.requestDelay) {
            const delay = this.requestDelay - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        this.lastRequestTime = Date.now();
    }

    async getDocumentLibraries(siteId) {
        try {
            const libraries = await this.graphClient.api(`/sites/${siteId}/drives`)
                .select('id,name,driveType,owner,quota')
                .get();
            return libraries.value || [];
        } catch (error) {
            console.error('Error fetching libraries:', error);
            throw error;
        }
    }

    async processLibraryItems(library, folderPath, progressCallback) {
        const items = { value: [] };
        
        try {
            // Get root items first
            items.value = (await this.graphClient.api(`/drives/${library.id}/root/children`)
                .select('id,name,size,lastModifiedDateTime,file,folder,parentReference')
                .top(100)
                .get()).value || [];
                
            if (progressCallback?.onFolderProcessing) {
                progressCallback.onFolderProcessing(folderPath || library.name);
            }
                
            // Process folders recursively but with controlled concurrency
            const folders = items.value.filter(item => item.folder);
            const processed = new Set();
            
            const processFolderQueue = async (folders, currentPath, depth = 1) => {
                if (depth > 20) return; // Safety limit
                
                const batchPromises = [];
                for (const folder of folders) {
                    if (processed.has(folder.id)) continue;
                    processed.add(folder.id);
                    
                    const promise = (async () => {
                        try {
                            await this.throttleRequest();
                            const folderItems = await this.graphClient.api(`/drives/${library.id}/items/${folder.id}/children`)
                                .select('id,name,size,lastModifiedDateTime,file,folder,parentReference')
                                .top(100)
                                .get();
                                
                            const itemsWithPath = (folderItems.value || []).map(item => ({
                                ...item,
                                fullPath: `${currentPath}/${item.name}`
                            }));
                            
                            const subFolders = itemsWithPath.filter(item => item.folder);
                            items.value.push(...itemsWithPath);
                            
                            if (progressCallback?.onFolderProcessing) {
                                progressCallback.onFolderProcessing(`${currentPath}/${folder.name}`);
                            }
                            
                            if (subFolders.length > 0) {
                                await processFolderQueue(subFolders, `${currentPath}/${folder.name}`, depth + 1);
                            }
                        } catch (e) {
                            console.warn(`Error processing folder: ${e.message}`);
                        }
                    })();
                    
                    batchPromises.push(promise);
                    if (batchPromises.length >= this.maxConcurrent) {
                        await Promise.all(batchPromises);
                        batchPromises.length = 0;
                    }
                }
                
                if (batchPromises.length > 0) {
                    await Promise.all(batchPromises);
                }
            };
            
            await processFolderQueue(folders, library.name);
            
        } catch (e) {
            console.warn(`Error scanning library ${library.name}: ${e.message}`);
        }
        
        const files = items.value.filter(item => item.file);
        return files;
    }

    async* generateSiteFiles(siteId, progressCallback = null) {
        try {
            console.log(`Starting optimized file generation for site: ${siteId}`);
            
            const libraries = await this.getDocumentLibraries(siteId);
            console.log(`Processing ${libraries.length} libraries...`);
            
            let totalFiles = 0;
            let totalProcessed = 0;
            
            for (const library of libraries) {
                if (progressCallback?.isCancelled?.()) {
                    console.log('File generation cancelled');
                    return;
                }
                
                try {
                    const files = await this.processLibraryItems(library, null, progressCallback);
                    console.log(`Found ${files.length} files in library ${library.name}`);
                    
                    // Process files in batches to avoid memory issues
                    for (let i = 0; i < files.length; i += this.batchSize) {
                        if (progressCallback?.isCancelled?.()) return;
                        
                        const batch = files.slice(i, i + this.batchSize);
                        const processedBatch = batch.map(file => ({
                            id: file.id,
                            name: file.name,
                            size: file.size,
                            modified: file.lastModifiedDateTime,
                            path: file.fullPath || `${library.name}/${file.name}`,
                            library: library.name,
                            driveId: library.id,
                            versions: [{
                                id: 'current',
                                label: 'Huidige versie',
                                date: new Date(file.lastModifiedDateTime).toLocaleString('nl-NL'),
                                size: file.size
                            }]
                        }));
                        
                        totalProcessed += processedBatch.length;
                        
                        if (progressCallback?.onProgress) {
                            progressCallback.onProgress({
                                totalFiles: totalFiles,
                                processedFiles: totalProcessed,
                                currentLibrary: library.name
                            });
                        }
                        
                        if (progressCallback?.onBatchComplete) {
                            progressCallback.onBatchComplete(processedBatch);
                        }
                        
                        yield processedBatch;
                    }
                    
                } catch (libraryError) {
                    console.error(`Error processing library ${library.name}:`, libraryError);
                }
            }
            
            console.log(`Completed file generation, processed ${totalProcessed} files`);
            
        } catch (error) {
            console.error('Error in file generation:', error);
            throw error;
        }
    }
}

module.exports = OptimizedSharePointService;