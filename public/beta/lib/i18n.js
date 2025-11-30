// Simple i18n helper for Beta UI
import { appStore } from './component.js';

const dictionaries = {
  en: {
    betaBadge: 'Beta',
    oldUI: 'Old UI',
    sharepointSitesTitle: 'SharePoint Sites',
    sharepointSitesSubtitle: 'Manage and cleanup version history across your sites',
    selectAllSites: 'Select all sites',
    refresh: 'Refresh',
    bulkCleanup: 'Bulk Cleanup',
    searchPlaceholder: 'Search sites...',
    loadingSitesTitle: 'Loading sites...',
    loadingSitesDesc: 'Please wait while we fetch your SharePoint sites',
    emptyTitle: 'No sites found',
    emptyDesc: 'Please log in to see your SharePoint sites',
    login: 'Login',
    inloggen: 'Login',
    logout: 'Logout',
    versionsToKeep: 'Versions to keep',
    startDryRun: 'Start Dry Run',
    startCleanup: 'Start Cleanup',
    cancel: 'Cancel',
    startRealCleanup: 'Start Real Cleanup',
    downloadReport: 'Download Report',
    overview: 'Overview',
    displayName: 'Display Name',
    siteId: 'Site ID',
    webUrl: 'Web URL',
    description: 'Description',
    created: 'Created',
    lastModified: 'Last Modified',
    storage: 'Storage',
    documentLibraries: 'Document Libraries',
    cleanupHistory: 'Cleanup History',
    noDescription: 'No description',
    noHistory: 'No cleanup history yet',
    close: 'Close',
    versioning: 'Versioning',
    versioningEnabled: 'Enabled',
    majorVersions: 'Major Limit',
    minorVersions: 'Minor Limit',
    minorEnabled: 'Minor Versions',
    forceCheckout: 'Force Checkout',
    manageLibraryVersioning: 'Manage Library Versioning',
    versioningMode: 'Versioning Mode',
    manualVersioning: 'Manual',
    smartVersioning: 'Smart (Microsoft)',
    manualVersioningDesc: 'Manually set the number of versions to keep (100-500)',
    smartVersioningDesc: 'Let Microsoft automatically manage versions based on usage and available storage',
    maxVersionsLabel: 'Maximum Versions',
    versioningEnabledLabel: 'Versioning Enabled',
    minorVersionsLabel: 'Minor Versions Enabled',
    maxMinorVersionsLabel: 'Max Minor Versions',
    saveSettings: 'Save Settings',
    loadingLibraries: 'Loading libraries...',
    noLibrariesFound: 'No libraries found',
    site: 'Site',
    defaultValues: '(defaults)',
    realValues: '(actual)',
    totalUsed: 'Total Used',
    lastCleanup: 'Last cleanup',
    confirmDirectCleanup: 'Run cleanup directly without dry run? This will permanently delete old versions. Continue?',
    noResultsDownload: 'No results to download',
    reportDownloaded: 'Report downloaded',
    connectionLost: 'Connection lost',
    connectionError: 'Connection error occurred',
    dryRunComplete: 'Dry run complete',
    cleanupComplete: 'Cleanup complete',
    files: 'files',
    versionsRemoved: 'versions removed'
  },
  nl: {
    betaBadge: 'Beta',
    oldUI: 'Oude UI',
    sharepointSitesTitle: 'SharePoint Sites',
    sharepointSitesSubtitle: 'Beheer en ruim versiegeschiedenis op voor je sites',
    selectAllSites: 'Selecteer alle sites',
    refresh: 'Vernieuwen',
    bulkCleanup: 'Bulk Cleanup',
    searchPlaceholder: 'Zoek sites...',
    loadingSitesTitle: 'Sites laden...',
    loadingSitesDesc: 'Even geduld terwijl we je SharePoint sites ophalen',
    emptyTitle: 'Geen sites gevonden',
    emptyDesc: 'Log in om je SharePoint sites te zien',
    login: 'Inloggen',
    inloggen: 'Inloggen',
    logout: 'Uitloggen',
    versionsToKeep: 'Versies behouden',
    startDryRun: 'Start Dry Run',
    startCleanup: 'Start Cleanup',
    cancel: 'Annuleren',
    startRealCleanup: 'Start Definitieve Cleanup',
    downloadReport: 'Rapport Downloaden',
    overview: 'Overzicht',
    displayName: 'Weergavenaam',
    siteId: 'Site ID',
    webUrl: 'Web URL',
    description: 'Beschrijving',
    created: 'Aangemaakt',
    lastModified: 'Laatst gewijzigd',
    storage: 'Opslag',
    documentLibraries: 'Documentbibliotheken',
    cleanupHistory: 'Cleanup Geschiedenis',
    noDescription: 'Geen beschrijving',
    noHistory: 'Nog geen cleanup geschiedenis',
    close: 'Sluiten',
    versioning: 'Versiebeheer',
    versioningEnabled: 'Ingeschakeld',
    majorVersions: 'Max hoofdversies',
    minorVersions: 'Max subversies',
    minorEnabled: 'Subversies',
    forceCheckout: 'Uitcheck verplicht',
    manageLibraryVersioning: 'Bibliotheek Versiebeheer Beheren',
    versioningMode: 'Versiebeheermodus',
    manualVersioning: 'Handmatig',
    smartVersioning: 'Smart (Microsoft)',
    manualVersioningDesc: 'Stel handmatig het aantal te behouden versies in (100-500)',
    smartVersioningDesc: 'Laat Microsoft automatisch versies beheren op basis van gebruik en beschikbare opslagruimte',
    maxVersionsLabel: 'Maximum Versies',
    versioningEnabledLabel: 'Versiebeheer Ingeschakeld',
    minorVersionsLabel: 'Subversies Ingeschakeld',
    maxMinorVersionsLabel: 'Max Subversies',
    saveSettings: 'Instellingen Opslaan',
    loadingLibraries: 'Bibliotheken laden...',
    noLibrariesFound: 'Geen bibliotheken gevonden',
    site: 'Site',
    defaultValues: '(standaard)',
    realValues: '(actueel)',
    totalUsed: 'Totaal gebruikt',
    lastCleanup: 'Laatste cleanup',
    confirmDirectCleanup: 'Direct cleanup uitvoeren zonder dry run? Dit verwijdert oude versies definitief. Doorgaan?',
    noResultsDownload: 'Geen resultaten om te downloaden',
    reportDownloaded: 'Rapport gedownload',
    connectionLost: 'Verbinding verbroken',
    connectionError: 'Verbindingsfout opgetreden',
    dryRunComplete: 'Dry run voltooid',
    cleanupComplete: 'Cleanup voltooid',
    files: 'bestanden',
    versionsRemoved: 'versies verwijderd',
    versionWarning: 'Waarschuwing: Het behouden van slechts 1 versie is extreem risicovol en kan leiden tot permanent gegevensverlies. We raden sterk aan om minimaal 2 versies te behouden.'
  }
};

// Extended keys (added after initial implementation)
Object.assign(dictionaries.en, {
  unnamedSite: 'Unnamed Site',
  notCleanedYet: 'Not cleaned yet',
  selectSite: 'Select site',
  details: 'Details',
  cleanup: 'Cleanup',
  bulkCleanup: 'Bulk Cleanup',
  startBulkDryRun: 'Start Bulk Dry Run',
  startBulkCleanup: 'Start Bulk Cleanup',
  sitesProcessed: 'Sites processed',
  filesWithVersions: 'Files with versions',
  versionsToRemove: 'Versions to remove',
  processingSites: 'Processing Sites',
  sitesCompleted: 'sites completed',
  pending: 'Pending',
  failed: 'Failed',
  authFailed: 'Authentication failed. Please try again.',
  loginSuccessUser: 'Successfully logged in as user!',
  loginSuccessApp: 'Successfully logged in as app!',
  loggedOut: 'Logged out',
  userLoginTitle: 'User Login',
  loginIntro: 'Log in with your Microsoft account to access SharePoint sites you have permissions for.',
  secureOAuth: 'Secure OAuth authentication',
  accessSitesPermissions: 'Access sites with your permissions',
  auditTrail: 'Audit trail with your name',
  userOnlyBeta: 'Only user login is available in the beta UI',
  loginUrlError: 'Could not retrieve login URL',
  loginFailed: 'Login failed:',
  noSitesAvailableBulk: 'No sites available for bulk cleanup',
  sessionExpired: 'Session expired. Please log in again.',
  failedLoadSites: 'Failed to load sites:',
  startCleanupFailed: 'Failed to start cleanup',
  noSearchResults: 'No sites match your search',
  versionWarning: 'Warning: Keeping only 1 version is extremely risky and can lead to permanent data loss. We strongly recommend keeping at least 2 versions.',
  tryDifferentSearch: 'Try a different search term',
  noOldVersionsFound: 'No old versions found!',
  scanning: 'Scanning...'
});

Object.assign(dictionaries.nl, {
  unnamedSite: 'Naamloos',
  notCleanedYet: 'Nog niet opgeschoond',
  selectSite: 'Selecteer site',
  details: 'Details',
  cleanup: 'Cleanup',
  bulkCleanup: 'Bulk Cleanup',
  startBulkDryRun: 'Start Bulk Dry Run',
  startBulkCleanup: 'Start Bulk Cleanup',
  sitesProcessed: 'Sites verwerkt',
  filesWithVersions: 'Bestanden met versies',
  versionsToRemove: 'Versies te verwijderen',
  processingSites: 'Sites verwerken',
  sitesCompleted: 'sites klaar',
  pending: 'In afwachting',
  failed: 'Mislukt',
  authFailed: 'Authenticatie mislukt. Probeer opnieuw.',
  loginSuccessUser: 'Succesvol ingelogd als gebruiker!',
  loginSuccessApp: 'Succesvol ingelogd als app!',
  loggedOut: 'Uitgelogd',
  userLoginTitle: 'Gebruiker Login',
  loginIntro: 'Log in met je Microsoft account om toegang te krijgen tot SharePoint sites waar je rechten hebt.',
  secureOAuth: 'Veilige OAuth authenticatie',
  accessSitesPermissions: 'Toegang tot sites met jouw permissions',
  auditTrail: 'Audit trail met jouw naam',
  userOnlyBeta: 'Alleen gebruiker login is beschikbaar in de beta UI',
  loginUrlError: 'Kon login URL niet ophalen',
  loginFailed: 'Login mislukt:',
  noSitesAvailableBulk: 'Geen sites beschikbaar voor bulk cleanup',
  sessionExpired: 'Sessie verlopen. Log opnieuw in.',
  failedLoadSites: 'Laden van sites mislukt:',
  startCleanupFailed: 'Cleanup starten mislukt',
  noSearchResults: 'Geen sites voldoen aan je zoekopdracht',
  tryDifferentSearch: 'Probeer een andere zoekterm',
  noOldVersionsFound: 'Geen oude versies gevonden!',
  scanning: 'Scannen...'
});

export function t(key) {
  const lang = appStore.getState().lang || 'nl';
  const dict = dictionaries[lang] || dictionaries.en;
  return dict[key] || dictionaries.en[key] || key;
}

export function setLanguage(lang) {
  if (!dictionaries[lang]) return;
  localStorage.setItem('lang', lang);
  appStore.setState({ lang });
  applyTranslations();
}

export function applyTranslations(root=document) {
  const lang = appStore.getState().lang || 'nl';
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  // Placeholders
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', t(key));
  });
}

// Auto apply on load
if (document.readyState !== 'loading') {
  applyTranslations();
} else {
  document.addEventListener('DOMContentLoaded', () => applyTranslations());
}
