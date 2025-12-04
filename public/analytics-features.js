// ===== DARK MODE & NEW FEATURES JAVASCRIPT =====

// Security: HTML escaping utility to prevent XSS attacks
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Global state for new features
let failedSites = [];
let etaTracker = {
    startTime: null,
    processedCount: 0,
    totalCount: 0,
    averageTimePerSite: 0
};
let networkReconnectAttempts = 0;
let maxReconnectAttempts = 5;

// ===== DARK MODE =====
function toggleDarkMode() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Keep consistent moon icon; adjust data attribute for CSS color shift
    const icon = document.querySelector('#darkModeToggle i');
    if (icon) {
        icon.classList.add('persistent-moon');
    }
    
    // Force page reload to rebuild charts with correct colors
    // This is more reliable than trying to update Chart.js legend labels dynamically
    window.location.reload();
}

function initializeDarkMode() {
    // Migrate old themePref to new theme key (backwards compatibility)
    const oldThemePref = localStorage.getItem('themePref');
    if (oldThemePref && !localStorage.getItem('theme')) {
        localStorage.setItem('theme', oldThemePref);
        localStorage.removeItem('themePref');
    }
    
    const savedTheme = localStorage.getItem('theme');
    let theme;
    if (!savedTheme) {
        // Respect system preference if user has not explicitly chosen
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        theme = prefersDark ? 'dark' : 'light';
    } else {
        theme = savedTheme;
    }
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.querySelector('#darkModeToggle i');
    if (icon) {
        icon.className = 'fas fa-moon persistent-moon';
    }
    updateChartsForTheme(theme);
    // Live react to system preference changes if user hasn't overridden
    if (window.matchMedia) {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        try {
            media.addEventListener('change', (e) => {
                if (!localStorage.getItem('theme')) { // only auto-switch if user has not chosen manually
                    const newTheme = e.matches ? 'dark' : 'light';
                    document.documentElement.setAttribute('data-theme', newTheme);
                    if (icon) icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
                    updateChartsForTheme(newTheme);
                }
            });
        } catch {
            // Fallback for older browsers
            media.addListener((e) => {
                if (!localStorage.getItem('theme')) {
                    const newTheme = e.matches ? 'dark' : 'light';
                    document.documentElement.setAttribute('data-theme', newTheme);
                    if (icon) icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
                    updateChartsForTheme(newTheme);
                }
            });
        }
    }
}

function updateChartsForTheme(theme) {
    const isDark = theme === 'dark';
    const textColor = isDark ? '#f1f5f9' : '#1a202c';
    const gridColor = isDark ? '#334155' : '#e2e8f0';
    const tooltipBg = isDark ? 'rgba(30,41,59,0.92)' : '#ffffff';
    const tooltipBorder = isDark ? '#475569' : '#e2e8f0';

    // Global defaults (Chart.js v4)
    if (window.Chart) {
        Chart.defaults.color = textColor;
        Chart.defaults.borderColor = gridColor;
        Chart.defaults.font.family = 'system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,sans-serif';
        if (Chart.defaults.plugins && Chart.defaults.plugins.tooltip) {
            Chart.defaults.plugins.tooltip.backgroundColor = tooltipBg;
            Chart.defaults.plugins.tooltip.titleColor = textColor;
            Chart.defaults.plugins.tooltip.bodyColor = textColor;
            Chart.defaults.plugins.tooltip.borderColor = tooltipBorder;
            Chart.defaults.plugins.tooltip.borderWidth = 1;
        }
        if (Chart.defaults.plugins && Chart.defaults.plugins.legend) {
            Chart.defaults.plugins.legend.labels = Chart.defaults.plugins.legend.labels || {};
            Chart.defaults.plugins.legend.labels.color = textColor;
        }
    }

    const updateCommon = (chart) => {
        if (!chart || !chart.options) return;
        if (chart.options.plugins?.legend?.labels) {
            chart.options.plugins.legend.labels.color = textColor;
        }
        if (chart.options.scales) {
            Object.values(chart.options.scales).forEach(scale => {
                if (scale.ticks) scale.ticks.color = textColor;
                if (scale.grid) scale.grid.color = gridColor;
                if (scale.title) scale.title.color = textColor;
            });
        }
        // Update plugin title/subtitle colors if they exist
        if (chart.options.plugins?.title) {
            chart.options.plugins.title.color = textColor;
        }
        if (chart.options.plugins?.subtitle) {
            chart.options.plugins.subtitle.color = isDark ? '#94a3b8' : '#718096';
        }
        // Dataset color adjustments for better dark/light contrast + multi-hue palettes
        if (chart.data && Array.isArray(chart.data.datasets)) {
            chart.data.datasets.forEach(ds => {
                if (ds.type === 'bar' || chart.config.type === 'bar') {
                    const lightBarPalette = ['#6366f1','#818cf8','#a5b4fc','#60a5fa','#38bdf8','#34d399','#fbbf24','#f87171'];
                    const darkBarPalette  = ['#818cf8','#6366f1','#4f46e5','#7c3aed','#0ea5e9','#10b981','#fbbf24','#f87171'];
                    if (Array.isArray(ds.data)) {
                        const palette = isDark ? darkBarPalette : lightBarPalette;
                        ds.backgroundColor = ds.data.map((_, i) => palette[i % palette.length]);
                        ds.borderColor = ds.backgroundColor.map(c => c);
                    } else {
                        // Fallback single color if data not array
                        ds.backgroundColor = isDark ? 'rgba(129,140,248,0.75)' : 'rgba(102,126,234,0.8)';
                        ds.borderColor = isDark ? 'rgba(129,140,248,1)' : 'rgba(102,126,234,1)';
                    }
                } else if (chart.config.type === 'line') {
                    if (isDark) {
                        ds.borderColor = 'rgba(99,102,241,1)';
                        ds.backgroundColor = 'rgba(99,102,241,0.15)';
                    } else {
                        ds.borderColor = 'rgba(102,126,234,1)';
                        ds.backgroundColor = 'rgba(102,126,234,0.1)';
                    }
                } else if (chart.config.type === 'doughnut' || chart.config.type === 'pie') {
                    if (isDark) {
                        // Re-map with slightly brighter palette for dark
                        const palette = ['#10b981','#fbbf24','#f87171'];
                        ds.backgroundColor = palette.map(c => c + 'CC');
                        ds.borderColor = '#1e293b'; // Dark background color for borders
                        ds.borderWidth = 2;
                    } else {
                        ds.backgroundColor = [
                            'rgba(72, 187, 120, 0.8)',
                            'rgba(237, 137, 54, 0.8)',
                            'rgba(245, 101, 101, 0.8)'
                        ];
                        ds.borderColor = '#ffffff';
                        ds.borderWidth = 2;
                    }
                }
            });
        }
        // Force complete re-render with new colors
        chart.update('none'); // Update data first without animation
        chart.resize(); // Force recalculation of layout
        chart.render(); // Force complete redraw
    };

    updateCommon(window.storageChart);
    updateCommon(window.categoriesChart);
    updateCommon(window.trendChart);
}

// ===== ETA TRACKING =====
function startETATracking(totalSites) {
    etaTracker = {
        startTime: Date.now(),
        processedCount: 0,
        totalCount: totalSites,
        averageTimePerSite: 0
    };
    
    document.getElementById('etaDisplay').style.display = 'flex';
    updateETA();
}

function updateETA() {
    if (!etaTracker.startTime || etaTracker.processedCount === 0) {
        document.getElementById('etaTime').textContent = 'Calculating...';
        return;
    }
    
    const elapsed = Date.now() - etaTracker.startTime;
    const averageTime = elapsed / etaTracker.processedCount;
    const remainingSites = etaTracker.totalCount - etaTracker.processedCount;
    const estimatedRemaining = averageTime * remainingSites;
    
    document.getElementById('etaTime').textContent = formatDuration(estimatedRemaining);
    
    // Update again in 1 second if not complete
    if (etaTracker.processedCount < etaTracker.totalCount) {
        setTimeout(updateETA, 1000);
    }
}

function incrementETAProgress() {
    etaTracker.processedCount++;
    updateETA();
}

function stopETATracking() {
    setTimeout(() => {
        document.getElementById('etaDisplay').style.display = 'none';
    }, 2000);
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        const mins = minutes % 60;
        return `${hours}h ${mins}m`;
    } else if (minutes > 0) {
        const secs = seconds % 60;
        return `${minutes}m ${secs}s`;
    } else {
        return `${seconds}s`;
    }
}

// ===== RETRY FAILED SITES =====
function recordFailedSite(siteId, siteName, error) {
    failedSites.push({
        id: siteId,
        name: siteName,
        error: error.message || error.toString()
    });
    
    // Update failed sites list UI
    updateFailedSitesList();
}

function updateFailedSitesList() {
    if (failedSites.length === 0) {
        document.getElementById('retrySection').style.display = 'none';
        return;
    }
    
    document.getElementById('retrySection').style.display = 'block';
    document.getElementById('retryTitle').textContent = `${failedSites.length} site${failedSites.length > 1 ? 's' : ''} failed`;
    
    const list = document.getElementById('failedSitesList');
    list.innerHTML = '';
    failedSites.forEach(site => {
        const div = document.createElement('div');
        div.className = 'failed-site-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'failed-site-name';
        nameSpan.textContent = site.name;
        
        const errorSpan = document.createElement('span');
        errorSpan.className = 'failed-site-error';
        errorSpan.textContent = site.error;
        errorSpan.title = site.error;
        
        div.appendChild(nameSpan);
        div.appendChild(errorSpan);
        list.appendChild(div);
    });
}

async function retryFailedSites() {
    if (failedSites.length === 0) return;
    
    const sitesToRetry = [...failedSites];
    failedSites = []; // Clear the list
    updateFailedSitesList(); // Hide retry section
    
    const retryButton = document.getElementById('retryButton');
    retryButton.disabled = true;
    retryButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Retrying...';
    
    // Get versions to keep from the modal
    const versionsToKeep = parseInt(document.getElementById('bulkVersionsToKeep').value) || 50;
    const dryRun = false; // Always execute (not dry run) when retrying
    
    try {
        // Call the bulk cleanup function again with only failed sites
        // startBulkCleanup expects array of {id, name} objects
        await window.startBulkCleanup(sitesToRetry, versionsToKeep, dryRun);
    } finally {
        retryButton.disabled = false;
        retryButton.innerHTML = '<i class="fas fa-redo"></i> Retry Failed Sites';
    }
}

function clearFailedSites() {
    failedSites = [];
    document.getElementById('retrySection').style.display = 'none';
}

// ===== NETWORK ERROR DETECTION & AUTO-RECONNECT =====
function showNetworkStatus(status, message) {
    const statusEl = document.getElementById('networkStatus');
    const textEl = document.getElementById('networkStatusText');
    
    statusEl.className = `network-status ${status}`;
    textEl.textContent = message;
    statusEl.style.display = 'flex';
    
    // Auto-hide after 5 seconds if online
    if (status === 'online') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
}

function handleNetworkError(error, eventSource) {
    console.error('Network error detected:', error);
    
    if (eventSource) {
        eventSource.close();
    }
    
    showNetworkStatus('offline', 'Connection lost. Retrying...');
    
    // Attempt to reconnect
    attemptReconnect();
}

async function attemptReconnect() {
    if (networkReconnectAttempts >= maxReconnectAttempts) {
        showNetworkStatus('offline', 'Unable to reconnect. Please refresh the page.');
        return false;
    }
    
    networkReconnectAttempts++;
    showNetworkStatus('reconnecting', `Reconnecting... (Attempt ${networkReconnectAttempts}/${maxReconnectAttempts})`);
    
    // Exponential backoff: 2^n seconds
    const delay = Math.pow(2, networkReconnectAttempts) * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
        // Try a simple API call to check connection
        const response = await fetch('/api/sharepoint/sites/test', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showNetworkStatus('online', 'Reconnected successfully!');
            networkReconnectAttempts = 0;
            return true;
        } else {
            return await attemptReconnect();
        }
    } catch (error) {
        return await attemptReconnect();
    }
}

function resetNetworkStatus() {
    networkReconnectAttempts = 0;
    document.getElementById('networkStatus').style.display = 'none';
}

// Monitor online/offline events
window.addEventListener('online', () => {
    showNetworkStatus('online', 'Connection restored');
    networkReconnectAttempts = 0;
});

window.addEventListener('offline', () => {
    showNetworkStatus('offline', 'No internet connection');
});

// ===== INITIALIZE ON PAGE LOAD =====
document.addEventListener('DOMContentLoaded', () => {
    initializeDarkMode();
    
    // Check initial network status
    if (!navigator.onLine) {
        showNetworkStatus('offline', 'No internet connection');
    }
});

// Export functions to window for use in HTML
window.toggleDarkMode = toggleDarkMode;
window.retryFailedSites = retryFailedSites;
window.recordFailedSite = recordFailedSite;
window.clearFailedSites = clearFailedSites;
window.startETATracking = startETATracking;
window.incrementETAProgress = incrementETAProgress;
window.stopETATracking = stopETATracking;
window.handleNetworkError = handleNetworkError;
window.resetNetworkStatus = resetNetworkStatus;

// ===== STAT VALUE UPDATE ANIMATION =====
function animateStatValue(elementId, newValue) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    // Add animation class
    element.classList.add('updated');
    
    // Update value
    element.textContent = newValue;
    
    // Remove animation class after it completes
    setTimeout(() => {
        element.classList.remove('updated');
    }, 600);
}

// Export for use in main analytics code
window.animateStatValue = animateStatValue;
