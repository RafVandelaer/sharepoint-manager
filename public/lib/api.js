// API Client for SharePoint Manager
import { appStore } from './component.js';
import { getTokenOptional } from './msal-auth.js';
import { inspectToken, hasRequiredScopes } from './jwt-debug.js';

class ApiClient {
  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
    this.tokenInspected = false; // Only inspect once per session
  }

  async request(path, options = {}) {
    const {
      method = 'GET',
      body,
      headers = {},
      signal
    } = options;

    const sessionId = appStore.getState().sessionId;
    const bearer = await getTokenOptional();
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    const spRestToken = appStore.getState().sharePointRestToken;

    // Skip auth for demo mode paths
    const isDemoPath = path.includes('/demo/');
    
    if (bearer && !isDemoPath) {
      requestHeaders['Authorization'] = `Bearer ${bearer}`;
      console.log('API request with Bearer token:', path, bearer.substring(0, 20) + '...');
      
      // Inspect token on first API call
      if (!this.tokenInspected) {
        this.tokenInspected = true;
        console.log('First API call - inspecting token...');
        inspectToken(bearer);
        hasRequiredScopes(bearer, ['Sites.Read.All', 'Sites.ReadWrite.All']);
      }
    } else if (sessionId && !isDemoPath) {
      requestHeaders['X-Session-ID'] = sessionId;
      console.log('API request with Session ID:', path, sessionId);
    } else {
      console.log('API request without auth (demo mode):', path);
    }

    // Add SharePoint REST token only for library-related endpoints (or when available globally)
    if (spRestToken && /\/libraries/.test(path)) {
      requestHeaders['X-SharePoint-Token'] = spRestToken;
      console.log('Added X-SharePoint-Token header');
    }

    const config = {
      method,
      headers: requestHeaders,
      signal
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, config);

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        error.statusText = response.statusText;
        
        try {
          const errorData = await response.json();
          error.message = errorData.error || errorData.message || error.message;
          error.details = errorData.details;
        } catch {
          const text = await response.text();
          error.message = text || error.message;
        }
        
        console.error('API error:', path, error);
        throw error;
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      }
      
      return await response.text();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request cancelled');
      }
      throw error;
    }
  }

  // Auth endpoints
  auth = {
    getLoginUrl: () => this.request('/auth/login'),

    // Browser-based config: set per-user Azure App Registration
    setConfig: ({ tenantId, clientId, clientSecret, redirectUri }) =>
      this.request('/auth/config', {
        method: 'POST',
        body: { tenantId, clientId, clientSecret, redirectUri }
      }),

    // Check if session has config on server
    configStatus: () => this.request('/auth/config/status'),

    // App login no longer used; kept for backward compatibility if needed
    loginAsApp: () => this.request('/auth/login/app', { method: 'POST' }),

    validateSession: (sessionId) => this.request(`/auth/token/${sessionId}`),
    
    logout: (sessionId) => this.request(`/auth/logout/${sessionId}`, { method: 'POST' })
  };

  // SharePoint endpoints
  sharepoint = {
    getSites: () => this.request('/sharepoint/sites'),
    
    getSiteDetails: (siteId) => this.request(`/sharepoint/sites/${siteId}`),
    
    getSiteLibraries: (siteId) => this.request(`/sharepoint/sites/${siteId}/libraries`),

    updateLibraryVersioning: (siteId, driveId, settings) =>
      this.request(`/sharepoint/sites/${siteId}/libraries/${driveId}/versioning`, {
        method: 'PATCH',
        body: settings
      }),
    
    cleanupDryRun: (siteId, versionsToKeep, signal) => 
      this.request(`/sharepoint/sites/${siteId}/cleanup?dryRun=true`, {
        method: 'POST',
        body: { versionsToKeep },
        signal
      }),
    
    cleanupReal: (siteId, versionsToKeep, signal) =>
      this.request(`/sharepoint/sites/${siteId}/cleanup`, {
        method: 'POST',
        body: { versionsToKeep },
        signal
      }),
    
    getVersionsByPath: (siteId, path, signal) =>
      this.request(
        `/sharepoint/sites/${siteId}/versions-by-path?path=${encodeURIComponent(path)}`,
        { signal }
      ),
    
    getTestFiles: (siteId, signal) =>
      this.request(`/sharepoint/sites/${siteId}/files/test`, { signal })
  };

  // SSE connection for progress updates
  createSSE(url, callbacks = {}) {
    const {
      onOpen,
      onProgress,
      onComplete,
      onError,
      onClose
    } = callbacks;

    const sessionId = appStore.getState().sessionId;
    let fullUrl = `${this.baseUrl}${url}`;
    const token = appStore.getState().accessToken || null;
    if (token) {
      fullUrl += `${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
    } else if (sessionId) {
      fullUrl += `${url.includes('?') ? '&' : '?'}sessionId=${sessionId}`;
    }

    const eventSource = new EventSource(fullUrl);

    eventSource.addEventListener('open', () => {
      console.log('SSE connection opened');
      onOpen?.();
    });

    eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'progress':
            onProgress?.(data);
            break;
          case 'complete':
            onComplete?.(data);
            eventSource.close();
            break;
          case 'error':
            onError?.(new Error(data.message));
            eventSource.close();
            break;
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    });

    eventSource.addEventListener('error', (error) => {
      console.error('SSE error:', error);
      onError?.(error);
      eventSource.close();
    });

    eventSource.addEventListener('close', () => {
      console.log('SSE connection closed');
      onClose?.();
    });

    return eventSource;
  }
}

export const api = new ApiClient();
