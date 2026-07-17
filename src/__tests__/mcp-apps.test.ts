/**
 * MCP Apps (SEP-1865) contract tests — mirrors the checks an MCP Apps host
 * performs to render the quarantined-message card:
 *   1. the renderable tool advertises the UI resource via _meta
 *   2. the ui:// resource lists and reads back as profile=mcp-app HTML
 *   3. buildMessageCard normalizes a SpamTitan quarantined message into the
 *      card payload the iframe renders from
 *   4. spamtitan_get_message attaches _card best-effort (never failing the
 *      tool result)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the client module so handler tests never hit the network
vi.mock("../utils/client.js", () => ({
  apiRequest: vi.fn(),
  getCredentials: vi.fn().mockReturnValue({ apiKey: "test-key" }),
  runWithCredentials: vi.fn((_creds: unknown, fn: () => unknown) => fn()),
}));

import { getAvailableDomains, getDomainHandler } from "../domains/index.js";
import { listResources, readResource } from "../resources.js";
import {
  buildMessageCard,
  applyBrandInjection,
  MESSAGE_CARD_RESOURCE_URI,
  MCP_APP_RESOURCE_MIME,
} from "../card.builder.js";
import { MESSAGE_CARD_HTML } from "../generated/message-card-html.js";
import { apiRequest } from "../utils/client.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

const mockApiRequest = vi.mocked(apiRequest);

// Read-only policy: only the single-entity read tool renders the card.
const RENDERABLE_TOOLS = ["spamtitan_get_message"];

async function getAllTools(): Promise<Tool[]> {
  const tools: Tool[] = [];
  for (const domain of getAvailableDomains()) {
    const handler = await getDomainHandler(domain);
    tools.push(...handler.getTools());
  }
  return tools;
}

describe("MCP Apps quarantined-message card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("tool _meta advertisement", () => {
    it.each(RENDERABLE_TOOLS)("%s links the card via _meta", async (name) => {
      const tool = (await getAllTools()).find((t) => t.name === name);
      expect(tool).toBeDefined();
      // Canonical flat key (ext-apps RESOURCE_URI_META_KEY) …
      expect(tool?._meta?.["ui/resourceUri"]).toBe(MESSAGE_CARD_RESOURCE_URI);
      // … and the nested form registerAppTool also emits.
      expect((tool?._meta?.ui as { resourceUri?: string })?.resourceUri).toBe(
        MESSAGE_CARD_RESOURCE_URI
      );
    });

    it("no other tools carry UI metadata", async () => {
      const others = (await getAllTools()).filter(
        (t) => t._meta && !RENDERABLE_TOOLS.includes(t.name)
      );
      expect(others).toEqual([]);
    });
  });

  describe("ui:// resource", () => {
    it("is listed with the MCP Apps MIME type", () => {
      const card = listResources().find((r) => r.uri === MESSAGE_CARD_RESOURCE_URI);
      expect(card?.mimeType).toBe(MCP_APP_RESOURCE_MIME);
    });

    it("reads back as profile=mcp-app HTML containing the card app", () => {
      const content = readResource(MESSAGE_CARD_RESOURCE_URI);
      expect(content.mimeType).toBe(MCP_APP_RESOURCE_MIME);
      // No MCP_BRAND_* env set → the embedded HTML is served byte-identical.
      expect(content.text).toBe(MESSAGE_CARD_HTML);
      expect(content.text).toContain("card__bar");
      expect(content.text).toContain("BRAND_INJECT");
      // The vite build must have inlined the bridge script — a bare <script src>
      // would be unloadable from a resources/read HTML string.
      expect(content.text).not.toContain('src="./message-card.ts"');
    });

    it("serves neutral defaults with no vendor identity", () => {
      const { text } = readResource(MESSAGE_CARD_RESOURCE_URI);
      expect(text).not.toMatch(/WYRE/i);
      expect(text).not.toContain("00c9db"); // WYRE cyan
      expect(text).not.toContain("ede947"); // WYRE yellow
      expect(text).not.toContain("fonts.googleapis.com"); // no external fetches
    });

    it("carries the BRAND_INJECT marker exactly once", () => {
      const { text } = readResource(MESSAGE_CARD_RESOURCE_URI);
      expect(text.match(/BRAND_INJECT/g)).toHaveLength(1);
    });

    it("injects MCP_BRAND_* env vars into the served HTML", () => {
      vi.stubEnv("MCP_BRAND_NAME", "Acme MSP");
      vi.stubEnv("MCP_BRAND_PRIMARY_COLOR", "#ff0000");
      try {
        const { text } = readResource(MESSAGE_CARD_RESOURCE_URI);
        expect(text).toContain(
          '<script>window.__BRAND__={"name":"Acme MSP","primaryColor":"#ff0000"}</script>'
        );
        expect(text).not.toContain("BRAND_INJECT");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("rejects unknown resource URIs", () => {
      expect(() => readResource("ui://spamtitan/nope.html")).toThrow(/Unknown resource/);
    });
  });

  describe("applyBrandInjection", () => {
    const html = MESSAGE_CARD_HTML;

    it("replaces the marker with an inline window.__BRAND__ script", () => {
      const out = applyBrandInjection(html, { name: "Acme", primaryColor: "#123456" });
      expect(out).toContain('window.__BRAND__={"name":"Acme","primaryColor":"#123456"}');
      expect(out).not.toContain("BRAND_INJECT");
    });

    it("escapes < so brand values cannot break out of the script tag", () => {
      const out = applyBrandInjection(html, { name: "</script><script>alert(1)" });
      expect(out).not.toContain("</script><script>alert(1)");
      expect(out).toContain("\\u003c/script>\\u003cscript>alert(1)");
    });

    it("returns the HTML unchanged for an empty brand", () => {
      expect(applyBrandInjection(html, {})).toBe(html);
      expect(applyBrandInjection(html, { name: "" })).toBe(html);
    });
  });

  describe("buildMessageCard", () => {
    const message = {
      id: "q-8842",
      sender: "spam@evil.example",
      recipient: "user@org.example",
      subject: "You have won a prize!",
      reason: "spam",
      score: 12.4,
      status: "quarantined",
      date: "2026-07-17T09:00:00Z",
    };

    it("normalizes a quarantined message into the card payload", () => {
      expect(buildMessageCard(message)).toEqual({
        id: "q-8842",
        sender: "spam@evil.example",
        recipient: "user@org.example",
        subject: "You have won a prize!",
        reason: "spam",
        score: "12.4",
        status: "quarantined",
        date: "2026-07-17T09:00:00Z",
      });
    });

    it("accepts numeric ids and alternate field spellings", () => {
      const card = buildMessageCard({
        id: 991,
        from: "a@b.example",
        to: "c@d.example",
        type: "virus",
        spam_score: "9.9",
        received: "2026-07-16T12:00:00Z",
      });
      expect(card).toEqual({
        id: "991",
        sender: "a@b.example",
        recipient: "c@d.example",
        reason: "virus",
        score: "9.9",
        date: "2026-07-16T12:00:00Z",
      });
    });

    it("truncates very long subjects so the card payload stays small", () => {
      const card = buildMessageCard({
        id: "q-1",
        sender: "a@b.example",
        subject: "x".repeat(600),
      });
      expect(card?.subject).toHaveLength(300);
    });

    it("returns null for payloads that are not a quarantined message", () => {
      expect(buildMessageCard({})).toBeNull();
      expect(buildMessageCard({ sender: "no-id@b.example" })).toBeNull();
      // id-bearing but with no recognizable email fields → no card
      expect(buildMessageCard({ id: "q-1", foo: "bar" })).toBeNull();
    });
  });

  describe("spamtitan_get_message handler", () => {
    async function callGetMessage(args: Record<string, unknown>) {
      const handler = await getDomainHandler("quarantine");
      return handler.handleCall("spamtitan_get_message", args);
    }

    it("fetches the message and attaches the normalized _card", async () => {
      mockApiRequest.mockResolvedValueOnce({
        id: "q-8842",
        sender: "spam@evil.example",
        recipient: "user@org.example",
        subject: "You have won a prize!",
        reason: "spam",
      });

      const result = await callGetMessage({ message_id: "q-8842" });
      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/quarantine/messages/q-8842");

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe("q-8842");
      expect(parsed._card).toEqual({
        id: "q-8842",
        sender: "spam@evil.example",
        recipient: "user@org.example",
        subject: "You have won a prize!",
        reason: "spam",
      });
    });

    it("unwraps { message: {...} } envelopes before building the card", async () => {
      mockApiRequest.mockResolvedValueOnce({
        message: { id: "q-1", sender: "a@b.example", subject: "hi" },
      });

      const result = await callGetMessage({ message_id: "q-1" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe("q-1");
      expect(parsed._card.id).toBe("q-1");
    });

    it("drops the card (not the result) when the payload is not card-shaped", async () => {
      mockApiRequest.mockResolvedValueOnce({ unexpected: "shape" });

      const result = await callGetMessage({ message_id: "q-2" });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual({ unexpected: "shape" });
      expect(parsed._card).toBeUndefined();
    });

    it("returns error when message_id is missing", async () => {
      const result = await callGetMessage({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("message_id is required");
    });
  });
});
