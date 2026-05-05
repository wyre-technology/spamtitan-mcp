#!/usr/bin/env node
/**
 * SpamTitan MCP Server
 *
 * This MCP server provides tools for interacting with the SpamTitan API.
 * All tools are listed upfront so they work with every MCP client, including
 * remote connectors (claude.ai, mcp-remote) that do not support dynamic
 * tool-list changes. A helper `spamtitan_navigate` tool provides domain
 * discovery and guidance.
 *
 * Supports both stdio and HTTP transports:
 * - stdio (default): For local Claude Desktop / CLI usage
 * - http: For hosted deployment with optional gateway auth
 *
 * Auth modes:
 * - env (default): Credentials from SPAMTITAN_API_KEY environment variable
 * - gateway: Credentials injected from request headers by the MCP gateway
 *   - Header: X-SpamTitan-API-Key
 *
 * Domains:
 * - quarantine: List queue, release and delete quarantined messages
 * - lists: Manage allowlists and blocklists
 * - stats: View email flow statistics
 */

import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getDomainHandler, getAvailableDomains } from "./domains/index.js";
import { isDomainName, type DomainName } from "./utils/types.js";
import { getCredentials } from "./utils/client.js";
import { logger } from "./utils/logger.js";
import { setServerRef } from "./utils/server-ref.js";

/**
 * Available domains for navigation
 */
type Domain = "quarantine" | "lists" | "stats";

/**
 * Domain metadata for navigation
 */
const domainDescriptions: Record<Domain, string> = {
  quarantine: "Email quarantine management - list queue, release and delete quarantined messages",
  lists: "Allowlist/blocklist management - manage email filtering rules",
  stats: "Email statistics - view email flow and filtering statistics",
};

// Create the MCP server
const server = new Server(
  {
    name: "spamtitan-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

setServerRef(server);

/**
 * Navigation / discovery tool - helps the LLM find the right tools
 *
 * This is a stateless helper that describes available tools for a domain.
 * All domain tools are always listed in tools/list regardless of navigation
 * state, because many MCP clients (claude.ai connectors, mcp-remote) only
 * fetch the tool list once and do not support notifications/tools/list_changed.
 */
const navigateTool: Tool = {
  name: "spamtitan_navigate",
  description:
    "Discover available SpamTitan tools by domain. Returns tool names and descriptions for the selected domain. All tools are callable at any time — this is a help/discovery aid, not a prerequisite.",
  inputSchema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        enum: getAvailableDomains(),
        description: `The domain to explore:
- quarantine: ${domainDescriptions.quarantine}
- lists: ${domainDescriptions.lists}
- stats: ${domainDescriptions.stats}`,
      },
    },
    required: ["domain"],
  },
};


/**
 * Status tool - shows credentials status and available domains
 */
const statusTool: Tool = {
  name: "spamtitan_status",
  description: "Show credentials status and available domains",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

/**
 * Map from domain name to its tool definitions (loaded lazily)
 */
const domainToolMap = new Map<DomainName, Tool[]>();

/**
 * All domain tools, collected once at startup
 */
let allDomainTools: Tool[] | null = null;

/**
 * Load all domain tools (lazy-loaded on first access)
 */
async function getAllDomainTools(): Promise<Tool[]> {
  if (allDomainTools !== null) {
    return allDomainTools;
  }

  const domains = getAvailableDomains();
  const tools: Tool[] = [];

  for (const domain of domains) {
    if (!domainToolMap.has(domain)) {
      const handler = await getDomainHandler(domain);
      const domainTools = handler.getTools();
      domainToolMap.set(domain, domainTools);
    }
    tools.push(...domainToolMap.get(domain)!);
  }

  allDomainTools = tools;
  return tools;
}

// Handle ListTools requests - always returns ALL tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const domainTools = await getAllDomainTools();
  return { tools: [navigateTool, statusTool, ...domainTools] };
});

// Handle CallTool requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logger.info("Tool call received", { tool: name, arguments: args });

  try {
    // Handle navigation / discovery helper
    if (name === "spamtitan_navigate") {
      const { domain } = args as { domain: Domain };

      if (!isDomainName(domain)) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid domain: ${domain}. Available domains: ${getAvailableDomains().join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      const handler = await getDomainHandler(domain);
      const tools = handler.getTools();

      const toolSummary = tools
        .map((t) => `- ${t.name}: ${t.description}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `${domainDescriptions[domain]}\n\nAvailable tools:\n${toolSummary}\n\nYou can call any of these tools directly.`,
          },
        ],
      };
    }

    if (name === "spamtitan_status") {
      const creds = getCredentials();
      const credStatus = creds
        ? "Configured"
        : "NOT CONFIGURED - Please set SPAMTITAN_API_KEY environment variable";

      return {
        content: [
          {
            type: "text",
            text: `SpamTitan MCP Server Status\n\nCredentials: ${credStatus}\nAvailable domains: ${getAvailableDomains().join(", ")}\n\nAll tools are available at all times. Use spamtitan_navigate to discover tools by domain.`,
          },
        ],
      };
    }

    // Route to appropriate domain handler based on tool name
    const toolArgs = (args ?? {}) as Record<string, unknown>;

    // Route quarantine tools
    if (name === "spamtitan_get_queue" ||
        name === "spamtitan_release_message" ||
        name === "spamtitan_delete_message") {
      const handler = await getDomainHandler("quarantine");
      return await handler.handleCall(name, toolArgs);
    }

    // Route list management tools
    if (name === "spamtitan_manage_allowlist" ||
        name === "spamtitan_manage_blocklist") {
      const handler = await getDomainHandler("lists");
      return await handler.handleCall(name, toolArgs);
    }

    // Route stats tools
    if (name === "spamtitan_get_stats") {
      const handler = await getDomainHandler("stats");
      return await handler.handleCall(name, toolArgs);
    }

    // Unknown tool
    return {
      content: [
        {
          type: "text",
          text: `Unknown tool: ${name}. Use spamtitan_navigate to discover available tools by domain.`,
        },
      ],
      isError: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error("Tool call failed", { tool: name, error: message, stack });
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

/**
 * Start the server with stdio transport (default)
 */
async function startStdioTransport(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("SpamTitan MCP server running on stdio");
}

/**
 * Start the server with HTTP Streamable transport.
 * In gateway mode (AUTH_MODE=gateway), credentials are extracted
 * from the X-SpamTitan-API-Key request header.
 */
async function startHttpTransport(): Promise<void> {
  const port = parseInt(process.env.MCP_HTTP_PORT || "8080", 10);
  const host = process.env.MCP_HTTP_HOST || "0.0.0.0";
  const isGatewayMode = process.env.AUTH_MODE === "gateway";

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
  });

  const httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // Health check - no auth required
    if (url.pathname === "/health") {
      const creds = getCredentials();
      const statusCode = creds ? 200 : 503;

      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: creds ? "ok" : "degraded",
          transport: "http",
          authMode: isGatewayMode ? "gateway" : "env",
          timestamp: new Date().toISOString(),
          credentials: {
            configured: !!creds,
          },
          logLevel: process.env.LOG_LEVEL || "info",
          version: "1.0.0",
        })
      );
      return;
    }

    // MCP endpoint
    if (url.pathname === "/mcp") {
      // Gateway mode: extract credentials from headers
      if (isGatewayMode) {
        const apiKey = req.headers["x-spamtitan-api-key"] as string | undefined;

        if (!apiKey) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Missing credentials",
              message:
                "Gateway mode requires X-SpamTitan-API-Key header",
              required: ["X-SpamTitan-API-Key"],
            })
          );
          return;
        }

        // Set env var so getCredentials() picks it up
        process.env.SPAMTITAN_API_KEY = apiKey;
      }

      transport.handleRequest(req, res);
      return;
    }

    // 404 for everything else
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found", endpoints: ["/mcp", "/health"] }));
  });

  await server.connect(transport);

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => {
      logger.info(`SpamTitan MCP server listening on http://${host}:${port}/mcp`);
      logger.info(`Health check available at http://${host}:${port}/health`);
      logger.info(
        `Authentication mode: ${isGatewayMode ? "gateway (X-SpamTitan-API-Key header)" : "env (SPAMTITAN_API_KEY environment variable)"}`
      );
      resolve();
    });
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down SpamTitan MCP server...");
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Main entry point - select transport based on MCP_TRANSPORT env var
 */
async function main() {
  const transportType = process.env.MCP_TRANSPORT || "stdio";
  logger.info("Starting SpamTitan MCP server", {
    transport: transportType,
    logLevel: process.env.LOG_LEVEL || "info",
    nodeVersion: process.version,
  });

  if (transportType === "http") {
    await startHttpTransport();
  } else {
    await startStdioTransport();
  }
}

main().catch((error) => {
  logger.error("Fatal startup error", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
