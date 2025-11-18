import { api } from './js/api.js';
import { connectSSE } from './js/sse.js';
import { state } from './js/state.js';
import { setupHistoryHandlers } from './js/history.js';
import {
    getFileIcon as getFileIconUtil,
    processDryRunResults as processDryRunResultsUtil,
    displayDryRunResults as displayDryRunResultsUtil,
    showFileVersionDetails as showFileVersionDetailsUtil,
    displayFileVersions as displayFileVersionsUtil,
} from './js/cleanup.js';

class SharePointManager {
    constructor() {
        this.sessionId = null;
        this.sites = [];
        this.currentSite = null;
        this.cleanupStopped = false;
        this.eventSource = null;
        this.abortController = null;
        this.bulkScanCancelled = false;
        this.bulkScanAbortController = null; // Dedicated abort controller for bulk scans
        this.currentEventSource = null;
        
        // Task persistence properties
        this.taskState = {
            bulkDryRun: null // Stores incomplete bulk dry run state
        };
        this.lastBulkDryRunSites = [];
        this.lastBulkVersionsToKeep = 3;
        this.lastBulkResults = null;
        this.completedSitesInBulkRun = []; // Track which sites have been completed
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupLoginModal();
        this.checkAuthStatus();
        setupHistoryHandlers(this);
        
        // Check for incomplete tasks on startup - wait longer for auth to complete
        setTimeout(() => this.checkForIncompleteTasks(), 2500);
    }

    setupLoginModal() {
        const loginModal = document.getElementById('loginModal');
        const closeBtn = document.getElementById('closeLoginModal');
        const userLoginBtn = document.getElementById('userLoginBtn');
        const appLoginBtn = document.getElementById('appLoginBtn');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                loginModal.style.display = 'none';
            });
        }

        if (userLoginBtn) {
            userLoginBtn.addEventListener('click', () => {
                loginModal.style.display = 'none';
                this.loginAsUser();
            });
        }

        if (appLoginBtn) {
            appLoginBtn.addEventListener('click', () => {
                loginModal.style.display = 'none';
                this.loginAsApp();
            });
        }

        // Close on outside click
        loginModal?.addEventListener('click', (e) => {
            if (e.target === loginModal) {
                loginModal.style.display = 'none';
            }
        });
    }

    setupEventListeners() {
        // Login button click handler with direct function
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.onclick = async (e) => {
                e.preventDefault();
                await this.login();
            };
        }

        // Veilige event listeners voor elementen die mogelijk nog niet bestaan
        const elements = [
            { id: 'logoutBtn', handler: () => this.logout() },
            { id: 'refreshSitesBtn', handler: () => this.loadSites() },
            { id: 'siteSearch', event: 'input', handler: (e) => this.filterSites(e.target.value) },
            { id: 'closeModal', handler: () => this.closeModal() },
            { id: 'cleanupBtn', handler: () => this.startCleanup() },
            { id: 'dryRunBtn', handler: () => this.dryRunCleanup() },
            { id: 'closeError', handler: () => this.hideError() },
            { id: 'closeSuccess', handler: () => this.hideSuccess() },
            { id: 'cancelBulkScan', handler: () => this.cancelBulkScan() }
        ];

        elements.forEach(({ id, event = 'click', handler }) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener(event, handler);
            }
        });
        
        // Cleanup Simulation Page event listeners
        document.getElementById('backToSites').addEventListener('click', () => {
            document.getElementById('cleanupSimulationPage').style.display = 'none';
            document.getElementById('sitesSection').style.display = 'block';
        });
        document.getElementById('cancelDryRun').addEventListener('click', () => {
            document.getElementById('cleanupSimulationPage').style.display = 'none';
            document.getElementById('sitesSection').style.display = 'block';
        });
        
        // Event listeners voor de nieuwe actie knoppen
        document.getElementById('startDryRunBtn').addEventListener('click', () => {
            this.runDryRun();
        });
        
        // Demo banner close button
        document.getElementById('closeDemoBanner').addEventListener('click', () => {
            document.getElementById('demoBanner').style.display = 'none';
        });
        
        // Increment/decrement versionsToKeep
        document.getElementById('decrementVersions').addEventListener('click', () => {
            const input = document.getElementById('versionsToKeep');
            const value = parseInt(input.value) || 3;
            if (value > 1) {
                input.value = value - 1;
            }
        });
        
        document.getElementById('incrementVersions').addEventListener('click', () => {
            const input = document.getElementById('versionsToKeep');
            const value = parseInt(input.value) || 3;
            if (value < 20) {
                input.value = value + 1;
            }
        });
        
        document.getElementById('startRealCleanupBtn').addEventListener('click', () => {
            this.runRealCleanup(false); // false betekent dat we geen dry run uitvoeren
        });
        
        document.getElementById('confirmCleanup').addEventListener('click', () => {
            this.runRealCleanup(false);
        });
        
        document.getElementById('runAgainBtn').addEventListener('click', () => {
            this.runDryRun();
        });
        
        document.getElementById('stopCleanupBtn').addEventListener('click', () => {
            this.stopCleanup();
        });

        // Bulk progress overlay close button
        document.getElementById('closeBulkProgress').addEventListener('click', () => {
            document.getElementById('bulkProgressOverlay').style.display = 'none';
        });

        // Start cleanup from bulk dry run results
        document.getElementById('startBulkCleanupFromResults').addEventListener('click', () => {
            this.startBulkCleanupFromDryRun();
        });

        // Select all / Deselect all sites
        document.getElementById('selectAllSitesBtn').addEventListener('click', () => {
            this.selectAllSites();
        });
        
        document.getElementById('deselectAllSitesBtn').addEventListener('click', () => {
            this.deselectAllSites();
        });

        document.getElementById('siteModal').addEventListener('click', (e) => {
            if (e.target.id === 'siteModal') {
                this.closeModal();
            }
        });
    }

    toggleSiteDetails(idx) {
        const content = document.getElementById(`site-details-${idx}`);
        const item = document.getElementById(`site-item-${idx}`);
        
        if (content.style.display === 'none') {
            content.style.display = 'block';
            item.classList.add('expanded');
        } else {
            content.style.display = 'none';
            item.classList.remove('expanded');
        }
    }

    async dryRunCleanup() {
        if (!this.currentSite || !this.sessionId) return;
        
        const versionsToKeep = parseInt(document.getElementById('versionsToKeep').value) || 10;
        const dryRunBtn = document.getElementById('dryRunBtn');
        const originalText = dryRunBtn.innerHTML;
        
        dryRunBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Dry Run...';
        dryRunBtn.disabled = true;
        
        try {
            const response = await fetch(`/api/sharepoint/sites/${this.currentSite.id}/cleanup?dryRun=true`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-ID': this.sessionId
                },
                body: JSON.stringify({ versionsToKeep })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            this.dryRunDetails = result; // Store for later use
            this.showDryRunResults(result);
            this.showCleanupSimulationPage();
            
        } catch (error) {
            console.error('Dry run error:', error);
            this.showError('Fout bij dry run');
        } finally {
            dryRunBtn.innerHTML = originalText;
            dryRunBtn.disabled = false;
        }
    }

    showCleanupSimulationPage() {
        // Hide other sections
        document.getElementById('sitesSection').style.display = 'none';
        document.getElementById('siteModal').style.display = 'none';
        
        // Show cleanup simulation page
        const simulationPage = document.getElementById('cleanupSimulationPage');
        simulationPage.style.display = 'block';
    }
    
    async startCleanupSimulation(siteId) {
        // Sla de huidige site op
        this.currentSite = this.sites.find(site => site.id === siteId);
        if (!this.currentSite) return;
        
        // Update de titel op de simulatie pagina
        const siteNameElement = document.querySelector('#cleanupSimulationPage .section-title');
        if (siteNameElement) {
            siteNameElement.textContent = `Opschoning Simulatie - ${this.currentSite.displayName || this.currentSite.name}`;
        }
        
        // Sluit eventuele lopende verbindingen/aanvragen van vorige site
        try { if (this.eventSource) { this.eventSource.close(); } } catch {}
        this.eventSource = null;
        if (this.abortController) {
            try { this.abortController.abort(); } catch {}
        }
        this.abortController = null;
        this.cleanupStopped = false;
        this.currentFiles = [];

        // Reset de resultaten
        document.getElementById('dryRunTotalFiles').textContent = '0';
        document.getElementById('dryRunTotalVersions').textContent = '0';
        document.getElementById('dryRunVersionsToRemove').textContent = '0';
        const storageEl = document.getElementById('dryRunStorageSavings');
        if (storageEl) storageEl.textContent = '0 MB';
        
        // Reset lijsten naar lege/placeholder staat
        const filesListEl = document.getElementById('dryRunFilesList');
        if (filesListEl) filesListEl.innerHTML = '';
        const detailsEl = document.getElementById('dryRunFileDetails');
        if (detailsEl) {
            detailsEl.innerHTML = `
            <div class="select-file-message">
                <i class="fas fa-file-alt"></i>
                <div>
                    <h4>Selecteer een bestand</h4>
                    <p>Klik op een bestand om de versie details te zien</p>
                </div>
            </div>`;
        }
        
        // Reset voortgangsweergave
    const progressBar = document.getElementById('progressIndicator');
    const progressText = document.getElementById('progressText');
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    progressBar.classList.add('progress-animated');
        document.getElementById('statusMessage').textContent = 'API verbinding opzetten...';
        document.getElementById('progressSection').style.display = 'block';
        document.getElementById('currentFolderPath').textContent = 'Verbinding maken met SharePoint...';
        
        // Verberg de dry run acties
        document.getElementById('dryRunActions').style.display = 'none';
        
        // Toon de simulatie pagina
        this.showCleanupSimulationPage();
    }

    showDryRunResults(result) {
        // Update summary statistics
        document.getElementById('dryRunTotalFiles').textContent = result.totalFiles;
        document.getElementById('dryRunTotalVersions').textContent = result.totalVersions;
        document.getElementById('dryRunVersionsToRemove').textContent = result.versionsToRemove;
        
        // Toon de geschatte opslagbesparing
        if (result.totalStorageSavings) {
            document.getElementById('dryRunStorageSavings').textContent = result.totalStorageSavings;
        } else {
            document.getElementById('dryRunStorageSavings').textContent = 'Onbekend';
        }

        // Generate file list
        const filesList = document.getElementById('dryRunFilesList');
        const details = result.details;
        
        if (Object.keys(details).length === 0) {
            filesList.innerHTML = `
                <div class="no-files-found">
                    <i class="fas fa-check-circle"></i>
                    <p>Geen bestanden gevonden die opgeschoond moeten worden.</p>
                </div>
            `;
            return;
        }
        
        filesList.innerHTML = Object.entries(details)
            .filter(([fileName]) => fileName && typeof fileName === 'string')
            .map(([fileName, info]) => {
                // Bepaal het bestandstype-icoon op basis van de extensie
                const fileExt = fileName.split('.').pop().toLowerCase();
                let iconClass = 'fas fa-file';
                
                // Verschillende icoontjes op basis van bestandstype
                if (['doc', 'docx'].includes(fileExt)) {
                    iconClass = 'fas fa-file-word';
                } else if (['xls', 'xlsx'].includes(fileExt)) {
                    iconClass = 'fas fa-file-excel';
                } else if (['ppt', 'pptx'].includes(fileExt)) {
                    iconClass = 'fas fa-file-powerpoint';
                } else if (['pdf'].includes(fileExt)) {
                    iconClass = 'fas fa-file-pdf';
                } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(fileExt)) {
                    iconClass = 'fas fa-file-image';
                }
                
                return `
                <div class="file-item" data-file="${fileName}" onclick="app.showFileVersions('${fileName}')">
                    <div class="file-icon">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="file-info">
                        <div class="file-name">${fileName}</div>
                        <div class="file-path">${info.path || ''}</div>
                        <div class="version-stats">
                            <span class="version-count"><i class="fas fa-history"></i> ${info.totalVersions} versies</span>
                            <span class="remove-count"><i class="fas fa-trash-alt"></i> ${info.versionsToRemove} te verwijderen</span>
                        </div>
                    </div>
                </div>
                `;
            }).join('');
    }

    showFileVersions(fileName) {
        // Highlight selected file
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const selectedFile = document.querySelector(`[data-file="${fileName}"]`);
        if (selectedFile) {
            selectedFile.classList.add('active');
        }

        // Show loading indicator
        const fileDetails = document.getElementById('dryRunFileDetails');
        fileDetails.innerHTML = `
            <div class="loading-indicator">
                <i class="fas fa-spinner fa-spin"></i>
                Versie details laden...
            </div>
        `;

        // In een echte implementatie zou je hier de versies ophalen
        // Voor nu tonen we data op basis van de beschikbare details
        setTimeout(() => {
            const versionsToKeep = parseInt(document.getElementById('versionsToKeep').value) || 10;
            const details = this.dryRunDetails?.details[fileName];
            
            if (!details) {
                fileDetails.innerHTML = '<p>Geen versie informatie beschikbaar</p>';
                return;
            }

            // Bestandstype bepalen
            if (!fileName || typeof fileName !== 'string') {
                fileDetails.innerHTML = '<p>Ongeldige bestandsnaam</p>';
                return;
            }
            const fileExt = fileName.split('.').pop().toLowerCase();
            let fileIcon = 'fas fa-file';
            
            // Verschillende icoontjes op basis van bestandstype
            if (['doc', 'docx'].includes(fileExt)) {
                fileIcon = 'fas fa-file-word';
            } else if (['xls', 'xlsx'].includes(fileExt)) {
                fileIcon = 'fas fa-file-excel';
            } else if (['ppt', 'pptx'].includes(fileExt)) {
                fileIcon = 'fas fa-file-powerpoint';
            } else if (['pdf'].includes(fileExt)) {
                fileIcon = 'fas fa-file-pdf';
            } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(fileExt)) {
                fileIcon = 'fas fa-file-image';
            }

            const totalVersions = details.totalVersions;
            let html = `
                <div class="file-header">
                    <div class="file-header-icon">
                        <i class="${fileIcon}"></i>
                    </div>
                    <div class="file-header-info">
                        <h3>${fileName}</h3>
                        <p class="file-path">${details.path}</p>
                    </div>
                </div>

                <div class="version-summary">
                    <div class="version-stat">
                        <span class="stat-number">${totalVersions}</span>
                        <span class="stat-text">Totaal versies</span>
                    </div>
                    <div class="version-stat">
                        <span class="stat-number">${versionsToKeep}</span>
                        <span class="stat-text">Behouden</span>
                    </div>
                    <div class="version-stat">
                        <span class="stat-number">${details.versionsToRemove}</span>
                        <span class="stat-text">Verwijderen</span>
                    </div>
                </div>

                <h4><i class="fas fa-history"></i> Versie Historie</h4>
                <div class="version-list">
            `;

            // Toon behouden versies
            for (let i = 0; i < versionsToKeep && i < totalVersions; i++) {
                const versionNum = totalVersions - i;
                const isCurrentVersion = i === 0;
                
                html += `
                    <div class="version-item version-keep">
                        <div class="version-info">
                            <strong>Versie ${versionNum}</strong>
                            <div class="version-date">
                                ${isCurrentVersion ? 
                                    '<span class="current-version"><i class="fas fa-star"></i> Huidige versie</span>' : 
                                    'Wordt behouden'
                                }
                            </div>
                        </div>
                        <span class="version-status status-keep">
                            <i class="fas fa-check-circle"></i> Behouden
                        </span>
                    </div>
                `;
            }

            // Toon te verwijderen versies
            for (let i = versionsToKeep; i < totalVersions; i++) {
                html += `
                    <div class="version-item version-remove">
                        <div class="version-info">
                            <strong>Versie ${totalVersions - i}</strong>
                            <div class="version-date">Oude versie</div>
                        </div>
                        <span class="version-status status-remove">
                            <i class="fas fa-trash-alt"></i> Verwijderen
                        </span>
                    </div>
                `;
            }

            html += `</div>`;
            fileDetails.innerHTML = html;
        }, 300);
    }

    checkAuthStatus() {
        const urlParams = new URLSearchParams(window.location.search);
        const session = urlParams.get('session');
        const authStatus = urlParams.get('auth');
        const authType = urlParams.get('authType') || 'user';

        if (authStatus === 'error') {
            this.showError('Authenticatie mislukt. Probeer opnieuw.');
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (session && authStatus === 'success') {
            this.sessionId = session;
            state.sessionId = session;
            this.authType = authType;
            this.showSuccess(`Succesvol ingelogd als ${authType === 'app' ? 'app' : 'gebruiker'}!`);
            this.showAuthenticatedState(authType);
            this.loadSites();
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (session) {
            this.sessionId = session;
            state.sessionId = session;
            this.validateSession();
        } else {
            this.showUnauthenticatedState();
        }
    }

    async validateSession() {
        if (!this.sessionId) {
            this.showUnauthenticatedState();
            return;
        }

        try {
            let response;
            
            try {
                response = await fetch(`/api/auth/token/${this.sessionId}`);
                console.log('New endpoint response:', response.status);
            } catch (error) {
                console.log('New endpoint failed, trying legacy endpoint:', error);
                response = await fetch(`/auth/token/${this.sessionId}`);
                console.log('Legacy endpoint response:', response.status);
            }
            
            if (response.ok) {
                const data = await response.json();
                this.authType = data.authType || 'user';
                this.showAuthenticatedState(this.authType);
                this.loadSites();
            } else {
                console.log('Session validation failed:', response.status, response.statusText);
                this.showUnauthenticatedState();
                this.sessionId = null;
                state.sessionId = null;
                this.showDemoBanner();
            }
        } catch (error) {
            console.error('Error validating session:', error);
            this.showUnauthenticatedState();
            this.sessionId = null;
            state.sessionId = null;
        }
    }

    async login() {
        // Show login modal instead of direct login
        const loginModal = document.getElementById('loginModal');
        if (loginModal) {
            loginModal.style.display = 'flex';
        }
    }

    async loginAsUser() {
        const loginBtn = document.getElementById('loginBtn');
        const originalText = loginBtn.innerHTML;
        
        try {
            console.log('Starting user login process...');
            
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Laden...';
            loginBtn.disabled = true;
            
            const response = await fetch('/api/auth/login');
            console.log('Login response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Login response data:', data);
            
            if (!data || !data.authUrl) {
                throw new Error('Invalid response from auth server');
            }

            if (data.authUrl) {
                console.log('Redirecting to Azure login with URL:', data.authUrl);
                window.location.href = data.authUrl;
            } else {
                this.showError('Kon authenticatie URL niet ophalen');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError('Fout bij inloggen. Controleer je Azure App registratie configuratie.');
        } finally {
            if (loginBtn) {
                loginBtn.innerHTML = originalText;
                loginBtn.disabled = false;
            }
        }
    }

    async loginAsApp() {
        const loginBtn = document.getElementById('loginBtn');
        const originalText = loginBtn.innerHTML;
        
        try {
            console.log('Starting app login process...');
            
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> App Login...';
            loginBtn.disabled = true;
            
            const response = await fetch('/api/auth/login/app', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('App login response:', data);
            
            if (data.sessionId) {
                this.sessionId = data.sessionId;
                state.sessionId = data.sessionId;
                this.authType = 'app';
                this.showSuccess('Succesvol ingelogd als app!');
                this.showAuthenticatedState('app');
                this.loadSites();
            } else {
                throw new Error('No session ID received');
            }
        } catch (error) {
            console.error('App login error:', error);
            this.showError('Fout bij app login. Controleer je client secret en permissions.');
        } finally {
            if (loginBtn) {
                loginBtn.innerHTML = originalText;
                loginBtn.disabled = false;
            }
        }
    }

    async logout() {
        if (this.sessionId) {
            try {
                await fetch(`/auth/logout/${this.sessionId}`, { method: 'POST' });
            } catch (error) {
                console.error('Logout error:', error);
            }
        }
        
        this.sessionId = null;
        state.sessionId = null;
        this.showUnauthenticatedState();
        this.showSuccess('Uitgelogd');
    }

    showAuthenticatedState(authType = 'user') {
        document.getElementById('loginBtn').style.display = 'none';
        const userInfo = document.getElementById('userInfo');
        userInfo.style.display = 'flex';
        
        // Update user name with auth mode badge
        const userName = document.getElementById('userName');
        const badgeClass = authType === 'app' ? 'app' : 'user';
        const badgeText = authType === 'app' ? 'App' : 'User';
        userName.innerHTML = `Ingelogd <span class="auth-mode-badge ${badgeClass}">${badgeText}</span>`;
        
        document.getElementById('setupSection').style.display = 'none';
        document.getElementById('sitesSection').style.display = 'block';
    }

    showUnauthenticatedState() {
        document.getElementById('loginBtn').style.display = 'inline-flex';
        document.getElementById('userInfo').style.display = 'none';
        document.getElementById('setupSection').style.display = 'block';
        document.getElementById('sitesSection').style.display = 'none';
    }

    async loadSites() {
        if (!this.sessionId) {
            // Gebruiker is niet ingelogd, toon demo sites met banner
            console.log('No session - showing demo sites. Click "Inloggen" to connect to real SharePoint data.');
            this.sites = this.getMockSites();
            this.renderSites(this.sites);
            this.showDemoBanner();
            return;
        }

        this.showLoading(true);

        try {
            let response;
            try {
                response = await fetch('/api/sharepoint/sites', {
                    headers: {
                        'X-Session-ID': this.sessionId
                    }
                });
                
                if (!response.ok && response.status === 401) {
                    console.log('Authentication required, trying test endpoint...');
                    response = await fetch('/api/sharepoint/sites/test');
                }
            } catch (error) {
                console.log('Real sites endpoint failed, trying test endpoint...', error.message);
                response = await fetch('/api/sharepoint/sites/test');
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.sites = await response.json();
            
            // Toon demo banner als we test data gebruiken
            if (response.url && response.url.includes('/test')) {
                this.showDemoBanner();
            }
            
            this.renderSites(this.sites);
        } catch (error) {
            console.error('Error loading sites:', error);
            
            // Check of het een authentication error is en gebruik mock data
            if (error.message.includes('Authentication required') || error.message.includes('401') || error.message.includes('HTTP 401')) {
                console.log('Authentication error - token expired or invalid, using demo sites');
                // Token is verlopen of ongeldig, log de gebruiker uit
                this.sessionId = null;
                state.sessionId = null;
                this.showUnauthenticatedState();
                this.sites = this.getMockSites();
                this.renderSites(this.sites);
                this.showDemoBanner();
            } else {
                this.showError('Fout bij laden van SharePoint sites: ' + error.message);
                // Ook bij andere fouten kunnen we mock data tonen
                this.sites = this.getMockSites();
                this.renderSites(this.sites);
                this.showDemoBanner();
            }
        } finally {
            this.showLoading(false);
        }
    }

    renderSites(sites) {
        const sitesGrid = document.getElementById('sitesGrid');
        if (sites.length === 0) {
            sitesGrid.innerHTML = `
                <div class="no-sites-found">
                    <i class="fas fa-folder-open"></i>
                    <h3>Geen SharePoint sites gevonden</h3>
                    <p>Controleer je permissions of probeer opnieuw.</p>
                </div>
            `;
            return;
        }

        // Add bulk actions if they don't exist
        let actionsContainer = document.getElementById('sitesActions');
        if (!actionsContainer) {
            actionsContainer = document.createElement('div');
            actionsContainer.id = 'sitesActions';
            actionsContainer.className = 'sites-actions';
            sitesGrid.parentNode.insertBefore(actionsContainer, sitesGrid);
        }

        actionsContainer.innerHTML = `
            <div class="bulk-actions-config">
                <div class="bulk-versions-setting">
                    <label for="bulkVersionsToKeep">Versies te behouden:</label>
                    <div class="input-with-buttons">
                        <button class="btn btn-icon decrement-btn" id="bulkDecrementVersions">
                            <i class="fas fa-minus"></i>
                        </button>
                        <input type="number" id="bulkVersionsToKeep" value="3" min="1" max="50">
                        <button class="btn btn-icon increment-btn" id="bulkIncrementVersions">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </div>
                <div class="bulk-actions-buttons">
                    <button id="bulkDryRunBtn" class="bulk-action-btn" disabled>
                        <i class="fas fa-check-circle"></i> Dry Run Geselecteerde Sites
                    </button>
                    <button id="bulkCleanupBtn" class="bulk-action-btn" disabled>
                        <i class="fas fa-broom"></i> Opschonen Geselecteerde Sites
                    </button>
                    <button id="showRecentCleanups" class="bulk-action-btn" title="Recente opschoningen">
                        <i class="fas fa-history"></i> Recente Opschoningen
                    </button>
                </div>
            </div>
        `;

        sitesGrid.innerHTML = `
            <div class="sites-list">
                ${sites.map((site, idx) => `
                    <div class="site-item">
                        <div class="site-select-wrapper">
                            <input type="checkbox" 
                                   id="site-${site.id}" 
                                   class="site-select site-checkbox" 
                                   data-site-id="${site.id}"
                                   value="${site.id}"
                                   onclick="event.stopPropagation();">
                            <div class="site-icon">
                                <i class="fas fa-sitemap"></i>
                            </div>
                        </div>
                        <div class="site-content" onclick="app.startCleanupSimulation('${site.id}')">
                            <div class="site-title">${site.displayName || site.name || 'Unnamed Site'}</div>
                            <div class="site-description">${site.description || 'Geen beschrijving'}</div>
                            <div class="site-url">${site.webUrl.replace('https://', '')}</div>
                        </div>
                        <div class="site-actions">
                            <button class="action-button" title="Bekijk details" onclick="app.openSiteModal('${site.id}'); event.stopPropagation();">
                                <i class="fas fa-info-circle"></i>
                            </button>
                            <button class="action-button" title="Open in SharePoint" onclick="window.open('${site.webUrl}', '_blank'); event.stopPropagation();">
                                <i class="fas fa-external-link-alt"></i>
                            </button>
                            <button class="action-button" title="Versie Opschoning" onclick="app.startCleanupSimulation('${site.id}'); event.stopPropagation();">
                                <i class="fas fa-broom"></i>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        // Add event listeners for bulk actions
        document.getElementById('bulkDryRunBtn')?.addEventListener('click', () => this.bulkDryRun());
        document.getElementById('bulkCleanupBtn')?.addEventListener('click', () => this.bulkCleanup());

        // Bulk versions increment/decrement
        document.getElementById('bulkDecrementVersions')?.addEventListener('click', () => {
            const input = document.getElementById('bulkVersionsToKeep');
            const value = parseInt(input.value) || 3;
            if (value > 1) {
                input.value = value - 1;
            }
        });
        
        document.getElementById('bulkIncrementVersions')?.addEventListener('click', () => {
            const input = document.getElementById('bulkVersionsToKeep');
            const value = parseInt(input.value) || 3;
            if (value < 50) {
                input.value = value + 1;
            }
        });

        // Add checkbox change listeners
        document.querySelectorAll('.site-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateBulkActions());
        });

        // Recent cleanups button handler (if present)
        const recentBtn = document.getElementById('showRecentCleanups');
        if (recentBtn) {
            recentBtn.addEventListener('click', () => {
                // Simple placeholder: open history panel or fetch recent cleanups
                if (typeof this.showRecentCleanups === 'function') {
                    this.showRecentCleanups();
                } else {
                    console.log('Recent cleanups clicked');
                }
            });
        }
    }

    filterSites(searchTerm) {
        const filteredSites = this.sites.filter(site => 
            (site.displayName || site.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (site.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (site.webUrl || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
        this.renderSites(filteredSites);
    }

    async openSiteModal(siteId) {
        this.currentSite = this.sites.find(site => site.id === siteId);
        if (!this.currentSite) return;
        
        ui.toggleSiteActions(true);

        document.getElementById('modalTitle').textContent = this.currentSite.displayName || this.currentSite.name;
        
        // Show basic site info
        document.getElementById('siteDetails').innerHTML = `
            <div style="margin-bottom: 1rem;">
                <strong>URL:</strong> <a href="${this.currentSite.webUrl}" target="_blank">${this.currentSite.webUrl}</a>
            </div>
            <div style="margin-bottom: 1rem;">
                <strong>Beschrijving:</strong> ${this.currentSite.description || 'Geen beschrijving'}
            </div>
            <div style="margin-bottom: 1rem;">
                <strong>Site ID:</strong> <code>${this.currentSite.id}</code>
            </div>
        `;

        document.getElementById('siteModal').style.display = 'flex';
    }

    closeModal() {
        document.getElementById('siteModal').style.display = 'none';
        document.getElementById('cleanupResults').style.display = 'none';
        this.currentSite = null;
        ui.toggleSiteActions(false);
    }

    async runDryRun() {
        if (!this.currentSite) return;
        
        // Reset eventuele eerdere annuleringen
        this.cleanupStopped = false;
        
        // Sluit eventuele bestaande SSE verbindingen
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        
        // Maak een nieuwe AbortController voor deze aanvraag
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();
        
        // Haal het aantal te behouden versies op
        this.versionsToKeep = parseInt(document.getElementById('versionsToKeep').value) || 3;
        
        // Toon de voortgangssectie
        document.getElementById('progressSection').style.display = 'block';
    document.getElementById('statusMessage').textContent = `Simulatie wordt gestart... (${this.versionsToKeep} versies behouden)`;
    document.getElementById('currentFolderPath').textContent = '';
        
        // Verberg actieknoppen tijdens de simulatie
        document.getElementById('startDryRunBtn').disabled = true;
        document.getElementById('startRealCleanupBtn').disabled = true;
        document.getElementById('stopCleanupBtn').style.display = 'inline-block';
        document.getElementById('dryRunActions').style.display = 'none';
        
        // Toon demo banner als we geen sessie hebben
        if (!this.sessionId) {
            this.showDemoBanner();
            console.log("No session ID available - operating in demo mode");
        }
        
        // Reset de file details
        document.getElementById('dryRunFileDetails').innerHTML = `
            <div class="select-file-message">
                <i class="fas fa-file-alt"></i>
                <div>
                    <h4>Selecteer een bestand</h4>
                    <p>Klik op een bestand om de versie details te zien</p>
                </div>
            </div>
        `;
        
        try {
            // Gebruik Server-Sent Events voor realtime voortgangsupdates
            if (!this.sessionId || (this.currentSite && this.currentSite.demo)) {
                // Als er geen sessie is of het is een demo site, simuleer dan de voortgang
                document.getElementById('statusMessage').textContent = 'Bestanden scannen...';
                document.getElementById('currentFolderPath').textContent = 'Bestanden worden gescand...';
                await this.simulateProgress('Bestanden scannen...', 0, 20);

                // Vervolg met normale flow voor demo data
                let response;

                try {
                    console.log('Using test endpoint via api.testFiles');
                    response = {
                        ok: true,
                        json: async () => await api.testFiles(this.currentSite.id, this.abortController.signal)
                    };

                    if (this.cleanupStopped) {
                        console.log('Process was stopped during API call');
                        throw new Error('AbortError');
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const files = await response.json();

                    if (this.cleanupStopped) {
                        console.log('Process was stopped during file processing');
                        throw new Error('AbortError');
                    }

                    document.getElementById('statusMessage').textContent = 'Bestanden verwerken...';
                    document.getElementById('currentFolderPath').textContent = 'Bestanden worden verwerkt...';
                    await this.simulateProgress('Bestanden verwerken...', 20, 70);

                    // Verwerk resultaat als het proces niet gestopt is
                    if (!this.cleanupStopped) {
                        await this.processDryRunResults(files);
                    }
                } catch (testError) {
                    if (testError.name === 'AbortError' || testError.message === 'AbortError') {
                        console.log('Test API call was aborted by user');
                        document.getElementById('statusMessage').textContent = 'Proces is gestopt.';
                    } else {
                        console.error('Error fetching test data:', testError);
                        this.showError('Kon geen test data ophalen: ' + testError.message);
                    }

                    // Herstel UI elementen
                    document.getElementById('startDryRunBtn').disabled = false;
                    document.getElementById('startRealCleanupBtn').disabled = false;
                    document.getElementById('stopCleanupBtn').style.display = 'none';
                    document.getElementById('dryRunActions').style.display = 'flex';
                }
                return; // Stop hier als we demo data hebben gebruikt
            }
            
            // Voor echte data: start SSE en doe een dry run met voortgangsupdates
            try {
                // Start Server-Sent Events voor realtime voortgangsupdates
                this.setupSSEForDryRun();
                
                // De rest van de verwerking gebeurt in de SSE event handlers
            } catch (sseError) {
                console.error('Error setting up SSE:', sseError);
                
                // Fallback naar normale API call als SSE niet werkt
                console.log('Falling back to regular API call');
                await this.fallbackToDryRunAPI();
            }
        } catch (error) {
            console.error('Error during dry run:', error);
            
            if (error.name === 'AbortError' || error.message === 'AbortError') {
                document.getElementById('statusMessage').textContent = 'Proces is gestopt.';
            } else {
                this.showError(`Fout tijdens simulatie: ${error.message}`);
                document.getElementById('statusMessage').textContent = 'Simulatie mislukt.';
            }
            
            // Herstel UI
            document.getElementById('startDryRunBtn').disabled = false;
            document.getElementById('startRealCleanupBtn').disabled = false;
            document.getElementById('stopCleanupBtn').style.display = 'none';
            document.getElementById('dryRunActions').style.display = 'flex';
        }
    }
    
    displayDryRunResults(files) {
        return displayDryRunResultsUtil(this, files);
    }
    
    // Bepaal het bestandstype-icoon op basis van de extensie (gedelegeerd)
    getFileIcon(fileName) { return getFileIconUtil(fileName); }
    
    // Toon versie details voor een geselecteerd bestand
    async showFileVersionDetails(fileId) { return showFileVersionDetailsUtil(this, fileId); }
    
    displayFileVersions(fileData) { return displayFileVersionsUtil(this, fileData); }
    
    async runRealCleanup(isDryRun = false) {
        if (!this.currentSite) return;
        
        // Reset eventuele eerdere annuleringen
        this.cleanupStopped = false;
        
        // Maak een nieuwe AbortController voor deze aanvraag
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();
        
        const versionsToKeep = parseInt(document.getElementById('versionsToKeep').value) || 3;
        
        // Toon de voortgangssectie
        document.getElementById('progressSection').style.display = 'block';
        document.getElementById('statusMessage').textContent = isDryRun ? 'Simulatie wordt uitgevoerd...' : 'Echte opschoning wordt uitgevoerd...';
        document.getElementById('currentFolderPath').textContent = 'Verbinding maken...';
        
        // Verberg actieknoppen tijdens de opschoning
        document.getElementById('startDryRunBtn').disabled = true;
        document.getElementById('startRealCleanupBtn').disabled = true;
        document.getElementById('dryRunActions').style.display = 'none';
        document.getElementById('stopCleanupBtn').style.display = 'inline-block';
        
        try {
            if (isDryRun) {
                // Dry run - gebruik de bestaande functionaliteit
                await this.runDryRun();
                return;
            }
            
            // Echte cleanup via API
            await this.simulateProgress('Verbinding maken met SharePoint...', 0, 10);
            
            if (this.cleanupStopped) {
                throw new Error('AbortError');
            }
            
            // Toon een waarschuwing aan de gebruiker
            if (confirm('Let op: Je staat op het punt om WERKELIJK oude versies te verwijderen.\n\nBelangrijk: De huidige (nieuwste) versie wordt altijd behouden.\nDit kan niet ongedaan worden gemaakt.\n\nWil je doorgaan?')) {
                await this.simulateProgress('Bezig met verwijderen van oude versies...', 10, 30);
                
                const response = await fetch(`/api/sharepoint/sites/${this.currentSite.id}/cleanup?dryRun=false`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-ID': this.sessionId
                    },
                    body: JSON.stringify({ versionsToKeep }),
                    signal: this.abortController.signal
                });
                
                if (this.cleanupStopped) {
                    throw new Error('AbortError');
                }
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const result = await response.json();
                
                if (this.cleanupStopped) {
                    throw new Error('AbortError');
                }
                
                await this.simulateProgress('Opschoning voltooid!', 80, 100);
                
                this.showCleanupResults(result);
                document.getElementById('statusMessage').textContent = `Opschoning voltooid! ${result.versionsToRemove || 0} versies verwijderd van ${result.totalFiles || 0} bestanden.`;
                this.showSuccess('Opschoning succesvol voltooid!');
            } else {
                // Gebruiker heeft geannuleerd
                document.getElementById('statusMessage').textContent = 'Opschoning geannuleerd door gebruiker.';
                throw new Error('Cancelled by user');
            }
        } catch (error) {
            console.error('Error during cleanup:', error);
            
            if (error.name === 'AbortError' || error.message === 'AbortError') {
                document.getElementById('statusMessage').textContent = 'Proces is gestopt.';
            } else if (error.message === 'Cancelled by user') {
                // Doe niets, we hebben al een bericht getoond
            } else {
                this.showError('Fout tijdens opschoning: ' + error.message);
                document.getElementById('statusMessage').textContent = 'Opschoning mislukt.';
            }
        } finally {
            // Herstel knoppen na afloop
            document.getElementById('startDryRunBtn').disabled = false;
            document.getElementById('startRealCleanupBtn').disabled = false;
            document.getElementById('stopCleanupBtn').style.display = 'none';
            document.getElementById('dryRunActions').style.display = 'flex';
        }
    }
    
    async processDryRunResults(files) { return processDryRunResultsUtil(this, files); }
    
    setupSSEForDryRun() {
        try {
            // Als er een bestaande verbinding is, sluit deze
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
            
            // URL voor de SSE verbinding
            const siteId = this.currentSite.id;
            const versionsToKeep = this.versionsToKeep;
            const sseUrl = `/api/sharepoint/sites/${siteId}/cleanup?dryRun=true&versionsToKeep=${versionsToKeep}&sessionId=${encodeURIComponent(this.sessionId || '')}`;
            
            console.log('Setting up SSE connection to:', sseUrl);
            
            // Open een nieuwe SSE verbinding
            this.eventSource = connectSSE(sseUrl, {
                onOpen: () => {
                    console.log('SSE connection opened');
                    document.getElementById('statusMessage').textContent = 'Verbinding gemaakt met server...';
                    document.getElementById('currentFolderPath').textContent = 'Wachten op gegevens...';
                },
                onProgress: (data) => {
                    if (this.cleanupStopped) return;
                    const folderPath = data.folderPath || 'Onbekend';
                    const progress = data.progress || 0;
                    const progressBar = document.getElementById('progressIndicator');
                    const progressText = document.getElementById('progressText');
                    if (typeof progress === 'number' && !isNaN(progress)) {
                        progressBar.style.width = `${progress}%`;
                        progressText.textContent = `${Math.round(progress)}%`;
                        progressBar.classList.remove('progress-animated');
                    } else {
                        progressBar.style.width = '100%';
                        progressText.textContent = 'Bezig...';
                        progressBar.classList.add('progress-animated');
                    }
                    // Only update if different to avoid redundant display
                    const currentPathEl = document.getElementById('currentFolderPath');
                    if (currentPathEl.textContent !== folderPath) {
                        currentPathEl.textContent = folderPath;
                    }
                    // Keep status message generic to avoid duplication
                    let statusType = 'mappen';
                    if (folderPath && /\.[a-zA-Z0-9]{2,5}$/.test(folderPath)) statusType = 'bestanden';
                    const statusMsg = `Bezig met scannen van ${statusType}...`;
                    const statusEl = document.getElementById('statusMessage');
                    if (statusEl.textContent !== statusMsg) {
                        statusEl.textContent = statusMsg;
                    }
                },
                onComplete: (data) => {
                    console.log('Received complete event with data:', data.result);
                    if (this.eventSource) { this.eventSource.close(); this.eventSource = null; }
                    if (data.result && data.result.details && !Array.isArray(data.result.details)) {
                        const details = data.result.details;
                        const versionsToKeep = this.versionsToKeep || (parseInt(document.getElementById('versionsToKeep').value) || 10);
                        const filesArray = Object.entries(details)
                            .filter(([key]) => key && typeof key === 'string')
                            .map(([key, info]) => {
                            const path = info.path || key;
                            const name = path.split('/').pop();
                            const totalVersions = info.totalVersions || 0;
                            const toRemove = info.versionsToRemove || Math.max(0, totalVersions - versionsToKeep);
                            return { id: path, name, path, versions: totalVersions, toKeep: Math.min(totalVersions, versionsToKeep), toRemove, storageSavings: info.storageSavings || 'Onbekend', originalFile: info };
                        });
                        this.displayDryRunResults(filesArray);
                    } else {
                        this.processDryRunResults(data.result.files || []);
                    }
                    if (data.result) {
                        if (typeof data.result.totalFiles !== 'undefined') document.getElementById('dryRunTotalFiles').textContent = data.result.totalFiles;
                        if (typeof data.result.totalVersions !== 'undefined') document.getElementById('dryRunTotalVersions').textContent = data.result.totalVersions;
                        if (typeof data.result.versionsToRemove !== 'undefined') document.getElementById('dryRunVersionsToRemove').textContent = data.result.versionsToRemove;
                        if (typeof data.result.totalStorageSavings !== 'undefined') document.getElementById('dryRunStorageSavings').textContent = data.result.totalStorageSavings;
                    }
                    document.getElementById('statusMessage').textContent = 'Simulatie voltooid!';
                    const progressBar = document.getElementById('progressIndicator');
                    const progressText = document.getElementById('progressText');
                    progressBar.classList.remove('progress-animated');
                    progressBar.style.width = '100%';
                    progressText.textContent = '100%';
                },
                onError: (event) => {
                    console.error('SSE connection error:', event);
                    if (!this.cleanupStopped) {
                        if (this.eventSource) { this.eventSource.close(); this.eventSource = null; }
                        this.fallbackToDryRunAPI();
                    }
                }
            });
        } catch (error) {
            console.error('Error setting up SSE:', error);
            throw error; // Rethrow the error so the caller can handle it
        }
    }
    
    async fallbackToDryRunAPI() {
        console.log('Falling back to traditional API call');
        document.getElementById('statusMessage').textContent = 'Bezig met alternatieve methode...';
        // Toon een duidelijke fase in de blauwe infobalk
        document.getElementById('currentFolderPath').textContent = 'API verbinding opzetten...';
        
        try {
            await this.simulateProgress('API verbinding opzetten...', 0, 20);
            document.getElementById('currentFolderPath').textContent = 'Bestanden ophalen...';
            
            if (this.cleanupStopped) {
                console.log('Process was stopped before API call');
                throw new Error('AbortError');
            }
            
            // Gebruik API helper
            const response = {
                ok: true,
                json: async () => await api.cleanupDryRun(this.currentSite.id, this.versionsToKeep, this.abortController.signal)
            };
            
            if (this.cleanupStopped) {
                console.log('Process was stopped during API call');
                throw new Error('AbortError');
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (this.cleanupStopped) {
                console.log('Process was stopped after API call');
                throw new Error('AbortError');
            }
            
            await this.simulateProgress('Resultaten verwerken...', 50, 90);
            document.getElementById('currentFolderPath').textContent = 'Resultaten verwerken...';
            
            // Update summary stats
            document.getElementById('dryRunTotalFiles').textContent = result.totalFiles;
            document.getElementById('dryRunTotalVersions').textContent = result.totalVersions;
            document.getElementById('dryRunVersionsToRemove').textContent = result.versionsToRemove;
            document.getElementById('dryRunStorageSavings').textContent = result.totalStorageSavings || 'Onbekend';
            
            // Converteer de details van object naar array
            let files = [];
            
            if (result.details) {
                files = Object.entries(result.details)
                    .filter(([key]) => key && typeof key === 'string')
                    .map(([key, detail]) => {
                    return {
                        id: key,
                        name: key.split('/').pop(),
                        path: detail.path || key,
                        totalVersions: detail.totalVersions,
                        versions: detail.totalVersions,
                        toKeep: detail.versionsToKeep,
                        toRemove: detail.versionsToRemove,
                        storageSavings: detail.storageSavings
                    };
                });
            } else if (result.files && Array.isArray(result.files)) {
                // API returned array format
                files = result.files;
            }
            
            await this.processDryRunResults(files);
            // Klaar
            document.getElementById('currentFolderPath').textContent = 'Simulatie voltooid';
        } catch (error) {
            if (error.name === 'AbortError' || error.message === 'AbortError') {
                console.log('Request was aborted');
                document.getElementById('statusMessage').textContent = 'Proces is gestopt.';
            } else {
                console.error('Error in fallback API:', error);
                this.showError(`Fout tijdens API aanroep: ${error.message}`);
                document.getElementById('statusMessage').textContent = 'Simulatie mislukt.';
            }
            
            // Herstel UI
            document.getElementById('startDryRunBtn').disabled = false;
            document.getElementById('startRealCleanupBtn').disabled = false;
            document.getElementById('stopCleanupBtn').style.display = 'none';
            document.getElementById('dryRunActions').style.display = 'flex';
        }
    }
    
    async simulateProgress(statusText, startPercent, endPercent) {
        document.getElementById('statusMessage').textContent = statusText;
        
        const duration = 1500; // milliseconds
        const steps = 30;
        const stepDuration = duration / steps;
        const percentStep = (endPercent - startPercent) / steps;
        
        for (let i = 0; i <= steps; i++) {
            // Check of het proces gestopt is
            if (this.cleanupStopped) {
                console.log('Progress simulation stopped by user');
                break;
            }
            
            const currentPercent = startPercent + (percentStep * i);
            document.getElementById('progressIndicator').style.width = currentPercent + '%';
            document.getElementById('progressText').textContent = Math.round(currentPercent) + '%';
            
            await new Promise(resolve => setTimeout(resolve, stepDuration));
        }
    }
    
    stopCleanup() {
        console.log('User requested to stop cleanup process');
        
        // Markeer het proces als gestopt
        this.cleanupStopped = true;
        document.getElementById('statusMessage').textContent = 'Proces wordt gestopt...';
        
        // Annuleer eventuele actieve SSE verbinding
        if (this.eventSource) {
            try {
                this.eventSource.close();
                this.eventSource = null;
                console.log('Event source closed by user');
            } catch (error) {
                console.error('Error closing event source:', error);
            }
        }
        
        // Stuur een annuleringsverzoek naar de server als er een actieve aanvraag is
        if (this.abortController) {
            try {
                this.abortController.abort();
                console.log('API request aborted by user');
            } catch (error) {
                console.error('Error aborting request:', error);
            } finally {
                this.abortController = null;
            }
        }
        
        // Update UI
        document.getElementById('statusMessage').textContent = 'Proces is gestopt.';
        document.getElementById('stopCleanupBtn').style.display = 'none';
        document.getElementById('startDryRunBtn').disabled = false;
        document.getElementById('startRealCleanupBtn').disabled = false;
        document.getElementById('dryRunActions').style.display = 'flex';
    }
    
    async startCleanup() {
        if (!this.currentSite || !this.sessionId) return;

        const versionsToKeep = parseInt(document.getElementById('versionsToKeep').value) || 10;
        const cleanupBtn = document.getElementById('cleanupBtn');
        const originalText = cleanupBtn.innerHTML;

        cleanupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Bezig...';
        cleanupBtn.disabled = true;

        try {
            const response = await fetch(`/api/sharepoint/sites/${this.currentSite.id}/cleanup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-ID': this.sessionId
                },
                body: JSON.stringify({ versionsToKeep })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            this.showCleanupResults(result);
            this.showSuccess('Versie opschoning voltooid!');
        } catch (error) {
            console.error('Cleanup error:', error);
            this.showError('Fout bij versie opschoning');
        } finally {
            cleanupBtn.innerHTML = originalText;
            cleanupBtn.disabled = false;
        }
    }

    showCleanupResults(result) {
        const resultsDiv = document.getElementById('cleanupResults');
        let html = '';
        if (result.dryRun) {
            html += `<h5>Dry Run Resultaten</h5>`;
            html += `<p><strong>Totaal versies die zouden worden verwijderd:</strong> ${result.totalDeleted}</p>`;
        } else {
            html += `<h5>Opschoning Resultaten</h5>`;
            html += `<p><strong>Totaal verwijderde versies:</strong> ${result.totalDeleted}</p>`;
        }

        if (result.processedFiles && result.processedFiles.length > 0) {
            html += `<h6>Verwerkte Bestanden:</h6><ul>`;
            result.processedFiles.forEach(file => {
                if (result.dryRun) {
                    html += `<li>${file.fileName} (${file.libraryName}): <strong>${file.deletedVersions}</strong> versies zouden worden verwijderd</li>`;
                } else {
                    html += `<li>${file.fileName} (${file.libraryName}): <strong>${file.deletedVersions}</strong> versies verwijderd</li>`;
                }
            });
            html += `</ul>`;
        } else if (result.message) {
            html += `<p><em>${result.message}</em></p>`;
        }

        resultsDiv.innerHTML = html;
        resultsDiv.style.display = 'block';
    }

    // Run real cleanup for selected sites (bulk)
    async bulkCleanup() {
        const selectedSites = this.getSelectedSites();
        if (selectedSites.length === 0) {
            this.showError('Selecteer eerst sites om op te schonen');
            return;
        }
        if (!this.sessionId) {
            this.showError('Inloggen vereist voor echte opschoning');
            this.showDemoBanner();
            return;
        }

        const versionsInput = document.getElementById('bulkVersionsToKeep');
        const versionsToKeep = versionsInput ? (parseInt(versionsInput.value) || 3) : 3;

        const confirmMsg = `Je staat op het punt om echte opschoning uit te voeren voor ${selectedSites.length} site(s).\n\nDit verwijdert oude versies en kan niet ongedaan worden gemaakt.\nDe huidige (nieuwste) versie blijft altijd behouden.\n\nDoorgaan?`;
        if (!confirm(confirmMsg)) {
            return;
        }

        await this.runBulkCleanupForSites(selectedSites, versionsToKeep, 'Bulk Opschoning');
    }

    // Start real cleanup for the sites from the last bulk dry run
    async startBulkCleanupFromDryRun() {
        const sites = this.lastBulkDryRunSites || [];
        const versionsToKeep = this.lastBulkVersionsToKeep || 3;
        if (!sites.length) {
            this.showError('Geen vorige dry run resultaten gevonden');
            return;
        }
        if (!this.sessionId) {
            this.showError('Inloggen vereist voor echte opschoning');
            this.showDemoBanner();
            return;
        }

        const confirmMsg = `Echte opschoning starten voor ${sites.length} site(s) op basis van de laatste dry run?`;
        if (!confirm(confirmMsg)) return;

        await this.runBulkCleanupForSites(sites, versionsToKeep, 'Bulk Opschoning (van Dry Run)');
    }

    // Internal helper to perform bulk real cleanup with UI feedback
    async runBulkCleanupForSites(siteIds, versionsToKeep, title) {
        // Setup abort controller
        this.bulkScanAbortController = new AbortController();
        this.bulkScanCancelled = false;

        const overlay = document.getElementById('bulkProgressOverlay');
        const progressBar = document.getElementById('bulkProgressBar');
        const progressText = document.getElementById('bulkProgressText');
        const statusMessage = document.getElementById('bulkStatusMessage');
        const folderPath = document.getElementById('bulkCurrentFolder');
        const resultsDiv = document.getElementById('bulkResults');
        const closeBtn = document.getElementById('closeBulkProgress');

        if (!overlay) {
            // No overlay present, run simple sequential cleanup
            let success = 0; let failed = 0;
            for (const siteId of siteIds) {
                try {
                    await api.cleanupReal(siteId, versionsToKeep, this.bulkScanAbortController.signal);
                    success++;
                    await new Promise(r => setTimeout(r, 500));
                } catch (e) {
                    if (e.name === 'AbortError') break;
                    failed++;
                }
            }
            this.showSuccess(`Opschoning voltooid: ${success} succesvol, ${failed} gefaald`);
            return;
        }

        document.getElementById('bulkProgressTitle').textContent = `${title} — ${versionsToKeep} versies behouden`;
        overlay.style.display = 'flex';
        resultsDiv.style.display = 'none';
        closeBtn.style.display = 'none';

        let success = 0;
        let failed = 0;
        let totalFiles = 0;
        let versionsRemoved = 0;
        let storageSavingsBytes = 0;

        for (let i = 0; i < siteIds.length; i++) {
            if (this.bulkScanCancelled) break;
            const siteId = siteIds[i];
            const site = this.sites.find(s => s.id === siteId);
            const siteName = site ? (site.displayName || site.name) : siteId;

            statusMessage.innerHTML = `<i class="fas fa-broom"></i> Opschonen ${siteName} (${i + 1}/${siteIds.length})...`;
            folderPath.textContent = 'Verbinding maken...';

            try {
                const result = await api.cleanupReal(siteId, versionsToKeep, this.bulkScanAbortController.signal);
                success++;
                totalFiles += result.totalFiles || 0;
                versionsRemoved += result.versionsToRemove || 0;
                storageSavingsBytes += result.totalStorageSavingsBytes || 0;
                progressBar.style.width = `${Math.round(((i + 1) / siteIds.length) * 100)}%`;
                progressText.textContent = `${i + 1}/${siteIds.length} sites`;
                folderPath.textContent = `✓ ${siteName} opgeschoond`;
                await new Promise(r => setTimeout(r, 500));
            } catch (error) {
                if (error.name === 'AbortError') {
                    statusMessage.innerHTML = '<i class="fas fa-pause-circle"></i> Opschoning gepauzeerd';
                    break;
                }
                console.error(`Cleanup error for site ${siteId}:`, error);
                failed++;
                folderPath.textContent = `✗ ${siteName}: ${error.message}`;
                // small delay before next
                await new Promise(r => setTimeout(r, 300));
            }
        }

        // Finalize
        progressBar.style.width = '100%';
        progressText.textContent = '100%';
        const totalAttempted = success + failed;
        if (failed > 0) {
            statusMessage.innerHTML = `<i class="fas fa-check-circle" style="color: #ff9800;"></i> Voltooid met ${failed} fouten (${success}/${totalAttempted} sites)`;
        } else {
            statusMessage.innerHTML = `<i class="fas fa-check-circle" style="color: #4caf50;"></i> Alle ${success} sites succesvol opgeschoond!`;
        }
        document.getElementById('bulkSitesProcessed').textContent = success;
        document.getElementById('bulkTotalFiles').textContent = totalFiles;
        document.getElementById('bulkVersionsToRemove').textContent = versionsRemoved;
        document.getElementById('bulkStorageSavings').textContent = this.formatFileSize(storageSavingsBytes);
        resultsDiv.style.display = 'block';
        closeBtn.style.display = 'block';
    }

    getSelectedSites() {
        const checkboxes = document.querySelectorAll('.site-checkbox:checked');
        return Array.from(checkboxes).map(cb => cb.dataset.siteId);
    }

    selectAllSites() {
        const checkboxes = document.querySelectorAll('.site-checkbox');
        checkboxes.forEach(cb => cb.checked = true);
        this.updateBulkActions();
        
        // Toggle button visibility
        document.getElementById('selectAllSitesBtn').style.display = 'none';
        document.getElementById('deselectAllSitesBtn').style.display = 'inline-flex';
    }

    deselectAllSites() {
        const checkboxes = document.querySelectorAll('.site-checkbox');
        checkboxes.forEach(cb => cb.checked = false);
        this.updateBulkActions();
        
        // Toggle button visibility
        document.getElementById('selectAllSitesBtn').style.display = 'inline-flex';
        document.getElementById('deselectAllSitesBtn').style.display = 'none';
    }

    updateBulkActions() {
        const selectedSites = this.getSelectedSites();
        const bulkDryRunBtn = document.getElementById('bulkDryRunBtn');
        const bulkCleanupBtn = document.getElementById('bulkCleanupBtn');
        
        bulkDryRunBtn.disabled = selectedSites.length === 0;
        bulkCleanupBtn.disabled = selectedSites.length === 0;
        
        // Update button visibility based on selection
        const allCheckboxes = document.querySelectorAll('.site-checkbox');
        const allChecked = allCheckboxes.length > 0 && Array.from(allCheckboxes).every(cb => cb.checked);
        
        if (allChecked && allCheckboxes.length > 0) {
            document.getElementById('selectAllSitesBtn').style.display = 'none';
            document.getElementById('deselectAllSitesBtn').style.display = 'inline-flex';
        } else if (selectedSites.length === 0) {
            document.getElementById('selectAllSitesBtn').style.display = 'inline-flex';
            document.getElementById('deselectAllSitesBtn').style.display = 'none';
        }
    }

    // Bulk scan methods - restored functionality
    async bulkDryRun() {
        const selectedSites = this.getSelectedSites();
        if (selectedSites.length === 0) {
            this.showError('Selecteer eerst sites om te scannen');
            return;
        }

        // Get versionsToKeep from bulk input
        const versionsToKeepInput = document.getElementById('bulkVersionsToKeep');
        const versionsToKeep = versionsToKeepInput ? parseInt(versionsToKeepInput.value) || 3 : 3;

        // Create a new AbortController for this bulk scan
        this.bulkScanAbortController = new AbortController();
        
        // Reset cancelled state
        this.bulkScanCancelled = false;
        this.currentEventSource = null;
        this.completedSitesInBulkRun = [];

        // Store for later use in cleanup and resumption
        this.lastBulkDryRunSites = selectedSites;
        this.lastBulkVersionsToKeep = versionsToKeep;

        // Show bulk progress overlay
        const overlay = document.getElementById('bulkProgressOverlay');
        const progressBar = document.getElementById('bulkProgressBar');
        const progressText = document.getElementById('bulkProgressText');
        const statusMessage = document.getElementById('bulkStatusMessage');
        const folderPath = document.getElementById('bulkCurrentFolder');
        const resultsDiv = document.getElementById('bulkResults');
        const closeBtn = document.getElementById('closeBulkProgress');
        const cleanupBtn = document.getElementById('startBulkCleanupFromResults');
        
        if (overlay) {
            document.getElementById('bulkProgressTitle').textContent = `Bulk Dry Run - Scanning Sites (${versionsToKeep} versions to keep)`;
            overlay.style.display = 'flex';
            resultsDiv.style.display = 'none';
            closeBtn.style.display = 'none';
            cleanupBtn.style.display = 'none';

            let success = 0;
            let failed = 0;
            let totalResults = {
                totalFiles: 0,
                totalVersions: 0,
                versionsToRemove: 0,
                storageSavingsBytes: 0
            };

            // Retry logic with exponential backoff
            const retryCleanupDryRun = async (siteId, versionsToKeep, maxRetries = 3) => {
                let lastError;
                for (let attempt = 0; attempt < maxRetries; attempt++) {
                    try {
                        console.log(`Attempt ${attempt + 1}/${maxRetries} for site ${siteId}`);
                        return await api.cleanupDryRun(siteId, versionsToKeep, this.bulkScanAbortController.signal);
                    } catch (error) {
                        lastError = error;
                        if (error.name === 'AbortError') {
                            throw error; // Don't retry aborts
                        }
                        
                        // Only retry on 500+ errors (server errors)
                        const is500Error = error.message && error.message.includes('HTTP 500');
                        const is503Error = error.message && error.message.includes('HTTP 503');
                        
                        if (!is500Error && !is503Error && attempt < maxRetries - 1) {
                            throw error; // Don't retry other errors
                        }
                        
                        if (attempt < maxRetries - 1) {
                            const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10s
                            console.warn(`Site ${siteId} failed (attempt ${attempt + 1}), retrying in ${backoffMs}ms...`, error.message);
                            await new Promise(resolve => setTimeout(resolve, backoffMs));
                        }
                    }
                }
                throw lastError || new Error('Unknown error after retries');
            };

            // Process sites in batches to avoid overwhelming the server
            const batchSize = 5; // Process 5 sites at a time
            for (let batchStart = 0; batchStart < selectedSites.length; batchStart += batchSize) {
                const batchEnd = Math.min(batchStart + batchSize, selectedSites.length);
                const batch = selectedSites.slice(batchStart, batchEnd);

                for (let i = 0; i < batch.length; i++) {
                    const siteId = batch[i];
                    const currentIndex = batchStart + i;
                    
                    if (this.bulkScanCancelled) {
                        // Save progress to localStorage for resumption
                        this.saveBulkDryRunState(
                            selectedSites,
                            versionsToKeep,
                            this.completedSitesInBulkRun,
                            totalResults
                        );
                        statusMessage.innerHTML = '<i class="fas fa-pause-circle"></i> Scan paused - you can resume this later';
                        break;
                    }

                    try {
                        const site = this.sites.find(s => s.id === siteId);
                        const siteName = site ? (site.displayName || site.name) : 'Unknown';
                        
                        // Skip if already processed
                        if (this.completedSitesInBulkRun.includes(siteId)) {
                            console.log(`Skipping already processed site: ${siteId}`);
                            continue;
                        }
                        
                        statusMessage.innerHTML = `<i class="fas fa-hourglass-half"></i> Scanning ${siteName} (${currentIndex + 1}/${selectedSites.length})...`;
                        folderPath.textContent = 'Connecting...';
                        
                        // Use regular API call for dry run with error handling and abort signal
                        let response;
                        try {
                            response = await retryCleanupDryRun(siteId, versionsToKeep);
                        } catch (apiError) {
                            // Check if it was aborted
                            if (apiError.name === 'AbortError') {
                                console.log(`Bulk scan aborted at site ${siteId}`);
                                this.saveBulkDryRunState(
                                    selectedSites,
                                    versionsToKeep,
                                    this.completedSitesInBulkRun,
                                    totalResults
                                );
                                break;
                            }
                            console.error(`API Error for site ${siteId} after retries:`, apiError);
                            failed++;
                            folderPath.textContent = `✗ ${siteName}: ${apiError.message}`;
                            
                            // Save progress before continuing to next site
                            this.saveBulkDryRunState(
                                selectedSites,
                                versionsToKeep,
                                this.completedSitesInBulkRun,
                                totalResults
                            );
                            continue; // Skip to next site instead of breaking
                        }
                        
                        // Check if the response indicates the site was skipped (access denied)
                        if (response.skipped) {
                            console.warn(`Site ${siteId} was skipped:`, response.error);
                            failed++;
                            folderPath.textContent = `⊘ ${siteName}: ${response.error}`;
                            this.completedSitesInBulkRun.push(siteId); // Mark as processed even though skipped
                            
                            this.saveBulkDryRunState(
                                selectedSites,
                                versionsToKeep,
                                this.completedSitesInBulkRun,
                                totalResults
                            );
                            continue; // Continue to next site
                        }
                        
                        if (this.bulkScanCancelled) {
                            // Save progress again if cancelled during API call
                            this.saveBulkDryRunState(
                                selectedSites,
                                versionsToKeep,
                                this.completedSitesInBulkRun,
                                totalResults
                            );
                            break;
                        }

                        success++;
                        this.completedSitesInBulkRun.push(siteId);
                        
                        // Aggregate results
                        totalResults.totalFiles += response.totalFiles || 0;
                        totalResults.totalVersions += response.totalVersions || 0;
                        totalResults.versionsToRemove += response.versionsToRemove || 0;
                        totalResults.storageSavingsBytes += response.totalStorageSavingsBytes || 0;
                        
                        // Update progress
                        progressBar.style.width = `${Math.round(((currentIndex + 1) / selectedSites.length) * 100)}%`;
                        progressText.textContent = `${currentIndex + 1}/${selectedSites.length} sites`;
                        folderPath.textContent = `${siteName} completed`;
                        
                        // Add small delay between requests to avoid overwhelming the server
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                    } catch (error) {
                        console.error(`Error in dry run for site ${siteId}:`, error);
                        
                        // Check if it's an authentication error
                        if (error.message && error.message.includes('401')) {
                            console.error('Authentication failed - session likely expired');
                            statusMessage.innerHTML = '<i class="fas fa-exclamation-circle" style="color: #f44336;"></i> Authentication expired. Please log in again to continue.';
                            folderPath.textContent = 'Session expired';
                            
                            // Save progress and clear state since auth is invalid
                            this.saveBulkDryRunState(
                                selectedSites,
                                versionsToKeep,
                                this.completedSitesInBulkRun,
                                totalResults
                            );
                            break;
                        }
                        
                        failed++;
                        folderPath.textContent = `Error: ${error.message}`;
                        
                        // Save progress on error but continue to next site
                        this.saveBulkDryRunState(
                            selectedSites,
                            versionsToKeep,
                            this.completedSitesInBulkRun,
                            totalResults
                        );
                        continue; // Continue to next site instead of breaking
                    }
                }
                
                if (this.bulkScanCancelled) {
                    break;
                }
            }

            // Show results
            if (!this.bulkScanCancelled) {
                const completedCount = success;
                const failedCount = failed;
                const totalAttempted = completedCount + failedCount;
                
                if (failedCount > 0) {
                    statusMessage.innerHTML = `<i class="fas fa-check-circle" style="color: #ff9800;"></i> Completed with ${failedCount} error${failedCount !== 1 ? 's' : ''} (${completedCount}/${totalAttempted} sites)`;
                } else {
                    statusMessage.innerHTML = `<i class="fas fa-check-circle" style="color: #4caf50;"></i> All ${completedCount} sites scanned successfully!`;
                }
                
                progressBar.style.width = '100%';
                progressText.textContent = '100%';
                folderPath.textContent = totalAttempted > 0 ? `${completedCount}/${totalAttempted} sites scanned` : 'All sites scanned';
                
                document.getElementById('bulkSitesProcessed').textContent = completedCount;
                document.getElementById('bulkTotalFiles').textContent = totalResults.totalFiles;
                document.getElementById('bulkVersionsToRemove').textContent = totalResults.versionsToRemove;
                document.getElementById('bulkStorageSavings').textContent = this.formatFileSize(totalResults.storageSavingsBytes);
                
                resultsDiv.style.display = 'block';
                
                // Show cleanup button only if there are versions to remove and no failures
                if (totalResults.versionsToRemove > 0 && failedCount === 0) {
                    cleanupBtn.style.display = 'block';
                }
                
                // Clear saved state on completion
                this.clearBulkDryRunState();
            }
            
            closeBtn.style.display = 'block';
        } else {
            // Fallback if no overlay exists
            this.showSuccess(`Bulk dry run started for ${selectedSites.length} sites`);
        }
    }

    async cancelBulkScan() {
        console.log('User requested to cancel bulk scan');
        this.bulkScanCancelled = true;
        
        // Abort any ongoing requests immediately
        if (this.bulkScanAbortController) {
            try {
                this.bulkScanAbortController.abort();
                console.log('Aborted all ongoing cleanup requests');
            } catch (error) {
                console.error('Error aborting bulk scan:', error);
            }
        }
        
        // Close any active event source
        if (this.currentEventSource) {
            try {
                this.currentEventSource.close();
                this.currentEventSource = null;
            } catch (error) {
                console.error('Error closing event source:', error);
            }
        }

        // Update UI if overlay exists
        const statusMessage = document.getElementById('bulkStatusMessage');
        const folderPath = document.getElementById('bulkCurrentFolder');
        const closeBtn = document.getElementById('closeBulkProgress');
        
        if (statusMessage) {
            statusMessage.innerHTML = '<i class="fas fa-pause-circle"></i> Scan paused - you can resume this later';
        }
        if (folderPath) {
            folderPath.textContent = 'Operation paused';
        }
        if (closeBtn) {
            closeBtn.style.display = 'block';
        }
        
        this.showSuccess('Bulk scan paused - your progress has been saved');
    }

    showLoading(show) {
        document.getElementById('loadingSection').style.display = show ? 'block' : 'none';
        document.getElementById('sitesSection').style.display = show ? 'none' : 'block';
    }

    showError(message) {
        document.getElementById('errorText').textContent = message;
        document.getElementById('errorMessage').style.display = 'block';
        setTimeout(() => this.hideError(), 5000);
    }

    showSuccess(message) {
        document.getElementById('successText').textContent = message;
        document.getElementById('successMessage').style.display = 'block';
        setTimeout(() => this.hideSuccess(), 3000);
    }

    hideError() {
        document.getElementById('errorMessage').style.display = 'none';
    }

    hideSuccess() {
        document.getElementById('successMessage').style.display = 'none';
    }

    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    showDemoBanner() {
        document.getElementById('demoBanner').style.display = 'block';
    }

    // Task persistence methods
    saveBulkDryRunState(sites, versionsToKeep, completedSites, results) {
        const state = {
            sites,
            versionsToKeep,
            completedSites,
            results,
            timestamp: Date.now()
        };
        localStorage.setItem('bulkDryRunState', JSON.stringify(state));
        console.log('Bulk dry run state saved:', state);
    }

    loadBulkDryRunState() {
        try {
            const state = JSON.parse(localStorage.getItem('bulkDryRunState'));
            return state;
        } catch (error) {
            console.error('Error loading bulk dry run state:', error);
            return null;
        }
    }

    clearBulkDryRunState() {
        localStorage.removeItem('bulkDryRunState');
        console.log('Bulk dry run state cleared');
    }

    checkForIncompleteTasks() {
        const state = this.loadBulkDryRunState();
        console.log('%c🔍 Checking for incomplete bulk tasks...', 'color: #0078d4; font-size: 14px; font-weight: bold;');
        console.log('Loaded state:', state);
        console.log('Current sessionId:', this.sessionId);
        
        if (state && state.sites && state.completedSites) {
            // Remove duplicates from completedSites
            state.completedSites = [...new Set(state.completedSites)];
            
            const remainingSites = state.sites.filter(siteId => !state.completedSites.includes(siteId));
            
            console.log(`%c📊 Incomplete task found: ${state.sites.length} total, ${state.completedSites.length} completed, ${remainingSites.length} remaining`, 'color: #ff9800; font-size: 12px;');
            
            if (remainingSites.length > 0) {
                // Check if user is still authenticated
                if (!this.sessionId) {
                    console.log('%c⏳ No session available yet, waiting for auth...', 'color: #ff9800; font-size: 12px;');
                    // Try again in a moment (auth might still be loading)
                    setTimeout(() => {
                        if (this.sessionId) {
                            console.log('%c✅ Session now available, showing resumption prompt', 'color: #107c10; font-size: 12px;');
                            this.showTaskResumptionPrompt(state, remainingSites);
                        } else {
                            console.log('%c❌ Still no session after waiting, clearing state', 'color: #d13438; font-size: 12px;');
                            this.clearBulkDryRunState();
                        }
                    }, 1500);
                    return;
                }
                console.log('%c✅ Session valid, showing resumption prompt', 'color: #107c10; font-size: 12px;');
                this.showTaskResumptionPrompt(state, remainingSites);
            } else {
                // All sites were scanned, clear state
                console.log('%c🗑️ All sites already scanned, clearing state', 'color: #757575; font-size: 12px;');
                this.clearBulkDryRunState();
            }
        } else {
            console.log('%c✨ No incomplete bulk dry run state found', 'color: #757575; font-size: 12px;');
        }
    }

    showTaskResumptionPrompt(state, remainingSites) {
        const completedPercentage = Math.round((state.completedSites.length / state.sites.length) * 100);
        const message = `🔄 Je hebt een onvoltooide bulk scan uit vorige sessie!\n\n📊 Voortgang:\n• Totaal sites: ${state.sites.length}\n• Al gescand: ${state.completedSites.length} (${completedPercentage}%)\n• Nog te scannen: ${remainingSites.length}\n• Gegevens bewaart sinds: ${new Date(state.timestamp).toLocaleString('nl-NL')}\n\nWil je doorgaan met scannen?`;
        
        console.log('%c📢 Resumption Prompt Shown', 'color: #0078d4; font-size: 14px; font-weight: bold;');
        console.log('State:', state);
        console.log('Remaining sites:', remainingSites);
        
        // Create a custom prompt or use confirm
        if (confirm(message)) {
            console.log('%c✅ User accepted resumption', 'color: #107c10; font-size: 12px; font-weight: bold;');
            this.resumeBulkDryRun(state, remainingSites);
        } else {
            console.log('%c❌ User declined resumption', 'color: #d13438; font-size: 12px; font-weight: bold;');
            this.clearBulkDryRunState();
        }
    }

    resumeBulkDryRun(state, remainingSites) {
        console.log('Resuming bulk dry run with remaining sites:', remainingSites);
        
        // Restore state
        this.lastBulkDryRunSites = state.sites;
        this.lastBulkVersionsToKeep = state.versionsToKeep;
        this.completedSitesInBulkRun = state.completedSites;
        this.lastBulkResults = state.results;
        
        // Reset cancel flag
        this.bulkScanCancelled = false;

        // Show overlay and continue scanning
        const overlay = document.getElementById('bulkProgressOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            
            // Update UI with saved progress
            document.getElementById('bulkProgressTitle').textContent = `Bulk Dry Run - Resuming (${state.versionsToKeep} versions to keep)`;
            const statusMessage = document.getElementById('bulkStatusMessage');
            statusMessage.textContent = `Resuming bulk scan from previous session...`;
            statusMessage.innerHTML = '<i class="fas fa-sync"></i> Resuming scan...';
            
            // Continue scanning remaining sites
            this.continueBulkDryRun(remainingSites, state.versionsToKeep, state.results);
        }
    }

    async continueBulkDryRun(remainingSites, versionsToKeep, accumulatedResults) {
        // Create new abort controller for this continuation
        if (!this.bulkScanAbortController) {
            this.bulkScanAbortController = new AbortController();
        }
        
        const progressBar = document.getElementById('bulkProgressBar');
        const progressText = document.getElementById('bulkProgressText');
        const statusMessage = document.getElementById('bulkStatusMessage');
        const folderPath = document.getElementById('bulkCurrentFolder');
        const resultsDiv = document.getElementById('bulkResults');
        const closeBtn = document.getElementById('closeBulkProgress');
        const cleanupBtn = document.getElementById('startBulkCleanupFromResults');

        let success = this.completedSitesInBulkRun.length;
        let failed = 0;
        
        // Continue with accumulated results from before
        let totalResults = accumulatedResults || {
            totalFiles: 0,
            totalVersions: 0,
            versionsToRemove: 0,
            storageSavingsBytes: 0
        };

        const totalSites = this.lastBulkDryRunSites.length;
        
        console.log('%c🔄 Starting continueBulkDryRun', 'color: #0078d4; font-size: 12px; font-weight: bold;');
        console.log(`Remaining: ${remainingSites.length}/${totalSites}, Already completed: ${success}, Total results so far:`, totalResults);

        // Retry logic with exponential backoff
        const retryCleanupDryRun = async (siteId, versionsToKeep, maxRetries = 3) => {
            let lastError;
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    console.log(`Attempt ${attempt + 1}/${maxRetries} for site ${siteId}`);
                    return await api.cleanupDryRun(siteId, versionsToKeep, this.bulkScanAbortController.signal);
                } catch (error) {
                    lastError = error;
                    if (error.name === 'AbortError') {
                        throw error; // Don't retry aborts
                    }
                    
                    // Only retry on 500+ errors (server errors) or timeout-ish errors
                    const is500Error = error.message && error.message.includes('HTTP 500');
                    const is503Error = error.message && error.message.includes('HTTP 503');
                    
                    if (!is500Error && !is503Error && attempt < maxRetries - 1) {
                        throw error; // Don't retry other errors
                    }
                    
                    if (attempt < maxRetries - 1) {
                        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10s
                        console.warn(`Site ${siteId} failed (attempt ${attempt + 1}), retrying in ${backoffMs}ms...`, error.message);
                        await new Promise(resolve => setTimeout(resolve, backoffMs));
                    }
                }
            }
            throw lastError || new Error('Unknown error after retries');
        };

        for (let i = 0; i < remainingSites.length; i++) {
            const siteId = remainingSites[i];
            
            if (this.bulkScanCancelled) {
                // Save progress again
                this.saveBulkDryRunState(
                    this.lastBulkDryRunSites,
                    versionsToKeep,
                    this.completedSitesInBulkRun,
                    totalResults
                );
                statusMessage.innerHTML = '<i class="fas fa-info-circle"></i> Scan paused - can be resumed later';
                break;
            }

            try {
                const site = this.sites.find(s => s.id === siteId);
                const siteName = site ? (site.displayName || site.name) : 'Unknown';
                
                // Current count is success (already completed) + current position in remaining loop
                const currentSiteNumber = success + i + 1;
                statusMessage.innerHTML = `<i class="fas fa-hourglass-half"></i> Scanning ${siteName} (${currentSiteNumber}/${totalSites})...`;
                folderPath.textContent = 'Connecting...';
                
                let response;
                try {
                    response = await retryCleanupDryRun(siteId, versionsToKeep);
                } catch (apiError) {
                    // Check if it was aborted
                    if (apiError.name === 'AbortError') {
                        console.log(`Bulk scan aborted at site ${siteId}`);
                        this.saveBulkDryRunState(
                            this.lastBulkDryRunSites,
                            versionsToKeep,
                            this.completedSitesInBulkRun,
                            totalResults
                        );
                        break;
                    }
                    console.error(`API Error for site ${siteId} after retries:`, apiError);
                    failed++;
                    folderPath.textContent = `✗ ${siteName}: ${apiError.message}`;
                    
                    // Save progress before continuing to next site
                    this.saveBulkDryRunState(
                        this.lastBulkDryRunSites,
                        versionsToKeep,
                        this.completedSitesInBulkRun,
                        totalResults
                    );
                    continue; // Skip to next site instead of breaking
                }
                
                // Check if the response indicates the site was skipped (access denied)
                if (response.skipped) {
                    console.warn(`Site ${siteId} was skipped:`, response.error);
                    failed++;
                    folderPath.textContent = `⊘ ${siteName}: ${response.error}`;
                    this.completedSitesInBulkRun.push(siteId); // Mark as processed even though skipped
                    
                    this.saveBulkDryRunState(
                        this.lastBulkDryRunSites,
                        versionsToKeep,
                        this.completedSitesInBulkRun,
                        totalResults
                    );
                    continue; // Continue to next site
                }
                
                if (this.bulkScanCancelled) {
                    break;
                }

                success++;
                this.completedSitesInBulkRun.push(siteId);
                
                // Aggregate results
                totalResults.totalFiles += response.totalFiles || 0;
                totalResults.totalVersions += response.totalVersions || 0;
                totalResults.versionsToRemove += response.versionsToRemove || 0;
                totalResults.storageSavingsBytes += response.totalStorageSavingsBytes || 0;
                
                // Update progress bar
                const overallProgress = Math.round((success / totalSites) * 100);
                progressBar.style.width = `${overallProgress}%`;
                progressText.textContent = `${success}/${totalSites} (${overallProgress}%)`;
                folderPath.textContent = `✓ ${siteName} completed`;
                
                console.log(`%c✅ Site ${success}/${totalSites} completed: ${siteName}`, 'color: #107c10; font-size: 11px;');
                
                // Add small delay between requests to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Auto-save progress every 2 sites
                if (i % 2 === 0) {
                    this.saveBulkDryRunState(
                        this.lastBulkDryRunSites,
                        versionsToKeep,
                        this.completedSitesInBulkRun,
                        totalResults
                    );
                }
                
            } catch (error) {
                console.error(`Unexpected error in dry run for site ${siteId}:`, error);
                
                // Check if it's an authentication error
                if (error.message && error.message.includes('401')) {
                    console.error('Authentication failed - session likely expired');
                    statusMessage.innerHTML = '<i class="fas fa-exclamation-circle" style="color: #f44336;"></i> Authentication expired. Please log in again to continue.';
                    folderPath.textContent = 'Session expired';
                    
                    // Clear the saved state since auth is invalid
                    this.clearBulkDryRunState();
                    break;
                }
                
                failed++;
                folderPath.textContent = `Error: ${error.message}`;
                // Continue to next site even after unexpected errors
                continue;
            }
        }

        // Show final results
        if (!this.bulkScanCancelled) {
            const completedCount = success;
            const failedCount = failed;
            const totalAttempted = completedCount + failedCount;
            
            if (failedCount > 0) {
                statusMessage.innerHTML = `<i class="fas fa-check-circle" style="color: #ff9800;"></i> Completed with ${failedCount} error${failedCount !== 1 ? 's' : ''} (${completedCount}/${totalAttempted} sites)`;
            } else {
                statusMessage.textContent = 'Scan completed successfully!';
            }
            
            progressBar.style.width = '100%';
            progressText.textContent = '100%';
            folderPath.textContent = totalAttempted > 0 ? `${completedCount}/${totalAttempted} sites scanned` : 'All sites scanned';
            
            document.getElementById('bulkSitesProcessed').textContent = completedCount;
            document.getElementById('bulkTotalFiles').textContent = totalResults.totalFiles;
            document.getElementById('bulkVersionsToRemove').textContent = totalResults.versionsToRemove;
            document.getElementById('bulkStorageSavings').textContent = this.formatFileSize(totalResults.storageSavingsBytes);
            
            resultsDiv.style.display = 'block';
            
            if (totalResults.versionsToRemove > 0 && failedCount === 0) {
                cleanupBtn.style.display = 'block';
            }
            
            if (failed > 0) {
                statusMessage.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #ff9800;"></i> Completed with ${failed} errors. ${success} sites scanned successfully.`;
            } else {
                statusMessage.innerHTML = `<i class="fas fa-check-circle" style="color: #4caf50;"></i> All ${success} sites scanned successfully!`;
            }
            
            // Clear saved state on completion
            this.clearBulkDryRunState();
        }
        
        closeBtn.style.display = 'block';
    }
    
    getMockSites() {
        return [
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
    }
}

// Initialize the app
const app = new SharePointManager();
// Zorg dat de app ook beschikbaar is voor inline handlers en andere scripts
// (bijvoorbeeld onclick="app.showFileVersionDetails(...)" in gegenereerde HTML)
// Bij ES modules komt top-level const niet op window terecht, dus we exposen expliciet.
window.app = app;