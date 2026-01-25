# Roo Code Evaluations - Quick Start Guide

## Prerequisites

1. Start Docker services:
```bash
cd packages/evals
docker compose up -d db redis
```

## Running Evaluations

### Option 1: CLI - Run All Tests

```bash
cd packages/evals
pnpm cli --ci
```

### Option 2: CLI - Run Single Test

Run a specific exercise:
```bash
cd packages/evals
pnpm cli --language go --exercise alphametics
```

Run limited tests per language:
```bash
cd packages/evals
pnpm cli --language go --exercises-per-language 1
```

### Option 3: Web UI (Recommended)

Start the web interface:
```bash
cd apps/web-evals
pnpm dev
```

Then open: `http://localhost:3446`

The Web UI allows you to:
- Select specific tests to run
- Monitor progress in real-time
- Control execution pace
- Review results visually

## Configuration

### Model Selection

Edit `packages/evals/src/cli/runCi.ts`:

```typescript
settings: {
  apiProvider: "openrouter",
  openRouterModelId: "google/gemini-2.0-flash-exp:free",  // Free!
  // or: "google/gemini-pro-1.5"  // Better quality, still cheap
  // or: "anthropic/claude-sonnet-4"  // Expensive but best
}
```

### API Keys

Edit `packages/evals/.env.local`:
```env
OPENROUTER_API_KEY=your_key_here
HOST_EXECUTION_METHOD=cli
```

## Rate Limits

**Free Gemini**: ~10 requests/minute
- Solution: Use Web UI to control pace
- Or: Reduce concurrency in `runCi.ts`

**Paid Models**: Much higher limits
- Gemini Pro: ~60 requests/minute
- Claude: ~50 requests/minute

## Troubleshooting

### Database not running
```bash
docker compose up -d db redis
```

### Ripgrep error
```bash
node node_modules/@vscode/ripgrep/lib/postinstall.js
```

### Extension bundle missing
```bash
pnpm bundle
```

## Cost Estimates

Per evaluation task:
- **Gemini 2.0 Flash (free)**: $0.00
- **Gemini 1.5 Pro**: ~$0.30
- **Claude Sonnet 4**: ~$3-5

Full test suite (25 tasks):
- **Gemini Flash**: $0 (but rate limited)
- **Gemini Pro**: ~$7.50
- **Claude**: ~$75-125
