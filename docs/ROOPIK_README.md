# 🧡 Roopik IDE

**AI-Native, Canvas-First IDE for Frontend Development**

---

## What is Roopik?

Roopik is a revolutionary IDE that fuses **Figma's canvas**, **Cursor's AI**, and **VS Code's power** into one seamless experience. Design and code become one.

**Vision**: Where designers code and developers design.

---

## Quick Links

📖 **[Getting Started](GETTING-STARTED.md)** - Start here! Complete setup guide
📋 **[Project Roadmap](PROJECT_ROADMAP.md)** - Full 48-week implementation plan
🔧 **[Project Management](docs/PROJECT-MANAGEMENT.md)** - How to manage the project
🌿 **[Git Strategy](docs/git-strategy.md)** - Branching and workflow
🔄 **[Upstream Sync](docs/upstream/sync-strategy.md)** - VS Code sync strategy

---

## Features (Planned)

- **🎨 Infinite Canvas** - Design UI components visually like Figma
- **⚡ Live Preview** - See components render in real-time with HMR
- **🤖 AI-Powered** - Claude-driven design-to-code generation
- **🔄 Bidirectional Sync** - Edit canvas or code, both stay in sync
- **🎭 Component Variants** - Like Figma variants, but with live code
- **🚀 Multi-Framework** - React, Vue, Svelte support (React first)

---

## Project Status

**Current Phase**: Planning Complete ✅
**Implementation**: Not Started
**Timeline**: 48-56 weeks
**Progress**: See [docs/progress/](docs/progress/)

---

## Architecture

```
VS Code Fork (Electron)
    ↓
Custom Extension (extensions/roopik/)
    ├── Canvas Webview (React + Infinite Canvas)
    ├── Preview Engine (esbuild + iframe sandboxes)
    ├── AI Agent System (Claude API + tools)
    ├── Codegen (Canvas JSON → JSX)
    └── Sync Engine (Code ↔ Canvas bidirectional)
```

**Design Philosophy**:
- 🎯 Canvas is source of truth for structure
- 🧠 AI thinks in tools, not raw code
- ⚡ Preview is sacred (60fps, isolated, HMR)
- 🔄 Sync is bidirectional (code ↔ canvas)

---

## Documentation

```
docs/
├── PROJECT-MANAGEMENT.md       # Project management guide
├── git-strategy.md             # Git workflow & branching
├── decisions/                  # Architecture Decision Records
├── progress/                   # Weekly progress logs
├── challenges/                 # Problems & solutions
├── upstream/                   # VS Code sync documentation
└── guides/                     # Development guides
```

---

## Getting Started

### Prerequisites

- **Node.js**: 18+
- **npm** or **yarn**
- **Git**
- **Windows/Mac/Linux**: Cross-platform support

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/RoopikLabs/roopik.git
cd roopik

# 2. Install dependencies
npm install

# 3. Build VS Code core
npm run watch-client

# 4. Launch development instance
.\scripts\code.bat  # Windows
./scripts/code.sh   # Mac/Linux
```

**Full guide**: [GETTING-STARTED.md](GETTING-STARTED.md)

---

## Development

### Daily Workflow

```bash
# Terminal 1: Watch core
npm run watch-client

# Terminal 2: Watch extensions
npm run watch-extensions

# Terminal 3: Run IDE
.\scripts\code.bat
```

### Creating a Feature

```bash
git checkout develop
git checkout -b feature/my-feature
# ... work ...
git commit -m "feat(canvas): my feature"
git push -u origin feature/my-feature
# Create PR on GitHub
```

**Full guide**: [docs/git-strategy.md](docs/git-strategy.md)

---

## Contributing

We're building in the open! Key principles:

1. **Canvas is law** - Structural changes go through canvas JSON
2. **AI outputs tools** - Never raw code
3. **Preview is fast** - Optimize for instant feedback
4. **Code is clean** - Generated code should be production-ready
5. **Users never lose work** - Auto-save, version control, undo/redo

**Contribution guide**: Coming soon

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Editor** | VS Code (Electron), Monaco Editor |
| **Extension** | TypeScript, Node.js, VS Code API |
| **Canvas** | React, Vite, Tailwind CSS, Zustand |
| **Preview** | esbuild/Vite, iframe sandboxes, HMR |
| **AI** | Claude API, structured tool outputs |
| **Codegen** | Babel AST, Prettier, TypeScript |
| **Storage** | JSON files, Git integration |

---

## Inspiration

- **Cursor** - AI-native coding IDE
- **Figma** - Visual design tool
- **Fiddle** - Canvas-first component tool (the startup that inspired this)
- **Framer** - Design-to-code tool
- **Builder.io** - Visual development platform

**Our Differentiator**: First IDE where AI designs AND codes simultaneously.

---

## Upstream Sync

Roopik is a fork of [VS Code](https://github.com/microsoft/vscode). We sync monthly to get bug fixes and features.

**Strategy**: Extension-first architecture (90%+ in `extensions/roopik/`)

**Full guide**: [docs/upstream/sync-strategy.md](docs/upstream/sync-strategy.md)

---

## License

MIT License - See [LICENSE](LICENSE) for details

(Note: VS Code is also MIT licensed)

---

## Community

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and ideas
- **Discord**: Coming soon

---

## Acknowledgments

- **Microsoft**: For VS Code
- **Anthropic**: For Claude API
- **Cursor Team**: For proving AI-native IDEs work
- **Fiddle Team**: For the inspiration
- **Void Editor**: For upstream sync inspiration

---

## Roadmap

**Phase 1** (Weeks 1-4): Foundation ✅ Planned
**Phase 2** (Weeks 5-10): Canvas Engine
**Phase 3** (Weeks 11-14): Component System
**Phase 4** (Weeks 15-20): Preview Engine
**Phase 5** (Weeks 21-28): Code ↔ Canvas Sync
**Phase 6** (Weeks 29-36): AI Agent System
**Phase 7** (Weeks 37-40): Variant System
**Phase 8** (Weeks 41-48): Advanced Features
**Phase 9** (Weeks 49-56): Core Integration (Optional)

**Full roadmap**: [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md)

---

## Status Badges (Coming Soon)

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)]()

---

**Let's build the future of frontend development. 🚀**

---

*Last updated: November 14, 2025*
