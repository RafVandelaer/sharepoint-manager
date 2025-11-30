/**
 * Demo Data Service - Generates realistic SharePoint demo data
 * 
 * Used for /demo endpoint to showcase analytics without real authentication
 */

class DemoDataService {
  constructor() {
    // Seeded random generator for consistent demo data
    this.seed = 12345; // Fixed seed for reproducible results
    
    this.siteNames = [
      'Marketing Team Site',
      'Sales Operations Hub',
      'Engineering Docs',
      'HR Resources',
      'Finance & Accounting',
      'Product Development',
      'Customer Support Portal',
      'Legal Documents',
      'IT Infrastructure',
      'Project Management',
      'Design Assets Library',
      'Research & Development',
      'Executive Dashboard',
      'Training Materials',
      'Quality Assurance',
      'Supply Chain Management',
      'Business Intelligence',
      'Corporate Communications',
      'Partner Collaboration',
      'Archive - 2024'
    ];

    this.siteDescriptions = [
      'Centralized hub for team collaboration and document management',
      'Project files, templates, and shared resources',
      'Documentation, policies, and procedures',
      'Asset library and knowledge base',
      'Collaboration workspace for cross-functional teams',
      'Repository for strategic planning and reporting',
      'Historical records and archived content',
      'Operational tools and workflow automation',
      'Training resources and onboarding materials',
      'Client-facing portal for external collaboration'
    ];
  }

  /**
   * Seeded random number generator (LCG algorithm)
   * Returns consistent random numbers for same seed
   */
  seededRandom() {
    const a = 1103515245;
    const c = 12345;
    const m = 2147483648;
    this.seed = (a * this.seed + c) % m;
    return this.seed / m;
  }

  /**
   * Generate array of demo sites with realistic storage patterns
   */
  generateSites(count = 50) {
    const sites = [];
    
    for (let i = 0; i < count; i++) {
      const nameIndex = i % this.siteNames.length;
      const suffix = i >= this.siteNames.length ? ` ${Math.floor(i / this.siteNames.length) + 1}` : '';
      const name = this.siteNames[nameIndex] + suffix;
      
      // Realistic storage distribution: mostly small, some medium, few large
      const rand = this.seededRandom();
      let usedGB;
      if (rand < 0.6) {
        // 60% small sites (< 1GB)
        usedGB = this.seededRandom() * 0.9 + 0.1;
      } else if (rand < 0.9) {
        // 30% medium sites (1-10GB)
        usedGB = this.seededRandom() * 9 + 1;
      } else {
        // 10% large sites (10-100GB)
        usedGB = this.seededRandom() * 90 + 10;
      }

      const usedBytes = usedGB * 1024 * 1024 * 1024;
      const quotaGB = this.getRealisticQuota(usedGB);
      const quotaBytes = quotaGB * 1024 * 1024 * 1024;

      sites.push({
        id: `demo-site-${i + 1}`,
        name: name,
        displayName: name,
        description: this.siteDescriptions[i % this.siteDescriptions.length],
        webUrl: `https://contoso.sharepoint.com/sites/${name.toLowerCase().replace(/\s+/g, '-')}`,
        createdDateTime: this.getRandomDate(365 * 2), // Created within last 2 years
        storage: {
          used: usedBytes,
          allocated: quotaBytes,
          usedGB: usedGB.toFixed(2),
          allocatedGB: quotaGB.toFixed(2),
          percentUsed: ((usedBytes / quotaBytes) * 100).toFixed(1)
        },
        versions: this.generateVersionMetrics()
      });
    }

    // Sort by storage used (descending) for realistic top sites
    return sites.sort((a, b) => b.storage.used - a.storage.used);
  }

  /**
   * Generate realistic quota based on usage
   */
  getRealisticQuota(usedGB) {
    if (usedGB < 1) return Math.ceil(usedGB * 2) || 1;
    if (usedGB < 10) return Math.ceil(usedGB * 1.5);
    if (usedGB < 50) return Math.ceil(usedGB * 1.3);
    return Math.ceil(usedGB * 1.2);
  }

  /**
   * Generate version history metrics
   */
  generateVersionMetrics() {
    const totalFiles = Math.floor(this.seededRandom() * 5000) + 100;
    const filesWithVersions = Math.floor(totalFiles * (this.seededRandom() * 0.4 + 0.3)); // 30-70% have versions
    const totalVersions = Math.floor(filesWithVersions * (this.seededRandom() * 8 + 2)); // 2-10 versions avg
    const versionsSize = totalVersions * (this.seededRandom() * 5 + 1) * 1024 * 1024; // 1-6MB avg per version

    return {
      totalFiles,
      filesWithVersions,
      totalVersions,
      versionsSize,
      versionsSizeGB: (versionsSize / (1024 * 1024 * 1024)).toFixed(2),
      averageVersionsPerFile: filesWithVersions > 0 ? (totalVersions / filesWithVersions).toFixed(1) : '0.0'
    };
  }

  /**
   * Get random date in the past (days ago)
   */
  getRandomDate(maxDaysAgo) {
    const daysAgo = Math.floor(this.seededRandom() * maxDaysAgo);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString();
  }

  /**
   * Generate paginated response (for progressive loading simulation)
   */
  generatePaginatedResponse(pageSize = 50, pageIndex = 0) {
    const allSites = this.generateSites(100); // Generate 100 total demo sites
    const start = pageIndex * pageSize;
    const end = start + pageSize;
    const pageSites = allSites.slice(start, end);
    
    return {
      sites: pageSites.map(s => ({
        id: s.id,
        name: s.name,
        displayName: s.displayName,
        webUrl: s.webUrl,
        description: s.description,
        createdDateTime: s.createdDateTime,
        storage: {
          used: s.storage.used,
          usedGB: s.storage.usedGB,
          allocatedGB: s.storage.allocatedGB,
          percentage: s.storage.percentUsed  // Map percentUsed to percentage
        }
      })),
      aggregate: {
        totalUsed: pageSites.reduce((sum, s) => sum + s.storage.used, 0)
      },
      nextLink: end < allSites.length ? `page=${pageIndex + 1}` : null
    };
  }

  /**
   * Generate full analytics response
   */
  generateFullAnalytics() {
    const sites = this.generateSites(100);
    const totalUsed = sites.reduce((sum, s) => sum + s.storage.used, 0);
    const totalUsedGB = (totalUsed / (1024 * 1024 * 1024)).toFixed(2);
    const averageUsedGB = (totalUsedGB / sites.length).toFixed(2);

    return {
      sites: sites,
      aggregate: {
        totalUsedGB,
        averageUsedGB,
        // Include upward storage trend for charts (30 days)
        trend: this.generateStorageTrend(30, Math.max(10, parseFloat(totalUsedGB) / sites.length), 0.015)
      }
    };
  }

  /**
   * Generate storage trend data (30 days)
   * Ensures UPWARD trend from old to new dates
   */
  generateStorageTrend(days = 30, base = 5, dailyGrowthPct = 0.012) {
    const trend = [];
    // Calculate target end value (base should be the final value)
    const endValue = base;
    // Start from lower value so we grow UP to the base
    const startValue = endValue / (1 + dailyGrowthPct * days);
    let current = startValue;
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // Push current value for this date
      trend.push({ date: date.toISOString().slice(0, 10), gb: parseFloat(current.toFixed(2)) });
      
      // Increment for next iteration (making next date higher)
      const growth = current * dailyGrowthPct;
      const noise = (this.seededRandom() - 0.4) * growth; // Slight upward bias
      current = current + growth + noise;
    }
    return trend;
  }

  /**
   * Generate site detail with libraries
   */
  generateSiteDetail(siteId) {
    const sites = this.generateSites(100);
    const site = sites.find(s => s.id === siteId) || sites[0];

    const libraries = [
      {
        id: 'demo-lib-1',
        name: 'Documents',
        usedGB: (parseFloat(site.storage.usedGB) * 0.6).toFixed(2),
        itemCount: Math.floor(this.seededRandom() * 2000) + 500,
        webUrl: `${site.webUrl}/Shared Documents`,
        versioningEnabled: true,
        majorVersionLimit: 500,
        enableMinorVersions: false,
        majorWithMinorVersionsLimit: 0,
        forceCheckout: false,
        listId: '{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}'
      },
      {
        id: 'demo-lib-2',
        name: 'Shared Documents',
        usedGB: (parseFloat(site.storage.usedGB) * 0.25).toFixed(2),
        itemCount: Math.floor(this.seededRandom() * 1000) + 200,
        webUrl: `${site.webUrl}/Documents`,
        versioningEnabled: true,
        majorVersionLimit: 100,
        enableMinorVersions: true,
        majorWithMinorVersionsLimit: 50,
        forceCheckout: false,
        listId: '{B2C3D4E5-F6A7-8901-BCDE-F12345678901}'
      },
      {
        id: 'demo-lib-3',
        name: 'Site Assets',
        usedGB: (parseFloat(site.storage.usedGB) * 0.1).toFixed(2),
        itemCount: Math.floor(this.seededRandom() * 500) + 50,
        webUrl: `${site.webUrl}/SiteAssets`,
        versioningEnabled: false,
        majorVersionLimit: 0,
        enableMinorVersions: false,
        majorWithMinorVersionsLimit: 0,
        forceCheckout: false,
        listId: '{C3D4E5F6-A7B8-9012-CDEF-123456789012}'
      },
      {
        id: 'demo-lib-4',
        name: 'Archive',
        usedGB: (parseFloat(site.storage.usedGB) * 0.05).toFixed(2),
        itemCount: Math.floor(this.seededRandom() * 300) + 20,
        webUrl: `${site.webUrl}/Archive`,
        versioningEnabled: true,
        majorVersionLimit: 50,
        enableMinorVersions: false,
        majorWithMinorVersionsLimit: 0,
        forceCheckout: true,
        listId: '{D4E5F6A7-B8C9-0123-DEF1-234567890123}'
      }
    ];

    return {
      ...site,
      libraries
    };
  }
}

module.exports = new DemoDataService();
