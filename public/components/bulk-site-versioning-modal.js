// Bulk Site Versioning Modal Component
import { Component, h } from '../lib/component.js';
import { api } from '../lib/api.js';
import { toast } from './toast.js';

export class BulkSiteVersioningModal extends Component {
  constructor() {
    super('#modalContainer');
    this.sites = [];
    this.isProcessing = false;
    
    this.render();
    this.setupEventListeners();
  }

  render() {
    this.el = h('div', {
      className: 'modal',
      id: 'bulkSiteVersioningModal',
      style: 'display: none;'
    }, `
      <div class="modal-content" style="max-width: 700px;">
        <div class="modal-header">
          <h2>Bulk Versioning Instellingen</h2>
          <button class="modal-close" id="closeBulkSiteVersioningModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="modal-body">
          <div id="bulkSiteVersioningContent"></div>
        </div>
      </div>
    `);
    
    document.body.appendChild(this.el);
  }

  setupEventListeners() {
    this.on('#closeBulkSiteVersioningModal', 'click', () => this.close());
    
    this.on('.modal', 'click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.close();
      }
    });
  }

  open(sites) {
    this.sites = sites || [];
    
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
    const content = this.$('#bulkSiteVersioningContent');
    if (!content) return;

    const siteCount = this.sites.length;

    content.innerHTML = `
      <div class="details-section" style="margin-bottom:var(--space-4);">
        <div class="text-sm text-secondary" style="margin-bottom:var(--space-4);">
          <i class="fas fa-info-circle"></i> 
          Pas versioning instellingen toe op <strong>alle document libraries</strong> in <strong>${siteCount} geselecteerde site${siteCount > 1 ? 's' : ''}</strong>.
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

        <!-- Selected Sites List -->
        <div style="background:var(--color-bg-subtle);padding:var(--space-3);border-radius:4px;margin-bottom:var(--space-4);max-height:200px;overflow-y:auto;">
          <h4 style="margin-bottom:var(--space-2);font-size:var(--text-sm);">Geselecteerde Sites:</h4>
          <ul style="list-style:none;padding:0;margin:0;">
            ${this.sites.map(site => `
              <li style="padding:4px 0;font-size:var(--text-sm);color:var(--color-text-secondary);">
                <i class="fas fa-check-circle" style="color:var(--color-success);margin-right:6px;"></i>
                ${site.displayName || site.name}
              </li>
            `).join('')}
          </ul>
        </div>

        <div class="alert" style="background:var(--color-warning-bg);color:var(--color-warning-text);padding:var(--space-3);border-radius:4px;margin-bottom:var(--space-4);">
          <i class="fas fa-exclamation-triangle"></i>
          <strong>Let op:</strong> Dit past de instellingen toe op ALLE libraries in ALLE geselecteerde sites. Deze actie kan niet ongedaan gemaakt worden.
        </div>

        <div id="bulkStatus" class="text-sm" style="min-height:20px;margin-bottom:var(--space-3);"></div>
        <div id="bulkProgress" style="display:none;margin-bottom:var(--space-3);">
          <div style="background:var(--color-border-subtle);border-radius:4px;height:8px;overflow:hidden;">
            <div id="bulkProgressBar" style="background:var(--color-primary);height:100%;width:0%;transition:width 0.3s;"></div>
          </div>
          <div class="text-xs text-secondary" style="margin-top:4px;" id="bulkProgressText">Voorbereiden...</div>
        </div>
      </div>

      <div class="modal-actions" style="display:flex;gap:var(--space-3);justify-content:flex-end;padding-top:var(--space-4);border-top:1px solid var(--color-border);">
        <button class="btn btn-outline" id="cancelBulkSiteBtn">Annuleren</button>
        <button class="btn btn-primary" id="applyBulkSiteBtn" ${this.isProcessing ? 'disabled' : ''}>
          <i class="fas fa-check"></i> Toepassen op ${siteCount} site${siteCount > 1 ? 's' : ''}
        </button>
      </div>
    `;

    this.attachHandlers();
  }

  attachHandlers() {
    const content = this.$('#bulkSiteVersioningContent');
    
    // Cancel button
    const cancelBtn = content.querySelector('#cancelBulkSiteBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.close());
    }

    // Apply button
    const applyBtn = content.querySelector('#applyBulkSiteBtn');
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

    const content = this.$('#bulkSiteVersioningContent');
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
    const applyBtn = content.querySelector('#applyBulkSiteBtn');
    const statusEl = content.querySelector('#bulkStatus');
    const progressContainer = content.querySelector('#bulkProgress');
    const progressBar = content.querySelector('#bulkProgressBar');
    const progressText = content.querySelector('#bulkProgressText');

    if (applyBtn) applyBtn.disabled = true;
    if (progressContainer) progressContainer.style.display = 'block';
    
    let totalLibraries = 0;
    let completedLibraries = 0;
    let failedLibraries = 0;
    let processedSites = 0;

    statusEl.textContent = 'Libraries ophalen...';
    statusEl.style.color = 'var(--color-text-secondary)';

    for (const site of this.sites) {
      try {
        // Fetch libraries for this site
        statusEl.textContent = `Site ${processedSites + 1}/${this.sites.length}: ${site.displayName || site.name} - Libraries ophalen...`;
        
        const libraries = await api.sharepoint.getSiteLibraries(site.id);
        totalLibraries += libraries.length;

        // Apply settings to all libraries in this site
        for (const lib of libraries) {
          statusEl.textContent = `Site ${processedSites + 1}/${this.sites.length}: ${lib.name}...`;
          
          try {
            await api.sharepoint.updateLibraryVersioning(site.id, lib.id, data);
            completedLibraries++;
          } catch (error) {
            console.error(`Failed to update ${lib.name} in ${site.displayName}:`, error);
            failedLibraries++;
          }

          // Update progress
          const progress = ((completedLibraries + failedLibraries) / totalLibraries) * 100;
          if (progressBar) progressBar.style.width = `${progress}%`;
          if (progressText) {
            progressText.textContent = `${completedLibraries + failedLibraries} van ${totalLibraries} libraries`;
          }
        }

        processedSites++;
      } catch (error) {
        console.error(`Failed to process site ${site.displayName}:`, error);
        processedSites++;
      }
    }

    // Final status
    this.isProcessing = false;
    if (progressContainer) progressContainer.style.display = 'none';
    
    if (failedLibraries === 0) {
      statusEl.textContent = `Succesvol toegepast op ${completedLibraries} libraries in ${processedSites} sites!`;
      statusEl.style.color = 'var(--color-success)';
      toast.show(`Bulk versioning instellingen toegepast op ${completedLibraries} libraries`, 'success');
      
      setTimeout(() => {
        this.close();
      }, 2500);
    } else {
      statusEl.textContent = `Voltooid: ${completedLibraries} geslaagd, ${failedLibraries} gefaald (${processedSites} sites)`;
      statusEl.style.color = 'var(--color-warning)';
      if (applyBtn) applyBtn.disabled = false;
    }
  }
}

// Export singleton
export const bulkSiteVersioningModal = new BulkSiteVersioningModal();
