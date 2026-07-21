/**
 * Request URL construction + per-tenant base URL routing.
 *
 * Two defects are pinned here:
 *
 * 1. `apiRequest` built URLs with `new URL(path, base)`, which is RFC 3986
 *    relative resolution rather than concatenation: a path-absolute reference
 *    like "/api/v1/stats" replaces the base's entire path. SpamTitan is
 *    self-hosted and SPAMTITAN_BASE_URL is documented as "your SpamTitan
 *    instance URL", so any instance sitting under a path prefix silently lost
 *    it. Invisible against the bare-origin TitanHQ default.
 *
 * 2. The base URL was read once into a module-level const, while the API key
 *    was resolved per-request. In gateway mode that meant every tenant's key
 *    was sent to whichever single host the container booted with. The base URL
 *    now travels with the key in the request-scoped credential store.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRequest, getCredentials, runWithCredentials, DEFAULT_BASE_URL } from '../utils/client.js';

/** Stub global fetch and hand back the URL the next request is sent to. */
function captureFetchedUrl(): () => string {
  let seen = '';
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      seen = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{}'),
      } as Response);
    })
  );
  return () => seen;
}

describe('apiRequest — base URL path preservation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SPAMTITAN_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = originalEnv;
  });

  it.each([
    [
      'bare origin (TitanHQ default shape)',
      'https://api-spamtitan.titanhq.com',
      'https://api-spamtitan.titanhq.com/api/v1/stats',
    ],
    [
      'self-hosted instance under a path prefix, trailing slash',
      'https://mail.example.com/spamtitan/',
      'https://mail.example.com/spamtitan/api/v1/stats',
    ],
    [
      'self-hosted instance under a path prefix, no trailing slash',
      'https://mail.example.com/spamtitan',
      'https://mail.example.com/spamtitan/api/v1/stats',
    ],
    [
      'redundant slashes on both sides collapse to one',
      'https://mail.example.com/spamtitan//',
      'https://mail.example.com/spamtitan/api/v1/stats',
    ],
    [
      'deep path prefix',
      'https://gw.example.com/vendors/spamtitan/v2/',
      'https://gw.example.com/vendors/spamtitan/v2/api/v1/stats',
    ],
  ])('preserves the base path for a %s', async (_name, baseUrl, expected) => {
    const fetchedUrl = captureFetchedUrl();
    await runWithCredentials({ apiKey: 'test-key', baseUrl }, () =>
      apiRequest('/api/v1/stats')
    );
    expect(fetchedUrl()).toBe(expected);
  });

  it('appends query params after the joined path', async () => {
    const fetchedUrl = captureFetchedUrl();
    await runWithCredentials(
      { apiKey: 'test-key', baseUrl: 'https://mail.example.com/spamtitan/' },
      () =>
        apiRequest('/api/v1/quarantine/queue', {
          params: { limit: 50, skipped: undefined },
        })
    );
    expect(fetchedUrl()).toBe(
      'https://mail.example.com/spamtitan/api/v1/quarantine/queue?limit=50'
    );
  });

  it('falls back to SPAMTITAN_BASE_URL in env mode', async () => {
    process.env.SPAMTITAN_BASE_URL = 'https://mail.example.com/spamtitan/';
    const fetchedUrl = captureFetchedUrl();
    await apiRequest('/api/v1/stats');
    expect(fetchedUrl()).toBe('https://mail.example.com/spamtitan/api/v1/stats');
  });

  it('falls back to the TitanHQ default when nothing is configured', async () => {
    delete process.env.SPAMTITAN_BASE_URL;
    const fetchedUrl = captureFetchedUrl();
    await apiRequest('/api/v1/stats');
    expect(fetchedUrl()).toBe(`${DEFAULT_BASE_URL}/api/v1/stats`);
  });
});

describe('per-tenant base URL isolation (gateway mode)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = originalEnv;
  });

  it('routes each tenant to its own instance rather than a process-wide host', async () => {
    // The container booted pointing at tenant A's host.
    process.env.SPAMTITAN_BASE_URL = 'https://tenant-a.example.com/spamtitan/';
    const fetchedUrl = captureFetchedUrl();

    await runWithCredentials(
      { apiKey: 'tenant-b-key', baseUrl: 'https://tenant-b.example.com/spamtitan/' },
      () => apiRequest('/api/v1/stats')
    );

    // Tenant B's key must NOT be sent to tenant A's host.
    expect(fetchedUrl()).toBe('https://tenant-b.example.com/spamtitan/api/v1/stats');
    expect(fetchedUrl()).not.toContain('tenant-a.example.com');
  });

  it('keeps concurrent tenants on separate hosts', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        seen.push(url);
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{}'),
        } as Response);
      })
    );

    await Promise.all([
      runWithCredentials(
        { apiKey: 'a', baseUrl: 'https://tenant-a.example.com/st/' },
        () => apiRequest('/api/v1/stats')
      ),
      runWithCredentials(
        { apiKey: 'b', baseUrl: 'https://tenant-b.example.com/st/' },
        () => apiRequest('/api/v1/stats')
      ),
    ]);

    expect(seen.sort()).toEqual([
      'https://tenant-a.example.com/st/api/v1/stats',
      'https://tenant-b.example.com/st/api/v1/stats',
    ]);
  });

  it('exposes the scoped base URL via getCredentials', () => {
    runWithCredentials(
      { apiKey: 'k', baseUrl: 'https://scoped.example.com/st/' },
      () => {
        expect(getCredentials()?.baseUrl).toBe('https://scoped.example.com/st/');
      }
    );
  });
});
