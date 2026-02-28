# Rebase Repo Guide (Minimal + Editable)

Format used below:
- Step N (branch)
- Command
- Log: what it does

---

## ⚠️ CRITICAL WARNING: Never Import VS Code History

**WRONG (imports 144k+ commits into your repo):**
```bash
git reset --hard upstream/main  # ❌ NEVER DO THIS
git checkout -b branch upstream/main  # ❌ ALSO IMPORTS HISTORY
```

**CORRECT (orphan = files only, no history):**
```bash
git checkout --orphan <branch-name> upstream/main  # ✅ CORRECT
```

The orphan approach gives you VS Code's FILES but creates a fresh branch with NO commit history. This keeps your repo clean and avoids pushing 144k+ commits to origin.

---

## Prerequisites

- **Node.js**: Must match version in `.nvmrc` (currently v22.22.0). Use `nvm install && nvm use`.
- **Python + Pillow**: Required for installer image generation. `pip install Pillow`.
- **Windows**: Run `git config core.longpaths true` to avoid filename-too-long errors.

---

## One-time Setup (run once)

### Step 1 (any branch)
```bash
git remote add upstream https://github.com/microsoft/vscode.git
git remote add roopik https://github.com/RoopikLabs/roopik.git
git remote add roopik-docs https://github.com/RoopikLabs/RoopikDocs.git
```
Log: Adds the three fetch-only sources (VS Code + Roopik + Roopik Docs).

### Step 2 (any branch)
```bash
git remote set-url --push upstream DISABLE
git remote set-url --push roopik DISABLE
git remote set-url --push roopik-docs DISABLE
git remote -v
```
Log: Makes upstream/roopik/roopik-docs impossible to push to (safety).

### Step 3 (any branch)
```bash
git config remote.upstream.fetch "+refs/heads/main:refs/remotes/upstream/main"
git config remote.roopik.fetch "+refs/heads/develop:refs/remotes/roopik/develop"
git config remote.roopik-docs.fetch "+refs/heads/main:refs/remotes/roopik-docs/main"
```
Log: Fetches ONLY the 1 branch you care about from each remote.

### Step 4 (any branch)
```bash
git fetch --depth=1 upstream
git fetch --depth=1 roopik
git fetch --depth=1 roopik-docs
```
Log: Shallow fetch (minimal history). Still gets latest code.

### Step 5 (creates local work branch - USE ORPHAN!)
```bash
git checkout --orphan vscode-snapshot upstream/main
git reset
git add -A
git commit --no-verify -m "Snapshot: VS Code latest (files only, no history)"
```
Log: Creates orphan branch with VS Code files but NO history. Never use `git checkout -b` with upstream - that imports history!

### Step 6 (on vscode-snapshot)
```bash
git config remote.pushDefault origin
```
Log: Ensures push targets origin by default.

---
---

## Repeatable Sync Cycle (every time)

### Step 1 (any branch)
```bash
git fetch --depth=1 upstream
```
Log: Fetch latest VS Code (shallow, no full history).

### Step 2 (creates fresh orphan branch)
```bash
git checkout --orphan vscode-snapshot upstream/main
git reset
git add -A
git commit --no-verify -m "Snapshot: VS Code latest (files only, no history)"
```
Log: Creates orphan branch with VS Code FILES but NO history. This is the correct way to get VS Code code without importing 144k+ commits.

### Step 3 (on vscode-snapshot)
```bash
git fetch --depth=1 roopik-docs
git checkout roopik-docs/main -- docs/UPDATE_REBASE
```
Log: Pulls the branding/sync scripts from RoopikDocs repo.

### Step 4 (on vscode-snapshot)
```bash
git add -A
git commit --no-verify -m "chore: add docs/UPDATE_REBASE from roopik-docs"
```
Log: Commits the docs (isolated commit for easy rollback).

### Step 5 (on vscode-snapshot)
```bash
git fetch --depth=1 roopik
GIT_LFS_SKIP_SMUDGE=1 git checkout roopik/develop -- extensions/roopik extensions/roopik-roo src/vs/workbench/contrib/roopik tools/roopik
```
Log: Pulls your Roopik extensions, workbench contrib, and tools (MCP STDIO server) from the Roopik repo. Skips LFS to avoid missing asset errors.

### Step 6 (on vscode-snapshot)
```bash
git add -A
git commit --no-verify -m "feat: restore Roopik extension and workbench contribution folders"
```
Log: Commits the restored Roopik code (isolated commit).

### Step 7 (on vscode-snapshot)
```bash
GIT_LFS_SKIP_SMUDGE=1 git checkout roopik/develop -- .github
git add .github
git commit --no-verify -m "chore: replace .github with Roopik build workflows"
```
Log: Replaces VS Code's GitHub Actions with Roopik's build workflows (build-windows, build-linux, build-macos, etc.).

### Step 8 (on vscode-snapshot)
```bash
node docs/UPDATE_REBASE/apply-branding.js
```
Log: Applies branding automation including:
- product.json and package.json updates
- Icon replacements (Windows, macOS, Linux, PWA)
- Installer images (BMP files for Inno Setup, requires Python + Pillow)
- Build configuration (gulpfile, eslint, hygiene, dirs.ts)
- Core integration (workbench, CSP, titlebar)
- Dependencies installation
- Patches (app.ts, AppX disable, macOS keychain, settings layout)
- Devtools extensions extraction
- MCP binaries in gulpfile.vscode.ts
- Adds extensions/roopik and extensions/roopik-roo to build/npm/dirs.ts
- Build scripts copy (e.g., generateDOMWhitelist.mjs → build/scripts/)

### Step 9 (on vscode-snapshot)
```bash
git add -A
git commit --no-verify -m "chore: apply Roopik branding"
```
Log: Commits the branding changes (isolated commit).

### Step 10 — Install dependencies (on vscode-snapshot)
```bash
npm install
cd extensions/roopik-roo && npm install && cd ../..
```
Log: Installs all VS Code + extension dependencies. The root `npm install` covers dirs.ts entries. roopik-roo needs a separate install for its postinstall (builds packages/types and packages/build).

### Step 11 — Build verification (on vscode-snapshot)
```bash
npm run compile
```
Log: Compiles VS Code + all extensions. Fix any errors before pushing.

### Step 12 (push to origin for reference)
```bash
git push -u origin vscode-snapshot --force
```
Log: Push snapshot to origin (reference/diff repo).

### Step 13 (push to roopik repo for CI)
```bash
git remote set-url --push roopik https://github.com/RoopikLabs/roopik.git
git push roopik vscode-snapshot:rebase/vscode-snapshot
git remote set-url --push roopik DISABLE
```
Log: Pushes rebase branch to the main Roopik repo for GitHub Actions CI verification. Re-disables push after.
