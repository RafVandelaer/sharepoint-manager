// Cleanup Modal Component
import { Component, formatFileSize, formatDate, escapeHtml, h } from '../lib/component.js';
import { t } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { toast } from './toast.js';

class CleanupModal extends Component {
  constructor() {
    super('#modalContainer');
    this.site = null;
    this.versionsToKeep = 3;
    this.isDryRun = true;
    this.files = [];
    this.selectedFile = null;
    this.eventSource = null;
    this.isProcessing = false;
    
    this.render();
    this.setupEventListeners();
  }

  getFileIcon(fileName) {
    if (!fileName || typeof fileName !== 'string') {
      return 'fa-file';
    }
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const iconMap = {
      'docx': 'fa-file-word', 'doc': 'fa-file-word',
      'xlsx': 'fa-file-excel', 'xls': 'fa-file-excel',
      'pptx': 'fa-file-powerpoint', 'ppt': 'fa-file-powerpoint',
      'pdf': 'fa-file-pdf',
      'jpg': 'fa-file-image', 'jpeg': 'fa-file-image', 'png': 'fa-file-image', 'gif': 'fa-file-image'
    };
    return iconMap[ext] || 'fa-file';
  }

  render() {
    this.el = h('div', {
      className: 'modal',
      id: 'cleanupModal',
      style: 'display: none;'
    }, `
      <div class="modal-content" style="max-width: 1200px;">
        <div class="modal-header">
          <h2 id="cleanupModalTitle">Cleanup Simulation</h2>
          <button class="modal-close" id="closeCleanupModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="modal-body">
          <!-- Configuration -->
          <div class="cleanup-config" id="cleanupConfig">
            <div class="form-group">
              <label>${t('versionsToKeep')}:</label>
              <input type="number" id="versionsToKeep" value="3" min="1" max="50" class="input">
            </div>
            <div class="flex gap-3">
              <button class="btn btn-primary" id="startDryRun">
                <i class="fas fa-play"></i>
                ${t('startDryRun')}
              </button>
              <button class="btn btn-secondary" id="startImmediateCleanup">
                <i class="fas fa-broom"></i>
                ${t('startCleanup')}
              </button>
              <button class="btn btn-outline" id="cancelCleanup">
                ${t('cancel')}
              </button>
            </div>
          </div>

          <!-- Progress -->
          <div class="cleanup-progress" id="cleanupProgress" style="display: none;">
            <div class="progress-header">
              <div class="scan-status-row">
                <div class="spinner" id="scanSpinner" style="display:none"></div>
                <span id="progressStatus">Initializing...</span>
                <div class="pulse-dots" id="statusDots" style="display:none"><span></span><span></span><span></span></div>
                <span id="progressPercent">0%</span>
              </div>
            </div>
            <div class="progress-bar" id="progressBar">
              <div class="progress-fill" id="progressFill" style="width: 0%;"></div>
            </div>
            <div class="progress-stats" id="progressStats"></div>
          </div>

          <!-- Results -->
          <div class="cleanup-results" id="cleanupResults" style="display: none;">
            <div class="results-summary">
              <div class="summary-card">
                <i class="fas fa-file"></i>
                <div>
                  <div class="summary-value" id="totalFiles">0</div>
                  <div class="summary-label">Files with versions</div>
                </div>
              </div>
              <div class="summary-card">
                <i class="fas fa-code-branch"></i>
                <div>
                  <div class="summary-value" id="totalVersions">0</div>
                  <div class="summary-label">Total versions</div>
                </div>
              </div>
              <div class="summary-card">
                <i class="fas fa-trash"></i>
                <div>
                  <div class="summary-value" id="versionsToRemove">0</div>
                  <div class="summary-label">Versions to remove</div>
                </div>
              </div>
            </div>

            <div class="results-content">
              <div class="file-list-panel">
                <h3>Files</h3>
                <div class="file-list" id="fileList"></div>
              </div>
              
              <div class="file-details-panel">
                <h3>Version Details</h3>
                <div class="file-details" id="fileDetails">
                  <div class="empty-state" style="padding: var(--space-10) var(--space-4);">
                    <i class="fas fa-hand-pointer" style="font-size: 3rem; color: var(--color-border-strong); margin-bottom: var(--space-3);"></i>
                    <p style="color: var(--color-text-secondary);">Select a file to view version details</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="modal-actions" style="margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--color-border);">
              <button class="btn btn-danger" id="startRealCleanup" style="display: none;">
                <i class="fas fa-broom"></i>
                ${t('startRealCleanup')}
              </button>
              <button class="btn btn-outline" id="downloadCleanupReport" style="display: none;">
                <i class="fas fa-file-download"></i>
                ${t('downloadReport')}
              </button>
              <button class="btn btn-outline" id="closeResults">
                ${t('close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    `);
    
    document.body.appendChild(this.el);
  }

  setupEventListeners() {
    // Close modal
    this.on('#closeCleanupModal', 'click', () => this.close());
    this.on('#cancelCleanup', 'click', () => this.close());
    this.on('#closeResults', 'click', () => this.close());
    
    // Close on outside click
    this.on('.modal', 'click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.close();
      }
    });

    // Versions input
    this.on('#versionsToKeep', 'input', (e) => {
      this.versionsToKeep = parseInt(e.target.value) || 3;
    });

    // Start dry run
    this.on('#startDryRun', 'click', () => this.startCleanup(true));
    // Direct real cleanup (skips dry run)
    this.on('#startImmediateCleanup', 'click', () => {
      if (confirm('Direct cleanup uitvoeren zonder dry run? Dit verwijdert oude versies definitief. Doorgaan?')) {
        this.startCleanup(false);
      }
    });
    
    // Start real cleanup
    this.on('#startRealCleanup', 'click', () => {
      if (confirm('Are you sure you want to delete these versions? This cannot be undone!')) {
        this.startCleanup(false);
      }
    });
    // Download report
    this.on('#downloadCleanupReport', 'click', () => this.downloadReport());
  }

  open(site) {
    this.site = site;
    this.files = [];
    this.selectedFile = null;
    this.isDryRun = true;
    
    this.$('#cleanupModalTitle').textContent = `Cleanup: ${site.displayName}`;
    this.$('#cleanupConfig').style.display = 'block';
    this.$('#cleanupProgress').style.display = 'none';
    this.$('#cleanupResults').style.display = 'none';
    this.$('#versionsToKeep').value = this.versionsToKeep;
    
    // Show modal
    if (this.el) {
      this.el.style.display = 'flex';
    }
  }

  close() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    // Hide modal
    if (this.el) {
      this.el.style.display = 'none';
    }
    this.isProcessing = false;
  }

  async startCleanup(dryRun = true) {
    if (!this.site) return;
    
    this.isDryRun = dryRun;
    this.isProcessing = true;
    this.files = [];
    
    // Show progress
    this.$('#cleanupConfig').style.display = 'none';
    this.$('#cleanupResults').style.display = 'none';
    this.$('#cleanupProgress').style.display = 'block';
    this.$('#progressStatus').textContent = dryRun ? 'Starting dry run' : 'Starting cleanup';
    this.$('#progressFill').style.width = '0%';
    this.$('#progressPercent').textContent = '0%';
    this.$('#progressStats').innerHTML = '';
    // Activate animation visuals
    this.$('#scanSpinner').style.display = 'inline-block';
    this.$('#statusDots').style.display = 'inline-block';
    this.$('#progressBar').classList.add('shimmer');

    try {
      // Detect demo mode by pathname or site id prefix
      const isDemoMode = window.IS_DEMO_MODE || window.location.pathname === '/demo' || (this.site?.id || '').startsWith('demo-site-');
      if (isDemoMode) {
        console.log('[CLEANUP] Demo mode detected, using simulated cleanup');
        // Use simple POST (no SSE) and simulate batch updates client-side
        const endpoint = `/demo/sites/${this.site.id}/cleanup?dryRun=${dryRun}&versionsToKeep=${this.versionsToKeep}`;
        const resp = await api.request(endpoint, { method: 'POST' });
        const result = resp.result || resp;
        const batches = Array.isArray(result.progress) ? result.progress : [];
        const totalFiles = result.filesProcessed || 0;
        let processedSoFar = 0;
        const totalVersionsRemoved = result.versionsRemoved || 0;
        const batchInterval = 300; // ms between visual updates

        this.$('#progressStatus').textContent = 'Simulating batch processing...';

        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          await new Promise(r => setTimeout(r, batchInterval));
          processedSoFar += batch.filesProcessed || batch.files || 0;
          const percent = totalFiles ? Math.min(100, Math.round((processedSoFar / totalFiles) * 100)) : 0;
          this.updateProgress({
            progress: percent,
            stats: {
              foldersProcessed: i + 1,
              filesProcessed: processedSoFar,
              versionsFound: Math.round(totalVersionsRemoved * (processedSoFar / totalFiles))
            },
            message: batch.currentFolder || `Batch ${i + 1}`
          });
        }

        // Finalize
        this.handleComplete({
          versionsRemoved: totalVersionsRemoved,
          versionsToRemove: totalVersionsRemoved,
          details: {},
        });
        return;
      }

      // Real mode with SSE
      this.eventSource = api.createSSE(
        `/sharepoint/sites/${this.site.id}/cleanup?versionsToKeep=${this.versionsToKeep}&dryRun=${dryRun}`
      );

      this.eventSource.addEventListener('progress', (e) => {
        const data = JSON.parse(e.data);
        this.updateProgress(data);
      });

      this.eventSource.addEventListener('folder', (e) => {
        const data = JSON.parse(e.data);
        const folderName = data.folderName || data.folderPath || t('scanning');
        this.$('#progressStatus').textContent = folderName;
      });

      this.eventSource.addEventListener('complete', (e) => {
        const data = JSON.parse(e.data);
        this.handleComplete(data);
      });

      this.eventSource.addEventListener('error', (e) => {
        console.error('SSE error:', e);
        toast.error(t('connectionError'));
        // Stop animations on error
        this.$('#scanSpinner').style.display = 'none';
        this.$('#statusDots').style.display = 'none';
        this.$('#progressBar').classList.remove('shimmer');
        this.close();
      });

      this.eventSource.onerror = () => {
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        if (this.isProcessing) {
          toast.error(t('connectionLost'));
          // Stop animations on error
          this.$('#scanSpinner').style.display = 'none';
          this.$('#statusDots').style.display = 'none';
          this.$('#progressBar').classList.remove('shimmer');
          this.close();
        }
      };

    } catch (error) {
      console.error('Cleanup error:', error);
      toast.error(error.message || t('startCleanupFailed'));
      this.$('#cleanupConfig').style.display = 'block';
      this.$('#cleanupProgress').style.display = 'none';
    }
  }

  updateProgress(data) {
    const percent = Math.round(data.progress || data.percentage || 0);
    this.$('#progressFill').style.width = `${percent}%`;
    this.$('#progressPercent').textContent = `${percent}%`;
    
    if (data.message) this.$('#progressStatus').textContent = data.message;

    if (data.stats) {
      this.$('#progressStats').innerHTML = `
        <div class="flex gap-4" style="margin-top: var(--space-3);">
          <span><i class="fas fa-folder"></i> ${data.stats.foldersProcessed || 0} folders</span>
          <span><i class="fas fa-file"></i> ${data.stats.filesProcessed || 0} files</span>
          <span><i class="fas fa-code-branch"></i> ${data.stats.versionsFound || 0} versions</span>
        </div>
      `;
    }
  }

  handleBatch(data) {
    if (data.files && Array.isArray(data.files)) {
      this.files.push(...data.files);
    }
  }

  handleComplete(data) {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    this.isProcessing = false;
    
    // Extract files from result.details object
    const details = data.details || {};
    const normalizedFiles = Object.entries(details).map(([path, file]) => {
      const versions = file.totalVersions || 0;
      const toKeep = file.versionsToKeep || this.versionsToKeep;
      const toRemove = file.versionsToRemove || 0;
      
      return {
        id: path,
        name: path.split('/').pop() || 'Unknown',
        path: path,
        versions,
        toKeep,
        toRemove,
        storageSavings: file.storageSavings || '0 B',
        versionDetails: []
      };
    }).filter(file => file.toRemove > 0);

    this.files = normalizedFiles;
    this.showResults();
    
    // Save cleanup history
    const versionsRemoved = data.versionsToRemove || data.versionsRemoved || 0;
    this.saveCleanupHistory(normalizedFiles.length, versionsRemoved);
    
    // Stop animations
    this.$('#scanSpinner').style.display = 'none';
    this.$('#statusDots').style.display = 'none';
    this.$('#progressBar').classList.remove('shimmer');
    if (this.isDryRun) {
      toast.success(`${t('dryRunComplete')} Found ${normalizedFiles.length} ${t('files')} with old versions.`);
      // Show download button for dry run report
      this.$('#downloadCleanupReport').style.display = 'inline-flex';
    } else {
      toast.success(`${t('cleanupComplete')} Removed versions from ${normalizedFiles.length} ${t('files')}.`);
      // Hide download button after real cleanup (optional)
      this.$('#downloadCleanupReport').style.display = 'none';
    }
  }

  showResults() {
    this.$('#cleanupProgress').style.display = 'none';
    this.$('#cleanupResults').style.display = 'block';
    
    // Update summary
    const totalFiles = this.files.length;
    const totalVersions = this.files.reduce((sum, f) => sum + f.versions, 0);
    const versionsToRemove = this.files.reduce((sum, f) => sum + f.toRemove, 0);
    
    this.$('#totalFiles').textContent = totalFiles;
    this.$('#totalVersions').textContent = totalVersions;
    this.$('#versionsToRemove').textContent = versionsToRemove;
    
    // Render file list
    this.renderFileList();
    
    // Show real cleanup button only after dry run
    if (this.isDryRun && this.files.length > 0) {
      this.$('#startRealCleanup').style.display = 'inline-flex';
    } else {
      this.$('#startRealCleanup').style.display = 'none';
    }
  }

  generateReportCSV() {
    const header = ['Path','FileName','TotalVersions','VersionsKept','VersionsToRemove','StorageSavings'];
    const rows = this.files.map(f => [
      '"'+(f.path||'')+'"',
      '"'+(f.name||'')+'"',
      f.versions,
      f.toKeep,
      f.toRemove,
      '"'+(f.storageSavings||'0 B')+'"'
    ].join(','));
    return [header.join(','), ...rows].join('\n');
  }

  downloadReport() {
    if (!this.files || !this.files.length) {
      toast.error(t('noResultsDownload'));
      return;
    }
    const csv = this.generateReportCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g,'-');
    a.href = url;
    a.download = `cleanup-dry-run-${this.site?.displayName || 'site'}-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t('reportDownloaded'));
  }

  renderFileList() {
    const fileListEl = this.$('#fileList');
    
    if (this.files.length === 0) {
      fileListEl.innerHTML = `
        <div class="empty-state" style="padding: var(--space-6) var(--space-4);">
          <i class="fas fa-check-circle" style="font-size: 2rem; color: var(--color-success); margin-bottom: var(--space-2);"></i>
          <p style="color: var(--color-text-secondary);">${t('noOldVersionsFound')}</p>
        </div>
      `;
      return;
    }

    fileListEl.innerHTML = this.files.map(file => `
      <div class="file-item ${this.selectedFile?.id === file.id ? 'selected' : ''}" 
           data-file-id="${escapeHtml(file.id)}">
        <div class="file-icon">
          <i class="fas ${this.getFileIcon(file.name)}"></i>
        </div>
        <div class="file-info">
          <div class="file-name">${escapeHtml(file.name)}</div>
          <div class="file-versions">
            <span class="version-badge">${file.versions}</span> versions, 
            <span class="version-badge remove">${file.toRemove}</span> to remove
          </div>
          ${file.storageSavings ? `
            <div class="file-storage">
              <i class="fas fa-hdd"></i> Savings: ${escapeHtml(file.storageSavings)}
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');

    // Add click listeners
    fileListEl.querySelectorAll('.file-item').forEach(item => {
      item.addEventListener('click', () => {
        const fileId = item.getAttribute('data-file-id');
        const file = this.files.find(f => f.id === fileId);
        if (file) {
          this.showFileDetails(file);
        }
      });
    });
  }

  async showFileDetails(file) {
    this.selectedFile = file;
    
    // Update selected state
    this.$$('#fileList .file-item').forEach(item => {
      item.classList.toggle('selected', item.getAttribute('data-file-id') === file.id);
    });

    const detailsEl = this.$('#fileDetails');
    
    // If we don't have version details, fetch them
    if (!file.versionDetails || file.versionDetails.length === 0) {
      detailsEl.innerHTML = '<div class="spinner" style="margin: var(--space-6);"></div>';
      
      try {
        const data = await api.sharepoint.getVersionsByPath(this.site.id, file.path);
        file.versionDetails = data.versions || [];
      } catch (error) {
        console.error('Error fetching versions:', error);
        detailsEl.innerHTML = `<div class="alert alert-error">Failed to load version details</div>`;
        return;
      }
    }

    // Render version details
    const versionsWithStatus = file.versionDetails.map((version, index) => ({
      ...version,
      keep: index < this.versionsToKeep
    }));

    detailsEl.innerHTML = `
      <div class="file-header">
        <div class="file-icon large">
          <i class="fas ${this.getFileIcon(file.name)}"></i>
        </div>
        <div class="file-meta">
          <h4>${escapeHtml(file.name)}</h4>
          <div class="meta-info">
            <span><i class="fas fa-code-branch"></i> ${file.versions} versions</span>
            <span><i class="fas fa-check"></i> ${file.toKeep} to keep</span>
            <span><i class="fas fa-trash"></i> ${file.toRemove} to remove</span>
          </div>
        </div>
      </div>

      <div class="version-list">
        <table class="versions-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Date</th>
              <th>Author</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${versionsWithStatus.map(version => `
              <tr class="${version.keep ? 'keep' : 'remove'}">
                <td>${escapeHtml(version.label || version.id || '')}</td>
                <td>${version.date ? formatDate(new Date(version.date)) : ''}</td>
                <td>${escapeHtml(version.author || 'Unknown')}</td>
                <td>
                  <span class="badge ${version.keep ? 'badge-success' : 'badge-error'}">
                    ${version.keep ? 'Keep' : 'Remove'}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  saveCleanupHistory(filesAffected, versionsRemoved) {
    if (!this.site) return;
    
    try {
      const historyKey = `cleanup_history_${this.site.id}`;
      const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
      
      const entry = {
        timestamp: new Date().toISOString(),
        type: this.isDryRun ? 'dry-run' : 'real-cleanup',
        filesAffected,
        versionsRemoved,
        versionsToKeep: this.versionsToKeep
      };
      
      history.unshift(entry);
      
      // Keep only last 50 entries
      if (history.length > 50) {
        history.splice(50);
      }
      
      localStorage.setItem(historyKey, JSON.stringify(history));
    } catch (error) {
      console.error('Error saving cleanup history:', error);
    }
  }
}

// Export singleton
export const cleanupModal = new CleanupModal();
