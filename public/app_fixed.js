    // Bulk scan methods - simplified implementation
    async bulkDryRun() {
        const selectedSites = this.getSelectedSites();
        if (selectedSites.length === 0) {
            this.showError('Selecteer eerst sites om te scannen');
            return;
        }
        this.showSuccess(`Bulk scan gestart voor ${selectedSites.length} sites (volledige implementatie volgt binnenkort)`);
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
