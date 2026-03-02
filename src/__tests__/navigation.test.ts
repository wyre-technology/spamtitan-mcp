/**
 * Tests for navigation and domain state management
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock handlers using vi.hoisted
const { mockHandlers } = vi.hoisted(() => {
  const mockHandlers = {
    quarantine: {
      getTools: vi.fn().mockReturnValue([
        { name: "spamtitan_get_queue", description: "List quarantine queue" },
        { name: "spamtitan_release_message", description: "Release a message" },
        { name: "spamtitan_delete_message", description: "Delete a message" },
      ]),
      handleCall: vi.fn(),
    },
    lists: {
      getTools: vi.fn().mockReturnValue([
        { name: "spamtitan_manage_allowlist", description: "Manage allowlist" },
        { name: "spamtitan_manage_blocklist", description: "Manage blocklist" },
      ]),
      handleCall: vi.fn(),
    },
    stats: {
      getTools: vi.fn().mockReturnValue([
        { name: "spamtitan_get_stats", description: "Get email stats" },
      ]),
      handleCall: vi.fn(),
    },
  };

  return { mockHandlers };
});

// Mock all domain handlers
vi.mock("../domains/quarantine.js", () => ({
  quarantineHandler: mockHandlers.quarantine,
}));

vi.mock("../domains/lists.js", () => ({
  listsHandler: mockHandlers.lists,
}));

vi.mock("../domains/stats.js", () => ({
  statsHandler: mockHandlers.stats,
}));

import {
  getDomainHandler,
  getAvailableDomains,
  clearDomainCache,
} from "../domains/index.js";
import { isDomainName } from "../utils/types.js";

describe("Domain Navigation", () => {
  beforeEach(() => {
    clearDomainCache();
    vi.clearAllMocks();

    mockHandlers.quarantine.getTools.mockReturnValue([
      { name: "spamtitan_get_queue", description: "List quarantine queue" },
      { name: "spamtitan_release_message", description: "Release a message" },
      { name: "spamtitan_delete_message", description: "Delete a message" },
    ]);
    mockHandlers.lists.getTools.mockReturnValue([
      { name: "spamtitan_manage_allowlist", description: "Manage allowlist" },
      { name: "spamtitan_manage_blocklist", description: "Manage blocklist" },
    ]);
    mockHandlers.stats.getTools.mockReturnValue([
      { name: "spamtitan_get_stats", description: "Get email stats" },
    ]);
  });

  describe("getAvailableDomains", () => {
    it("should return all available domains", () => {
      const domains = getAvailableDomains();
      expect(domains).toEqual(["quarantine", "lists", "stats"]);
    });

    it("should return a consistent list", () => {
      const domains1 = getAvailableDomains();
      const domains2 = getAvailableDomains();
      expect(domains1).toEqual(domains2);
    });
  });

  describe("isDomainName", () => {
    it("should return true for valid domain names", () => {
      expect(isDomainName("quarantine")).toBe(true);
      expect(isDomainName("lists")).toBe(true);
      expect(isDomainName("stats")).toBe(true);
    });

    it("should return false for invalid domain names", () => {
      expect(isDomainName("invalid")).toBe(false);
      expect(isDomainName("")).toBe(false);
      expect(isDomainName("QUARANTINE")).toBe(false);
      expect(isDomainName("devices")).toBe(false);
    });
  });

  describe("getDomainHandler", () => {
    it("should load quarantine domain handler", async () => {
      const handler = await getDomainHandler("quarantine");
      expect(handler).toBeDefined();
      expect(handler.getTools).toBeDefined();
      expect(handler.handleCall).toBeDefined();
    });

    it("should load lists domain handler", async () => {
      const handler = await getDomainHandler("lists");
      expect(handler).toBeDefined();
      expect(handler.getTools()).toHaveLength(2);
    });

    it("should load stats domain handler", async () => {
      const handler = await getDomainHandler("stats");
      expect(handler).toBeDefined();
      expect(handler.getTools()).toHaveLength(1);
    });

    it("should cache domain handlers", async () => {
      const handler1 = await getDomainHandler("quarantine");
      const handler2 = await getDomainHandler("quarantine");
      expect(handler1).toBe(handler2);
    });

    it("should throw for unknown domain", async () => {
      await expect(
        getDomainHandler("unknown" as "quarantine")
      ).rejects.toThrow("Unknown domain: unknown");
    });
  });

  describe("clearDomainCache", () => {
    it("should clear the cached handlers", async () => {
      await getDomainHandler("quarantine");
      clearDomainCache();
      const handler2 = await getDomainHandler("quarantine");
      expect(handler2).toBeDefined();
      expect(handler2.getTools).toBeDefined();
    });
  });
});

describe("Domain Tools Structure", () => {
  beforeEach(() => {
    clearDomainCache();

    mockHandlers.quarantine.getTools.mockReturnValue([
      { name: "spamtitan_get_queue", description: "List quarantine queue" },
      { name: "spamtitan_release_message", description: "Release a message" },
      { name: "spamtitan_delete_message", description: "Delete a message" },
    ]);
    mockHandlers.lists.getTools.mockReturnValue([
      { name: "spamtitan_manage_allowlist", description: "Manage allowlist" },
      { name: "spamtitan_manage_blocklist", description: "Manage blocklist" },
    ]);
    mockHandlers.stats.getTools.mockReturnValue([
      { name: "spamtitan_get_stats", description: "Get email stats" },
    ]);
  });

  it("quarantine domain should expose quarantine-specific tools", async () => {
    const handler = await getDomainHandler("quarantine");
    const tools = handler.getTools();
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("spamtitan_get_queue");
    expect(toolNames).toContain("spamtitan_release_message");
    expect(toolNames).toContain("spamtitan_delete_message");
  });

  it("lists domain should expose list management tools", async () => {
    const handler = await getDomainHandler("lists");
    const tools = handler.getTools();
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("spamtitan_manage_allowlist");
    expect(toolNames).toContain("spamtitan_manage_blocklist");
  });

  it("stats domain should expose stats tools", async () => {
    const handler = await getDomainHandler("stats");
    const tools = handler.getTools();
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("spamtitan_get_stats");
  });
});
