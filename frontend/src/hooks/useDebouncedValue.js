import { useEffect, useState } from 'react';
import { createDebouncer, SEARCH_DEBOUNCE_MS } from '../utils/debounce.js';

export function useDebouncedValue(value, delay = SEARCH_DEBOUNCE_MS) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const schedule = createDebouncer(setDebounced, delay);
    schedule(value);
    return schedule.cancel;
  }, [value, delay]);
  return debounced;
}
