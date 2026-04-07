## [1.1.1](https://github.com/wyre-technology/spamtitan-mcp/compare/v1.1.0...v1.1.1) (2026-04-07)


### Bug Fixes

* **ci:** deploy :latest tag, force revision via env var bump ([1bae09f](https://github.com/wyre-technology/spamtitan-mcp/commit/1bae09ff1c54ff13b69da65d24a4b2db207a149e))

# [1.1.0](https://github.com/wyre-technology/spamtitan-mcp/compare/v1.0.0...v1.1.0) (2026-03-10)


### Features

* **elicitation:** add MCP elicitation support with graceful fallback ([7823cb1](https://github.com/wyre-technology/spamtitan-mcp/commit/7823cb1a9f9abe71fb42860be3870661a07928d1))

# 1.0.0 (2026-03-02)


### Features

* initial SpamTitan MCP server scaffold ([569c9fd](https://github.com/wyre-technology/spamtitan-mcp/commit/569c9fd5a9af6a530c8980e1c6a36fc68762263e))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-03-02

### Added
- Initial release of SpamTitan MCP Server
- Decision-tree navigation architecture with three domains:
  - `quarantine`: List queue, release and delete quarantined messages
  - `lists`: Manage sender allowlists and blocklists
  - `stats`: View email flow statistics by time period and domain
- Dual transport support: stdio (Claude Desktop) and HTTP streaming (hosted deployment)
- Gateway auth mode: credentials injected via `X-SpamTitan-API-Key` header
- Health check endpoint at `/health`
- Docker image with non-root user and health check
- Structured stderr-only logging with configurable log level
- Comprehensive test suite with vitest
- Semantic release CI/CD pipeline
- MCPB manifest for Claude Desktop installation
