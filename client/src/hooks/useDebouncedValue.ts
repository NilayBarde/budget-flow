import { useState, useEffect } from 'react';

// Returns a value that only updates after it has stopped changing for
// `delayMs`. Used to debounce query keys (e.g. search input) so the input
// itself stays instantly responsive while requests coalesce.
export const useDebouncedValue = <T>(value: T, delayMs = 300): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
};
