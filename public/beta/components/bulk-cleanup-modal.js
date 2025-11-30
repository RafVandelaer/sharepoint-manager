// Bulk Cleanup Modal Component
import { Component, formatFileSize, formatDate, escapeHtml, h } from '../lib/component.js';
import { api } from '../lib/api.js';
import { toast } from './toast.js';
import { t } from '../lib/i18n.js';

class BulkCleanupModal extends Component {
  constructor() {
    super('#modalContainer');
    this.sites = [];
    this.selectedSites = new Set();
    this.versionsToKeep = 3;
    this.isDryRun = true;
    this.results = [];
    this.eventSources = [];
    this.completedSites = 0;
    
    this.render();
    this.setupEventListeners();
  }

  render() {
    this.el = h('div', {
      className: 'modal',
      id: 'bulkCleanupModal',
      style: 'display: none;'
    }, `
      <div class="modal-content" style="max-width: 1000px;">
        <div class="modal-header">
          <h2 data-i18n="bulkCleanup">${t('bulkCleanup')}</h2>
          <button class="modal-close" id="closeBulkCleanup">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="modal-body">
          <!-- Site Selection -->
          <div id="siteSelection">
            <div class="bulk-config">
              <div class="form-group">
                <label data-i18n="versionsToKeep">${t('versionsToKeep')}:</label>
                <input type="number" id="bulkVersionsToKeep" value="3" min="1" max="50" class="input">
              </div>
              
              <div class="form-group">
                <label data-i18n="selectSite">${t('selectSite')}:</label>
                <div class="bulk-site-list" id="bulkSiteList"></div>
              </div>
            </div>

            <div class="modal-actions" style="margin-top: var(--space-4);">
              <button class="btn btn-primary" id="startBulkDryRun" disabled>
                <i class="fas fa-play"></i>
                <span data-i18n="startBulkDryRun">${t('startBulkDryRun')}</span>
              </button>
              <button class="btn btn-danger" id="startBulkCleanup" disabled>
                <i class="fas fa-broom"></i>
                <span data-i18n="startBulkCleanup">${t('startBulkCleanup')}</span>
              </button>
              <button class="btn btn-outline" id="cancelBulkCleanup">
                <span data-i18n="cancel">${t('cancel')}</span>
              </button>
            </div>
          </div>

          <!-- Progress -->
          <div id="bulkProgress" style="display: none;">
            <div class="bulk-progress-header">
              <h3 data-i18n="processingSites">${t('processingSites')}</h3>
              <div class="bulk-progress-stats">
                <span id="bulkProgressText">0 / 0 sites completed</span>
              </div>
            </div>

            <div class="progress-bar" style="margin-bottom: var(--space-4);">
              <div class="progress-fill" id="bulkProgressFill" style="width: 0%;"></div>
            </div>

            <div class="bulk-site-progress" id="bulkSiteProgress"></div>

            <div class="modal-actions" style="margin-top: var(--space-4);">
              <button class="btn btn-outline" id="cancelBulkProgress">
                <span data-i18n="cancel">${t('cancel')}</span>
              </button>
            </div>
          </div>

          <!-- Results -->
          <div id="bulkResults" style="display: none;">
            <div class="results-summary">
              <div class="summary-card">
                <i class="fas fa-server"></i>
                <div>
                  <div class="summary-value" id="bulkTotalSites">0</div>
                  <div class="summary-label" data-i18n="sitesProcessed">${t('sitesProcessed')}</div>
                </div>
              </div>
              <div class="summary-card">
                <i class="fas fa-file"></i>
                <div>
                  <div class="summary-value" id="bulkTotalFiles">0</div>
                  <div class="summary-label" data-i18n="filesWithVersions">${t('filesWithVersions')}</div>
                </div>
              </div>
              <div class="summary-card">
                <i class="fas fa-trash"></i>
                <div>
                  <div class="summary-value" id="bulkTotalVersions">0</div>
                  <div class="summary-label" data-i18n="versionsToRemove">${t('versionsToRemove')}</div>
                </div>
              </div>
            </div>

            <div class="bulk-results-list" id="bulkResultsList"></div>

            <div class="modal-actions" style="margin-top: var(--space-6);">
              <button class="btn btn-danger" id="startBulkRealCleanup" style="display: none;">
                <i class="fas fa-broom"></i>
                <span data-i18n="startRealCleanup">${t('startRealCleanup')}</span>
              </button>
              <button class="btn btn-outline" id="closeBulkResults">
                <span data-i18n="close">${t('close')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `);
    
    document.body.appendChild(this.el);
  }

  setupEventListeners() {
    this.on('#closeBulkCleanup', 'click', () => this.close());
    this.on('#cancelBulkCleanup', 'click', () => this.close());
    this.on('#closeBulkResults', 'click', () => this.close());
    this.on('#cancelBulkProgress', 'click', () => this.cancelProcessing());
    
    this.on('.modal', 'click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.close();
      }
    });

    this.on('#bulkVersionsToKeep', 'input', (e) => {
      this.versionsToKeep = parseInt(e.target.value) || 3;
    });

    this.on('#startBulkDryRun', 'click', () => this.startBulkCleanup(true));
    this.on('#startBulkCleanup', 'click', () => {
      if (confirm(t('confirmDirectCleanup'))) {
        this.startBulkCleanup(false);
      }
    });
    this.on('#startBulkRealCleanup', 'click', () => {
      if (confirm(`Are you sure you want to cleanup ${this.selectedSites.size} sites? This cannot be undone!`)) {
        this.startBulkCleanup(false);
      }
    });
  }

  open(sites, autoSelect=false) {
    this.sites = sites;
    this.selectedSites.clear();
    if (autoSelect) {
      sites.forEach(s => this.selectedSites.add(s.id));
    }
    this.results = [];
    
    this.$('#siteSelection').style.display = 'block';
    this.$('#bulkProgress').style.display = 'none';
    this.$('#bulkResults').style.display = 'none';
    this.$('#bulkVersionsToKeep').value = this.versionsToKeep;
    
    this.renderSiteList();
    this.updateStartButton();
    
    // Show modal
    if (this.el) {
      this.el.style.display = 'flex';
    }
  }

  close() {
    this.cancelProcessing();
    // Hide modal
    if (this.el) {
      this.el.style.display = 'none';
    }
  }

  renderSiteList() {
    const listEl = this.$('#bulkSiteList');
    
    if (this.sites.length === 0) {
      listEl.innerHTML = `<p class="text-secondary">No sites available</p>`;
      return;
    }

    listEl.innerHTML = this.sites.map(site => `
      <div class="bulk-site-item">
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" 
                 class="bulk-site-checkbox" 
                 data-site-id="${site.id}"
                 ${this.selectedSites.has(site.id) ? 'checked' : ''}>
          <div class="flex-1">
            <div class="font-medium">${escapeHtml(site.displayName || site.name)}</div>
            <div class="text-xs text-secondary">${escapeHtml(site.webUrl || '')}</div>
          </div>
        </label>
      </div>
    `).join('');

    // Add event listeners to checkboxes
    this.$$('.bulk-site-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const siteId = e.target.getAttribute('data-site-id');
        if (e.target.checked) {
          this.selectedSites.add(siteId);
        } else {
          this.selectedSites.delete(siteId);
        }
        this.updateStartButton();
      });
    });
  }

  updateStartButton() {
    const dryBtn = this.$('#startBulkDryRun');
    const cleanBtn = this.$('#startBulkCleanup');
    const count = this.selectedSites.size;
    const suffix = count > 0 ? ` (${count} ${t('sitesProcessed')})` : '';
    dryBtn.disabled = count === 0;
    cleanBtn.disabled = count === 0;
    dryBtn.innerHTML = `<i class="fas fa-play"></i> ${t('startBulkDryRun')}${suffix}`;
    cleanBtn.innerHTML = `<i class="fas fa-broom"></i> ${t('startBulkCleanup')}${suffix}`;
  }

  async startBulkCleanup(dryRun = true) {
    this.isDryRun = dryRun;
    this.results = [];
    this.completedSites = 0;
    
    this.$('#siteSelection').style.display = 'none';
    this.$('#bulkResults').style.display = 'none';
    this.$('#bulkProgress').style.display = 'block';
    
    const selectedSiteIds = Array.from(this.selectedSites);
    this.$('#bulkProgressText').textContent = `0 / ${selectedSiteIds.length} ${t('sitesCompleted')}`;
    this.$('#bulkProgressFill').style.width = '0%';
    
    // Render initial progress list
    const progressEl = this.$('#bulkSiteProgress');
    progressEl.innerHTML = selectedSiteIds.map(siteId => {
      const site = this.sites.find(s => s.id === siteId);
      return `
        <div class="bulk-site-progress-item" data-site-id="${siteId}">
          <div class="site-progress-status pending">
            <i class="fas fa-clock"></i>
          </div>
          <div class="site-progress-info">
            <div class="site-progress-name">${escapeHtml(site.displayName || site.name)}</div>
            <div class="site-progress-message">${t('pending')}...</div>
          </div>
        </div>
      `;
    }).join('');

    // Cache progress item references for faster lookup
    this.siteProgressItems = new Map();
    selectedSiteIds.forEach(id => {
      const el = progressEl.querySelector(`[data-site-id="${id}"]`);
      if (el) this.siteProgressItems.set(id, el);
    });

    // Process sites sequentially
    for (const siteId of selectedSiteIds) {
      await this.processSite(siteId, dryRun);
    }

    this.showResults();
  }

  async processSite(siteId, dryRun) {
    const site = this.sites.find(s => s.id === siteId);
    const progressItem = this.siteProgressItems.get(siteId);
    const statusEl = progressItem.querySelector('.site-progress-status');
    const messageEl = progressItem.querySelector('.site-progress-message');

    try {
      // Update to processing
      statusEl.className = 'site-progress-status processing';
      statusEl.innerHTML = '<div class="spinner small"></div>';
      messageEl.textContent = `${t('processingSites')}...`;

      const result = await this.scanSite(siteId, dryRun);
      
      // Update to complete
      statusEl.className = 'site-progress-status complete';
      statusEl.innerHTML = '<i class="fas fa-check"></i>';
      messageEl.textContent = `${result.filesAffected} ${t('files')} / ${result.versionsToRemove} ${t('versionsRemoved')}`;
      
      this.results.push({
        site,
        ...result
      });

    } catch (error) {
      console.error(`Error processing site ${siteId}:`, error);
      
      statusEl.className = 'site-progress-status error';
      statusEl.innerHTML = '<i class="fas fa-times"></i>';
      messageEl.textContent = error.message || t('failed');
      
      this.results.push({
        site,
        error: error.message,
        filesAffected: 0,
        versionsToRemove: 0
      });
    }

    this.completedSites++;
    this.updateProgress();
  }

  async scanSite(siteId, dryRun) {
    return new Promise((resolve, reject) => {
      const eventSource = api.createSSE(
        `/sharepoint/sites/${siteId}/cleanup?versionsToKeep=${this.versionsToKeep}&dryRun=${dryRun}`
      );

      this.eventSources.push(eventSource);

      let filesAffected = 0;
      let versionsToRemove = 0;

      eventSource.addEventListener('batch', (e) => {
        const data = JSON.parse(e.data);
        if (data.files && Array.isArray(data.files)) {
          data.files.forEach(file => {
            const toRemove = Math.max(0, (file.versions || file.totalVersions || 0) - this.versionsToKeep);
            if (toRemove > 0) {
              filesAffected++;
              versionsToRemove += toRemove;
            }
          });
        }
      });

      eventSource.addEventListener('complete', () => {
        eventSource.close();
        resolve({ filesAffected, versionsToRemove });
      });

      eventSource.addEventListener('error', (error) => {
        eventSource.close();
        reject(error);
      });

      eventSource.onerror = () => {
        eventSource.close();
        reject(new Error('Connection error'));
      };
    });
  }

  updateProgress() {
    const total = this.selectedSites.size;
    const percent = Math.round((this.completedSites / total) * 100);
    
    this.$('#bulkProgressFill').style.width = `${percent}%`;
    this.$('#bulkProgressText').textContent = `${this.completedSites} / ${total} ${t('sitesCompleted')}`;
  }

  showResults() {
    this.$('#bulkProgress').style.display = 'none';
    this.$('#bulkResults').style.display = 'block';

    const totalSites = this.results.length;
    const totalFiles = this.results.reduce((sum, r) => sum + (r.filesAffected || 0), 0);
    const totalVersions = this.results.reduce((sum, r) => sum + (r.versionsToRemove || 0), 0);

    this.$('#bulkTotalSites').textContent = totalSites;
    this.$('#bulkTotalFiles').textContent = totalFiles;
    this.$('#bulkTotalVersions').textContent = totalVersions;

    // Render results list
    const resultsEl = this.$('#bulkResultsList');
    resultsEl.innerHTML = this.results.map(result => `
      <div class="bulk-result-item ${result.error ? 'error' : 'success'}">
        <div class="result-icon">
          <i class="fas ${result.error ? 'fa-times-circle' : 'fa-check-circle'}"></i>
        </div>
        <div class="result-info">
          <div class="result-site-name">${escapeHtml(result.site.displayName || result.site.name)}</div>
          <div class="result-stats">
            ${result.error 
              ? `<span class="text-error">${escapeHtml(result.error)}</span>`
              : `<span>${result.filesAffected} ${t('files')}</span> • <span>${result.versionsToRemove} ${t('versionsRemoved')}</span>`
            }
          </div>
        </div>
      </div>
    `).join('');

    // Show real cleanup button only after dry run
    if (this.isDryRun && totalVersions > 0) {
      this.$('#startBulkRealCleanup').style.display = 'inline-flex';
    } else {
      this.$('#startBulkRealCleanup').style.display = 'none';
    }

    if (this.isDryRun) {
      toast.success(`${t('dryRunComplete')} ${totalFiles} ${t('files')} / ${totalSites} ${t('sitesProcessed')}`);
    } else {
      toast.success(`${t('cleanupComplete')} ${totalSites} ${t('sitesProcessed')}`);
    }
  }

  cancelProcessing() {
    this.eventSources.forEach(es => {
      if (es && es.readyState !== EventSource.CLOSED) {
        es.close();
      }
    });
    this.eventSources = [];
  }
}

// Export singleton
export const bulkCleanupModal = new BulkCleanupModal();
