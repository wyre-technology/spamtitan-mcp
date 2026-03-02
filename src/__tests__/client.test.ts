/**
 * Tests for SpamTitan credential management
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCredentials, clearCredentials } from "../utils/client.js";

describe("SpamTitan Client Utilities", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearCredentials();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearCredentials();
  });

  describe("getCredentials", () => {
    it("should return null when SPAMTITAN_API_KEY is not set", () => {
      delete process.env.SPAMTITAN_API_KEY;
      const creds = getCredentials();
      expect(creds).toBeNull();
    });

    it("should return credentials when SPAMTITAN_API_KEY is set", () => {
      process.env.SPAMTITAN_API_KEY = "test-api-key-123";
      const creds = getCredentials();
      expect(creds).not.toBeNull();
      expect(creds?.apiKey).toBe("test-api-key-123");
    });

    it("should use the default base URL when SPAMTITAN_BASE_URL is not set", () => {
      process.env.SPAMTITAN_API_KEY = "test-key";
      delete process.env.SPAMTITAN_BASE_URL;
      const creds = getCredentials();
      expect(creds?.baseUrl).toBe("https://api-spamtitan.titanhq.com");
    });

    it("should use a custom base URL when SPAMTITAN_BASE_URL is set", () => {
      process.env.SPAMTITAN_API_KEY = "test-key";
      process.env.SPAMTITAN_BASE_URL = "https://custom.spamtitan.example.com";
      const creds = getCredentials();
      expect(creds?.baseUrl).toBe("https://custom.spamtitan.example.com");
    });

    it("should reflect updated env vars on each call", () => {
      process.env.SPAMTITAN_API_KEY = "key-1";
      const creds1 = getCredentials();
      expect(creds1?.apiKey).toBe("key-1");

      process.env.SPAMTITAN_API_KEY = "key-2";
      const creds2 = getCredentials();
      expect(creds2?.apiKey).toBe("key-2");
    });
  });
});
