const activeRequests = new Set();
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

export function beginRequestActivity() {
  const id = Symbol('request');
  activeRequests.add(id);
  if (activeRequests.size === 1) notify();
  return id;
}

export function endRequestActivity(id) {
  if (!id || !activeRequests.delete(id)) return;
  if (activeRequests.size === 0) notify();
}

export function subscribeToRequestActivity(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRequestActivitySnapshot() {
  return activeRequests.size > 0;
}
