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
import { TenantSelector } from './components/tenant-selector.js';

class App {
  constructor() {
    this.authComponent = new AuthComponent();
    this.tenantSelector = new TenantSelector('#tenantSelectorContainer');
    this.sites = [];
    this.filteredSites = [];
    this.selectedSites = new Set();

    this.initElements();
    this.setupEventListeners();
    this.setupStoreSubscription();
    this.initializeDarkMode();
    
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

    // Dark mode toggle
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
      darkModeToggle.addEventListener('click', () => {
        this.toggleDarkMode();
      });
    }

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
            console.log('Attempting SharePoint REST token for host:', host);
            const spToken = await getSharePointTokenOptional(host);
            if (spToken) {
              appStore.setState({ sharePointRestToken: spToken });
              console.log('SharePoint REST token stored in appStore');
            } else {
              console.log('SharePoint REST token not available (admin consent missing or scope not added)');
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
    this.sitesGrid.textContent = '';

    if (this.filteredSites.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.style.gridColumn = '1 / -1';
      const icon = document.createElement('i');
      icon.className = 'fas fa-search';
      const title = document.createElement('h3');
      title.textContent = t('noSearchResults');
      const desc = document.createElement('p');
      desc.textContent = t('tryDifferentSearch');
      emptyState.appendChild(icon);
      emptyState.appendChild(title);
      emptyState.appendChild(desc);
      this.sitesGrid.appendChild(emptyState);
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
    } else {
      this.bulkCleanupBtn.classList.add('hidden');
      if (this.bulkVersioningBtn) this.bulkVersioningBtn.classList.add('hidden');
    }

    // Visual state: enable/disable
    const hasSelection = this.selectedSites.size > 0;
    
    // Update cleanup button
    this.bulkCleanupBtn.disabled = !hasSelection;
    this.bulkCleanupBtn.textContent = '';
    const cleanupIcon = document.createElement('i');
    cleanupIcon.className = 'fas fa-broom';
    this.bulkCleanupBtn.appendChild(cleanupIcon);
    this.bulkCleanupBtn.appendChild(document.createTextNode(' ' + t('bulkCleanup') + (hasSelection ? ` (${this.selectedSites.size})` : '')));

    // Update versioning button
    if (this.bulkVersioningBtn) {
      this.bulkVersioningBtn.disabled = !hasSelection;
      this.bulkVersioningBtn.textContent = '';
      const versionIcon = document.createElement('i');
      versionIcon.className = 'fas fa-layer-group';
      this.bulkVersioningBtn.appendChild(versionIcon);
      this.bulkVersioningBtn.appendChild(document.createTextNode(' Bulk Versioning' + (hasSelection ? ` (${this.selectedSites.size})` : '')));
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

  initializeDarkMode() {
    // Check localStorage for saved preference
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateDarkModeIcon(savedTheme);
  }

  toggleDarkMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    this.updateDarkModeIcon(newTheme);
  }

  updateDarkModeIcon(theme) {
    const icon = document.querySelector('#darkModeToggle i');
    if (icon) {
      icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new App());
} else {
  new App();
}
