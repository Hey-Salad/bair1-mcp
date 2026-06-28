# Bair1 MCP Server

An MCP (Model Context Protocol) server that lets AI agents query air quality data from [bair1.live](https://bair1.live) sensors.

## Tools

| Tool | Description |
|------|-------------|
| `get_latest_reading` | Get the most recent air quality reading (optionally by device) |
| `list_devices` | List all registered Bair1 sensors |
| `get_readings` | Get historical readings for a device |
| `get_air_quality_summary` | Human-readable summary with AQI, PM levels, and health advice |
| `export_data` | Export readings as JSON with optional date range filtering |

## Setup

```bash
npm install
npm run build
```

## Configuration

Set the `BAIR1_API_KEY` environment variable if you need authenticated endpoints (export). Public read endpoints work without a key.

## Usage with Claude Desktop

Add the following to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bair1": {
      "command": "node",
      "args": ["/Users/chilumbam/bair1-mcp/dist/index.js"],
      "env": {
        "BAIR1_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Usage with Claude Code

Add the server to your Claude Code MCP config:

```bash
claude mcp add bair1 node /Users/chilumbam/bair1-mcp/dist/index.js
```

Or with an API key:

```bash
claude mcp add bair1 -e BAIR1_API_KEY=your-key node /Users/chilumbam/bair1-mcp/dist/index.js
```

## Development

```bash
npm run dev   # Watch mode — recompiles on change
npm start     # Run the compiled server
```
