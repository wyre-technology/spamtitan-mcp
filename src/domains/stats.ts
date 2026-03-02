/**
 * Stats domain handler
 *
 * Provides tools for viewing SpamTitan email flow statistics:
 * - get_stats: Get email flow statistics (messages received, blocked, quarantined, delivered)
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { apiRequest } from "../utils/client.js";
import { logger } from "../utils/logger.js";

function getTools(): Tool[] {
  return [
    {
      name: "spamtitan_get_stats",
      description:
        "Get email flow statistics from SpamTitan including messages received, blocked, quarantined, and delivered. Supports filtering by time period.",
      inputSchema: {
        type: "object" as const,
        properties: {
          period: {
            type: "string",
            enum: ["today", "yesterday", "last_7_days", "last_30_days", "last_90_days"],
            description:
              "Time period for statistics (default: today)",
          },
          domain: {
            type: "string",
            description: "Filter statistics for a specific domain (optional)",
          },
        },
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (toolName) {
    case "spamtitan_get_stats": {
      const period = (args.period as string) || "today";
      const domain = args.domain as string | undefined;

      logger.info("API call: stats.get", { period, domain });

      const params: Record<string, string | number | boolean | undefined> = {
        period,
      };
      if (domain) params.domain = domain;

      const result = await apiRequest<unknown>("/api/v1/stats", { params });

      logger.debug("API response: stats.get", { result });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ stats: result, period, domain: domain ?? "all" }, null, 2),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown stats tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const statsHandler: DomainHandler = {
  getTools,
  handleCall,
};
