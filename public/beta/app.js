// Main Application
import { appStore, debounce } from './lib/component.js';
import { t } from './lib/i18n.js';
import { api } from './lib/api.js';
import { getSharePointTokenOptional } from './lib/msal-auth.js';
import { AuthComponent } from './components/auth.js';
import { SiteCard } from './components/site-card.js';
import { loginModal } from './components/login-modal.js';
import { toast } from './components/toast.js';
import { cleanupModal } from './components/cleanup-modal.js';
import { siteDetailsModal } from './components/site-details-modal.js';
import { bulkCleanupModal } from './components/bulk-cleanup-modal.js';

class App {
  constructor() {
    this.authComponent = new AuthComponent();
    this.sites = [];
    this.filteredSites = [];
    this.selectedSites = new Set();

    this.initElements();
    this.setupEventListeners();
    this.setupStoreSubscription();
    
    // Load sites if authenticated, otherwise show empty state
    const { sessionId, accessToken } = appStore.getState();
    if (sessionId || accessToken) {
      this.loadSites();
    } else {
      this.showEmptyState();
    }
  }

  initElements() {
    this.sitesGrid = document.getElementById('sitesGrid');
    this.loadingState = document.getElementById('loadingState');
    this.emptyState = document.getElementById('emptyState');
    this.searchInput = document.getElementById('siteSearch');
    this.refreshBtn = document.getElementById('refreshSites');
    this.bulkCleanupBtn = document.getElementById('bulkCleanupBtn');
    this.bulkVersioningBtn = document.getElementById('bulkVersioningBtn');
    this.switchUIBtn = document.getElementById('switchToOldUI');
    this.loginFromEmptyBtn = document.getElementById('loginFromEmpty');
    this.selectAllCheckbox = document.getElementById('selectAllSites');
  }

  setupEventListeners() {
    // Search
    this.searchInput.addEventListener('input', debounce((e) => {
      this.filterSites(e.target.value);
    }, 300));

    // Refresh
    this.refreshBtn.addEventListener('click', () => {
      this.loadSites();
    });

    // Select all sites master checkbox
    if (this.selectAllCheckbox) {
      this.selectAllCheckbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        this.selectedSites.clear();
        if (checked) {
          this.filteredSites.forEach(site => this.selectedSites.add(site.id));
        }
        // Update all card checkboxes & visual state
        this.sitesGrid.querySelectorAll('.site-select-checkbox').forEach(cb => {
          cb.checked = checked;
          const card = cb.closest('.site-card');
          if (card) {
            if (checked) card.classList.add('selected'); else card.classList.remove('selected');
          }
        });
        this.updateBulkCleanupButtonState();
      });
    }

    // Switch to old UI
    if (this.switchUIBtn) {
      this.switchUIBtn.addEventListener('click', () => {
        localStorage.setItem('preferBetaUI', 'false');
        window.location.href = '/index.html';
      });
    }

    // Login from empty state
    this.loginFromEmptyBtn.addEventListener('click', () => {
      loginModal.open();
    });

    // Bulk cleanup
    this.bulkCleanupBtn.addEventListener('click', () => {
      if (this.selectedSites.size > 0) {
        const selected = this.sites.filter(s => this.selectedSites.has(s.id));
        bulkCleanupModal.open(selected, true); // auto-select passed sites
      } else {
        if (this.sites.length === 0) {
          toast.warning(t('noSitesAvailableBulk'));
          return;
        }
        bulkCleanupModal.open(this.sites, false);
      }
    });

    // Bulk versioning
    if (this.bulkVersioningBtn) {
      this.bulkVersioningBtn.addEventListener('click', async () => {
        if (this.selectedSites.size > 0) {
          const selected = this.sites.filter(s => this.selectedSites.has(s.id));
          const { bulkSiteVersioningModal } = await import('./components/bulk-site-versioning-modal.js');
          bulkSiteVersioningModal.open(selected);
        } else {
          if (this.sites.length === 0) {
            toast.warning('Geen sites beschikbaar');
            return;
          }
          const { bulkSiteVersioningModal } = await import('./components/bulk-site-versioning-modal.js');
          bulkSiteVersioningModal.open(this.sites);
        }
      });
    }
    
    // Select all sites checkbox
    if (this.selectAllCheckbox) {
      this.selectAllCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          // Select all
          this.sites.forEach(site => this.selectedSites.add(site.id));
        } else {
          // Deselect all
          this.selectedSites.clear();
        }
        this.updateSiteSelection();
      });
    }
  }

  setupStoreSubscription() {
    appStore.subscribe((state) => {
      if ((state.sessionId || state.accessToken) && this.sites.length === 0) {
        this.loadSites();
      }
      
      if (!state.sessionId && !state.accessToken) {
        this.sites = [];
        this.showEmptyState();
      }
    });
  }

  async loadSites() {
    const { sessionId, accessToken } = appStore.getState();
    
    if (!sessionId && !accessToken) {
      this.showEmptyState();
      return;
    }

    this.showLoadingState();

    try {
      const sites = await api.sharepoint.getSites();
      this.sites = sites;
      this.filteredSites = sites;
      this.renderSites();
      
      // Show bulk cleanup button if there are multiple sites
      if (sites.length > 1) {
        this.bulkCleanupBtn.classList.remove('hidden');
      } else {
        this.bulkCleanupBtn.classList.add('hidden');
      }
      
      if (sites.length === 0) {
        this.showEmptyState();
      }

      // Attempt SharePoint REST token acquisition (silent) if not yet present
      if (sites.length > 0 && !appStore.getState().sharePointRestToken) {
        try {
          const firstUrl = sites[0].webUrl || '';
          const match = firstUrl.match(/^https:\/\/(.*?)\/sites\//); // extract host
          if (match) {
            const host = `https://${match[1]}`;
            console.log('Attempting SharePoint REST token (AllSites.FullControl) for host:', host);
            const spToken = await getSharePointTokenOptional(host);
            if (spToken) {
              appStore.setState({ sharePointRestToken: spToken });
              console.log('✅ SharePoint REST token acquired and stored');
              console.log('Token preview:', spToken.substring(0, 30) + '...');
            } else {
              console.warn('⚠️ SharePoint REST token not available');
              console.warn('This is needed for versioning updates. Token will be requested when needed.');
              console.warn('Required: AllSites.FullControl consent for', host);
            }
          } else {
            console.log('Could not derive SharePoint host from first site URL');
          }
        } catch (spErr) {
          console.log('Error acquiring SharePoint REST token:', spErr.message);
        }
      }
    } catch (error) {
      console.error('Error loading sites:', error);
      
      if (error.status === 401) {
        toast.error(t('sessionExpired'));
        this.authComponent.clearAuth();
      } else if (error.status === 403) {
        toast.error('Toegang geweigerd. Controleer of admin consent is verleend in Azure Portal voor Sites.Read.All.');
        this.showEmptyState();
      } else if (error.status === 504 || error.message?.includes('timeout')) {
        toast.error('Graph API timeout. Ga naar Azure Portal → API Permissions → Grant admin consent.');
        this.showEmptyState();
      } else {
        const hint = error.hint || '';
        toast.error(`${t('failedLoadSites')} ${error.message}. ${hint}`);
        this.showEmptyState();
      }
    }
  }

  filterSites(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    
    if (!term) {
      this.filteredSites = this.sites;
    } else {
      this.filteredSites = this.sites.filter(site => {
        const name = (site.displayName || site.name || '').toLowerCase();
        const desc = (site.description || '').toLowerCase();
        const url = (site.webUrl || '').toLowerCase();
        
        return name.includes(term) || desc.includes(term) || url.includes(term);
      });
    }

    this.renderSites();
  }

  renderSites() {
    this.hideAllStates();
    this.sitesGrid.classList.remove('hidden');
    this.sitesGrid.innerHTML = '';

    if (this.filteredSites.length === 0) {
      this.sitesGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <i class="fas fa-search"></i>
          <h3>${t('noSearchResults')}</h3>
          <p>${t('tryDifferentSearch')}</p>
        </div>
      `;
      return;
    }

    this.filteredSites.forEach(siteData => {
      const cardContainer = document.createElement('div');
      this.sitesGrid.appendChild(cardContainer);

      const card = new SiteCard(siteData, cardContainer);
      card.render();

      // Listen to card events
      cardContainer.addEventListener('viewDetails', (e) => {
        this.viewSiteDetails(e.detail.siteId);
      });

      cardContainer.addEventListener('startCleanup', (e) => {
        this.startCleanup(e.detail.siteId);
      });

      cardContainer.addEventListener('selectionChanged', (e) => {
        const { siteId, selected } = e.detail;
        if (selected) {
          this.selectedSites.add(siteId);
        } else {
          this.selectedSites.delete(siteId);
        }
        // Update master checkbox state
        if (this.selectAllCheckbox) {
          if (this.selectedSites.size === this.filteredSites.length) {
            this.selectAllCheckbox.checked = true;
            this.selectAllCheckbox.indeterminate = false;
          } else if (this.selectedSites.size === 0) {
            this.selectAllCheckbox.checked = false;
            this.selectAllCheckbox.indeterminate = false;
          } else {
            this.selectAllCheckbox.indeterminate = true;
          }
        }
        this.updateBulkCleanupButtonState();
      });
    });

    // After rendering, update bulk button state based on selection
    this.updateBulkCleanupButtonState();
  }

  updateBulkCleanupButtonState() {
    // Show buttons if multiple sites OR any selected
    const shouldShow = this.sites.length > 1 || this.selectedSites.size > 0;
    
    if (shouldShow) {
      this.bulkCleanupBtn.classList.remove('hidden');
      if (this.bulkVersioningBtn) this.bulkVersioningBtn.classList.remove('hidden');
      if (this.selectionControls) this.selectionControls.classList.remove('hidden');
    } else {
      this.bulkCleanupBtn.classList.add('hidden');
      if (this.bulkVersioningBtn) this.bulkVersioningBtn.classList.add('hidden');
      if (this.selectionControls) this.selectionControls.classList.add('hidden');
    }

    // Update selection count display
    if (this.selectionCount) {
      this.selectionCount.textContent = `${this.selectedSites.size} sites selected`;
    }

    // Update button text with selection count
    const hasSelection = this.selectedSites.size > 0;
    
    // Update cleanup button text
    if (hasSelection) {
      this.bulkCleanupBtn.innerHTML = `<i class="fas fa-broom"></i> ${t('bulkCleanup')} (${this.selectedSites.size})`;
    } else {
      this.bulkCleanupBtn.innerHTML = `<i class="fas fa-broom"></i> ${t('bulkCleanup')}`;
    }

    // Update versioning button text
    if (this.bulkVersioningBtn) {
      if (hasSelection) {
        this.bulkVersioningBtn.innerHTML = `<i class="fas fa-cog"></i> ${t('bulkVersioning')} (${this.selectedSites.size})`;
      } else {
        this.bulkVersioningBtn.innerHTML = `<i class="fas fa-cog"></i> ${t('bulkVersioning')}`;
      }
    }
  }

  viewSiteDetails(siteId) {
    const site = this.sites.find(s => s.id === siteId);
    if (!site) {
      console.warn('Site not found for details:', siteId);
      return;
    }
    console.log('Opening site details for', siteId);
    siteDetailsModal.open(site);
  }

  startCleanup(siteId) {
    const site = this.sites.find(s => s.id === siteId);
    if (!site) return;

    cleanupModal.open(site);
  }

  showLoadingState() {
    this.hideAllStates();
    this.loadingState.classList.remove('hidden');
  }

  showEmptyState() {
    this.hideAllStates();
    this.emptyState.classList.remove('hidden');
  }

  hideAllStates() {
    this.loadingState.classList.add('hidden');
    this.emptyState.classList.add('hidden');
    this.sitesGrid.classList.add('hidden');
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new App());
} else {
  new App();
}
