/**
 * Tests for the quarantine domain handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the client module
vi.mock("../../utils/client.js", () => ({
  apiRequest: vi.fn(),
  getCredentials: vi.fn().mockReturnValue({ apiKey: "test-key", baseUrl: "https://api-spamtitan.titanhq.com" }),
  clearCredentials: vi.fn(),
}));

import { quarantineHandler } from "../../domains/quarantine.js";
import { apiRequest } from "../../utils/client.js";

const mockApiRequest = vi.mocked(apiRequest);

describe("Quarantine Domain Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getTools", () => {
    it("should return quarantine tools", () => {
      const tools = quarantineHandler.getTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("spamtitan_get_queue");
      expect(toolNames).toContain("spamtitan_release_message");
      expect(toolNames).toContain("spamtitan_delete_message");
    });

    it("should have proper input schemas", () => {
      const tools = quarantineHandler.getTools();
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      }
    });

    it("release_message should require message_id", () => {
      const tools = quarantineHandler.getTools();
      const releaseTool = tools.find((t) => t.name === "spamtitan_release_message");
      expect(releaseTool?.inputSchema.required).toContain("message_id");
    });

    it("delete_message should require message_id", () => {
      const tools = quarantineHandler.getTools();
      const deleteTool = tools.find((t) => t.name === "spamtitan_delete_message");
      expect(deleteTool?.inputSchema.required).toContain("message_id");
    });
  });

  describe("handleCall - spamtitan_get_queue", () => {
    it("should list quarantine queue with defaults", async () => {
      const fakeMessages = [
        { id: "msg-1", sender: "spam@evil.com", recipient: "user@org.com", subject: "Win money!" },
        { id: "msg-2", sender: "phish@bad.com", recipient: "admin@org.com", subject: "Urgent!" },
      ];
      mockApiRequest.mockResolvedValueOnce(fakeMessages);

      const result = await quarantineHandler.handleCall("spamtitan_get_queue", {});

      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/v1/quarantine/queue",
        expect.objectContaining({ params: expect.objectContaining({ page: 1, per_page: 50 }) })
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.messages).toEqual(fakeMessages);
    });

    it("should pass filter params to the API", async () => {
      mockApiRequest.mockResolvedValueOnce([]);

      await quarantineHandler.handleCall("spamtitan_get_queue", {
        sender: "spam@evil.com",
        recipient: "user@org.com",
        page: 2,
        per_page: 25,
      });

      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/v1/quarantine/queue",
        expect.objectContaining({
          params: expect.objectContaining({
            page: 2,
            per_page: 25,
            sender: "spam@evil.com",
            recipient: "user@org.com",
          }),
        })
      );
    });

    it("should handle wrapped response objects", async () => {
      mockApiRequest.mockResolvedValueOnce({
        messages: [{ id: "msg-1" }],
        total: 1,
      });

      const result = await quarantineHandler.handleCall("spamtitan_get_queue", {});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.messages).toEqual([{ id: "msg-1" }]);
    });
  });

  describe("handleCall - spamtitan_release_message", () => {
    it("should release a message by ID", async () => {
      mockApiRequest.mockResolvedValueOnce({ status: "released" });

      const result = await quarantineHandler.handleCall("spamtitan_release_message", {
        message_id: "abc-123",
      });

      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/v1/quarantine/messages/abc-123/release",
        expect.objectContaining({ method: "POST" })
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it("should return error when message_id is missing", async () => {
      const result = await quarantineHandler.handleCall("spamtitan_release_message", {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("message_id is required");
    });
  });

  describe("handleCall - spamtitan_delete_message", () => {
    it("should delete a message by ID", async () => {
      mockApiRequest.mockResolvedValueOnce({ status: "deleted" });

      const result = await quarantineHandler.handleCall("spamtitan_delete_message", {
        message_id: "abc-456",
      });

      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/v1/quarantine/messages/abc-456",
        expect.objectContaining({ method: "DELETE" })
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it("should return error when message_id is missing", async () => {
      const result = await quarantineHandler.handleCall("spamtitan_delete_message", {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("message_id is required");
    });
  });

  describe("handleCall - unknown tool", () => {
    it("should return error for unknown tool name", async () => {
      const result = await quarantineHandler.handleCall("spamtitan_unknown", {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown quarantine tool");
    });
  });
});
