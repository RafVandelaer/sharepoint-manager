// Central app state and simple helpers
export const state = {
  sessionId: null,
  sites: [],
  currentSite: null,
  cleanupStopped: false,
  eventSource: null,
  abortController: null,
  versionsToKeep: 3,
  currentFiles: [],
  dryRunDetails: null,
};

export function resetTransient() {
  state.cleanupStopped = false;
  if (state.eventSource) {
    try { state.eventSource.close(); } catch {}
  }
  state.eventSource = null;
  if (state.abortController) {
    try { state.abortController.abort(); } catch {}
  }
  state.abortController = new AbortController();
}
