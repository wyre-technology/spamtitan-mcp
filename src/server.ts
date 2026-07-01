/**
 * SpamTitan MCP Server factory.
 *
 * createMcpServer() returns a fresh Server instance with all request handlers
 * registered. Call it once per HTTP request (stateless transport) or once at
 * stdio startup — never at module load.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDomainHandler, getAvailableDomains } from './domains/index.js';
import { isDomainName } from './utils/types.js';
import { getCredentials } from './utils/client.js';
import { logger } from './utils/logger.js';
import { runWithServer } from './utils/server-ref.js';

type Domain = 'quarantine' | 'lists' | 'stats';

const domainDescriptions: Record<Domain, string> = {
  quarantine: 'Email quarantine management - list queue, release and delete quarantined messages',
  lists: 'Allowlist/blocklist management - manage email filtering rules',
  stats: 'Email statistics - view email flow and filtering statistics',
};

const navigateTool: Tool = {
  name: 'spamtitan_navigate',
  description:
    'Discover available SpamTitan tools by domain. Returns tool names and descriptions for the selected domain. All tools are callable at any time — this is a help/discovery aid, not a prerequisite.',
  inputSchema: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        enum: getAvailableDomains(),
        description: `The domain to explore:
- quarantine: ${domainDescriptions.quarantine}
- lists: ${domainDescriptions.lists}
- stats: ${domainDescriptions.stats}`,
      },
    },
    required: ['domain'],
  },
};

const statusTool: Tool = {
  name: 'spamtitan_status',
  description: 'Show credentials status and available domains',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

/**
 * Create a fresh MCP Server with all handlers registered.
 * Must be called per HTTP request (or once for stdio).
 */
export function createMcpServer(): Server {
  const server = new Server(
    { name: 'spamtitan-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: Tool[] = [navigateTool, statusTool];
    for (const domain of getAvailableDomains()) {
      const handler = await getDomainHandler(domain);
      tools.push(...handler.getTools());
    }
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info('Tool call received', { tool: name });

    try {
      if (name === 'spamtitan_navigate') {
        const { domain } = args as { domain: Domain };
        if (!isDomainName(domain)) {
          return {
            content: [{ type: 'text' as const, text: `Invalid domain: ${domain}. Available domains: ${getAvailableDomains().join(', ')}` }],
            isError: true,
          };
        }
        const handler = await getDomainHandler(domain);
        const tools = handler.getTools();
        const toolSummary = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
        return {
          content: [{ type: 'text' as const, text: `${domainDescriptions[domain]}\n\nAvailable tools:\n${toolSummary}\n\nYou can call any of these tools directly.` }],
        };
      }

      if (name === 'spamtitan_status') {
        const creds = getCredentials();
        const credStatus = creds
          ? 'Configured'
          : 'NOT CONFIGURED - Please set SPAMTITAN_API_KEY environment variable';
        return {
          content: [{ type: 'text' as const, text: `SpamTitan MCP Server Status\n\nCredentials: ${credStatus}\nAvailable domains: ${getAvailableDomains().join(', ')}\n\nAll tools are available at all times. Use spamtitan_navigate to discover tools by domain.` }],
        };
      }

      const toolArgs = (args ?? {}) as Record<string, unknown>;

      if (name === 'spamtitan_get_queue' || name === 'spamtitan_release_message' || name === 'spamtitan_delete_message') {
        const handler = await getDomainHandler('quarantine');
        return await handler.handleCall(name, toolArgs);
      }

      if (name === 'spamtitan_manage_allowlist' || name === 'spamtitan_manage_blocklist') {
        const handler = await getDomainHandler('lists');
        return await handler.handleCall(name, toolArgs);
      }

      if (name === 'spamtitan_get_stats') {
        const handler = await getDomainHandler('stats');
        return await handler.handleCall(name, toolArgs);
      }

      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}. Use spamtitan_navigate to discover available tools by domain.` }],
        isError: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error('Tool call failed', { tool: name, error: message, stack });
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Create a server scoped to the current async context so that elicitation
 * helpers (utils/server-ref.ts) can resolve it without circular imports.
 */
export function createScopedMcpServer<T>(fn: (server: Server) => T): T {
  const server = createMcpServer();
  return runWithServer(server, () => fn(server));
}
