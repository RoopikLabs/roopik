# Roopik Documentation

Welcome to the Roopik documentation! This directory contains all project documentation, technical decisions, and progress tracking.

## Directory Structure

```
docs/
├── README.md (this file)
├── decisions/ - Architecture Decision Records (ADRs)
├── challenges/ - Problems encountered and solutions
├── upstream/ - VS Code sync notes and conflicts
├── architecture/ - Technical architecture docs
└── guides/ - Development guides
```

## Quick Links

- [PROJECT_ROADMAP.md](../PROJECT_ROADMAP.md) - Full implementation plan
- [Development Setup](guides/01-development-setup.md)
- [Upstream Sync Strategy](upstream/sync-strategy.md)

## How to Use


### Documenting Decisions
When making important architectural decisions:
```bash
# Create new ADR: docs/decisions/001-webview-architecture.md
```

### Recording Challenges
When you encounter and solve a problem:
```bash
# Create challenge log: docs/challenges/build-system-windows.md
```

## Documentation Standards

- Use Markdown for all docs
- Include date on all entries
- Reference code with file paths and line numbers
- Include code examples where relevant
- Update this README when adding new docs
