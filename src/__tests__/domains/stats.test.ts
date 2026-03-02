/**
 * Tests for the stats domain handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../utils/client.js", () => ({
  apiRequest: vi.fn(),
  getCredentials: vi.fn().mockReturnValue({ apiKey: "test-key", baseUrl: "https://api-spamtitan.titanhq.com" }),
  clearCredentials: vi.fn(),
}));

import { statsHandler } from "../../domains/stats.js";
import { apiRequest } from "../../utils/client.js";

const mockApiRequest = vi.mocked(apiRequest);

describe("Stats Domain Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getTools", () => {
    it("should return the stats tool", () => {
      const tools = statsHandler.getTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("spamtitan_get_stats");
    });

    it("get_stats should have a period enum", () => {
      const tools = statsHandler.getTools();
      const statsTool = tools.find((t) => t.name === "spamtitan_get_stats");
      const periodProp = (statsTool?.inputSchema.properties as Record<string, { enum?: string[] }>)?.period;
      expect(periodProp?.enum).toContain("today");
      expect(periodProp?.enum).toContain("last_7_days");
      expect(periodProp?.enum).toContain("last_30_days");
    });
  });

  describe("handleCall - spamtitan_get_stats", () => {
    it("should get stats with default period", async () => {
      const fakeStats = { received: 1000, blocked: 400, quarantined: 50, delivered: 550 };
      mockApiRequest.mockResolvedValueOnce(fakeStats);

      const result = await statsHandler.handleCall("spamtitan_get_stats", {});

      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/v1/stats",
        expect.objectContaining({ params: expect.objectContaining({ period: "today" }) })
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.stats).toEqual(fakeStats);
      expect(parsed.period).toBe("today");
    });

    it("should get stats for a specific period", async () => {
      mockApiRequest.mockResolvedValueOnce({ received: 7000 });

      await statsHandler.handleCall("spamtitan_get_stats", { period: "last_7_days" });

      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/v1/stats",
        expect.objectContaining({ params: expect.objectContaining({ period: "last_7_days" }) })
      );
    });

    it("should filter by domain when provided", async () => {
      mockApiRequest.mockResolvedValueOnce({ received: 200 });

      await statsHandler.handleCall("spamtitan_get_stats", {
        period: "today",
        domain: "example.com",
      });

      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/v1/stats",
        expect.objectContaining({
          params: expect.objectContaining({
            period: "today",
            domain: "example.com",
          }),
        })
      );
    });

    it("should include period and domain in response", async () => {
      mockApiRequest.mockResolvedValueOnce({ received: 100 });

      const result = await statsHandler.handleCall("spamtitan_get_stats", {
        period: "last_30_days",
        domain: "myorg.com",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.period).toBe("last_30_days");
      expect(parsed.domain).toBe("myorg.com");
    });

    it("should show 'all' for domain when not specified", async () => {
      mockApiRequest.mockResolvedValueOnce({});

      const result = await statsHandler.handleCall("spamtitan_get_stats", {});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.domain).toBe("all");
    });
  });

  describe("handleCall - unknown tool", () => {
    it("should return error for unknown tool name", async () => {
      const result = await statsHandler.handleCall("spamtitan_unknown_stats", {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown stats tool");
    });
  });
});
