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
          <h2 id="versioningModalTitle">Versioning Instellingen</h2>
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
      content.innerHTML = `<p class="text-secondary">Geen libraries gevonden.</p>`;
      return;
    }

    const lib = this.selectedLibrary;
    const ver = lib.versioning || {};
    const permMissing = ver.permissionMissing || false;
    
    content.innerHTML = `
      <!-- Library Selector -->
      ${this.libraries.length > 1 ? `
        <div style="margin-bottom: var(--space-6);">
          <label style="display:block;margin-bottom:var(--space-2);font-weight:var(--font-semibold);">Selecteer Library:</label>
          <select id="librarySelector" class="form-select" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:4px;">
            ${this.libraries.map(l => `
              <option value="${l.id}" ${l.id === lib.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>
            `).join('')}
          </select>
        </div>
      ` : `
        <div style="margin-bottom: var(--space-6);">
          <h3 style="margin:0;">${escapeHtml(lib.name)}</h3>
          <div class="text-xs text-secondary">Bron: ${ver.source || 'n/a'}</div>
        </div>
      `}

      ${permMissing ? `
        <div class="alert" style="background: var(--color-warning-bg); color: var(--color-warning-text); padding:12px; border-radius:6px; margin-bottom:var(--space-6);">
          <strong>Beperkte rechten</strong><br>
          ${escapeHtml(ver.message || 'Voeg SharePoint AllSites.Read toe en geef admin consent voor echte versie-instellingen.')}
        </div>
      ` : ''}

      <!-- Current Settings Overview -->
      <div class="details-section" style="margin-bottom:var(--space-6);">
        <h4 style="margin-bottom:var(--space-3);"><i class="fas fa-info-circle"></i> Huidige Instellingen</h4>
        <div class="details-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:var(--space-4);">
          <div class="detail-item">
            <label>Versioning Actief</label>
            <div class="text-lg">${ver.enabled ? 'Ja' : 'Nee'}</div>
          </div>
          <div class="detail-item">
            <label>Minor Versies</label>
            <div class="text-lg">${ver.minorEnabled ? 'Ja' : 'Nee'}</div>
          </div>
          <div class="detail-item">
            <label>Force Checkout</label>
            <div class="text-lg">${ver.forceCheckout ? 'Ja' : 'Nee'}</div>
          </div>
          <div class="detail-item">
            <label>Major Versies Limiet</label>
            <div class="text-lg">${ver.majorLimit || '–'}</div>
          </div>
          <div class="detail-item">
            <label>Minor Versies Limiet</label>
            <div class="text-lg">${ver.minorLimit || '–'}</div>
          </div>
          <div class="detail-item">
            <label>Databron</label>
            <div class="text-sm">
              <span class="badge" style="padding:4px 8px;background:${ver.source === 'rest' || ver.source === 'rest-title' ? 'var(--color-success)' : 'var(--color-border-subtle)'};color:white;border-radius:4px;">
                ${ver.source || 'default'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Edit Settings Form -->
      <div class="details-section" style="margin-bottom:var(--space-6);">
        <h4 style="margin-bottom:var(--space-3);"><i class="fas fa-edit"></i> Instellingen Aanpassen</h4>
        
        <div style="margin-bottom:var(--space-4);">
          <label class="form-label" style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="automaticInput" ${ver.automatic ? 'checked' : ''} ${permMissing ? 'disabled' : ''}>
            <span>Automatic (Microsoft-managed)</span>
          </label>
          <div class="text-xs text-secondary" style="margin-top:4px;margin-left:24px;">
            Laat Microsoft automatisch optimale versie limieten bepalen
          </div>
        </div>

        <div style="display:${ver.automatic ? 'none' : 'block'}" id="manualSettings">
          <div class="text-sm" style="margin-bottom:var(--space-3);padding:var(--space-3);background:var(--color-bg-subtle);border-radius:4px;">
            Manual mode: 100 major versies, 10 minor versies
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="details-section" style="margin-bottom:var(--space-6);background:var(--color-bg-subtle);padding:var(--space-4);border-radius:6px;">
        <h4 style="margin-bottom:var(--space-3);"><i class="fas fa-bolt"></i> Snelle Instellingen</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div class="recommendation-card" style="background:white;padding:var(--space-3);border-radius:4px;border:1px solid var(--color-border);">
            <div class="text-xs text-secondary">Aanbevolen</div>
            <div class="text-lg font-bold">Microsoft Automatic</div>
            <div class="text-xs">Optimale limieten</div>
            <button class="btn btn-sm btn-outline" style="margin-top:8px;width:100%;" data-preset="automatic" ${permMissing ? 'disabled' : ''}>Toepassen</button>
          </div>
          <div class="recommendation-card" style="background:white;padding:var(--space-3);border-radius:4px;border:1px solid var(--color-border);">
            <div class="text-xs text-secondary">Manual</div>
            <div class="text-lg font-bold">100 major / 10 minor</div>
            <div class="text-xs">Vaste limieten</div>
            <button class="btn btn-sm btn-outline" style="margin-top:8px;width:100%;" data-preset="manual" ${permMissing ? 'disabled' : ''}>Toepassen</button>
          </div>
        </div>
      </div>

      <!-- Status & Actions -->
      <div id="versioningStatus" class="text-sm" style="margin-bottom:var(--space-4);min-height:20px;color:var(--color-text-secondary);"></div>

      <div class="modal-actions" style="display:flex;gap:var(--space-3);justify-content:flex-end;padding-top:var(--space-4);border-top:1px solid var(--color-border);">
        <button class="btn btn-outline" id="closeVersioningBtn">Annuleren</button>
        <button class="btn btn-primary" id="saveVersioningBtn" ${permMissing ? 'disabled' : ''}>
          <i class="fas fa-save"></i> Opslaan
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

    // Automatic checkbox toggle
    const automaticInput = content.querySelector('#automaticInput');
    const manualSettings = content.querySelector('#manualSettings');
    if (automaticInput && manualSettings) {
      automaticInput.addEventListener('change', (e) => {
        manualSettings.style.display = e.target.checked ? 'none' : 'block';
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
    const content = this.$('#versioningModalContent');
    const automaticInput = content.querySelector('#automaticInput');
    
    if (preset === 'automatic') {
      if (automaticInput) automaticInput.checked = true;
    } else if (preset === 'manual') {
      if (automaticInput) automaticInput.checked = false;
    }

    // Toggle manual settings visibility
    const manualSettings = content.querySelector('#manualSettings');
    if (manualSettings) {
      manualSettings.style.display = (preset === 'automatic') ? 'none' : 'block';
    }

    const statusEl = content.querySelector('#versioningStatus');
    if (statusEl) {
      statusEl.textContent = `${preset === 'automatic' ? 'Automatic' : 'Manual (100/10)'} preset toegepast`;
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
  }

  collectInputData() {
    const content = this.$('#versioningModalContent');
    const automaticInput = content.querySelector('#automaticInput');
    const isAutomatic = automaticInput ? automaticInput.checked : false;

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

    statusEl.textContent = 'Opslaan...';
    if (saveBtn) saveBtn.disabled = true;

    try {
      const data = this.collectInputData();
      const result = await api.sharepoint.updateLibraryVersioning(this.site.id, this.selectedLibrary.id, data);
      
      statusEl.textContent = 'Instellingen succesvol bijgewerkt!';
      statusEl.style.color = 'var(--color-success)';

      // Update local library object
      if (result?.versioning) {
        this.selectedLibrary.versioning = result.versioning;
      }

      // Refresh display after short delay
      setTimeout(() => {
        this.renderContent();
        toast.show('Versioning instellingen opgeslagen', 'success');
      }, 1500);

    } catch (error) {
      console.error('Update failed:', error);
      statusEl.textContent = `Fout: ${error.message || 'Onbekende fout'}`;
      statusEl.style.color = 'var(--color-error)';
      if (saveBtn) saveBtn.disabled = false;
    }
  }
}

// Export singleton
export const versioningSettingsModal = new VersioningSettingsModal();
