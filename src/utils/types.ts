/**
 * Shared types for the SpamTitan MCP server
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Tool call result type - inline definition for MCP SDK compatibility
 */
export type CallToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/**
 * Domain handler interface
 */
export interface DomainHandler {
  /** Get the tools for this domain */
  getTools(): Tool[];
  /** Handle a tool call */
  handleCall(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<CallToolResult>;
}

/**
 * Domain names for SpamTitan
 */
export type DomainName = "quarantine" | "lists" | "stats";

/**
 * Check if a string is a valid domain name
 */
export function isDomainName(value: string): value is DomainName {
  return ["quarantine", "lists", "stats"].includes(value);
}

/**
 * SpamTitan credentials extracted from environment or gateway headers
 */
export interface SpamTitanCredentials {
  apiKey: string;
  baseUrl: string;
}
