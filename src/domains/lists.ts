/**
 * Lists domain handler
 *
 * Provides tools for managing SpamTitan allowlists and blocklists:
 * - manage_allowlist: Add or remove sender allowlist entries
 * - manage_blocklist: Add or remove sender blocklist entries
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { apiRequest } from "../utils/client.js";
import { logger } from "../utils/logger.js";

function getTools(): Tool[] {
  return [
    {
      name: "spamtitan_manage_allowlist",
      description:
        "Add or remove sender allowlist entries in SpamTitan. Allowlisted senders always bypass spam filtering.",
      inputSchema: {
        type: "object" as const,
        properties: {
          action: {
            type: "string",
            enum: ["add", "remove", "list"],
            description:
              "Action to perform: 'add' to allowlist a sender, 'remove' to remove one, 'list' to view all entries",
          },
          sender: {
            type: "string",
            description:
              "Sender email address or domain to add/remove (e.g. user@example.com or @example.com). Required for add/remove actions.",
          },
          note: {
            type: "string",
            description: "Optional note explaining why this entry was added (for add action)",
          },
        },
        required: ["action"],
      },
    },
    {
      name: "spamtitan_manage_blocklist",
      description:
        "Add or remove sender blocklist entries in SpamTitan. Blocklisted senders are always rejected or quarantined.",
      inputSchema: {
        type: "object" as const,
        properties: {
          action: {
            type: "string",
            enum: ["add", "remove", "list"],
            description:
              "Action to perform: 'add' to blocklist a sender, 'remove' to remove one, 'list' to view all entries",
          },
          sender: {
            type: "string",
            description:
              "Sender email address or domain to add/remove (e.g. spammer@evil.com or @evil.com). Required for add/remove actions.",
          },
          note: {
            type: "string",
            description: "Optional note explaining why this entry was added (for add action)",
          },
        },
        required: ["action"],
      },
    },
  ];
}

async function handleListAction(
  listType: "allowlist" | "blocklist",
  action: string,
  sender: string | undefined,
  note: string | undefined
): Promise<CallToolResult> {
  const listName = listType === "allowlist" ? "allowlist" : "blocklist";
  const apiPath = `/api/v1/${listName}`;

  switch (action) {
    case "list": {
      logger.info(`API call: ${listName}.list`);
      const result = await apiRequest<unknown>(apiPath);
      const entries = Array.isArray(result)
        ? result
        : (result as Record<string, unknown>)?.entries ?? result;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ [listName]: entries }, null, 2),
          },
        ],
      };
    }

    case "add": {
      if (!sender) {
        return {
          content: [
            {
              type: "text",
              text: `Error: 'sender' is required when action is 'add'`,
            },
          ],
          isError: true,
        };
      }

      logger.info(`API call: ${listName}.add`, { sender, note });

      const body: Record<string, unknown> = { sender };
      if (note) body.note = note;

      const result = await apiRequest<unknown>(apiPath, {
        method: "POST",
        body,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `'${sender}' added to ${listName}`,
                result,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "remove": {
      if (!sender) {
        return {
          content: [
            {
              type: "text",
              text: `Error: 'sender' is required when action is 'remove'`,
            },
          ],
          isError: true,
        };
      }

      logger.info(`API call: ${listName}.remove`, { sender });

      const result = await apiRequest<unknown>(
        `${apiPath}/${encodeURIComponent(sender)}`,
        { method: "DELETE" }
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `'${sender}' removed from ${listName}`,
                result,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: `Unknown action '${action}'. Valid actions: add, remove, list`,
          },
        ],
        isError: true,
      };
  }
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const action = args.action as string;
  const sender = args.sender as string | undefined;
  const note = args.note as string | undefined;

  switch (toolName) {
    case "spamtitan_manage_allowlist":
      return handleListAction("allowlist", action, sender, note);

    case "spamtitan_manage_blocklist":
      return handleListAction("blocklist", action, sender, note);

    default:
      return {
        content: [{ type: "text", text: `Unknown lists tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const listsHandler: DomainHandler = {
  getTools,
  handleCall,
};
