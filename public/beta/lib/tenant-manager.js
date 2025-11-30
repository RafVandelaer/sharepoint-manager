// Tenant Manager - persist and manage multiple tenant configurations
const STORAGE_KEY = 'savedTenants';

export class TenantManager {
  constructor() {
    this.tenants = this.loadTenants();
  }

  loadTenants() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Failed to load tenants:', e);
      return [];
    }
  }

  saveTenants() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tenants));
    } catch (e) {
      console.error('Failed to save tenants:', e);
    }
  }

  addOrUpdateTenant(name, tenantId, clientId) {
    // Check if tenant already exists (by tenantId)
    const existing = this.tenants.find(t => t.tenantId === tenantId);
    
    if (existing) {
      // Update existing
      existing.name = name;
      existing.clientId = clientId;
      existing.lastUsed = Date.now();
    } else {
      // Add new
      this.tenants.push({
        id: crypto.randomUUID(),
        name,
        tenantId,
        clientId,
        createdAt: Date.now(),
        lastUsed: Date.now()
      });
    }
    
    this.saveTenants();
    return this.tenants;
  }

  getTenants() {
    // Return sorted by last used (most recent first)
    return [...this.tenants].sort((a, b) => b.lastUsed - a.lastUsed);
  }

  getTenantById(id) {
    return this.tenants.find(t => t.id === id);
  }

  deleteTenant(id) {
    this.tenants = this.tenants.filter(t => t.id !== id);
    this.saveTenants();
    return this.tenants;
  }

  updateLastUsed(tenantId) {
    const tenant = this.tenants.find(t => t.tenantId === tenantId);
    if (tenant) {
      tenant.lastUsed = Date.now();
      this.saveTenants();
    }
  }
}

export const tenantManager = new TenantManager();
