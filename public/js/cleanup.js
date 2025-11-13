// Cleanup module: display/process functions and file details
import { api } from './api.js';
import { $, setStatus, setCurrentPath, setProgress, toggleActions } from './ui.js';

export function getFileIcon(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    return 'fa-file';
  }
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'docx':
    case 'doc':
      return 'fa-file-word';
    case 'xlsx':
    case 'xls':
      return 'fa-file-excel';
    case 'pptx':
    case 'ppt':
      return 'fa-file-powerpoint';
    case 'pdf':
      return 'fa-file-pdf';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
      return 'fa-file-image';
    default:
      return 'fa-file';
  }
}

export async function processDryRunResults(app, files) {
  await app.simulateProgress('Versies analyseren...', 20, 70);

  let normalizedFiles = files;
  if (files && !Array.isArray(files) && typeof files === 'object') {
    const versionsToKeep = app.versionsToKeep || (parseInt($('versionsToKeep').value) || 10);
    normalizedFiles = Object.entries(files).map(([key, info]) => {
      const path = info.path || key;
      const name = (path && typeof path === 'string') ? path.split('/').pop() : (info.name || key);
      const totalVersions = info.totalVersions || 0;
      const toRemove = info.versionsToRemove || Math.max(0, totalVersions - versionsToKeep);
      return {
        id: path || key,
        name,
        path,
        versions: totalVersions,
        toKeep: Math.min(totalVersions, versionsToKeep),
        toRemove,
        storageSavings: info.storageSavings || 'Onbekend',
        originalFile: info
      };
    });
  }

  // Check of we cache gebruiken en toon dit
  if (files.cacheInfo) {
    const cacheAge = files.cacheInfo.age;
    const cacheMessage = cacheAge > 0 
      ? `Gebruikte scan data van ${Math.round(cacheAge / 60)} minuten geleden` 
      : 'Nieuwe scan uitgevoerd';
    setStatus(cacheMessage, files.dryRun ? 'info' : 'success');
  }

  if (!normalizedFiles || normalizedFiles.length === 0) {
    console.warn('No files returned - site may be empty');
    setStatus('Geen bestanden gevonden in deze SharePoint site.');
    displayDryRunResults(app, []);
    return;
  }

  const filesToDisplay = normalizedFiles.map(file => {
    const versions = file.versions ? file.versions.length : 0;
    const toKeep = Math.min(versions, app.versionsToKeep);
    const toRemove = versions > app.versionsToKeep ? versions - app.versionsToKeep : 0;
    return {
      id: file.id,
      name: file.name,
      path: file.path,
      versions: (typeof file.versions === 'number') ? file.versions : versions,
      toKeep: (typeof file.toKeep === 'number') ? file.toKeep : toKeep,
      toRemove: (typeof file.toRemove === 'number') ? file.toRemove : toRemove,
      storageSavings: file.storageSavings || 'Onbekend',
      originalFile: file
    };
  }).filter(file => file.toRemove > 0);

  await app.simulateProgress('Resultaten genereren...', 70, 100);
  displayDryRunResults(app, filesToDisplay);
  setStatus('Simulatie voltooid!');
  setProgress(100);
  toggleActions(true);
}

export function displayDryRunResults(app, files) {
  app.currentFiles = files;
  const filesListEl = $('dryRunFilesList');
  filesListEl.innerHTML = files.map(file => {
    const storageSavings = file.storageSavings ? `
                <div class="file-storage-savings">
                    <i class="fas fa-hdd"></i> Besparing: ${file.storageSavings}
                </div>` : '';
    return `
                <div class="file-item" data-file-id="${file.id}" onclick="app.showFileVersionDetails('${file.id}')">
                    <div class="file-icon">
                        <i class="fas ${getFileIcon(file.name)}"></i>
                    </div>
                    <div class="file-info">
                        <div class="file-name">${file.name}</div>
                        <div class="file-versions">
                            <span class="version-count">${file.versions}</span> versies, 
                            <span class="remove-count">${file.toRemove}</span> te verwijderen
                        </div>
                        ${storageSavings}
                    </div>
                </div>
            `;
  }).join('');

  const totalFiles = files.length;
  const totalVersions = files.reduce((sum, file) => sum + file.versions, 0);
  const totalToRemove = files.reduce((sum, file) => sum + file.toRemove, 0);
  const totalFilesEl = $('dryRunTotalFiles');
  const totalVersionsEl = $('dryRunTotalVersions');
  const totalToRemoveEl = $('dryRunVersionsToRemove');
  if (totalFilesEl) totalFilesEl.textContent = totalFiles;
  if (totalVersionsEl) totalVersionsEl.textContent = totalVersions;
  if (totalToRemoveEl) totalToRemoveEl.textContent = totalToRemove;

  toggleActions(true);
  setStatus('Simulatie voltooid! Je kunt nu kiezen om de echte opschoning te starten.');
}

export async function showFileVersionDetails(app, fileId) {
  const file = app.currentFiles ? app.currentFiles.find(f => f.id === fileId) : null;
  if (file && file.actualFile && file.actualFile.versions) {
    displayFileVersions(app, file.actualFile);
    return;
  }

  if (file && file.path && app.sessionId) {
    const detailsContainer = $('dryRunFileDetails');
    detailsContainer.innerHTML = '<p>Versie informatie laden...</p>';
    try {
      const data = await api.versionsByPath(app.currentSite.id, file.path);
      
      // De API retourneert { file: {...}, versions: [...] }
      // Flatten dit voor consistentie
      const flattenedData = {
        id: data.file?.id || file.id,
        name: data.file?.name || file.name,
        path: data.file?.path || file.path,
        driveId: data.file?.driveId,
        modified: data.versions?.[0]?.modified,
        size: data.file?.size,
        versions: data.versions || []
      };
      
      file.actualFile = flattenedData;
      displayFileVersions(app, flattenedData);
    } catch (err) {
      console.error('Error fetching versions by path:', err);
      detailsContainer.innerHTML = `<p>Kon versies niet ophalen: ${err.message}</p>`;
    }
  }
}

export function displayFileVersions(app, fileData) {
  const fileItems = document.querySelectorAll('.file-item');
  fileItems.forEach(item => {
    if (item.getAttribute('data-file-id') === fileData.id) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });

  const versionsWithStatus = fileData.versions.map((version, index) => ({
    ...version,
    keep: index < app.versionsToKeep
  }));

  const toKeep = versionsWithStatus.filter(v => v.keep).length;
  const toRemove = versionsWithStatus.filter(v => !v.keep).length;
  
  // Haal bestandsnaam op uit path als fileData.name undefined is
  let fileName = fileData.name;
  if (!fileName && fileData.path && typeof fileData.path === 'string') {
    fileName = fileData.path.split('/').pop();
  }
  if (!fileName) {
    fileName = 'Onbekend bestand';
  }

  const detailsContainer = $('dryRunFileDetails');
  detailsContainer.innerHTML = `
            <div class="file-header">
                <div class="file-icon large">
                    <i class="fas ${getFileIcon(fileName)}"></i>
                </div>
                <div class="file-meta">
                    <h4>${fileName}</h4>
                    <div class="meta-info">
                        <span>Gewijzigd: ${fileData.modified ? new Date(fileData.modified).toLocaleString('nl-NL') : 'Invalid Date'}</span>
                        <span>Grootte: ${fileData.size || 'Onbekend'}</span>
                        <span>Versies: ${fileData.versions.length}</span>
                    </div>
                </div>
            </div>
            <div class="version-summary">
                <div class="version-summary-item"><span class="version-count">${fileData.versions.length}</span> totaal</div>
                <div class="version-summary-item"><span class="version-count keep">${toKeep}</span> behouden</div>
                <div class="version-summary-item"><span class="version-count remove">${toRemove}</span> te verwijderen</div>
            </div>
            <div class="version-list">
                <table class="versions-table">
                    <thead>
                        <tr>
                            <th>Versie</th>
                            <th>Datum</th>
                            <th>Auteur</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${versionsWithStatus.map(version => `
                            <tr class="${version.keep ? 'keep' : 'remove'}">
                                <td>${version.label || version.id}</td>
                                <td>${version.date || ''}</td>
                                <td>${version.author || ''}</td>
                                <td>
                                    <span class="version-status ${version.keep ? 'keep' : 'remove'}">
                                        ${version.keep ? 'Behouden' : 'Te verwijderen'}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
}
