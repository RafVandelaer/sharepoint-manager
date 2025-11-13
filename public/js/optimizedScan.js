// Optimized cleanup state management
let state = {
    scanning: false,
    files: [],
    stats: {
        totalFiles: 0,
        totalVersions: 0,
        startTime: null,
        endTime: null
    },
    currentFolder: '',
    error: null
};

// Event source voor streaming updates
let eventSource = null;

export function startOptimizedScan(siteId, callbacks = {}) {
    if (state.scanning) {
        console.warn('Scan already in progress');
        return;
    }
    
    state = {
        scanning: true,
        files: [],
        stats: {
            totalFiles: 0,
            totalVersions: 0,
            startTime: Date.now(),
            endTime: null
        },
        currentFolder: '',
        error: null
    };
    
    const sessionId = localStorage.getItem('sessionId');
    const url = `/api/sharepoint/sites/${siteId}/files?sessionId=${sessionId}`;
    
    eventSource = new EventSource(url);
    
    // Event handlers
    eventSource.addEventListener('progress', (e) => {
        const data = JSON.parse(e.data);
        state.stats = {
            ...state.stats,
            ...data,
            endTime: Date.now()
        };
        callbacks.onProgress?.(state.stats);
    });
    
    eventSource.addEventListener('folder', (e) => {
        const data = JSON.parse(e.data);
        state.currentFolder = data.path;
        callbacks.onFolderChange?.(data.path);
    });
    
    eventSource.addEventListener('batch', (e) => {
        const data = JSON.parse(e.data);
        state.files.push(...data.files);
        callbacks.onBatchReceived?.(data.files);
    });
    
    eventSource.addEventListener('complete', (e) => {
        const data = JSON.parse(e.data);
        state.scanning = false;
        state.stats.endTime = Date.now();
        callbacks.onComplete?.(state.stats);
        eventSource.close();
    });
    
    eventSource.addEventListener('error', (e) => {
        const data = e.data ? JSON.parse(e.data) : { error: 'Unknown error' };
        state.error = data.error;
        state.scanning = false;
        callbacks.onError?.(data);
        eventSource.close();
    });
    
    eventSource.onerror = (error) => {
        console.error('EventSource failed:', error);
        state.scanning = false;
        state.error = 'Connection lost';
        callbacks.onError?.({ error: 'Connection lost' });
        eventSource.close();
    };
}

export function cancelScan() {
    if (eventSource) {
        eventSource.close();
        state.scanning = false;
    }
}

export function getCurrentState() {
    return { ...state };
}