// MSAL Browser auth helper (delegated, no client secret)
// Relies on global `msal` from msal-browser script tag in beta/index.html

const DEBUG_MODE = 0;
const debug = {
  log: (...args) => { if (DEBUG_MODE) console.log(...args); },
  warn: (...args) => { if (DEBUG_MODE) console.warn(...args); },
  error: (...args) => console.error(...args)
};

let pca = null;
let currentAccount = null;
let currentScopes = [
  'Sites.Read.All',         // Read sites, libraries, files, and versions
  'Sites.ReadWrite.All',    // Delete file versions
  'Sites.FullControl.All'   // Optional: Update versioning settings via SharePoint REST API
];

// Export pca for use in auth.js
export function getPca() {
  return pca;
}

function getStoredConfig() {
  const clientId = localStorage.getItem('msalClientId');
  const tenantId = localStorage.getItem('msalTenantId');
  return clientId && tenantId ? { clientId, tenantId } : null;
}

export function initIfConfigured() {
  const cfg = getStoredConfig();
  if (!cfg) return false;
  return init(cfg.clientId, cfg.tenantId);
}

export async function init(clientId, tenantId) {
  if (!window.msal) throw new Error('msal-browser not loaded');
  const authority = `https://login.microsoftonline.com/${tenantId}`;
  
  // Support both /beta/ and /beta/index.html paths
  const baseUrl = window.location.origin + '/';
  
  const config = {
    auth: { 
      clientId, 
      authority,
      redirectUri: baseUrl
    },
    cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false }
  };
  
  debug.log('MSAL init with redirectUri:', baseUrl);
  
  pca = new window.msal.PublicClientApplication(config);
  await pca.initialize();
  // Expose for console debugging
  window.getPca = () => pca;
  
  // Handle redirect promise on page load
  try {
    const response = await pca.handleRedirectPromise();
    if (response?.account) {
      currentAccount = response.account;
      debug.log('Redirect handled, account:', response.account.username);
      
      // Dispatch custom event for successful login
      window.dispatchEvent(new CustomEvent('msal-login-success', { 
        detail: { account: response.account, accessToken: response.accessToken } 
      }));
    }
  } catch (e) {
    debug.warn('handleRedirectPromise error:', e);
  }
  
  // Pick existing account if present
  const accounts = pca.getAllAccounts();
  if (accounts && accounts.length) {
    currentAccount = accounts[0];
  }
  localStorage.setItem('msalClientId', clientId);
  localStorage.setItem('msalTenantId', tenantId);
  return true;
}

export async function signIn(scopes = currentScopes) {
  if (!pca) {
    const ok = initIfConfigured();
    if (!ok) throw new Error('MSAL is not configured');
  }
  currentScopes = scopes;

  const accounts = pca.getAllAccounts();
  if (!accounts.length) {
    // Use redirect instead of popup to avoid CORS issues with non-SPA apps
    const loginResp = await pca.loginRedirect({ scopes });
    // Note: execution stops here; user will be redirected and return to this page
    return null;
  } else {
    currentAccount = accounts[0];
  }

  return acquireToken();
}

export async function acquireToken(scopes = currentScopes) {
  if (!pca) throw new Error('MSAL not initialized');
  if (!currentAccount) {
    const accounts = pca.getAllAccounts();
    if (accounts.length) currentAccount = accounts[0];
  }
  const request = { scopes, account: currentAccount };
  try {
    const resp = await pca.acquireTokenSilent(request);
    return { accessToken: resp.accessToken, account: resp.account };
  } catch (e) {
    // Use redirect instead of popup for token acquisition
    await pca.acquireTokenRedirect({ scopes });
    // Execution stops; user redirected and will return
    return null;
  }
}

export async function getTokenOptional() {
  try {
    if (!pca) {
      const ok = initIfConfigured();
      if (!ok) return null;
    }
    const result = await acquireToken();
    return result.accessToken;
  } catch {
    return null;
  }
}

// Attempt to silently acquire a SharePoint REST token (AllSites.FullControl) for given host
export async function acquireSharePointToken(host) {
  try {
    if (!pca) {
      const ok = initIfConfigured();
      if (!ok) return null;
    }
    if (!currentAccount) {
      const accounts = pca.getAllAccounts();
      if (accounts.length) currentAccount = accounts[0];
    }
    if (!host) return null;
    // Use AllSites.FullControl for versioning updates (not just Read)
    const scope = `${host.replace(/\/$/, '')}/AllSites.FullControl`;
    const request = { scopes: [scope], account: currentAccount };
    try {
      const resp = await pca.acquireTokenSilent(request);
      debug.log('Acquired SharePoint REST token (AllSites.FullControl) silently');
      return resp.accessToken;
    } catch (e) {
      debug.log('Silent SharePoint token acquisition failed:', e.message);
      // Try interactive consent
      debug.log('Attempting interactive consent for SharePoint scope...');
      try {
        await pca.acquireTokenRedirect({ scopes: [scope], account: currentAccount });
        // Execution stops; user will be redirected
        return null;
      } catch (redirectErr) {
        debug.warn('Interactive consent failed:', redirectErr.message);
        return null;
      }
    }
  } catch (outer) {
    debug.warn('acquireSharePointToken error:', outer.message);
    return null;
  }
}

export async function getSharePointTokenOptional(host) {
  return acquireSharePointToken(host);
}

// Interactive consent request for SharePoint REST scope
export async function requestSharePointConsent(host) {
  try {
    if (!pca) {
      const ok = initIfConfigured();
      if (!ok) throw new Error('MSAL not configured');
    }
    if (!host) throw new Error('Host missing');
    // Use AllSites.FullControl for versioning updates
    const scope = `${host.replace(/\/$/, '')}/AllSites.FullControl`;
    debug.log('Redirecting for SharePoint consent:', scope);
    await pca.acquireTokenRedirect({ scopes: [scope] });
  } catch (e) {
    debug.warn('requestSharePointConsent error:', e.message);
  }
}

export async function logout() {
  if (!pca) return;
  const account = currentAccount || (pca.getAllAccounts()[0] || null);
  if (account) {
    await pca.logoutPopup({ account });
    currentAccount = null;
  }
}
