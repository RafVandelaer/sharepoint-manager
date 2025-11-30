// Site Details Modal Component
import { Component, formatFileSize, formatDate, escapeHtml, h } from '../lib/component.js';
import { t } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { toast } from './toast.js';

export class SiteDetailsModal extends Component {
  constructor() {
    super('#modalContainer');
    this.site = null;
    this.details = null;
    this.isLoading = false;
    
    this.render();
    this.setupEventListeners();
  }

  render() {
    this.el = h('div', {
      className: 'modal',
      id: 'siteDetailsModal',
      style: 'display: none;'
    }, `
      <div class="modal-content" style="max-width: 900px;">
        <div class="modal-header">
          <h2 id="siteDetailsTitle">${t('overview')}</h2>
          <button class="modal-close" id="closeSiteDetails">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="modal-body">
          <div id="siteDetailsContent"></div>
        </div>
      </div>
    `);
    
    document.body.appendChild(this.el);
  }

  setupEventListeners() {
    this.on('#closeSiteDetails', 'click', () => this.close());
    
    this.on('.modal', 'click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.close();
      }
    });
  }

  async open(site) {
    this.site = site;
    this.$('#siteDetailsTitle').textContent = site.displayName || site.name;
    
    // Show modal explicitly
    if (this.el) {
      this.el.style.display = 'flex';
      this.el.classList.remove('hidden');
    }
    this.showLoading();
    
    try {
      // Fetch basic site details
      const details = await api.sharepoint.getSiteDetails(site.id);
      details.libraries = []; // will fill later
      this.details = details;
      this.renderDetails();

      // After initial render, fetch libraries with retry logic for REST token
      await this.fetchLibrariesWithRetry();
    } catch (error) {
      console.error('Error loading site details:', error);
      this.showError(error.message || 'Failed to load site details');
    }
  }

  async fetchLibrariesWithRetry(maxAttempts = 2) {
    if (!this.site) return;
    const hostMatch = (this.site.webUrl || '').match(/^https:\/\/(.*?)\//);
    const host = hostMatch ? `https://${hostMatch[1]}` : null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const libs = await api.sharepoint.getSiteLibraries(this.site.id);
        if (libs && Array.isArray(libs)) {
          this.details.libraries = libs;
          this.renderDetails();
        }
        // If we have real REST source or permissionMissing handled, stop
        const hasRest = libs?.some(l => l.versioning?.source === 'rest');
        const permMissing = libs?.some(l => l.versioning?.permissionMissing);
        if (hasRest || permMissing || attempt === maxAttempts) return;
      } catch (e) {
        console.log('Library fetch attempt failed:', attempt, e.message);
      }
      // Try acquiring REST token if missing
      try {
        const state = (await import('../lib/component.js')).appStore.getState();
        if (!state.sharePointRestToken && host) {
          const msalMod = await import('../lib/msal-auth.js');
            await msalMod.acquireSharePointToken(host);
        }
      } catch (tokenErr) {
        console.log('Silent REST token attempt failed:', tokenErr.message);
      }
      await new Promise(r => setTimeout(r, 800));
    }
  }

  close() {
    // Hide modal
    if (this.el) {
      this.el.style.display = 'none';
    }
    this.site = null;
    this.details = null;
  }

  showLoading() {
    const content = this.$('#siteDetailsContent');
    content.innerHTML = `
      <div class="flex items-center justify-center" style="padding: var(--space-10);">
        <div class="spinner"></div>
      </div>
    `;
  }

  showError(message) {
    const content = this.$('#siteDetailsContent');
    content.innerHTML = `
      <div class="alert alert-error">
        <i class="fas fa-exclamation-circle"></i>
        ${escapeHtml(message)}
      </div>
    `;
  }

  renderDetails() {
    const content = this.$('#siteDetailsContent');
    const site = this.site;
    const details = this.details || {};

    // Precompute permission states for versioning banner logic
    const permMissing = details.libraries && details.libraries.some(l => l.versioning?.permissionMissing);
    const hasRestVersioning = details.libraries && details.libraries.some(l => l.versioning?.source === 'rest');

    // Get cleanup history from localStorage
    const history = this.getCleanupHistory(site.id);

    content.innerHTML = `
      <!-- Site Overview -->
      <div class="details-section">
        <h3><i class="fas fa-info-circle"></i> ${t('overview')}</h3>
        <div class="details-grid">
          <div class="detail-item">
            <label>${t('displayName')}</label>
            <div>${escapeHtml(site.displayName || site.name || 'N/A')}</div>
          </div>
          <div class="detail-item">
            <label>${t('siteId')}</label>
            <div class="text-mono text-sm">${escapeHtml(site.id || 'N/A')}</div>
          </div>
          <div class="detail-item">
            <label>${t('webUrl')}</label>
            <div>
              <a href="${escapeHtml(site.webUrl || '#')}" target="_blank" rel="noopener noreferrer" class="text-primary">
                ${escapeHtml(site.webUrl || 'N/A')}
                <i class="fas fa-external-link-alt text-xs"></i>
              </a>
            </div>
          </div>
          <div class="detail-item">
            <label>${t('description')}</label>
            <div>${escapeHtml(site.description || 'No description')}</div>
          </div>
          ${site.createdDateTime ? `
            <div class="detail-item">
              <label>${t('created')}</label>
              <div>${formatDate(site.createdDateTime)}</div>
            </div>
          ` : ''}
          ${site.lastModifiedDateTime ? `
            <div class="detail-item">
              <label>${t('lastModified')}</label>
              <div>${formatDate(site.lastModifiedDateTime)}</div>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Storage Info -->
      ${details.quota ? `
        <div class="details-section">
          <h3><i class="fas fa-hdd"></i> ${t('storage')}</h3>
          <div class="storage-bar">
            ${this.renderStorageInfo(details.quota)}
          </div>
        </div>
      ` : ''}

      <!-- Document Libraries -->
      ${details.libraries && details.libraries.length > 0 ? `
        <div class="details-section">
          <h3><i class="fas fa-folder"></i> ${t('documentLibraries')}</h3>
          <div class="libraries-list">
            ${details.libraries.map(lib => `
              <div class="library-item">
                <div class="library-icon">
                  <i class="fas fa-book"></i>
                </div>
                <div class="library-info">
                  <div class="library-name">${escapeHtml(lib.name || lib.displayName || 'Unnamed')}</div>
                  ${lib.itemCount !== undefined ? `
                    <div class="library-meta">
                      <span><i class="fas fa-file"></i> ${lib.itemCount} items</span>
                    </div>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Cleanup History -->
      ${history.length > 0 ? `
        <div class="details-section">
          <h3><i class="fas fa-history"></i> ${t('cleanupHistory')}</h3>
          <div class="history-list">
            ${history.slice(0, 5).map(entry => `
              <div class="history-item">
                <div class="history-icon ${entry.type === 'dry-run' ? 'info' : 'success'}">
                  <i class="fas ${entry.type === 'dry-run' ? 'fa-eye' : 'fa-broom'}"></i>
                </div>
                <div class="history-info">
                  <div class="history-title">
                    ${entry.type === 'dry-run' ? t('startDryRun') : t('startRealCleanup')}
                  </div>
                  <div class="history-meta">
                    <span>${formatDate(entry.timestamp)}</span>
                    <span>•</span>
                    <span>${entry.filesAffected || 0} files</span>
                    <span>•</span>
                    <span>${entry.versionsRemoved || 0} versions removed</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
          ${history.length > 5 ? `
            <div class="text-center text-sm text-secondary" style="margin-top: var(--space-3);">
              Showing 5 of ${history.length} entries
            </div>
          ` : ''}
        </div>
      ` : `
        <div class="details-section">
          <h3><i class="fas fa-history"></i> ${t('cleanupHistory')}</h3>
          <div class="empty-state" style="padding: var(--space-6);">
            <i class="fas fa-clock" style="font-size: 2rem; color: var(--color-border-strong); margin-bottom: var(--space-2);"></i>
            <p style="color: var(--color-text-secondary);">${t('noHistory')}</p>
          </div>
        </div>
      `}

      ${details.libraries && details.libraries.length > 0 ? `
        <div class="details-section">
          <h3 style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-2);">
            <span><i class="fas fa-code-branch"></i> ${t('versioning')}</span>
            <div style="display:flex;gap:var(--space-2);">
              <button class="btn btn-outline btn-sm" id="bulkVersioningBtn" style="padding:6px 12px;">
                <i class="fas fa-layer-group"></i> Bulk Instellingen
              </button>
              <button class="btn btn-primary btn-sm" id="manageVersioningBtn" style="padding:6px 12px;">
                <i class="fas fa-cog"></i> Beheer Versioning
              </button>
            </div>
          </h3>
          ${permMissing && !hasRestVersioning ? `
            <div class="alert" style="background: var(--color-warning-bg); color: var(--color-warning-text); padding:8px; border-radius:4px; margin-bottom:8px;">
              <strong>Beperkte versie-info.</strong> Voeg SharePoint permissie toe en klik op <button class="btn btn-xs btn-outline" id="requestSpConsentBtn">Rechten ophalen</button>
            </div>
          ` : ''}
          <div class="details-grid" style="grid-template-columns: repeat(auto-fill,minmax(240px,1fr));">
            ${details.libraries.map(lib => `
              <div class="detail-item" style="padding:var(--space-3);background:var(--color-bg-subtle);border-radius:6px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                  <label style="font-weight:var(--font-semibold);margin:0;">${escapeHtml(lib.name)}</label>
                  <span class="badge" style="font-size:10px;background:${lib.versioning?.automatic === true ? 'var(--color-success)' : lib.versioning?.automatic === false ? 'var(--color-info)' : 'var(--color-border-subtle)'};color:white;padding:2px 6px;border-radius:3px;">${lib.versioning?.automatic === true ? 'automatic' : lib.versioning?.automatic === false ? 'manual' : 'unknown'}</span>
                </div>
                <div class="text-sm" style="margin-bottom:4px;">
                  ${lib.versioning?.enabled ? 'Ja' : 'Nee'} Versioning
                  ${lib.versioning?.minorEnabled ? ' • Ja Minor' : ' • Nee Minor'}
                </div>
                <div class="text-xs text-secondary">
                  Major: <strong>${lib.versioning?.majorLimit || '–'}</strong> • 
                  Minor: <strong>${lib.versioning?.minorLimit || '–'}</strong>
                </div>
                ${lib.versioning?.forceCheckout !== undefined ? `<div class='text-xs text-secondary' style="margin-top:4px;">Force CO: ${lib.versioning.forceCheckout ? 'Ja' : 'Nee'}</div>` : ''}
                ${lib.versioning?.permissionMissing ? `<div class='text-xs' style='color: var(--color-warning); margin-top:4px;'>${escapeHtml(lib.versioning.message || 'Geen rechten.')}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Actions -->
      <div class="modal-actions" style="margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--color-border);">
        <button class="btn btn-outline" id="closeSiteDetailsBtn">${t('close')}</button>
      </div>
    `;

    // Add event listener to close button
    const closeBtn = content.querySelector('#closeSiteDetailsBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Handle SharePoint consent button
    const consentBtn = content.querySelector('#requestSpConsentBtn');
    if (consentBtn) {
      consentBtn.addEventListener('click', async () => {
        try {
          const firstLib = details.libraries[0];
          const firstUrl = firstLib?.webUrl || site?.webUrl || '';
          const match = firstUrl.match(/^https:\/\/(.*?)\//);
          if (!match) {
            console.warn('Kon host niet bepalen voor consent.');
            return;
          }
          const host = `https://${match[1]}`;
          // Lazy import requestSharePointConsent
          const mod = await import('../lib/msal-auth.js');
          await mod.requestSharePointConsent(host);
        } catch (e) {
          console.warn('Consent flow error:', e.message);
        }
      });
    }

    // Handle "Beheer Versioning" button
    const manageBtn = content.querySelector('#manageVersioningBtn');
    if (manageBtn) {
      manageBtn.addEventListener('click', async () => {
        const { versioningSettingsModal } = await import('./versioning-settings-modal.js');
        versioningSettingsModal.open(this.site, details.libraries);
      });
    }

    // Handle "Bulk Instellingen" button
    const bulkBtn = content.querySelector('#bulkVersioningBtn');
    if (bulkBtn) {
      bulkBtn.addEventListener('click', async () => {
        const { bulkVersioningModal } = await import('./bulk-versioning-modal.js');
        bulkVersioningModal.open(this.site, details.libraries);
      });
    }
  }

  calculateStoragePercent(quota) {
    if (!quota || !quota.total || quota.total === 0) return 0;
    return Math.round((quota.used / quota.total) * 100);
  }

  renderStorageInfo(quota) {
    const used = quota.used || 0;
    
    // Only show used storage
    return `
      <div class="storage-info">
        <div style="font-size: var(--text-2xl); font-weight: var(--font-bold); color: var(--color-primary);">
          ${formatFileSize(used)}
        </div>
        <div class="text-sm text-secondary" style="margin-top: var(--space-1);">
          Totaal gebruikt
        </div>
      </div>
    `;
  }

  getCleanupHistory(siteId) {
    try {
      const historyKey = `cleanup_history_${siteId}`;
      const history = localStorage.getItem(historyKey);
      return history ? JSON.parse(history) : [];
    } catch (error) {
      console.error('Error loading cleanup history:', error);
      return [];
    }
  }
}

// Export singleton
export const siteDetailsModal = new SiteDetailsModal();
