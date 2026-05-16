# Roopik MCP STDIO Server

Standalone MCP (Model Context Protocol) server that bridges external AI agents to Roopik IDE.

## Architecture

```
┌──────────────┐     STDIO      ┌──────────────────┐     WebSocket     ┌─────────────┐
│   AI Agent   │ ◄────────────► │ This STDIO Server │ ◄───────────────► │ Roopik IDE  │
│ (Claude Code)│                │  (roopik-mcp.exe) │                   │ (WebSocket) │
└──────────────┘                └──────────────────┘                   └─────────────┘
```

## How It Works

1. External AI agents (Claude Code, Codex, Gemini, etc.) spawn this binary
2. Binary connects to Roopik IDE's WebSocket server
3. STDIO MCP requests are forwarded to Roopik
4. Roopik executes tools (browser control, CSS inspection, etc.)
5. Results are returned via STDIO

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build TypeScript
npm run build
```

## Building Binaries

```bash
# Build for current platform
npm run bundle

# Build Windows binary
npm run build:binary:win

# Build macOS binaries (x64 and ARM64)
npm run build:binary:mac-x64
npm run build:binary:mac-arm64

# Build Linux binary
npm run build:binary:linux

# Build all binaries
npm run build:binaries
```

Binaries are output to `resources/mcp-binaries/`:
- `roopik-mcp-win-x64.exe`
- `roopik-mcp-macos-x64`
- `roopik-mcp-macos-arm64`
- `roopik-mcp-linux-x64`

## CLI Arguments

```bash
roopik-mcp [--ws-port <port>] [--ws-url <url>]
```

| Argument | Description |
|----------|-------------|
| `--ws-port <port>` | WebSocket port to connect to |
| `--ws-url <url>` | Full WebSocket URL (overrides --ws-port) |

## Environment Variables

- `ROOPIK_MCP_WS_URL` - WebSocket URL to connect to (e.g., `ws://localhost:9876/mcp`)

**Priority order:**
1. `--ws-url` CLI argument (highest)
2. `--ws-port` CLI argument
3. `ROOPIK_MCP_WS_URL` environment variable
4. Auto-discovery (tries ports 9876-9880)

## Available Tools (26)

### Browser Tools (14)
- `browser_open` - Open the browser view
- `browser_close` - Close the browser view
- `browser_screenshot` - Take a screenshot
- `browser_navigate` - Navigate to URL
- `browser_reload` - Reload the page
- `browser_action_input` - Click, type, scroll, etc.
- `browser_execute_script` - Run JavaScript
- `browser_inspect_element` - CSS inspection with source file resolution
- `browser_get_errors` - Get console + network errors
- `browser_get_console_logs` - Get console logs
- `browser_get_performance` - Get Web Vitals metrics
- `browser_get_state` - Get browser state (open/closed, URL, title)
- `browser_set_viewport` - Set/clear viewport for responsive testing
- `browser_get_network_requests` - Get captured network traffic

### Canvas Tools (3)
- `canvas_list` - List all canvases
- `canvas_get_active` - Get active canvas
- `canvas_create` - Create a canvas

### Component Tools (6)
- `component_add` - Add component for live preview
- `component_add_batch` - Add multiple components
- `component_remove` - Remove component
- `component_get_info` - Get component info
- `component_list` - List components in canvas
- `component_rebuild` - Trigger rebuild

### Project Tools (3)
- `project_get_active` - Check if dev server is running
- `project_start` - Start development server
- `project_stop` - Stop development server

## Available Prompts (5)

- `how-to-start-project` - Guide for starting a dev server
- `how-to-create-component` - Guide for adding components to canvas
- `how-to-inspect-css` - Guide for CSS inspection with source resolution
- `how-to-debug-errors` - Guide for debugging browser errors
- `full-dev-workflow` - Complete development workflow
