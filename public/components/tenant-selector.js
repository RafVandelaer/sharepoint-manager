import { Component } from '../lib/component.js';
import { tenantManager } from '../lib/tenant-manager.js';

export class TenantSelector extends Component {
  constructor(selector) {
    super(selector);
    this.tenants = [];
    this.currentTenantId = localStorage.getItem('msalTenantId');
    
    // Re-render when localStorage changes (other tabs/windows)
    window.addEventListener('storage', (e) => {
      if (e.key === 'msalTenantId') {
        this.currentTenantId = e.newValue;
        this.render();
      }
    });
    
    // Initial render
    this.render();
  }

  render() {
    if (!this.el) return;
    
    this.tenants = tenantManager.getTenants();
    this.currentTenantId = localStorage.getItem('msalTenantId');
    const currentTenant = this.tenants.find(t => t.tenantId === this.currentTenantId);
    
    this.el.innerHTML = `
      <div class="tenant-selector">
        <button class="btn btn-outline btn-sm dropdown-toggle" id="tenantDropdownBtn">
          <i class="fas fa-building"></i>
          <span>${currentTenant?.name || 'Select Tenant'}</span>
          <i class="fas fa-chevron-down"></i>
        </button>
        
        <div class="dropdown-menu" id="tenantDropdown" style="display: none;">
          ${this.tenants.length > 0 ? `
            <div class="dropdown-header">Saved Tenants</div>
            ${this.tenants.map(tenant => `
              <button class="dropdown-item ${tenant.tenantId === this.currentTenantId ? 'active' : ''}" 
                      data-tenant-id="${tenant.id}">
                <div class="tenant-item">
                  <div class="tenant-name">${tenant.name}</div>
                  <div class="tenant-id">${tenant.tenantId.substring(0, 8)}...</div>
                </div>
                ${tenant.tenantId === this.currentTenantId ? '<i class="fas fa-check"></i>' : ''}
              </button>
            `).join('')}
            <div class="dropdown-divider"></div>
          ` : ''}
          
          <button class="dropdown-item" id="addNewTenantBtn">
            <i class="fas fa-plus"></i>
            Add New Tenant
          </button>
        </div>
      </div>
    `;
    
    this.attachEventListeners();
  }

  attachEventListeners() {
    const dropdownBtn = this.$('#tenantDropdownBtn');
    const dropdown = this.$('#tenantDropdown');
    const addNewBtn = this.$('#addNewTenantBtn');
    
    // Toggle dropdown
    dropdownBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });
    
    // Close dropdown when clicking outside
    const closeDropdown = (e) => {
      if (!this.el.contains(e.target)) {
        if (dropdown) dropdown.style.display = 'none';
      }
    };
    document.addEventListener('click', closeDropdown);
    
    // Select tenant
    this.el.querySelectorAll('[data-tenant-id]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tenantId = btn.getAttribute('data-tenant-id');
        const tenant = tenantManager.getTenantById(tenantId);
        
        if (tenant) {
          // Update last used
          tenantManager.updateLastUsed(tenant.tenantId);
          
          // Switch to this tenant (trigger login flow)
          await this.switchTenant(tenant);
        }
        
        if (dropdown) dropdown.style.display = 'none';
      });
    });
    
    // Add new tenant
    addNewBtn?.addEventListener('click', async () => {
      if (dropdown) dropdown.style.display = 'none';
      
      // Import and open login modal
      const { loginModal } = await import('./login-modal.js');
      loginModal.open();
    });
  }
  
  async switchTenant(tenant) {
    // Store tenant info in localStorage
    localStorage.setItem('msalTenantId', tenant.tenantId);
    localStorage.setItem('msalClientId', tenant.clientId);
    
    // Clear current session
    localStorage.removeItem('sessionId');
    sessionStorage.clear();
    
    // Show notification and trigger login
    const { toast } = await import('./toast.js');
    const { loginModal } = await import('./login-modal.js');
    
    toast.info(`Switching to ${tenant.name}...`);
    loginModal.open();
  }
}
