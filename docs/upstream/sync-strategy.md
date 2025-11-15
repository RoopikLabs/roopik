# VS Code Upstream Sync Strategy

**Last Updated**: November 14, 2025
**Current VS Code Version**: 1.107.0
**Next Sync Target**: TBD

---

## Overview

Roopik is a fork of VS Code. We need to regularly sync with upstream to get bug fixes, performance improvements, and new features. This document outlines our strategy.

---

## Sync Frequency

**Recommended**: Monthly (or when critical security fixes are released)

**Process**:
1. Check VS Code releases: https://github.com/microsoft/vscode/releases
2. Test sync on a separate branch first
3. Resolve conflicts
4. Test full build
5. Merge to main

---

## Our Modification Strategy (Inspired by Void)

### Philosophy: Minimal Core Changes

**Goal**: Keep 95%+ of VS Code unchanged so rebasing is easy.

**Where We Make Changes**:

1. **Product Branding** (`product.json`)
   - Already done ✅
   - Change: `nameShort`, `nameLong`, `applicationName`, `dataFolderName`
   - Easy to reapply after rebase

2. **Extension Preloading** (Future, if needed)
   - Location: `src/vs/workbench/services/extensions/`
   - Change: Preload our `roopik` extension by default
   - Tag with `// ROOPIK:` comment

3. **Custom Workbench Parts** (Phase 9, optional)
   - Location: `src/vs/workbench/contrib/canvas/`
   - New directory, no upstream conflicts
   - Register in contribution points

4. **Build Configuration** (as needed)
   - Location: `build/`, `package.json`, `scripts/`
   - Changes: Custom icons, splash screen, packaging
   - Tag with `// ROOPIK:` comment

---

## Tagging Convention (Critical!)

**ALL code changes in VS Code core MUST be tagged with:**

```typescript
// ROOPIK: <description of why this change exists>
// ROOPIK: Example: Preload canvas extension by default
const preloadedExtensions = [
  ...defaultExtensions,
  'roopik.canvas' // ROOPIK: Our custom extension
];
```

**Benefits**:
- Easy to search: `git grep "ROOPIK:"`
- Easy to reapply after rebase
- Documents WHY the change exists

---

## Rebasing Process (Step-by-Step)

### Preparation

1. **Create rebase branch**:
   ```bash
   git checkout -b rebase/vscode-1.108.0
   ```

2. **Add upstream remote** (first time only):
   ```bash
   git remote add upstream https://github.com/microsoft/vscode.git
   git fetch upstream
   ```

3. **Fetch latest VS Code**:
   ```bash
   git fetch upstream
   ```

### Option A: Merge Strategy (Safer, Recommended Initially)

```bash
# Merge upstream changes
git merge upstream/main

# Resolve conflicts (see below)
# Test build
npm run compile

# If successful, merge to main
git checkout main
git merge rebase/vscode-1.108.0
```

**Pros**: Preserves our commit history
**Cons**: Messier history

### Option B: Rebase Strategy (Cleaner, Use Later)

```bash
# Rebase our changes on top of upstream
git rebase upstream/main

# Resolve conflicts (see below)
# Force push to rebase branch
git push origin rebase/vscode-1.108.0 --force

# Test build
npm run compile

# If successful, merge to main
git checkout main
git merge rebase/vscode-1.108.0
```

**Pros**: Clean linear history
**Cons**: Rewrites history (don't do on main!)

---

## Conflict Resolution

### Expected Conflicts

1. **product.json** (Always conflicts)
   - **Resolution**: Always keep our values
   - **Our values**: Roopik branding
   - **Tool**: Manual merge

2. **package.json** (Likely conflicts)
   - **Resolution**: Merge dependencies, keep our scripts
   - **Check**: Ensure our custom scripts preserved
   - **Tool**: Manual merge

3. **Build files** (Occasional conflicts)
   - **Resolution**: Case-by-case
   - **Strategy**: Search for `// ROOPIK:` tags and reapply

4. **Extension preload** (If we implement Phase 9)
   - **Resolution**: Reapply our `// ROOPIK:` tagged changes
   - **Tool**: `git grep "ROOPIK:"`

### Conflict Resolution Workflow

```bash
# 1. Start rebase/merge (conflicts occur)
git merge upstream/main
# or
git rebase upstream/main

# 2. List conflicts
git status

# 3. For each conflict:
# - Open file in VS Code
# - Look for <<<<<<< markers
# - Resolve conflict
# - Search for "ROOPIK:" to reapply our changes
# - Stage file
git add <file>

# 4. Continue
git merge --continue
# or
git rebase --continue

# 5. Test build
npm run compile

# 6. If build fails, check:
# - Did we lose a ROOPIK: tagged change?
# - Did upstream change an API we depend on?
# - Search: git log upstream/main --oneline | grep <relevant keyword>
```

---

## Testing After Rebase

### Checklist

- [ ] `npm install` completes
- [ ] `npm run compile` succeeds
- [ ] `.\scripts\code.bat` launches
- [ ] Product branding correct (title bar, about dialog)
- [ ] Our extension (`extensions/roopik/`) still works
- [ ] No console errors on startup
- [ ] File operations work (open, edit, save)
- [ ] Git integration works

### Regression Testing

Create a test project:
```bash
# docs/upstream/test-project/
# Contains sample .roopik files
# Run through basic workflow after each rebase
```

---

## Avoiding Conflicts (Proactive Strategies)

### 1. Extension-First Architecture

**Principle**: 90% of Roopik lives in `extensions/roopik/`

**Why**: Extensions are outside VS Code core, no rebase conflicts

**What goes in extension**:
- Canvas webview (React app)
- Preview engine (iframe management)
- AI agent (Claude integration)
- Codegen (Canvas → JSX)
- All UI panels (component tree, inspector)

**What stays in core**:
- Product branding (`product.json`)
- Build configuration (only if needed)
- Custom workbench parts (Phase 9, optional)

### 2. Minimal Core Modifications

**Before changing VS Code core, ask**:
1. Can this be done in the extension? (95% yes)
2. Does this absolutely need core access? (5% yes)
3. Will this conflict with upstream updates? (If yes, avoid)

**Example - GOOD**:
```typescript
// In extensions/roopik/src/extension.ts
export function activate(context: vscode.ExtensionContext) {
  // All our code here, no core changes needed
}
```

**Example - BAD (avoid unless necessary)**:
```typescript
// In src/vs/workbench/browser/layout.ts
// ROOPIK: Custom layout modification
this.parts.push(new CanvasPart()); // Conflicts with upstream
```

### 3. Configuration Over Code

**Prefer**: Configuring VS Code via `product.json`, `package.json`
**Avoid**: Modifying core TypeScript files

**Example**:
```json
// product.json
{
  "extensionAllowedProposedApi": [
    "roopik.canvas" // ROOPIK: Our extension uses proposed APIs
  ]
}
```

---

## Tracking Upstream Changes

### Watch These Areas

1. **Extension API changes** (`src/vscode-dts/vscode.d.ts`)
   - Could break our extension
   - Check release notes for `vscode.proposed.*.d.ts` changes

2. **Webview changes** (`src/vs/workbench/contrib/webview/`)
   - Could affect canvas/preview
   - Test webview functionality after rebase

3. **Build system changes** (`build/`, `package.json`)
   - Could break our build scripts
   - Test full build after rebase

4. **Electron version bumps**
   - Could affect native modules
   - Check `package.json` for `electron` version

### Subscribe to VS Code Release Notes

- **URL**: https://code.visualstudio.com/updates
- **Frequency**: Monthly
- **What to check**: Breaking changes, API deprecations, Electron updates

---

## Our Changes Log

### Current Changes (as of Nov 14, 2025)

1. **.gitignore**
   - Added: `CLAUDE.md`, `Self-Learning/`, `COPILOT-INSTRUCTIONS.md`, `docs/`
   - Reason: Keep internal docs out of repo
   - Conflict risk: Low (append-only)

2. **product.json**
   - Changed: All branding fields
   - Reason: Roopik identity
   - Conflict risk: High (always conflicts, easy to resolve)

3. **README.md**
   - Changed: To "🧡 Roopik IDE"
   - Reason: Branding
   - Conflict risk: Low

### Future Changes (Planned)

4. **Extension preloading** (Phase 1, Week 2)
   - Location: `src/vs/workbench/services/extensions/electron-sandbox/extensionService.ts`
   - Change: Preload `roopik.canvas` extension
   - Tag: `// ROOPIK: Preload canvas extension`
   - Conflict risk: Medium

5. **Custom workbench part** (Phase 9, optional)
   - Location: `src/vs/workbench/contrib/canvas/` (new directory)
   - Change: Add `CanvasPart` to workbench layout
   - Tag: All files in this directory are ours
   - Conflict risk: Low (new directory)

---

## Emergency Rollback Plan

**If rebase breaks everything**:

```bash
# 1. Abort rebase/merge
git merge --abort
# or
git rebase --abort

# 2. Return to last known good state
git checkout main
git log --oneline -10 # Find last good commit
git reset --hard <commit-hash>

# 3. Document what went wrong
# Create: docs/upstream/rebase-failures/YYYY-MM-DD.md

# 4. Try again with more careful conflict resolution
```

---

## Void's Approach (For Reference)

### What Void Does

1. **Separate builder repo** (`void-builder`)
   - Forks VSCodium (not VS Code)
   - Uses `.patch` files to apply changes
   - Runs GitHub Actions to build binaries

2. **Patch-based workflow**
   - Generate patch: `git diff > void-changes.patch`
   - Apply patch after rebase: `git apply void-changes.patch`
   - Benefit: Easy to reapply changes

3. **Search-and-replace rebasing**
   - Copy fresh `vscode/` repo
   - Search for "Void" (case-sensitive)
   - Reapply all changes manually
   - Works because changes are minimal and tagged

### Should We Use Void's Approach?

**For Now: NO**

**Reasons**:
- We're just starting, don't need complex build pipeline yet
- Patch-based workflow is overkill for our current changes
- Direct fork is simpler to understand and modify

**Later: MAYBE** (Phase 9+)

**When it makes sense**:
- If we have many core modifications
- If rebasing becomes painful
- If we want automated binary builds
- If we want to track changes as patches

---

## Monthly Sync Checklist

**Before Sync**:
- [ ] Commit all current work
- [ ] Create rebase branch
- [ ] Backup main branch: `git branch backup/pre-rebase-YYYY-MM-DD main`

**During Sync**:
- [ ] Fetch upstream
- [ ] Start merge/rebase
- [ ] Resolve conflicts (check ROOPIK: tags)
- [ ] Test build
- [ ] Test basic functionality

**After Sync**:
- [ ] Update `docs/upstream/sync-log.md` with notes
- [ ] Update version in this file (top)
- [ ] Tag release: `git tag rebase/vscode-1.108.0`
- [ ] Push to origin
- [ ] Delete backup branch (if successful)

---

## Helpful Commands

```bash
# Search for all our changes
git grep "ROOPIK:"

# See what changed in upstream since last sync
git log upstream/main ^main --oneline

# See upstream changes in specific file
git log upstream/main -- src/vs/workbench/browser/layout.ts

# Compare our version to upstream
git diff main upstream/main -- product.json

# Cherry-pick specific upstream commit
git cherry-pick <commit-hash>

# Create patch of our changes
git diff upstream/main > roopik-changes.patch

# Apply patch
git apply roopik-changes.patch
```

---

## Resources

- [VS Code Repository](https://github.com/microsoft/vscode)
- [VS Code Release Notes](https://code.visualstudio.com/updates)
- [VSCodium](https://github.com/VSCodium/vscodium) (for patch reference)
- [Void Builder](https://github.com/voideditor/void-builder) (for inspiration)

---

## Questions/Issues?

Document any sync issues in `docs/upstream/issues/` and we'll address them.
