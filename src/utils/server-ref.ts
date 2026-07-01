/**
 * Request-scoped MCP Server reference for elicitation support.
 *
 * In HTTP mode each request creates a fresh Server via createMcpServer().
 * The factory calls setServerRef(server) so that elicitation helpers can
 * reach the server without a circular import. Because each request has its
 * own call-stack, AsyncLocalStorage keeps references isolated across concurrent
 * requests.
 *
 * In stdio mode the single server is set once at startup.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

const serverStore = new AsyncLocalStorage<Server>();

// Fallback for stdio mode (set once at startup, never mutated afterward).
let _stdioServer: Server | null = null;

/**
 * Run fn with the given server available via getServerRef().
 * Used by createMcpServer() to scope the server to the request lifetime.
 */
export function runWithServer<T>(server: Server, fn: () => T): T {
  return serverStore.run(server, fn);
}

/**
 * Set the stdio-mode server reference (called once at startup).
 */
export function setServerRef(server: Server): void {
  _stdioServer = server;
}

/**
 * Get the current server — request-scoped (HTTP) or stdio singleton.
 */
export function getServerRef(): Server | null {
  return serverStore.getStore() ?? _stdioServer;
}
