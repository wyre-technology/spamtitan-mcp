/**
 * SpamTitan HTTP client and credential management.
 *
 * In gateway mode (AUTH_MODE=gateway), credentials are injected per-request
 * via AsyncLocalStorage by the HTTP transport layer from request headers.
 *
 * In env mode (AUTH_MODE=env or unset), credentials come from
 * SPAMTITAN_API_KEY environment variable directly (stdio / single-tenant).
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from './logger.js';

export interface Credentials {
  apiKey: string;
  /**
   * The tenant's SpamTitan instance. SpamTitan is self-hosted, so this is
   * per-tenant and MUST travel with the API key rather than being read once
   * from the process environment — otherwise every tenant's key is sent to
   * whichever single host the container happened to boot with.
   */
  baseUrl: string;
}

export const DEFAULT_BASE_URL = 'https://api-spamtitan.titanhq.com';

// Request-scoped credential store. In gateway mode the HTTP layer runs each
// request inside runWithCredentials({apiKey, baseUrl}); getCredentials() reads
// it here. Falls back to process.env for stdio/single-tenant mode.
const credStore = new AsyncLocalStorage<Credentials>();

export function runWithCredentials<T>(creds: Credentials, fn: () => T): T {
  return credStore.run(creds, fn);
}

/**
 * Get credentials from the request-scoped store, or fall back to env vars.
 * Read fresh on every call so gateway per-request injection is reflected.
 */
export function getCredentials(): Credentials | null {
  const scoped = credStore.getStore();
  if (scoped?.apiKey) return scoped;

  const apiKey = process.env.SPAMTITAN_API_KEY;
  if (!apiKey) {
    logger.warn('Missing credentials', { hasApiKey: false });
    return null;
  }

  return {
    apiKey,
    baseUrl: process.env.SPAMTITAN_BASE_URL || DEFAULT_BASE_URL,
  };
}

/**
 * Make an authenticated HTTP request to the SpamTitan API.
 * Reads credentials fresh from the request-scoped store (or env) on each call.
 */
export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
  } = {}
): Promise<T> {
  const creds = getCredentials();
  if (!creds) {
    throw new Error(
      'No SpamTitan API credentials configured. Please set SPAMTITAN_API_KEY environment variable.'
    );
  }

  // Join base + path manually rather than relying on `new URL(path, base)`.
  // That constructor follows WHATWG relative-URL resolution: because every
  // call site passes a path-absolute reference ("/api/v1/..."), the base's own
  // path would be discarded rather than preserved. Self-hosted SpamTitan
  // instances routinely sit under a path prefix, so normalize and concatenate.
  const normalizedBase = creds.baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');
  const url = new URL(`${normalizedBase}/${normalizedPath}`);

  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'X-SpamTitan-API-Key': creds.apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const fetchOptions: RequestInit = { method, headers };

  if (options.body !== undefined && method !== 'GET') {
    fetchOptions.body = JSON.stringify(options.body);
  }

  logger.debug('SpamTitan API request', { method, url: url.toString() });

  const response = await fetch(url.toString(), fetchOptions);

  // Safe: read text once, then try JSON parse
  const rawText = await response.text();
  let responseBody: unknown;
  try {
    responseBody = JSON.parse(rawText);
  } catch {
    responseBody = rawText;
  }

  if (!response.ok) {
    const message =
      typeof responseBody === 'object' &&
      responseBody !== null &&
      'message' in responseBody
        ? String((responseBody as Record<string, unknown>).message)
        : `HTTP ${response.status}: ${response.statusText}`;

    logger.error('SpamTitan API error', {
      status: response.status,
      url: url.toString(),
      message,
    });

    if (response.status === 401) {
      throw new Error(`Authentication failed: ${message}. Check your SPAMTITAN_API_KEY.`);
    }
    if (response.status === 403) {
      throw new Error(`Forbidden: ${message}. Insufficient permissions.`);
    }
    if (response.status === 404) {
      throw new Error(`Not found: ${message}`);
    }
    if (response.status === 429) {
      throw new Error(`Rate limit exceeded: ${message}. Please retry after a moment.`);
    }
    throw new Error(`SpamTitan API error (${response.status}): ${message}`);
  }

  return responseBody as T;
}
