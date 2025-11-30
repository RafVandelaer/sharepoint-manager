// Auth Component - handles authentication state and UI
import { appStore } from '../lib/component.js';
import { t } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { loginModal } from './login-modal.js';
import { initIfConfigured, acquireToken, logout as msalLogout, getPca } from '../lib/msal-auth.js';
import { toast } from './toast.js';

export class AuthComponent {
  constructor() {
    this.el = document.querySelector('#authContainer');
    
    // If element doesn't exist, skip rendering (auth UI removed from layout)
    if (!this.el) {
      console.log('AuthComponent: #authContainer not found, skipping UI rendering');
      // Still check auth status for app functionality
      this.checkAuthStatus();
      return;
    }
    
    console.log('AuthComponent constructor, element:', this.el);
    
    this.state = {
      sessionId: null,
      accessToken: null,
      authType: null
    };
    
    // Subscribe to store changes
    appStore.subscribe((state) => {
      this.setState({ 
        sessionId: state.sessionId,
        accessToken: state.accessToken,
        authType: state.authType
      });
    });

    // Initial render
    console.log('About to render initial state');
    this.render();
    console.log('After initial render, innerHTML:', this.el?.innerHTML);
    
    // Then check auth status
    this.checkAuthStatus();
  }

  setState(newState) {
    const changed = Object.keys(newState).some(
      key => this.state[key] !== newState[key]
    );
    
    if (changed) {
      this.state = { ...this.state, ...newState };
      this.render();
    }
  }

  render() {
    if (!this.el) return; // Skip rendering if no container
    
    const { sessionId, accessToken, authType } = this.state;

    if (sessionId || accessToken) {
      this.renderAuthenticatedState(authType);
    } else {
      this.renderUnauthenticatedState();
    }
  }

  renderUnauthenticatedState() {
    if (!this.el) return; // Skip rendering if no container
    
    console.log('Rendering unauthenticated state');
    this.el.innerHTML = `
      <button class="btn btn-primary" id="loginButton">
        <i class="fas fa-sign-in-alt"></i>
        ${t('login')}
      </button>
    `;
    
    // Attach event listener
    const loginBtn = this.el.querySelector('#loginButton');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        console.log('Login button clicked');
        loginModal.open();
      });
    }
  }

  renderAuthenticatedState(authType = 'user') {
    if (!this.el) return; // Skip rendering if no container
    
    const badgeClass = authType === 'app' ? 'badge-error' : 'badge-primary';
    const badgeText = authType === 'app' ? 'App' : 'User';

    this.el.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-sm">${t('login')}</span>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
        <button class="btn btn-outline btn-sm" id="logoutButton">
          <i class="fas fa-sign-out-alt"></i>
          ${t('logout')}
        </button>
      </div>
    `;
    
    // Attach event listener
    const logoutBtn = this.el.querySelector('#logoutButton');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }
  }

  async checkAuthStatus() {
    // Check URL params for session after OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const session = urlParams.get('session');
    const authStatus = urlParams.get('auth');
    const authType = urlParams.get('authType') || 'user';

    console.log('checkAuthStatus - URL params:', { session, authStatus, authType });
    console.log('Current URL:', window.location.href);

    if (authStatus === 'error') {
      toast.error(t('authFailed'));
      window.history.replaceState({}, document.title, window.location.pathname);
      // Show login modal after error
      setTimeout(() => loginModal.open(), 500);
      return;
    }

    if (session && authStatus === 'success') {
      console.log('Setting session in appStore:', session);
      appStore.setState({
        sessionId: session,
        authType
      });
      toast.success(authType === 'app' ? t('loginSuccessApp') : t('loginSuccessUser'));
      window.history.replaceState({}, document.title, window.location.pathname);
      this.render();
      return;
    }

    if (session) {
      console.log('Validating existing session:', session);
      await this.validateSession(session);
      return;
    }

    // Try MSAL silent token or handle redirect return
    try {
      const msalConfigured = initIfConfigured();
      if (msalConfigured) {
        const pca = getPca();
        // Check if returning from redirect
        const response = await pca?.handleRedirectPromise();
        if (response?.accessToken) {
          console.log('Got access token from redirect, storing in state');
          appStore.setState({ accessToken: response.accessToken, authType: 'bearer' });
          window.history.replaceState({}, document.title, window.location.pathname);
          toast.success(t('loginSuccessUser'));
          this.render();
          return;
        }
        // Try silent acquire
        const tokenResult = await acquireToken();
        if (tokenResult?.accessToken) {
          console.log('Got access token silently, storing in state');
          appStore.setState({ accessToken: tokenResult.accessToken, authType: 'bearer' });
          this.render();
          return;
        }
      }
    } catch (e) {
      console.warn('MSAL token acquisition failed:', e);
      // ignore; will prompt login modal
    }

    console.log('No session or MSAL token found - showing login modal');
    this.render();
    setTimeout(() => loginModal.open(), 300);
  }

  async validateSession(sessionId) {
    try {
      const data = await api.auth.validateSession(sessionId);
      
      if (data.hasValidToken) {
        appStore.setState({
          sessionId,
          authType: data.authType || 'user'
        });
        this.render();
      } else {
        this.clearAuth();
        // Show login modal when session is invalid
        setTimeout(() => loginModal.open(), 300);
      }
    } catch (error) {
      console.error('Session validation failed:', error);
      this.clearAuth();
      // Show login modal on validation error
      setTimeout(() => loginModal.open(), 300);
    }
  }

  async logout() {
    const { sessionId, accessToken } = this.state;
    try {
      if (sessionId) {
        await api.auth.logout(sessionId);
      }
    } catch (error) {
      console.error('Logout error:', error);
    }

    if (accessToken) {
      try { await msalLogout(); } catch {}
    }

    this.clearAuth();
    toast.success(t('loggedOut'));
  }

  clearAuth() {
    appStore.setState({
      sessionId: null,
      accessToken: null,
      authType: null,
      sites: [],
      currentSite: null
    });
    this.render();
  }
}
