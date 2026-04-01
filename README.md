# Roopik IDE

A canvas-first, agentic IDE. Preview live components, run full projects end-to-end — AI agents that code, browse, test, and ship autonomously across multiple projects at once.

[ROOPIK](https://roopik.com)

## Features

### Canvas Mode
Design UI components across React, Vue, Svelte, Solid, and Preact without writing a single line of code. Multiple components render side-by-side in isolated sandboxes.

### Project Mode
Run your full project inside the IDE with a built-in browser. Inspect elements live, click any element to jump to its source code, edit it, and see changes instantly.

### Multi-Tab Browser + External Chrome
The embedded browser supports multiple tabs with full agentic control. Agents can open, navigate, screenshot, and interact with different sites in parallel. External Chrome mode connects to a real Chrome instance via CDP for full browser access.

### Multi-Agent Support
Spin up multiple coding agents that all run simultaneously:
- **Dio** (built-in agent, built on Roo Code open source)
- **Claude Code** (extension + CLI via MCP)
- **OpenAI Codex** (extension + CLI via MCP)
- **Cursor** (via MCP)

No manual setup needed — the IDE auto-registers and connects to these tools via MCP.

## Download

Available at [roopik.com](https://roopik.com)

## Building from Source

### Prerequisites
- Node.js (see `.nvmrc` for version)
- Python 3.11+
- Git

### Build Steps

```bash
# Install dependencies
npm install

# Build
npm run gulp vscode-win32-x64      # Windows
npm run gulp vscode-darwin-arm64    # macOS ARM
npm run gulp vscode-linux-x64      # Linux

# Watch (development)
npm run watch
```

## Privacy Policy

This program does not collect or transfer any user data to external systems unless specifically requested by the user. Telemetry features inherited from upstream dependencies are disabled by default and can be manually controlled in settings.

## Acknowledgements

Built on [Visual Studio Code](https://github.com/microsoft/vscode) (MIT) and [Roo Code](https://github.com/RooCodeInc/Roo-Code) (Apache 2.0).

## License

Copyright (c) 2025 - present Roopik Labs. Licensed under the [MIT License](LICENSE).
