export const SEARCH_DEBOUNCE_MS = 1500;

export function createDebouncer(callback, delay = SEARCH_DEBOUNCE_MS) {
  let timeout;
  const schedule = (...args) => {
    globalThis.clearTimeout(timeout);
    timeout = globalThis.setTimeout(() => callback(...args), delay);
  };
  schedule.cancel = () => globalThis.clearTimeout(timeout);
  return schedule;
}
