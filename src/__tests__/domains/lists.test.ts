/**
 * Tests for the lists domain handler (allowlist + blocklist)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../utils/client.js", () => ({
  apiRequest: vi.fn(),
  getCredentials: vi.fn().mockReturnValue({ apiKey: "test-key", baseUrl: "https://api-spamtitan.titanhq.com" }),
  clearCredentials: vi.fn(),
}));

import { listsHandler } from "../../domains/lists.js";
import { apiRequest } from "../../utils/client.js";

const mockApiRequest = vi.mocked(apiRequest);

describe("Lists Domain Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getTools", () => {
    it("should return allowlist and blocklist tools", () => {
      const tools = listsHandler.getTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("spamtitan_manage_allowlist");
      expect(toolNames).toContain("spamtitan_manage_blocklist");
    });

    it("both tools should require action", () => {
      const tools = listsHandler.getTools();
      for (const tool of tools) {
        expect(tool.inputSchema.required).toContain("action");
      }
    });
  });

  describe("handleCall - spamtitan_manage_allowlist", () => {
    it("should list allowlist entries", async () => {
      const fakeEntries = [{ sender: "trusted@partner.com" }, { sender: "@safe.com" }];
      mockApiRequest.mockResolvedValueOnce(fakeEntries);

      const result = await listsHandler.handleCall("spamtitan_manage_allowlist", {
        action: "list",
      });

      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/allowlist");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.allowlist).toEqual(fakeEntries);
    });

    it("should add a sender to the allowlist", async () => {
      mockApiRequest.mockResolvedValueOnce({ created: true });

      const result = await listsHandler.handleCall("spamtitan_manage_allowlist", {
        action: "add",
        sender: "friend@example.com",
        note: "Trusted partner",
      });

      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/allowlist", {
        method: "POST",
        body: { sender: "friend@example.com", note: "Trusted partner" },
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it("should remove a sender from the allowlist", async () => {
      mockApiRequest.mockResolvedValueOnce({ deleted: true });

      const result = await listsHandler.handleCall("spamtitan_manage_allowlist", {
        action: "remove",
        sender: "friend@example.com",
      });

      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/v1/allowlist/friend%40example.com",
        { method: "DELETE" }
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it("should return error when add action is missing sender", async () => {
      const result = await listsHandler.handleCall("spamtitan_manage_allowlist", {
        action: "add",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'sender' is required");
    });

    it("should return error when remove action is missing sender", async () => {
      const result = await listsHandler.handleCall("spamtitan_manage_allowlist", {
        action: "remove",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'sender' is required");
    });

    it("should return error for unknown action", async () => {
      const result = await listsHandler.handleCall("spamtitan_manage_allowlist", {
        action: "sync",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown action");
    });
  });

  describe("handleCall - spamtitan_manage_blocklist", () => {
    it("should list blocklist entries", async () => {
      const fakeEntries = [{ sender: "spammer@evil.com" }];
      mockApiRequest.mockResolvedValueOnce(fakeEntries);

      const result = await listsHandler.handleCall("spamtitan_manage_blocklist", {
        action: "list",
      });

      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/blocklist");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.blocklist).toEqual(fakeEntries);
    });

    it("should add a sender to the blocklist", async () => {
      mockApiRequest.mockResolvedValueOnce({ created: true });

      const result = await listsHandler.handleCall("spamtitan_manage_blocklist", {
        action: "add",
        sender: "@badactor.com",
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });
  });

  describe("handleCall - unknown tool", () => {
    it("should return error for unknown tool name", async () => {
      const result = await listsHandler.handleCall("spamtitan_unknown_list", {
        action: "list",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown lists tool");
    });
  });
});
