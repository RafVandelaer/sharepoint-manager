// SSE connection helper
export function connectSSE(url, { onOpen, onProgress, onComplete, onError }) {
  const es = new EventSource(url);
  es.onopen = (evt) => onOpen && onOpen(evt);
  es.onerror = (evt) => onError && onError(evt);
  es.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      if (data.type === 'progress') onProgress && onProgress(data);
      else if (data.type === 'complete') onComplete && onComplete(data);
      else if (data.type === 'error') onError && onError(data);
    } catch (e) {
      onError && onError(e);
    }
  };
  return es;
}
