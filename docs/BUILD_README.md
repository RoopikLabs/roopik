# Build Guide

## Commands

| Command | Cleans? | Watches? | Time |
|---------|---------|----------|------|
| `npm run watch` | YES | YES | ~10 min start |
| `npm run watch-client` | YES | YES | ~10 min start |
| `npm run compile` | YES | NO | ~10 min |
| `npm run compile-build` | YES | NO | ~10 min |
| `npm run compile-extensions` | YES | NO | ~1-2 min |
| `npx tsc -p src/tsconfig.json --incremental` | NO | NO | ~30 sec |
| `npx tsc -p src/tsconfig.json --incremental --watch` | NO | YES | ~1 sec/change |

## Daily Development (Project Already Built)

### Watch Without Cleaning (Best Option)

```bash
npx tsc -p src/tsconfig.json --incremental --watch
```

- Does NOT clean old build
- Watches for changes
- Rebuilds only changed files (~1-2 sec)

### One-Shot Build Without Cleaning

```bash
npx tsc -p src/tsconfig.json --incremental
```

### Launch VSCode

```bash
.\scripts\code.bat
```

## When to Use What

| Situation | Command |
|-----------|---------|
| Project built, want to watch | `npx tsc -p src/tsconfig.json --incremental --watch` |
| Project built, quick one-shot | `npx tsc -p src/tsconfig.json --incremental` |
| Fresh start / corrupted build | `npm run compile` |

## The Truth

**ALL npm run commands clean first!**

Only `npx tsc` with `--incremental` preserves the old build.
