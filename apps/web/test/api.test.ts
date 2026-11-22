import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, onUnauthorized, setCsrfToken } from '../src/lib/api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('apiRequest', () => {
  beforeEach(() => setCsrfToken(null));

  it('parses a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })));
    await expect(apiRequest<{ ok: boolean }>('/api/health')).resolves.toEqual({ ok: true });
  });

  it('sends the CSRF token only on mutations', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    setCsrfToken('csrf-value');

    await apiRequest('/api/settings', { method: 'PUT', body: { a: 1 } });
    await apiRequest('/api/settings');

    const [, putInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [, getInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect((putInit.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-value');
    expect((getInit.headers as Record<string, string>)['x-csrf-token']).toBeUndefined();
    expect(putInit.credentials).toBe('same-origin');
  });

  it('surfaces the backend error code and message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: { code: 'bad_request', message: 'Some fields are invalid' } }, 400),
      ),
    );
    await expect(apiRequest('/api/settings/budget', { method: 'PUT', body: {} })).rejects.toMatchObject({
      status: 400,
      code: 'bad_request',
      message: 'Some fields are invalid',
    });
  });

  it('notifies listeners when the session expires', async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { code: 'unauthorized', message: 'Authentication required' } }, 401)),
    );
    await expect(apiRequest('/api/dashboard/summary')).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await apiRequest('/api/dashboard/summary').catch(() => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reports a network failure without leaking internals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    await expect(apiRequest('/api/health')).rejects.toMatchObject({
      status: 0,
      code: 'network_error',
    });
  });

  it('tolerates a non-JSON error body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>bad gateway</html>', { status: 502 })));
    await expect(apiRequest('/api/health')).rejects.toMatchObject({ status: 502 });
  });
});
