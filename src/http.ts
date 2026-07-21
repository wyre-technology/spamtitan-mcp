/**
 * Stateless HTTP transport for SpamTitan MCP.
 *
 * Each request creates a fresh Server + StreamableHTTPServerTransport so that
 * no server state is shared across tenants or requests.  Credentials are
 * scoped to the request lifetime via AsyncLocalStorage (runWithCredentials).
 *
 * SECURITY-CRITICAL invariant: sessionIdGenerator MUST remain undefined and
 * enableJsonResponse MUST remain true. This keeps the transport stateless
 * (one request → one response). Switching to a stateful/SSE transport would
 * let a long-lived connection serve later tool calls under a stale/foreign
 * credential context — re-review tenant isolation before changing this.
 */

import { createServer as createHttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createScopedMcpServer } from './server.js';
import { getCredentials, runWithCredentials, DEFAULT_BASE_URL } from './utils/client.js';
import { logger } from './utils/logger.js';

export function startHttpServer(): void {
  const port = parseInt(process.env.MCP_HTTP_PORT || '8080', 10);
  const host = process.env.MCP_HTTP_HOST || '0.0.0.0';
  const isGatewayMode = process.env.AUTH_MODE === 'gateway';

  const httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // Health check — shallow unauthenticated liveness probe.
    // Must NOT depend on credentials: in gateway mode credentials arrive
    // per-request via headers, so a credential check here would return 503
    // and cause container health checks to fail when no ambient key is set.
    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/healthz')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        transport: 'http',
        authMode: isGatewayMode ? 'gateway' : 'env',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      }));
      return;
    }

    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found', endpoints: ['/mcp', '/health'] }));
      return;
    }

    // Gateway mode: extract and validate credentials from headers.
    if (isGatewayMode) {
      const apiKey = req.headers['x-spamtitan-api-key'] as string | undefined;
      if (!apiKey) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Missing credentials',
          message: 'Gateway mode requires X-SpamTitan-API-Key header',
          required: ['X-SpamTitan-API-Key'],
        }));
        return;
      }

      // SpamTitan is self-hosted, so the instance URL is per-tenant and must
      // travel with the key. Optional for back-compat: absent, we fall back to
      // SPAMTITAN_BASE_URL / the TitanHQ default.
      const baseUrl = (req.headers['x-spamtitan-base-url'] as string | undefined)
        || process.env.SPAMTITAN_BASE_URL
        || DEFAULT_BASE_URL;

      const handle = () => createScopedMcpServer(async (server) => {
        // SECURITY: sessionIdGenerator: undefined → stateless, one response per request.
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        res.on('close', () => { transport.close(); server.close(); });
        await server.connect(transport);
        await transport.handleRequest(req, res);
      });

      await runWithCredentials({ apiKey, baseUrl }, handle);
      return;
    }

    // Env mode: credentials come from SPAMTITAN_API_KEY env var.
    // Validate that credentials exist before accepting the request.
    if (!getCredentials()) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'No credentials configured',
        message: 'Set SPAMTITAN_API_KEY environment variable',
      }));
      return;
    }

    await createScopedMcpServer(async (server) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    });
  });

  httpServer.listen(port, host, () => {
    logger.info(`SpamTitan MCP server listening on http://${host}:${port}/mcp`);
    logger.info(`Health check available at http://${host}:${port}/health`);
    logger.info(`Authentication mode: ${isGatewayMode ? 'gateway (X-SpamTitan-API-Key header)' : 'env (SPAMTITAN_API_KEY environment variable)'}`);
  });

  const shutdown = async () => {
    logger.info('Shutting down SpamTitan MCP server...');
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
