// Optimized SharePoint Manager Application
import { initAuth, handleLoginRedirect, login, logout, isAuthenticated } from './api.js';
import { setupEventSource, createEventHandler } from './sse.js';
import { getAppState, updateAppState } from './state.js';
import {
    getFileIcon,
    processDryRunResults,
    displayDryRunResults,
    showFileVersionDetails,
    displayFileVersions,
} from './cleanup.js';
import { startOptimizedScan, handleScanEvents } from './optimizedScan.js';

class SharePointManager {
    constructor() {
        this.state = getAppState();
        this.elements = this.initializeElements();
        this.eventHandlers = {};
        this.init();
    }

    initializeElements() {
        return {
            loginBtn: document.getElementById('loginBtn'),
            logoutBtn: document.getElementById('logoutBtn'),
            sitesSection: document.getElementById('sitesSection'),
            sitesList: document.getElementById('sitesList'),
            refreshSitesBtn: document.getElementById('refreshSitesBtn'),
            selectAllSitesBtn: document.getElementById('selectAllSitesBtn'),
            deselectAllSitesBtn: document.getElementById('deselectAllSitesBtn'),
            siteSearch: document.getElementById('siteSearch'),
            cleanupSimulationPage: document.getElementById('cleanupSimulationPage'),
            backToSites: document.getElementById('backToSites'),
            progressSection: document.getElementById('progressSection'),
            dryRunResults: document.getElementById('dryRunResults'),
            dryRunFilesList: document.getElementById('dryRunFilesList'),
            dryRunFileDetails: document.getElementById('dryRunFileDetails'),
            startRealCleanupBtn: document.getElementById('startRealCleanupBtn'),
            cancelDryRun: document.getElementById('cancelDryRun'),
            confirmationModal: document.getElementById('confirmationModal'),
            confirmCleanup: document.getElementById('confirmCleanup'),
            cancelCleanup: document.getElementById('cancelCleanup'),
            currentFolderPath: document.getElementById('currentFolderPath'),
            dryRunTotalFiles: document.getElementById('dryRunTotalFiles'),
            dryRunTotalVersions: document.getElementById('dryRunTotalVersions'),
            dryRunVersionsToRemove: document.getElementById('dryRunVersionsToRemove'),
            dryRunStorageSavings: document.getElementById('dryRunStorageSavings')
        };
    }

    async init() {
        try {
            await initAuth();
            await handleLoginRedirect();
            this.updateAuthUI();
            if (isAuthenticated()) {
                await this.loadSites();
            }
            this.setupEventListeners();
        } catch (error) {
            console.error('Error initializing app:', error);
            this.showError('Er is een fout opgetreden bij het initialiseren van de applicatie.');
        }
    }

    setupEventListeners() {
        this.elements.loginBtn.addEventListener('click', login);
        this.elements.logoutBtn.addEventListener('click', logout);
        this.elements.refreshSitesBtn.addEventListener('click', () => this.loadSites());
        this.elements.selectAllSitesBtn.addEventListener('click', () => this.selectAllSites());
        this.elements.deselectAllSitesBtn.addEventListener('click', () => this.deselectAllSites());
        this.elements.backToSites.addEventListener('click', () => this.showSitesList());
        
        // Search functionality
        this.elements.siteSearch.addEventListener('input', (e) => this.handleSiteSearch(e));
        
        // Cleanup confirmation handling
        this.elements.startRealCleanupBtn.addEventListener('click', () => this.showCleanupConfirmation());
        this.elements.confirmCleanup.addEventListener('click', () => this.startRealCleanup());
        this.elements.cancelCleanup.addEventListener('click', () => this.hideCleanupConfirmation());
    }

    async startOptimizedScan(site) {
        try {
            // Update state
            updateAppState({
                selectedSite: site,
                scanInProgress: true,
                currentView: 'simulation'
            });

            // Show cleanup simulation page
            this.elements.sitesSection.style.display = 'none';
            this.elements.cleanupSimulationPage.style.display = 'block';
            this.elements.progressSection.style.display = 'block';
            this.elements.dryRunResults.style.display = 'none';

            const progressBar = document.getElementById('progressIndicator');
            progressBar.style.width = '0%';
            progressBar.classList.add('progress-animated');

            // Initialize and start the scan
            const eventSource = setupEventSource(`/api/optimized/${site.id}/scan`);
            const scanEventHandler = createEventHandler((event) => {
                const data = JSON.parse(event.data);
                
                switch (data.type) {
                    case 'progress':
                        this.elements.dryRunTotalFiles.textContent = data.stats.totalFiles;
                        this.elements.dryRunTotalVersions.textContent = data.stats.totalVersions;
                        this.elements.dryRunVersionsToRemove.textContent = data.stats.versionsToRemove;
                        this.elements.dryRunStorageSavings.textContent = this.formatStorageSize(data.stats.potentialSavings);
                        progressBar.style.width = `${data.progress}%`;
                        break;
                        
                    case 'folder':
                        this.elements.currentFolderPath.textContent = data.path;
                        break;
                        
                    case 'batch':
                        this.appendFileBatch(data.files);
                        break;
                        
                    case 'complete':
                        progressBar.classList.remove('progress-animated');
                        this.elements.progressSection.style.display = 'none';
                        this.elements.dryRunResults.style.display = 'block';
                        this.showSuccess(`Scan voltooid: ${data.stats.totalFiles} bestanden gevonden`);
                        break;
                        
                    case 'error':
                        this.showError(`Fout tijdens scannen: ${data.message}`);
                        progressBar.classList.remove('progress-animated');
                        break;
                }
            });
            
            eventSource.onmessage = scanEventHandler;
            
            // Start the scan
            await startOptimizedScan(site.id);
        } catch (error) {
            console.error('Error starting site scan:', error);
            this.showError('Er is een fout opgetreden bij het starten van de scan.');
        }
    }

    // Helper Methods
    appendFileBatch(batch) {
        const fragment = document.createDocumentFragment();
        
        for (const file of batch) {
            const fileElement = document.createElement('div');
            fileElement.className = 'file-item';
            fileElement.dataset.file = JSON.stringify(file);
            
            const icon = getFileIcon(file.name);
            const versionsToRemove = file.versions.filter(v => v.toRemove).length;
            
            fileElement.innerHTML = `
                <div class="file-icon">
                    <i class="${icon}"></i>
                </div>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-path">${file.path}</div>
                    <div class="version-stats">
                        <span class="version-count">
                            <i class="fas fa-history"></i> ${file.versions.length} versies
                        </span>
                        <span class="versions-to-remove">
                            <i class="fas fa-trash-alt"></i> ${versionsToRemove} te verwijderen
                        </span>
                    </div>
                </div>
            `;
            
            fileElement.addEventListener('click', () => this.showFileVersions(file));
            fragment.appendChild(fileElement);
        }
        
        this.elements.dryRunFilesList.appendChild(fragment);
    }
    
    showFileVersions(file) {
        const versionsHtml = file.versions.map((version, index) => `
            <div class="version-item ${version.toRemove ? 'to-remove' : ''}">
                <div class="version-info">
                    <span class="version-number">#${file.versions.length - index}</span>
                    <span class="version-date">${new Date(version.modified).toLocaleString()}</span>
                </div>
                <div class="version-details">
                    <span class="version-modifier">${version.modifiedBy}</span>
                    <span class="version-size">${this.formatStorageSize(version.size)}</span>
                </div>
                <div class="version-status">
                    ${version.toRemove ? '<i class="fas fa-trash-alt"></i> Wordt verwijderd' : '<i class="fas fa-check"></i> Wordt behouden'}
                </div>
            </div>
        `).join('');
        
        this.elements.dryRunFileDetails.innerHTML = `
            <div class="file-details-header">
                <h3>${file.name}</h3>
                <p>${file.path}</p>
            </div>
            <div class="versions-list">
                ${versionsHtml}
            </div>
        `;
    }
    
    formatStorageSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }
    
    showSitesList() {
        this.elements.cleanupSimulationPage.style.display = 'none';
        this.elements.sitesSection.style.display = 'block';
        updateAppState({ currentView: 'sites' });
    }
    
    handleSiteSearch(event) {
        const searchTerm = event.target.value.toLowerCase();
        const siteCards = this.elements.sitesList.querySelectorAll('.site-card');
        
        siteCards.forEach(card => {
            const siteName = card.querySelector('h3').textContent.toLowerCase();
            const siteUrl = card.querySelector('p').textContent.toLowerCase();
            card.style.display = (siteName.includes(searchTerm) || siteUrl.includes(searchTerm)) ? 'block' : 'none';
        });
    }
    
    showCleanupConfirmation() {
        this.elements.confirmationModal.style.display = 'block';
    }
    
    hideCleanupConfirmation() {
        this.elements.confirmationModal.style.display = 'none';
    }
    
    async startRealCleanup() {
        this.elements.confirmationModal.style.display = 'none';
        const state = getAppState();
        if (state.selectedSite) {
            try {
                const eventSource = setupEventSource(`/api/optimized/${state.selectedSite.id}/cleanup`);
                const cleanupEventHandler = createEventHandler(handleScanEvents);
                eventSource.onmessage = cleanupEventHandler;
            } catch (error) {
                console.error('Error starting cleanup:', error);
                this.showError('Er is een fout opgetreden bij het starten van de opschoning.');
            }
        }
    }
    
    updateAuthUI() {
        const authenticated = isAuthenticated();
        this.elements.loginBtn.style.display = authenticated ? 'none' : 'block';
        this.elements.logoutBtn.style.display = authenticated ? 'block' : 'none';
        this.elements.sitesSection.style.display = authenticated ? 'block' : 'none';
        this.elements.cleanupSimulationPage.style.display = 'none';
    }
    
    async loadSites() {
        try {
            this.showLoadingIndicator();
            const response = await fetch('/api/sites');
            const sites = await response.json();
            this.renderSites(sites);
            this.hideLoadingIndicator();
        } catch (error) {
            console.error('Error loading sites:', error);
            this.showError('Er is een fout opgetreden bij het laden van de sites.');
            this.hideLoadingIndicator();
        }
    }
    
    renderSites(sites) {
        this.elements.sitesList.innerHTML = '';
        sites.forEach(site => {
            const card = document.createElement('div');
            card.className = 'site-card';
            card.dataset.siteId = site.id;
            card.innerHTML = `
                <div class="site-select">
                    <input type="checkbox" class="site-checkbox" id="site-${site.id}" data-site-id="${site.id}">
                </div>
                <div class="site-info">
                    <h3>${site.displayName}</h3>
                    <p>${site.webUrl}</p>
                    <button class="scan-button" data-site-id="${site.id}">
                        <i class="fas fa-search"></i> Scan Site
                    </button>
                </div>
            `;
            
            const scanButton = card.querySelector('.scan-button');
            scanButton.addEventListener('click', () => this.startOptimizedScan(site));
            
            const checkbox = card.querySelector('.site-checkbox');
            checkbox.addEventListener('change', () => this.updateSiteSelection());
            
            this.elements.sitesList.appendChild(card);
        });
    }

    showError(message) {
        const errorElement = document.getElementById('errorMessage');
        const errorText = document.getElementById('errorText');
        errorText.textContent = message;
        errorElement.style.display = 'block';
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 5000);
    }

    showSuccess(message) {
        const successElement = document.getElementById('successMessage');
        const successText = document.getElementById('successText');
        successText.textContent = message;
        successElement.style.display = 'block';
        setTimeout(() => {
            successElement.style.display = 'none';
        }, 5000);
    }

    showLoadingIndicator() {
        this.elements.sitesSection.classList.add('loading');
    }

    hideLoadingIndicator() {
        this.elements.sitesSection.classList.remove('loading');
    }

    selectAllSites() {
        const checkboxes = this.elements.sitesList.querySelectorAll('.site-checkbox');
        checkboxes.forEach(checkbox => checkbox.checked = true);
        this.updateSiteSelection();
        this.elements.selectAllSitesBtn.style.display = 'none';
        this.elements.deselectAllSitesBtn.style.display = 'block';
    }

    deselectAllSites() {
        const checkboxes = this.elements.sitesList.querySelectorAll('.site-checkbox');
        checkboxes.forEach(checkbox => checkbox.checked = false);
        this.updateSiteSelection();
        this.elements.selectAllSitesBtn.style.display = 'block';
        this.elements.deselectAllSitesBtn.style.display = 'none';
    }

    updateSiteSelection() {
        const checkboxes = this.elements.sitesList.querySelectorAll('.site-checkbox');
        const totalCheckboxes = checkboxes.length;
        const checkedCheckboxes = Array.from(checkboxes).filter(cb => cb.checked).length;

        // Update select/deselect all buttons visibility
        if (checkedCheckboxes === 0) {
            this.elements.selectAllSitesBtn.style.display = 'block';
            this.elements.deselectAllSitesBtn.style.display = 'none';
        } else if (checkedCheckboxes === totalCheckboxes) {
            this.elements.selectAllSitesBtn.style.display = 'none';
            this.elements.deselectAllSitesBtn.style.display = 'block';
        } else {
            this.elements.selectAllSitesBtn.style.display = 'block';
            this.elements.deselectAllSitesBtn.style.display = 'block';
        }

        // Update state with selected sites
        const selectedSites = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.dataset.siteId);
            
        updateAppState({ selectedSites });
    }
}

// Initialize app
const app = new SharePointManager();
window.app = app; // Expose to global scope for event handlers