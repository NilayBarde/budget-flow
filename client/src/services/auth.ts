const STORAGE_KEY = 'budgetflow_access_key';

// Fired when the API rejects the stored key so the UI can lock itself.
export const AUTH_REQUIRED_EVENT = 'budgetflow:auth-required';

export const getAccessKey = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setAccessKey = (key: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Storage unavailable (private mode); the key will not persist.
  }
};

export const clearAccessKey = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

export const authHeaders = (): Record<string, string> => {
  const key = getAccessKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
};

export const notifyAuthRequired = () => {
  clearAccessKey();
  window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
};
