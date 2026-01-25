# Running Individual Evals on Windows

The Web UI has issues on Windows. **Use the CLI directly** - it's simpler and works perfectly!

## Run a Single Exercise

```bash
cd packages/evals
pnpm cli --language go --exercise alphametics
```

## Run Multiple Exercises from One Language

```bash
cd packages/evals
pnpm cli --language go --exercises-per-language 3
```

## Run All Go Exercises

```bash
cd packages/evals
pnpm cli --language go
```

## Run All Exercises (Full Suite)

```bash
cd packages/evals
pnpm cli --ci
```

## Monitor Progress

The CLI will show real-time output including:
- Which exercise is running
- Tool calls being made
- Files being edited
- Test results
- Token usage and cost

## Control Rate Limits

To avoid hitting Gemini's free tier rate limits:

**Option 1: Run exercises one at a time**
```bash
pnpm cli --language go --exercise alphametics
# Wait for it to finish, then run the next one
pnpm cli --language go --exercise bowling
```

**Option 2: Add delays between exercises**
Edit `packages/evals/src/cli/runCi.ts` and add a delay in the task loop.

**Option 3: Use a paid model**
Edit `packages/evals/src/cli/runCi.ts`:
```typescript
settings: {
  apiProvider: "openrouter",
  openRouterModelId: "google/gemini-pro-1.5",  // Higher rate limits
}
```

## View Results

Results are stored in the database. To view them:

```bash
cd packages/evals
pnpm cli --list-runs  # If this command exists
```

Or query the database directly:
```bash
docker exec -it evals-db psql -U postgres -d evals_development -c "SELECT * FROM runs ORDER BY created_at DESC LIMIT 10;"
```

## Summary

**✅ DO**: Use CLI commands directly
**❌ DON'T**: Use the Web UI on Windows (it's configured for Docker/Linux)

The CLI is faster, simpler, and shows you exactly what's happening in real-time!
