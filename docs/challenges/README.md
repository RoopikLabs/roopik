# Challenges & Solutions

This directory contains detailed documentation of problems we encountered and how we solved them.

## Purpose

When you hit a problem that takes significant time and efforts and specific hacks to solve, document it here so we:
- Remember the solution if it happens again
- Help future contributors who hit the same issue
- Build a knowledge base of common problems

## Format

Each challenge gets its own file: `challenge-name.md`

### Template

```markdown
# Challenge: [Brief Title]

**Date Encountered**: YYYY-MM-DD
**Phase**: [Which phase of project]
**Status**: [Solved / Workaround / Unsolved]

---

## Problem Description

[Clear description of what went wrong]

### Symptoms
- Symptom 1
- Symptom 2

### Error Messages
```
[Paste exact error messages]
```

### Environment
- OS: Windows/Mac/Linux
- Node version: X.X.X
- VS Code version: X.X.X
- Other relevant info

---

## Attempted Solutions

### Attempt 1: [What we tried]
**Result**: [Didn't work / Partial fix / Worked]
**Why it failed**: [Explanation]

### Attempt 2: [What we tried]
...

---

## Solution

[Detailed explanation of what fixed it]

### Steps
1. Step 1
2. Step 2
3. Step 3

### Code Changes
```typescript
// Before
...

// After
...
```

### Verification
How we verified the fix works:
- Test 1
- Test 2

---

## Root Cause

[What was the underlying cause?]

---

## Prevention

How to avoid this in the future:
- Prevention measure 1
- Prevention measure 2

---

## Related Issues

- Related challenge: [Link]
- GitHub issue: [Link if applicable]
- Stack Overflow: [Link if we found help there]

---

## References

- Documentation link
- Blog post that helped
- Expert who helped
```

## Index

| Challenge | Status | Date |
|-----------|--------|------|
| Native module binding error after antivirus interruption | Solved | 2025-11-15 |

### Native Module Binding Error (2025-11-15)

**Problem**: VS Code failed to launch with "Could not locate the bindings file" error for `@vscode/policy-watcher` after antivirus interrupted the build process.

**Solution**: Rebuild the native module for Electron target:
```bash
cd node_modules/@vscode/policy-watcher
npx node-gyp rebuild --target=39.1.2 --dist-url=https://electronjs.org/headers
```

**Root Cause**: Antivirus interruption during npm install left native modules compiled for wrong Node version instead of Electron runtime.

## Common Challenge Categories

Organize challenges by category:

### Build System
- `build-npm-install-fails.md`
- `build-compilation-errors.md`
- `build-windows-specific.md`

### Extension Development
- `extension-not-loading.md`
- `webview-not-rendering.md`
- `postmessage-communication-failing.md`

### Canvas Performance
- `canvas-fps-drops.md`
- `canvas-memory-leak.md`
- `canvas-transform-math-issues.md`

### Preview Engine
- `iframe-sandbox-csp-errors.md`
- `esbuild-bundling-fails.md`
- `hmr-not-updating.md`

### Code Sync
- `ast-parsing-edge-cases.md`
- `sync-infinite-loop.md`
- `conflict-resolution-bugs.md`

### AI Integration
- `claude-api-timeout.md`
- `tool-call-parsing-errors.md`
- `context-exceeds-token-limit.md`

### Upstream Sync
- `rebase-conflicts.md`
- `upstream-api-breaking-changes.md`
- `build-broken-after-sync.md`

## Tips for Documenting

1. **Be Specific**: Include exact error messages, stack traces
2. **Be Complete**: Document environment, versions, steps to reproduce
3. **Be Clear**: Write for someone who hasn't seen the problem
4. **Be Helpful**: Include what didn't work (saves others time)
5. **Be Timely**: Document while it's fresh in your mind
