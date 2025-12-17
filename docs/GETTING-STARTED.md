# Getting Started with Roopik

**Roopik** is an AI-native, canvas-first IDE for frontend development built on a VS Code fork.

---

## Prerequisites

- **Node.js**: 22.20.0 (see [.nvmrc](.nvmrc))
- **Windows**: Visual Studio Build Tools 2022 with Spectre libraries
- **macOS**: Xcode Command Line Tools
- **Linux**: build-essential, libx11-dev, libxkbfile-dev

---

## Quick Start

### 1. Install Dependencies (~5-10 min)

```bash
npm install
```

### 2. Build Roopik (~6-10 min)

```bash
# One-time build
npm run compile

# Or watch mode for development
npm run watch
```

### 3. Launch Roopik

**Windows**:
```bash
.\scripts\code.bat
```

**macOS/Linux**:
```bash
./scripts/code.sh
```

**Estimated first-time setup**: 15-20 minutes total

---

## Development Workflow

### Watch Mode (Recommended)

Run these in separate terminals for live reload:

```bash
# Terminal 1: Watch core changes
npm run watch-client

# Terminal 2: Watch extension changes
npm run watch-extensions

# Terminal 3: Launch Roopik
.\scripts\code.bat  # Windows
./scripts/code.sh   # macOS/Linux
```

### Build Commands

- `npm run compile` - Build everything once
- `npm run watch` - Watch both core and extensions
- `npm run watch-client` - Watch VS Code core only
- `npm run watch-extensions` - Watch extensions only

---

## Project Structure

```
roopik/
├── extensions/roopik/       # Our custom IDE code
├── src/                     # VS Code core (mostly unchanged)
├── out/                     # Compiled output
├── scripts/                 # Launch scripts
├── .nvmrc                   # Node.js version
├── .npmrc                   # Electron build config
└── CLAUDE.md                # AI context & architecture
```

---

## Git Workflow

### Branches

- `main` - Production-ready, protected
- `develop` - Active development
- `feature/*` - Feature branches
- `rebase/*` - Upstream VS Code syncs

### Example Workflow

```bash
# Create feature branch
git checkout develop
git checkout -b feature/canvas-zoom

# Work and commit
git add .
git commit -m "feat(canvas): add zoom controls"

# Merge back to develop
git checkout develop
git merge feature/canvas-zoom
git push
```

---

## Upstream Sync (VS Code Updates)

### Monthly Rebase from VS Code

```bash
# Add upstream (first time only)
git remote add upstream https://github.com/microsoft/vscode.git

# Sync with latest VS Code
git fetch upstream
git checkout -b rebase/vscode-1.108.0
git merge upstream/main

# Resolve conflicts, test build
npm run compile
.\scripts\code.bat

# Merge to develop
git checkout develop
git merge rebase/vscode-1.108.0
```

**Tag core modifications** with `// ROOPIK:` for easy conflict resolution.

See [docs/upstream/sync-strategy.md](docs/upstream/sync-strategy.md) for details.

---

## Troubleshooting

### Build fails after antivirus interference

Rebuild native modules:
```bash
cd node_modules/@vscode/policy-watcher
npx node-gyp rebuild --target=39.1.2 --dist-url=https://electronjs.org/headers
```

See [docs/challenges/README.md](docs/challenges/README.md) for common issues.

---

## Documentation

- [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md) - Full 48-week implementation plan
- [docs/upstream/sync-strategy.md](docs/upstream/sync-strategy.md) - VS Code sync strategy
- [docs/challenges/README.md](docs/challenges/README.md) - Common problems & solutions

---

## Next Steps

1. ✅ Install dependencies
2. ✅ Build Roopik
3. ✅ Launch and verify it works
4. → Start implementing Week 1 tasks (see [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md))

**Let's revolutionize frontend development!** 🚀
