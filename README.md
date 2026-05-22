# SpamTitan MCP Server

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

A Model Context Protocol (MCP) server for SpamTitan email security. Enables AI assistants to manage quarantine, maintain allowlists and blocklists, and view email filtering statistics.

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that connects Claude (or any MCP-compatible AI) to your SpamTitan environment.

> **Part of the [MSP Claude Plugins](https://github.com/wyre-technology) ecosystem** — a growing suite of AI integrations for the MSP stack. Built by MSPs, for MSPs.

## Installation

```bash
npm install @wyre-technology/spamtitan-mcp
```

## Configuration

Set the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `SPAMTITAN_API_KEY` | Yes | Your SpamTitan API key |
| `SPAMTITAN_BASE_URL` | No | Your SpamTitan instance URL |
| `MCP_TRANSPORT` | No | Transport mode: stdio (default) or http |

## Usage

### Running with Claude Desktop

Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "spamtitan-mcp": {
      "command": "npx",
      "args": ["@wyre-technology/spamtitan-mcp"],
      "env": {
        "SPAMTITAN_API_KEY": "your-spamtitan-api-key"
      }
    }
  }
}
```

### Running with Claude Code (CLI)

```bash
claude mcp add spamtitan-mcp \
  -e SPAMTITAN_API_KEY=your-value \
  -- npx -y @wyre-technology/spamtitan-mcp
```

### Docker

```bash
docker build -t spamtitan-mcp .
docker run \
  -e SPAMTITAN_API_KEY=your-value \
  -p 8080:8080 spamtitan-mcp
```

## Available Domains

### Lists
Manage allowlists and blocklists

### Quarantine
Email quarantine review and management

### Stats
Email filtering statistics and reports


## Development

```bash
# Clone the repository
git clone https://github.com/wyre-technology/spamtitan-mcp.git
cd spamtitan-mcp

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) if present, or open an issue to discuss changes.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
