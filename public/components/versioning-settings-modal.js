// Versioning Settings Modal Component
import { Component, formatDate, escapeHtml, h } from '../lib/component.js';
import { t } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { toast } from './toast.js';

export class VersioningSettingsModal extends Component {
  constructor() {
    super('#modalContainer');
    this.site = null;
    this.libraries = [];
    this.selectedLibrary = null;
    
    this.render();
    this.setupEventListeners();
  }

  render() {
    this.el = h('div', {
      className: 'modal',
      id: 'versioningSettingsModal',
      style: 'display: none;'
    }, `
      <div class="modal-content" style="max-width: 800px;">
        <div class="modal-header">
          <h2 id="versioningModalTitle">${t('versioningSettings')}</h2>
          <button class="modal-close" id="closeVersioningModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="modal-body">
          <div id="versioningModalContent"></div>
        </div>
      </div>
    `);
    
    document.body.appendChild(this.el);
  }

  setupEventListeners() {
    this.on('#closeVersioningModal', 'click', () => this.close());
    
    this.on('.modal', 'click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.close();
      }
    });
  }

  async open(site, libraries) {
    this.site = site;
    this.libraries = libraries || [];
    this.selectedLibrary = this.libraries[0] || null;
    
    if (this.el) {
      this.el.style.display = 'flex';
      this.el.classList.remove('hidden');
    }
    
    this.renderContent();
  }

  close() {
    if (this.el) {
      this.el.style.display = 'none';
    }
    this.site = null;
    this.libraries = [];
    this.selectedLibrary = null;
  }

  renderContent() {
    const content = this.$('#versioningModalContent');
    if (!this.selectedLibrary) {
      content.innerHTML = `<p class="text-secondary">${t('noLibrariesFound')}</p>`;
      return;
    }

    const lib = this.selectedLibrary;
    const ver = lib.versioning || {};
    const permMissing = ver.permissionMissing || false;
    
    content.innerHTML = `
      <!-- Library Selector -->
      ${this.libraries.length > 1 ? `
        <div style="margin-bottom: var(--space-6);">
          <label style="display:block;margin-bottom:var(--space-2);font-weight:var(--font-semibold);">${t('selectLibrary')}:</label>
          <select id="librarySelector" class="form-select" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:4px;">
            ${this.libraries.map(l => `
              <option value="${l.id}" ${l.id === lib.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>
            `).join('')}
          </select>
        </div>
      ` : `
        <div style="margin-bottom: var(--space-6);">
          <h3 style="margin:0;">${escapeHtml(lib.name)}</h3>
          <div class="text-xs text-secondary">${t('source')}: ${ver.source || 'n/a'}</div>
        </div>
      `}

      ${permMissing ? `
        <div class="alert" style="background: var(--color-warning-bg); color: var(--color-warning-text); padding:12px; border-radius:6px; margin-bottom:var(--space-6);">
          <strong>${t('limitedPermissions')}</strong><br>
          ${escapeHtml(ver.message || t('limitedPermissionsMessage'))}
        </div>
      ` : ''}

      <!-- Current Settings Overview -->
      <div class="details-section" style="margin-bottom:var(--space-6);">
        <h4 style="margin-bottom:var(--space-3);"><i class="fas fa-info-circle"></i> ${t('currentSettings')}</h4>
        <div class="details-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:var(--space-4);">
          <div class="detail-item">
            <label>${t('versioningActive')}</label>
            <div class="text-lg">${ver.enabled ? t('yes') : t('no')}</div>
          </div>
          <div class="detail-item">
            <label>${t('minorVersions')}</label>
            <div class="text-lg">${ver.minorEnabled ? t('yes') : t('no')}</div>
          </div>
          <div class="detail-item">
            <label>${t('forceCheckout')}</label>
            <div class="text-lg">${ver.forceCheckout ? t('yes') : t('no')}</div>
          </div>
          <div class="detail-item">
            <label>${t('majorVersionLimit')}</label>
            <div class="text-lg">${ver.majorLimit || '–'}</div>
          </div>
          <div class="detail-item">
            <label>${t('minorVersionLimit')}</label>
            <div class="text-lg">${ver.minorLimit || '–'}</div>
          </div>
        </div>
      </div>


      <!-- Quick Actions -->
      <div class="details-section" style="margin-bottom:var(--space-6);background:var(--color-bg-subtle);padding:var(--space-4);border-radius:6px;">
        <h4 style="margin-bottom:var(--space-3);"><i class="fas fa-bolt"></i> ${t('quickActions')}</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div class="recommendation-card" style="background:white;padding:var(--space-3);border-radius:4px;border:1px solid var(--color-border);">
            <div class="text-xs text-secondary">${t('recommended')}</div>
            <div class="text-lg font-bold">${t('microsoftAutomatic')}</div>
            <div class="text-xs">${t('optimalLimits')}</div>
            <button class="btn btn-sm btn-outline" style="margin-top:8px;width:100%;" data-preset="automatic" ${permMissing ? 'disabled' : ''}>${t('apply')}</button>
          </div>
          <div class="recommendation-card" style="background:white;padding:var(--space-3);border-radius:4px;border:1px solid var(--color-border);">
            <div class="text-xs text-secondary">${t('manual')}</div>
            <div class="text-lg font-bold">100 major / 10 minor</div>
            <div class="text-xs">${t('fixedLimits')}</div>
            <button class="btn btn-sm btn-outline" style="margin-top:8px;width:100%;" data-preset="manual" ${permMissing ? 'disabled' : ''}>${t('apply')}</button>
          </div>
        </div>
      </div>

      <!-- Status & Actions -->
      <div id="versioningStatus" class="text-sm" style="margin-bottom:var(--space-4);min-height:20px;color:var(--color-text-secondary);"></div>

      <div class="modal-actions" style="display:flex;gap:var(--space-3);justify-content:flex-end;padding-top:var(--space-4);border-top:1px solid var(--color-border);">
        <button class="btn btn-outline" id="closeVersioningBtn">${t('cancel')}</button>
        <button class="btn btn-primary" id="saveVersioningBtn" ${permMissing ? 'disabled' : ''}>
          <i class="fas fa-save"></i> ${t('save')}
        </button>
      </div>
    `;

    // Attach event handlers
    this.attachHandlers();
  }

  attachHandlers() {
    const content = this.$('#versioningModalContent');
    
    // Library selector
    const selector = content.querySelector('#librarySelector');
    if (selector) {
      selector.addEventListener('change', (e) => {
        const libId = e.target.value;
        this.selectedLibrary = this.libraries.find(l => l.id === libId) || this.selectedLibrary;
        this.renderContent();
      });
    }

    // Preset buttons
    content.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const preset = e.target.getAttribute('data-preset');
        this.applyPreset(preset);
      });
    });

    // Save button
    const saveBtn = content.querySelector('#saveVersioningBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.handleSave());
    }

    // Close button
    const closeBtn = content.querySelector('#closeVersioningBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }
  }

  applyPreset(preset) {
    // Bewaar keuze in geheugen (geen directe inputs meer)
    this.pendingAutomatic = preset === 'automatic';
    const content = this.$('#versioningModalContent');
    const statusEl = content.querySelector('#versioningStatus');
    if (statusEl) {
      statusEl.textContent = `${preset === 'automatic' ? t('microsoftAutomatic') : t('manual') + ' (100/10)'} ${t('presetApplied')}`;
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
  }

  collectInputData() {
    const isAutomatic = this.pendingAutomatic !== undefined
      ? this.pendingAutomatic
      : (this.selectedLibrary?.versioning?.automatic || false);

    return {
      enabled: true,
      minorEnabled: true,
      forceCheckout: false,
      automatic: isAutomatic,
      majorLimit: isAutomatic ? 0 : 100,
      minorLimit: 10
    };
  }

  async handleSave() {
    if (!this.selectedLibrary || !this.site) return;

    const content = this.$('#versioningModalContent');
    const statusEl = content.querySelector('#versioningStatus');
    const saveBtn = content.querySelector('#saveVersioningBtn');

    statusEl.textContent = t('saving');
    if (saveBtn) saveBtn.disabled = true;

    try {
      const data = this.collectInputData();
      const result = await api.sharepoint.updateLibraryVersioning(this.site.id, this.selectedLibrary.id, data);
      
      statusEl.textContent = t('settingsUpdated');
      statusEl.style.color = 'var(--color-success)';

      // Update local library object
      if (result?.versioning) {
        this.selectedLibrary.versioning = result.versioning;
      }

      // Refresh display after short delay
      setTimeout(() => {
        this.renderContent();
        toast.show(t('settingsUpdated'), 'success');
        // Reset pending keuze zodat nieuwe rendering huidige serverwaarden toont
        this.pendingAutomatic = undefined;
      }, 1500);

    } catch (error) {
      console.error('Update failed:', error);
      statusEl.textContent = `${t('error')}: ${error.message || t('unknownError')}`;
      statusEl.style.color = 'var(--color-error)';
      if (saveBtn) saveBtn.disabled = false;
    }
  }
}

// Export singleton
export const versioningSettingsModal = new VersioningSettingsModal();
