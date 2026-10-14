import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureApiAuth, getAccounts, previewCsvImport, importCsv, backfillCsvReferences } from '../api';

const fetchMock = vi.fn();
const onAuthFailure = vi.fn();

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const headersOf = (call: unknown[]) => new Headers((call[1] as RequestInit).headers);

beforeEach(() => {
  fetchMock.mockReset();
  onAuthFailure.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  configureApiAuth({ getAccessToken: async () => 'token-1', onAuthFailure });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API requests', () => {
  it('send the signed-in user\'s token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await getAccounts();

    expect(headersOf(fetchMock.mock.calls[0]).get('Authorization')).toBe('Bearer token-1');
    expect(headersOf(fetchMock.mock.calls[0]).get('Content-Type')).toBe('application/json');
  });

  it('send no Authorization header when signed out', async () => {
    configureApiAuth({ getAccessToken: async () => null, onAuthFailure });
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await getAccounts();

    expect(headersOf(fetchMock.mock.calls[0]).has('Authorization')).toBe(false);
  });

  it('report a 401 to the auth layer and still fail the request', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Not signed in' }));

    await expect(getAccounts()).rejects.toThrow('Not signed in');
    expect(onAuthFailure).toHaveBeenCalledWith(401, 'Not signed in');
  });

  it('report a 403 with the server\'s message, so the login page can say why', async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { message: "This Google account hasn't been invited." }));

    await expect(getAccounts()).rejects.toThrow("hasn't been invited");
    expect(onAuthFailure).toHaveBeenCalledWith(403, "This Google account hasn't been invited.");
  });

  it('do not involve the auth layer for other failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { message: 'Internal server error' }));

    await expect(getAccounts()).rejects.toThrow('Internal server error');
    expect(onAuthFailure).not.toHaveBeenCalled();
  });
});

describe('file uploads', () => {
  const file = new File(['date,amount'], 'statement.csv', { type: 'text/csv' });

  it.each([
    ['preview', () => previewCsvImport('acct-1', file), '/csv-import/acct-1/preview'],
    ['import', () => importCsv('acct-1', file), '/csv-import/acct-1/import'],
    ['backfill', () => backfillCsvReferences('acct-1', file), '/csv-import/acct-1/backfill-references'],
  ])('%s sends the token, and lets the browser set the multipart Content-Type', async (_name, upload, path) => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await upload();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(path);
    expect(init.body).toBeInstanceOf(FormData);
    expect(headersOf(fetchMock.mock.calls[0]).get('Authorization')).toBe('Bearer token-1');
    expect(headersOf(fetchMock.mock.calls[0]).has('Content-Type')).toBe(false);
  });

  it('report a 401 from an upload to the auth layer', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Not signed in' }));

    await expect(importCsv('acct-1', file)).rejects.toThrow('Not signed in');
    expect(onAuthFailure).toHaveBeenCalledWith(401, 'Not signed in');
  });

  it('keep the upload-specific message when the server gives none', async () => {
    fetchMock.mockResolvedValue(new Response('oops', { status: 500 }));

    await expect(previewCsvImport('acct-1', file)).rejects.toThrow('Preview failed');
  });
});
