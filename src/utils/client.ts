/**
 * SpamTitan HTTP client and credential management.
 *
 * In gateway mode (AUTH_MODE=gateway), credentials are injected
 * into process.env by the HTTP transport layer from request headers.
 *
 * In env mode (AUTH_MODE=env or unset), credentials come from
 * SPAMTITAN_API_KEY environment variable directly.
 */

import { logger } from "./logger.js";
import type { SpamTitanCredentials } from "./types.js";

const SPAMTITAN_BASE_URL = "https://api-spamtitan.titanhq.com";

let _credentials: SpamTitanCredentials | null = null;

/**
 * Get credentials from environment variables
 */
export function getCredentials(): SpamTitanCredentials | null {
  const apiKey = process.env.SPAMTITAN_API_KEY;

  if (!apiKey) {
    logger.warn("Missing credentials", { hasApiKey: false });
    return null;
  }

  return {
    apiKey,
    baseUrl: process.env.SPAMTITAN_BASE_URL || SPAMTITAN_BASE_URL,
  };
}

/**
 * Make an authenticated HTTP request to the SpamTitan API.
 * Reads credentials fresh from env on each call so gateway mode
 * header injection is always reflected.
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
      "No SpamTitan API credentials configured. Please set SPAMTITAN_API_KEY environment variable."
    );
  }

  const url = new URL(path, creds.baseUrl);

  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const method = options.method || "GET";
  const headers: Record<string, string> = {
    "X-SpamTitan-API-Key": creds.apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (options.body !== undefined && method !== "GET") {
    fetchOptions.body = JSON.stringify(options.body);
  }

  logger.debug("SpamTitan API request", { method, url: url.toString() });

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
      typeof responseBody === "object" &&
      responseBody !== null &&
      "message" in responseBody
        ? String((responseBody as Record<string, unknown>).message)
        : `HTTP ${response.status}: ${response.statusText}`;

    logger.error("SpamTitan API error", {
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

/**
 * Clear cached credentials (useful for testing)
 */
export function clearCredentials(): void {
  _credentials = null;
}
