import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AUTH_REQUIRED_EVENT,
  authHeaders,
  clearAccessKey,
  getAccessKey,
  notifyAuthRequired,
  setAccessKey,
} from '../auth';

describe('auth service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sends no Authorization header when no key is stored', () => {
    expect(authHeaders()).toEqual({});
  });

  it('sends a bearer header once a key is stored', () => {
    setAccessKey('secret');
    expect(authHeaders()).toEqual({ Authorization: 'Bearer secret' });
  });

  it('clears the stored key', () => {
    setAccessKey('secret');
    clearAccessKey();
    expect(getAccessKey()).toBeNull();
  });

  it('notifyAuthRequired drops the key and fires the lock event', () => {
    setAccessKey('secret');
    const listener = vi.fn();
    window.addEventListener(AUTH_REQUIRED_EVENT, listener);

    notifyAuthRequired();

    expect(getAccessKey()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_REQUIRED_EVENT, listener);
  });

  it('degrades to no key when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getAccessKey()).toBeNull();
    expect(authHeaders()).toEqual({});
    spy.mockRestore();
  });
});
