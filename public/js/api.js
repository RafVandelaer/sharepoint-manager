// API helpers with a small fetch wrapper
import { state } from './state.js';

async function fetchJson(path, { method = 'GET', headers = {}, body, signal } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (state.sessionId) h['X-Session-ID'] = state.sessionId;
  const res = await fetch(path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

export const api = {
  login: () => fetchJson('/api/auth/login'),
  validateSession: (sessionId) => fetchJson(`/api/auth/token/${sessionId}`),
  getSites: () => fetchJson('/api/sharepoint/sites'),
  cleanupDryRun: (siteId, versionsToKeep, signal) => fetchJson(`/api/sharepoint/sites/${siteId}/cleanup?dryRun=true`, {
    method: 'POST', body: { versionsToKeep }, signal
  }),
  cleanupReal: (siteId, versionsToKeep, signal) => fetchJson(`/api/sharepoint/sites/${siteId}/cleanup`, {
    method: 'POST', body: { versionsToKeep }, signal
  }),
  versionsByPath: (siteId, path, signal) => fetchJson(`/api/sharepoint/sites/${siteId}/versions-by-path?path=${encodeURIComponent(path)}`, { signal }),
  testFiles: (siteId, signal) => fetchJson(`/api/sharepoint/sites/${siteId}/files/test`, { signal }),
  // New optimized endpoints
  scanFilesOptimized: (siteId, callbacks) => {
    const { startOptimizedScan } = require('./optimizedScan.js');
    return startOptimizedScan(siteId, callbacks);
  }
};

export { fetchJson };
