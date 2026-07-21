/**
 * Tests for SpamTitan credential management.
 *
 * Covers:
 * - env-var fallback (stdio/single-tenant mode)
 * - AsyncLocalStorage scoping (gateway/multi-tenant mode)
 * - Concurrent request isolation (the cross-tenant leak scenario)
 * - Statelessness assertion: per-request distinct Server instances
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCredentials, runWithCredentials, DEFAULT_BASE_URL } from '../utils/client.js';
import { createMcpServer } from '../server.js';

describe('getCredentials — env fallback (stdio / single-tenant)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns null when SPAMTITAN_API_KEY is not set', () => {
    delete process.env.SPAMTITAN_API_KEY;
    expect(getCredentials()).toBeNull();
  });

  it('returns credentials when SPAMTITAN_API_KEY is set', () => {
    process.env.SPAMTITAN_API_KEY = 'test-api-key-123';
    const creds = getCredentials();
    expect(creds).not.toBeNull();
    expect(creds?.apiKey).toBe('test-api-key-123');
  });

  it('reflects updated env vars on each call', () => {
    process.env.SPAMTITAN_API_KEY = 'key-1';
    expect(getCredentials()?.apiKey).toBe('key-1');

    process.env.SPAMTITAN_API_KEY = 'key-2';
    expect(getCredentials()?.apiKey).toBe('key-2');
  });
});

describe('runWithCredentials — request-scoped AsyncLocalStorage', () => {
  it('exposes scoped credentials inside the callback', () => {
    runWithCredentials({ apiKey: 'scoped-key', baseUrl: DEFAULT_BASE_URL }, () => {
      const creds = getCredentials();
      expect(creds?.apiKey).toBe('scoped-key');
    });
  });

  it('does not leak scoped credentials outside the callback', () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv };
    delete process.env.SPAMTITAN_API_KEY;

    runWithCredentials({ apiKey: 'inside-key', baseUrl: DEFAULT_BASE_URL }, () => {
      // inside: scoped
      expect(getCredentials()?.apiKey).toBe('inside-key');
    });

    // outside: no env key set, no scope active → null
    expect(getCredentials()).toBeNull();
    process.env = originalEnv;
  });

  it('scoped key takes priority over env var', () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, SPAMTITAN_API_KEY: 'env-key' };

    runWithCredentials({ apiKey: 'header-key', baseUrl: DEFAULT_BASE_URL }, () => {
      expect(getCredentials()?.apiKey).toBe('header-key');
    });

    process.env = originalEnv;
  });

  it('isolates concurrent requests (cross-tenant leak scenario)', async () => {
    const results: string[] = [];

    // Simulate two concurrent "requests" whose async contexts must not bleed.
    const req1 = runWithCredentials({ apiKey: 'tenant-A', baseUrl: 'https://tenant-a.example.com/st/' }, () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          results.push(`req1: ${getCredentials()?.apiKey}`);
          resolve();
        }, 10);
      })
    );

    const req2 = runWithCredentials({ apiKey: 'tenant-B', baseUrl: 'https://tenant-b.example.com/st/' }, () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          results.push(`req2: ${getCredentials()?.apiKey}`);
          resolve();
        }, 5);
      })
    );

    await Promise.all([req1, req2]);

    expect(results).toContain('req1: tenant-A');
    expect(results).toContain('req2: tenant-B');
    // Ensure no cross-contamination
    expect(results).not.toContain('req1: tenant-B');
    expect(results).not.toContain('req2: tenant-A');
  });
});

describe('createMcpServer — statelessness assertion', () => {
  it('returns a distinct Server instance on each call', () => {
    const server1 = createMcpServer();
    const server2 = createMcpServer();
    expect(server1).not.toBe(server2);
  });

  it('each server has its own handler registration (no shared state)', async () => {
    const server1 = createMcpServer();
    const server2 = createMcpServer();
    // Both servers are independently constructed — closing one does not affect the other.
    await server1.close();
    // server2 should still be a valid object (not erroring on close)
    await expect(server2.close()).resolves.not.toThrow();
  });
});
