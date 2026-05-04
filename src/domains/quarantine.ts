/**
 * Quarantine domain handler
 *
 * Provides tools for managing SpamTitan email quarantine:
 * - List quarantined messages
 * - Release a quarantined message
 * - Delete a quarantined message
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { apiRequest } from "../utils/client.js";
import { logger } from "../utils/logger.js";
import { elicitText } from "../utils/elicitation.js";

function getTools(): Tool[] {
  return [
    {
      name: "spamtitan_get_queue",
      description:
        "List the email quarantine queue. Returns quarantined messages with sender, recipient, subject, and reason for quarantine.",
      inputSchema: {
        type: "object" as const,
        properties: {
          page: {
            type: "number",
            description: "Page number for pagination (default: 1)",
          },
          per_page: {
            type: "number",
            description: "Number of results per page (default: 50, max: 200)",
          },
          sender: {
            type: "string",
            description: "Filter by sender email address",
          },
          recipient: {
            type: "string",
            description: "Filter by recipient email address",
          },
          subject: {
            type: "string",
            description: "Filter by subject (partial match)",
          },
          reason: {
            type: "string",
            description: "Filter by quarantine reason (e.g. spam, virus, policy)",
          },
        },
      },
    },
    {
      name: "spamtitan_release_message",
      description:
        "Release a quarantined message by ID, delivering it to the intended recipient.",
      inputSchema: {
        type: "object" as const,
        properties: {
          message_id: {
            type: "string",
            description: "The quarantined message ID to release",
          },
        },
        required: ["message_id"],
      },
    },
    {
      name: "spamtitan_delete_message",
      description:
        "⚠ DESTRUCTIVE — IRREVERSIBLE. Permanently delete a quarantined message by ID. " +
        "This action cannot be undone and will remove the message from quarantine storage. " +
        "Confirm with the user before invoking.",
      annotations: {
        title: "Delete quarantined message (irreversible)",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object" as const,
        properties: {
          message_id: {
            type: "string",
            description: "The quarantined message ID to delete",
          },
        },
        required: ["message_id"],
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (toolName) {
    case "spamtitan_get_queue": {
      const page = (args.page as number) || 1;
      const perPage = (args.per_page as number) || 50;
      let sender = args.sender as string | undefined;
      let recipient = args.recipient as string | undefined;
      const subject = args.subject as string | undefined;
      const reason = args.reason as string | undefined;

      // If no filters provided, ask the user if they want to narrow by recipient
      if (!sender && !recipient && !subject && !reason) {
        const recipientFilter = await elicitText(
          "The quarantine queue can be large. Would you like to filter by recipient email address? Leave blank to list all.",
          "recipient",
          "Enter a recipient email address to filter by, or leave blank for all"
        );
        if (recipientFilter) {
          recipient = recipientFilter;
        }
      }

      logger.info("API call: quarantine.getQueue", {
        page,
        perPage,
        sender,
        recipient,
      });

      const params: Record<string, string | number | boolean | undefined> = {
        page,
        per_page: perPage,
      };

      if (sender) params.sender = sender;
      if (recipient) params.recipient = recipient;
      if (subject) params.subject = subject;
      if (reason) params.reason = reason;

      const result = await apiRequest<unknown>("/api/v1/quarantine/queue", { params });

      const messages = Array.isArray(result)
        ? result
        : (result as Record<string, unknown>)?.messages ?? result;

      logger.debug("API response: quarantine.getQueue", {
        count: Array.isArray(messages) ? messages.length : "unknown",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ messages, page, per_page: perPage }, null, 2),
          },
        ],
      };
    }

    case "spamtitan_release_message": {
      const messageId = args.message_id as string;
      if (!messageId) {
        return {
          content: [{ type: "text", text: "Error: message_id is required" }],
          isError: true,
        };
      }

      logger.info("API call: quarantine.releaseMessage", { messageId });

      const result = await apiRequest<unknown>(
        `/api/v1/quarantine/messages/${encodeURIComponent(messageId)}/release`,
        { method: "POST" }
      );

      logger.debug("API response: quarantine.releaseMessage", { result });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: true, message: `Message ${messageId} released successfully`, result },
              null,
              2
            ),
          },
        ],
      };
    }

    case "spamtitan_delete_message": {
      const messageId = args.message_id as string;
      if (!messageId) {
        return {
          content: [{ type: "text", text: "Error: message_id is required" }],
          isError: true,
        };
      }

      logger.info("API call: quarantine.deleteMessage", { messageId });

      const result = await apiRequest<unknown>(
        `/api/v1/quarantine/messages/${encodeURIComponent(messageId)}`,
        { method: "DELETE" }
      );

      logger.debug("API response: quarantine.deleteMessage", { result });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: true, message: `Message ${messageId} deleted successfully`, result },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown quarantine tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const quarantineHandler: DomainHandler = {
  getTools,
  handleCall,
};
