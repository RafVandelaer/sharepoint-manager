    // Eenvoudige bulk scan methods
    async bulkDryRun() {
        const selectedSites = this.getSelectedSites();
        if (selectedSites.length === 0) {
            this.showError('Selecteer eerst sites om te scannen');
            return;
        }
        this.showSuccess(`Bulk scan functionaliteit wordt binnenkort toegevoegd voor ${selectedSites.length} sites`);
    }

    async cancelBulkScan() {
        this.showSuccess('Bulk scan geannuleerd');
    }

    showLoading(show) {
        document.getElementById('loadingSection').style.display = show ? 'block' : 'none';
        document.getElementById('sitesSection').style.display = show ? 'none' : 'block';
    }

    showError(message) {
        document.getElementById('errorText').textContent = message;
        document.getElementById('errorMessage').style.display = 'block';
        setTimeout(() => this.hideError(), 5000);
    }

    showSuccess(message) {
        document.getElementById('successText').textContent = message;
        document.getElementById('successMessage').style.display = 'block';
        setTimeout(() => this.hideSuccess(), 3000);
    }

    hideError() {
        document.getElementById('errorMessage').style.display = 'none';
    }

    hideSuccess() {
        document.getElementById('successMessage').style.display = 'none';
    }

    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    showDemoBanner() {
        document.getElementById('demoBanner').style.display = 'block';
    }
    
    getMockSites() {
        return [
            {
                id: 'demo-site-1',
                name: 'Demo Team Site',
                displayName: 'Demo Team Site',
                description: 'Een demo SharePoint team site voor testing',
                webUrl: 'https://demo.sharepoint.com/sites/teamsite',
                createdDateTime: '2024-01-15T10:00:00Z'
            },
            {
                id: 'demo-site-2', 
                name: 'Demo Project Hub',
                displayName: 'Demo Project Hub',
                description: 'Demo project hub site met documenten',
                webUrl: 'https://demo.sharepoint.com/sites/projecthub',
                createdDateTime: '2024-02-20T14:30:00Z'
            },
            {
                id: 'demo-site-3',
                name: 'Demo Knowledge Base',
                displayName: 'Demo Knowledge Base',
                description: 'Demo kennisbank voor organisatie informatie',
                webUrl: 'https://demo.sharepoint.com/sites/kb',
                createdDateTime: '2024-03-10T09:15:00Z'
            }
        ];
    }
}

// Initialize the app
const app = new SharePointManager();
// Zorg dat de app ook beschikbaar is voor inline handlers en andere scripts
// (bijvoorbeeld onclick="app.showFileVersionDetails(...)" in gegenereerde HTML)
// Bij ES modules komt top-level const niet op window terecht, dus we exposen expliciet.
window.app = app;