// MSAL Browser auth helper (delegated, no client secret)
// Relies on global `msal` from msal-browser script tag in beta/index.html

const DEBUG_MODE = 0;
const debug = {
  log: (...args) => { if (DEBUG_MODE) console.log(...args); },
  warn: (...args) => { if (DEBUG_MODE) console.warn(...args); },
  error: (...args) => console.error(...args)
};

// Safe storage wrapper (handles Tracking Prevention in Safari/Firefox)
const safeStorage = {
  getItem: (key) => {
    try {
      return safeStorage.getItem(key);
    } catch (e) {
      debug.warn('localStorage blocked:', e);
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      safeStorage.setItem(key, value);
    } catch (e) {
      debug.warn('localStorage blocked:', e);
    }
  },
  removeItem: (key) => {
    try {
      safeStorage.removeItem(key);
    } catch (e) {
      debug.warn('localStorage blocked:', e);
    }
  }
};

let pca = null;
let currentAccount = null;
let currentScopes = [
  'Sites.Read.All',         // Read sites, libraries, files, and versions
  'Sites.ReadWrite.All'     // Delete file versions
];

// Export pca for use in auth.js
export function getPca() {
  return pca;
}

function getStoredConfig() {
  const clientId = safeStorage.getItem('msalClientId');
  const tenantId = safeStorage.getItem('msalTenantId');
  return clientId && tenantId ? { clientId, tenantId } : null;
}

export function initIfConfigured() {
  // Don't init if MSAL library is not loaded (main app doesn't load it)
  if (!window.msal) {
    debug.log('MSAL library not loaded, skipping init');
    return false;
  }
  
  const cfg = getStoredConfig();
  if (!cfg) return false;
  return init(cfg.clientId, cfg.tenantId);
}

export async function init(clientId, tenantId) {
  if (!window.msal) throw new Error('msal-browser not loaded');
  const authority = `https://login.microsoftonline.com/${tenantId}`;
  
  // Support both /beta/ and /beta/index.html paths
  const baseUrl = window.location.origin + '/beta/';
  
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
      console.log('Redirect handled, account:', response.account.username);
      // Store login time for session expiry tracking
      if (!safeStorage.getItem('loginTime')) {
        safeStorage.setItem('loginTime', Date.now().toString());
      }
    }
  } catch (e) {
    console.warn('handleRedirectPromise error:', e);
  }
  
  // Pick existing account if present
  const accounts = pca.getAllAccounts();
  if (accounts && accounts.length) {
    currentAccount = accounts[0];
    // Store login time for session expiry tracking (if not already set)
    if (!safeStorage.getItem('loginTime')) {
      safeStorage.setItem('loginTime', Date.now().toString());
    }
  }
  safeStorage.setItem('msalClientId', clientId);
  safeStorage.setItem('msalTenantId', tenantId);
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
    // Store login time for session expiry tracking
    if (!safeStorage.getItem('loginTime')) {
      safeStorage.setItem('loginTime', Date.now().toString());
    }
  }

  return acquireToken();
}

export async function acquireToken(scopes = currentScopes) {
  if (!window.msal) {
    console.log('MSAL library not loaded, cannot acquire token');
    return null;
  }
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

// Attempt to silently acquire a SharePoint REST token (AllSites.Read) for given host
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
    const scope = `${host.replace(/\/$/, '')}/AllSites.Read`;
    const request = { scopes: [scope], account: currentAccount };
    try {
      const resp = await pca.acquireTokenSilent(request);
      console.log('Acquired SharePoint REST token silently');
      return resp.accessToken;
    } catch (e) {
      console.log('Silent SharePoint token acquisition failed:', e.message);
      // Do NOT redirect automatically; user can grant later via UI
      return null;
    }
  } catch (outer) {
    console.warn('acquireSharePointToken error:', outer.message);
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
    const scope = `${host.replace(/\/$/, '')}/AllSites.Read`;
    console.log('Redirecting for SharePoint consent:', scope);
    await pca.acquireTokenRedirect({ scopes: [scope] });
  } catch (e) {
    console.warn('requestSharePointConsent error:', e.message);
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
