// UI helpers: DOM queries, status updates, rendering
export const $ = (id) => document.getElementById(id);

export function show(sectionId) { $(sectionId).style.display = 'block'; }
export function hide(sectionId) { $(sectionId).style.display = 'none'; }

export function setStatus(text, type = 'normal') {
    const statusEl = $('statusMessage');
    statusEl.textContent = text;
    
    // Reset classes
    statusEl.classList.remove('status-info', 'status-success', 'status-warning', 'status-error');
    
    // Add appropriate class based on type
    if (type !== 'normal') {
        statusEl.classList.add(`status-${type}`);
    }
}
export function setCurrentPath(text) { $('currentFolderPath').textContent = text; }

export function resetProgress() {
  const bar = $('progressIndicator');
  const txt = $('progressText');
  bar.style.width = '0%';
  txt.textContent = '0%';
  bar.classList.add('progress-animated');
}

export function setProgress(pct) {
  const bar = $('progressIndicator');
  const txt = $('progressText');
  if (typeof pct === 'number' && !Number.isNaN(pct)) {
    bar.style.width = `${pct}%`;
    txt.textContent = `${Math.round(pct)}%`;
    bar.classList.remove('progress-animated');
  } else {
    bar.style.width = '100%';
    txt.textContent = 'Bezig...';
    bar.classList.add('progress-animated');
  }
}

export function toggleActions(visible) {
  const dryRunActions = $('dryRunActions');
  const startDryRunBtn = $('startDryRunBtn');
  const startRealCleanupBtn = $('startRealCleanupBtn');
  const stopCleanupBtn = $('stopCleanupBtn');

  if (dryRunActions) dryRunActions.style.display = visible ? 'flex' : 'none';
  if (startDryRunBtn) startDryRunBtn.disabled = !visible;
  if (startRealCleanupBtn) startRealCleanupBtn.disabled = !visible;
  if (stopCleanupBtn) stopCleanupBtn.style.display = visible ? 'none' : 'inline-block';
}

export function toggleSiteActions(show) {
  const actionOptions = document.querySelector('.action-options');
  if (actionOptions) {
    actionOptions.style.display = show ? 'flex' : 'none';
    
    // Enable/disable actie knoppen
    const startDryRunBtn = $('startDryRunBtn');
    const startRealCleanupBtn = $('startRealCleanupBtn');
    if (startDryRunBtn) startDryRunBtn.disabled = !show;
    if (startRealCleanupBtn) startRealCleanupBtn.disabled = !show;
  }
}
