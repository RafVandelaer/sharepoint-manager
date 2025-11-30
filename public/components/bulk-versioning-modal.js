// Bulk Versioning Modal Component
import { Component, h } from '../lib/component.js';
import { api } from '../lib/api.js';
import { toast } from './toast.js';

export class BulkVersioningModal extends Component {
  constructor() {
    super('#modalContainer');
    this.site = null;
    this.libraries = [];
    this.isProcessing = false;
    
    this.render();
    this.setupEventListeners();
  }

  render() {
    this.el = h('div', {
      className: 'modal',
      id: 'bulkVersioningModal',
      style: 'display: none;'
    }, `
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <h2>Bulk Versioning Instellingen</h2>
          <button class="modal-close" id="closeBulkVersioningModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="modal-body">
          <div id="bulkVersioningContent"></div>
        </div>
      </div>
    `);
    
    document.body.appendChild(this.el);
  }

  setupEventListeners() {
    this.on('#closeBulkVersioningModal', 'click', () => this.close());
    
    this.on('.modal', 'click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.close();
      }
    });
  }

  open(site, libraries) {
    this.site = site;
    this.libraries = libraries || [];
    
    if (this.el) {
      this.el.style.display = 'flex';
      this.el.classList.remove('hidden');
    }
    
    this.renderContent();
  }

  close() {
    if (this.el) {
      this.el.style.display = 'none';
      this.el.classList.add('hidden');
    }
  }

  renderContent() {
    const content = this.$('#bulkVersioningContent');
    if (!content) return;

    const libraryCount = this.libraries.length;

    content.innerHTML = `
      <div class="details-section" style="margin-bottom:var(--space-4);">
        <div class="text-sm text-secondary" style="margin-bottom:var(--space-4);">
          <i class="fas fa-info-circle"></i> 
          Pas versioning instellingen toe op alle <strong>${libraryCount} document libraries</strong> in deze site.
        </div>

        <div style="background:var(--color-bg-subtle);padding:var(--space-4);border-radius:6px;margin-bottom:var(--space-4);">
          <h4 style="margin-bottom:var(--space-3);"><i class="fas fa-bolt"></i> Kies Instelling</h4>
          
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
            <label class="option-card" style="display:block;background:white;padding:var(--space-3);border-radius:4px;border:2px solid var(--color-border);cursor:pointer;transition:all 0.2s;">
              <input type="radio" name="bulkPreset" value="automatic" style="margin-right:8px;">
              <div>
                <div class="text-sm font-bold">Microsoft Automatic</div>
                <div class="text-xs text-secondary">Optimale limieten</div>
              </div>
            </label>
            
            <label class="option-card" style="display:block;background:white;padding:var(--space-3);border-radius:4px;border:2px solid var(--color-border);cursor:pointer;transition:all 0.2s;">
              <input type="radio" name="bulkPreset" value="manual" checked style="margin-right:8px;">
              <div>
                <div class="text-sm font-bold">Manual 100/10</div>
                <div class="text-xs text-secondary">100 major, 10 minor</div>
              </div>
            </label>
          </div>
        </div>

        <div class="alert" style="background:var(--color-warning-bg);color:var(--color-warning-text);padding:var(--space-3);border-radius:4px;margin-bottom:var(--space-4);">
          <i class="fas fa-exclamation-triangle"></i>
          <strong>Let op:</strong> Dit past de instellingen toe op ALLE libraries. Deze actie kan niet ongedaan gemaakt worden.
        </div>

        <div id="bulkStatus" class="text-sm" style="min-height:20px;margin-bottom:var(--space-3);"></div>
        <div id="bulkProgress" style="display:none;margin-bottom:var(--space-3);">
          <div style="background:var(--color-border-subtle);border-radius:4px;height:8px;overflow:hidden;">
            <div id="bulkProgressBar" style="background:var(--color-primary);height:100%;width:0%;transition:width 0.3s;"></div>
          </div>
          <div class="text-xs text-secondary" style="margin-top:4px;" id="bulkProgressText">0 van ${libraryCount}</div>
        </div>
      </div>

      <div class="modal-actions" style="display:flex;gap:var(--space-3);justify-content:flex-end;padding-top:var(--space-4);border-top:1px solid var(--color-border);">
        <button class="btn btn-outline" id="cancelBulkBtn">Annuleren</button>
        <button class="btn btn-primary" id="applyBulkBtn" ${this.isProcessing ? 'disabled' : ''}>
          <i class="fas fa-check"></i> Toepassen op ${libraryCount} libraries
        </button>
      </div>
    `;

    this.attachHandlers();
  }

  attachHandlers() {
    const content = this.$('#bulkVersioningContent');
    
    // Cancel button
    const cancelBtn = content.querySelector('#cancelBulkBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.close());
    }

    // Apply button
    const applyBtn = content.querySelector('#applyBulkBtn');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => this.handleApply());
    }

    // Radio button styling
    content.querySelectorAll('.option-card').forEach(card => {
      const radio = card.querySelector('input[type="radio"]');
      
      const updateStyle = () => {
        if (radio.checked) {
          card.style.borderColor = 'var(--color-primary)';
          card.style.background = 'var(--color-primary-bg)';
        } else {
          card.style.borderColor = 'var(--color-border)';
          card.style.background = 'white';
        }
      };

      radio.addEventListener('change', updateStyle);
      card.addEventListener('click', () => {
        radio.checked = true;
        radio.dispatchEvent(new Event('change'));
      });
      
      updateStyle();
    });
  }

  async handleApply() {
    if (this.isProcessing) return;

    const content = this.$('#bulkVersioningContent');
    const selectedPreset = content.querySelector('input[name="bulkPreset"]:checked')?.value;
    
    if (!selectedPreset) {
      toast.show('Selecteer een preset', 'error');
      return;
    }

    const isAutomatic = selectedPreset === 'automatic';
    const data = {
      enabled: true,
      minorEnabled: true,
      forceCheckout: false,
      automatic: isAutomatic,
      majorLimit: isAutomatic ? 0 : 100,
      minorLimit: 10
    };

    this.isProcessing = true;
    const applyBtn = content.querySelector('#applyBulkBtn');
    const statusEl = content.querySelector('#bulkStatus');
    const progressContainer = content.querySelector('#bulkProgress');
    const progressBar = content.querySelector('#bulkProgressBar');
    const progressText = content.querySelector('#bulkProgressText');

    if (applyBtn) applyBtn.disabled = true;
    if (progressContainer) progressContainer.style.display = 'block';
    
    let completed = 0;
    let failed = 0;

    for (let i = 0; i < this.libraries.length; i++) {
      const lib = this.libraries[i];
      
      statusEl.textContent = `Verwerken: ${lib.name}...`;
      statusEl.style.color = 'var(--color-text-secondary)';

      try {
        await api.sharepoint.updateLibraryVersioning(this.site.id, lib.id, data);
        completed++;
      } catch (error) {
        console.error(`Failed to update ${lib.name}:`, error);
        failed++;
      }

      // Update progress
      const progress = ((i + 1) / this.libraries.length) * 100;
      if (progressBar) progressBar.style.width = `${progress}%`;
      if (progressText) progressText.textContent = `${i + 1} van ${this.libraries.length}`;
    }

    // Final status
    this.isProcessing = false;
    if (progressContainer) progressContainer.style.display = 'none';
    
    if (failed === 0) {
      statusEl.textContent = `Succesvol toegepast op ${completed} libraries!`;
      statusEl.style.color = 'var(--color-success)';
      toast.show(`Bulk versioning instellingen toegepast op ${completed} libraries`, 'success');
      
      setTimeout(() => {
        this.close();
        // Trigger refresh of site details modal
        window.dispatchEvent(new CustomEvent('libraries-updated'));
      }, 2000);
    } else {
      statusEl.textContent = `Voltooid: ${completed} geslaagd, ${failed} gefaald`;
      statusEl.style.color = 'var(--color-warning)';
      if (applyBtn) applyBtn.disabled = false;
    }
  }
}

// Export singleton
export const bulkVersioningModal = new BulkVersioningModal();
