import { t } from '../lib/i18n.js';
// Login Modal Component
import { Component, h, appStore } from '../lib/component.js';
import { api } from '../lib/api.js';
import { init as msalInit, signIn as msalSignIn } from '../lib/msal-auth.js';
import { toast } from './toast.js';
import { tenantManager } from '../lib/tenant-manager.js';

export class LoginModal extends Component {
  constructor() {
    super('#modalContainer');
    this.isOpen = false;
  }

  open() {
    console.log('LoginModal.open() called');
    if (this.isOpen) {
      console.log('Modal already open');
      return;
    }
    this.isOpen = true;
    console.log('Rendering modal...');
    this.render();
    console.log('Modal rendered, el:', this.el);
  }

  close() {
    const modal = this.$('.modal');
    if (modal) {
      modal.style.opacity = '0';
      setTimeout(() => {
        this.el.innerHTML = '';
        this.isOpen = false;
      }, 200);
    }
  }

  render() {
    console.log('Rendering modal HTML');
    const hasSession = !!appStore.getState().sessionId;
    const savedTenants = tenantManager.getTenants();
    const hasTenants = savedTenants.length > 0;

    this.el.innerHTML = `
      <div class="modal" style="display: flex;">
        <div class="modal-content" style="max-width: ${hasTenants ? '500px' : '700px'};">
          <div class="modal-header">
              <h2>
                <i class="fas fa-sign-in-alt" style="margin-right: 12px;"></i>
                ${hasTenants ? t('login') : 'Setup & Login'}
              </h2>
            <button class="modal-close" id="closeLoginModal">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <div class="modal-body">
            ${hasTenants ? this.renderQuickLogin(savedTenants) : this.renderFirstTimeSetup()}
          </div>
        </div>
      </div>
    `;

    // Add event listeners
    const closeBtn = this.el.querySelector('#closeLoginModal');
    const loginBtn = this.el.querySelector('#loginButton');
    const addNewBtn = this.el.querySelector('#addNewTenantBtn');
    const modal = this.el.querySelector('.modal');
    const tenantSelect = this.el.querySelector('#tenantSelect');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    if (loginBtn) {
      loginBtn.addEventListener('click', () => this.handleLogin('user'));
    }

    if (addNewBtn) {
      addNewBtn.addEventListener('click', () => {
        this.close();
        // TODO: Open add tenant modal
        toast.info('Voeg een nieuwe tenant toe via tenant selector');
      });
    }

    const saveBtn = this.el.querySelector('#saveConfigBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.handleSaveConfig());
    }

    if (tenantSelect) {
      tenantSelect.addEventListener('change', (e) => {
        const tenantId = e.target.value;
        if (tenantId) {
          const tenant = tenantManager.getTenantById(tenantId);
          if (tenant) {
            // Auto-fill for first-time setup if user selects saved tenant
            const cfgTenantName = this.$('#cfgTenantName');
            const cfgTenantId = this.$('#cfgTenantId');
            const cfgClientId = this.$('#cfgClientId');
            if (cfgTenantName) cfgTenantName.value = tenant.name;
            if (cfgTenantId) cfgTenantId.value = tenant.tenantId;
            if (cfgClientId) cfgClientId.value = tenant.clientId;
          }
        }
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
          this.close();
        }
      });
    }

    console.log('Modal HTML set, elements:', { closeBtn, loginBtn, modal });
  }

  renderQuickLogin(savedTenants) {
    return `
      <div style="text-align: center; padding: var(--space-6);">
        <div style="width: 100px; height: 100px; margin: 0 auto var(--space-5); background: linear-gradient(135deg, #0078d4, #00bcf2); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
          <i class="fas fa-user" style="font-size: 3rem; color: white;"></i>
        </div>
        
        <h3 style="font-size: var(--text-2xl); font-weight: var(--font-bold); margin-bottom: var(--space-3);">
          ${t('userLoginTitle')}
        </h3>
        
        <p style="font-size: var(--text-base); color: var(--color-text-secondary); margin-bottom: var(--space-5);">
          Kies een tenant om in te loggen met je Microsoft account
        </p>

        <div style="margin-bottom: 24px; text-align: left;">
          <label style="display:block; font-weight:600; margin-bottom:8px; color: var(--color-text);">
            <i class="fas fa-building" style="margin-right: 8px;"></i>
            Selecteer Tenant
          </label>
          <select id="quickTenantSelect" class="input" style="width:100%; font-size: 16px; padding: 12px;">
            <option value="">-- Kies een tenant --</option>
            ${savedTenants.map(t => `
              <option value="${t.id}">${t.name}</option>
            `).join('')}
          </select>
        </div>
        
        <button class="btn btn-primary btn-lg" id="loginButton" style="width: 100%; margin-top: var(--space-4);">
          <i class="fab fa-microsoft"></i>
          ${t('login')} met Microsoft
        </button>

        <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--color-border);">
          <button class="btn btn-outline" id="addNewTenantBtn" style="width: 100%;">
            <i class="fas fa-plus"></i>
            Nieuwe tenant toevoegen
          </button>
        </div>
      </div>
    `;
  }

  renderFirstTimeSetup() {
    return `
      <div style="text-align: left; padding: var(--space-6);">
        <div style="width: 100px; height: 100px; margin: 0 auto var(--space-5); background: linear-gradient(135deg, #0078d4, #00bcf2); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
          <i class="fas fa-rocket" style="font-size: 3rem; color: white;"></i>
        </div>
        
        <h3 style="font-size: var(--text-2xl); font-weight: var(--font-bold); margin-bottom: var(--space-3); text-align: center;">
          Welkom! Eerste setup
        </h3>
        
        <p style="font-size: var(--text-base); color: var(--color-text-secondary); margin-bottom: var(--space-5); text-align: center;">
          Voer je Azure App Registration in om te beginnen
        </p>

        <div class="config-form" style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <p style="margin-top: 0; color: #495057;">
            <i class="fas fa-info-circle" style="color:#0d6efd; margin-right:6px;"></i>
            Je hebt een Azure App Registration nodig met de juiste permissions
          </p>
          <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 12px; margin: 12px 0; font-size: 13px;">
            <strong style="display: block; margin-bottom: 8px;"><i class="fas fa-key" style="color: #ffc107;"></i> Vereiste Delegated Permissions:</strong>
            <ul style="margin: 0; padding-left: 20px;">
              <li><code>Sites.Read.All</code> - Sites en versies lezen</li>
              <li><code>Sites.ReadWrite.All</code> - Versies verwijderen</li>
              <li><code>Sites.FullControl.All</code> - Versioning settings aanpassen (optioneel)</li>
            </ul>
            <p style="margin: 8px 0 0 0; font-size: 12px; color: #856404;">
              <strong>Redirect URI:</strong> <code>https://sharepointer.be/beta/</code> (Web)
            </p>
          </div>
          <div style="display:grid; grid-template-columns: 1fr; gap: 12px;">
            <div>
              <label for="cfgTenantName" style="display:block; font-weight:600; margin-bottom:6px;">Tenant naam (voor herkenning)</label>
              <input id="cfgTenantName" type="text" class="input" placeholder="bijv. Mijn Bedrijf">
            </div>
            <div>
              <label for="cfgTenantId" style="display:block; font-weight:600; margin-bottom:6px;">Tenant ID</label>
              <input id="cfgTenantId" type="text" class="input" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
            </div>
            <div>
              <label for="cfgClientId" style="display:block; font-weight:600; margin-bottom:6px;">Client ID</label>
              <input id="cfgClientId" type="text" class="input" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
            </div>
          </div>
          <div style="display:flex; gap:12px; margin-top:12px;">
            <button class="btn btn-secondary" id="saveConfigBtn" style="flex: 1;">
              <i class="fas fa-save"></i> Opslaan & Doorgaan
            </button>
            <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener" class="btn btn-outline">
              <i class="fas fa-external-link-alt"></i> Azure Portal
            </a>
          </div>
        </div>
        
        <button class="btn btn-primary btn-lg" id="loginButton" style="width: 100%; margin-top: var(--space-4);">
          <i class="fab fa-microsoft"></i>
          ${t('login')} met Microsoft
        </button>
      </div>
    `;
  }
    const loginBtn = this.el.querySelector('#loginButton');
    const modal = this.el.querySelector('.modal');
    const tenantSelect = this.el.querySelector('#tenantSelect');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    if (loginBtn) {
      loginBtn.addEventListener('click', () => this.handleLogin('user'));
    }

    const saveBtn = this.el.querySelector('#saveConfigBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.handleSaveConfig());
    }

    if (tenantSelect) {
      tenantSelect.addEventListener('change', (e) => {
        const tenantId = e.target.value;
        if (tenantId) {
          const tenant = tenantManager.getTenantById(tenantId);
          if (tenant) {
            const cfgTenantName = this.$('#cfgTenantName');
            const cfgTenantId = this.$('#cfgTenantId');
            const cfgClientId = this.$('#cfgClientId');
            if (cfgTenantName) cfgTenantName.value = tenant.name;
            if (cfgTenantId) cfgTenantId.value = tenant.tenantId;
            if (cfgClientId) cfgClientId.value = tenant.clientId;
          }
        }
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
          this.close();
        }
      });
    }

    console.log('Modal HTML set, elements:', { closeBtn, loginBtn, modal });
  }

  async handleLogin(type) {
    console.log('handleLogin called with type:', type);
    
    // Only support user login in beta UI
    if (type !== 'user') {
      toast.warning(t('userOnlyBeta'));
      return;
    }

    try {
      // Check if using quick login (tenant selector)
      const quickSelect = this.$('#quickTenantSelect');
      if (quickSelect && quickSelect.value) {
        const tenant = tenantManager.getTenantById(quickSelect.value);
        if (tenant) {
          await msalInit(tenant.clientId, tenant.tenantId);
          this.close();
          await msalSignIn();
          return;
        }
      }

      // Otherwise use manual config inputs (first-time setup)
      const tenantId = this.$('#cfgTenantId')?.value?.trim() || localStorage.getItem('msalTenantId');
      const clientId = this.$('#cfgClientId')?.value?.trim() || localStorage.getItem('msalClientId');
      const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!tenantId || !clientId || !guid.test(tenantId) || !guid.test(clientId)) {
        toast.error('Selecteer een tenant of vul Tenant ID en Client ID in.');
        return;
      }

      await msalInit(clientId, tenantId);
      this.close();
      
      // signIn will redirect; when user returns, auth.js will handle the response
      await msalSignIn();
      
    } catch (error) {
      console.error('Login error:', error);
      toast.error(`${t('loginFailed')} ${error.message}`);
    }
  }

  async handleSaveConfig() {
    try {
      const tenantName = this.$('#cfgTenantName')?.value?.trim() || 'Unnamed Tenant';
      const tenantId = this.$('#cfgTenantId')?.value?.trim();
      const clientId = this.$('#cfgClientId')?.value?.trim();
      const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!tenantId || !clientId || !guid.test(tenantId) || !guid.test(clientId)) {
        toast.error('Tenant ID of Client ID is geen geldige GUID.');
        return;
      }

      const btn = this.$('#saveConfigBtn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opslaan...'; }

      // Save tenant to localStorage
      tenantManager.addOrUpdateTenant(tenantName, tenantId, clientId);
      
      // Configure MSAL (stores IDs in localStorage) and initialize
      await msalInit(clientId, tenantId);
      toast.success('MSAL geconfigureerd. Klik op Inloggen om door te gaan.');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Configureer MSAL'; }
    } catch (err) {
      console.error('Config save error:', err);
      toast.error(`Configureren mislukt: ${err.message}`);
      const btn = this.$('#saveConfigBtn');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Configureer MSAL'; }
    }
  }
}

export const loginModal = new LoginModal();
