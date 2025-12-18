git status -sb
# Rebase Repo Guide (Minimal + Editable)

Format used below:
- Step N (branch)
- Command
- Log: what it does

---

## One-time Setup (run once)

### Step 1 (any branch)
```bash
git remote add upstream https://github.com/microsoft/vscode.git
git remote add roopik https://github.com/RoopikLabs/roopik.git
```
Log: Adds the two fetch-only sources (VS Code + Roopik).

### Step 2 (any branch)
```bash
git remote set-url --push upstream DISABLE
git remote set-url --push roopik DISABLE
git remote -v
```
Log: Makes upstream/roopik impossible to push to (safety).

### Step 3 (any branch)
```bash
git config remote.upstream.fetch "+refs/heads/main:refs/remotes/upstream/main"
git config remote.roopik.fetch "+refs/heads/develop:refs/remotes/roopik/develop"
```
Log: Fetches ONLY the 1 branch you care about from each remote.

### Step 4 (any branch)
```bash
git fetch --depth=1 upstream
git fetch --depth=1 roopik
```
Log: Shallow fetch (minimal history). Still gets latest code.

### Step 5 (creates local work branch)
```bash
git checkout -b rebase-clean upstream/main
```
Log: Creates your local “rebase work” branch from VS Code latest.

### Step 6 (on rebase-clean)
```bash
git config remote.pushDefault origin
git config branch.rebase-clean.remote origin
git config branch.rebase-clean.merge refs/heads/rebase-clean
```
Log: Ensures VS Code UI does NOT suggest “Push upstream/main”; pushes target origin.

---
---

## Repeatable Sync Cycle (every time)

### Step 1 (on rebase-clean)
```bash
git checkout rebase-clean
```
Log: You always do the sync on this branch.

### Step 2 (on rebase-clean)
```bash
git fetch --depth=1 upstream
git reset --hard upstream/main
```
Log: Updates your working tree to latest VS Code code.

### Step 3 (on rebase-clean)
```bash
git fetch --depth=1 roopik
git checkout roopik/develop -- docs branding extensions/roopik src/vs/workbench/contrib/roopik
```
Log: Pulls your Roopik folders from the Roopik repo into this rebase repo.

### Step 4 (on rebase-clean, optional)
```bash
node docs/UPDATE_REBASE/apply-branding.js
```
Log: Applies branding automation (if you use it).

### Step 5 (on rebase-clean)
```bash
git status -sb
git add -A
git commit --no-verify -m "Sync upstream + restore Roopik"
```
Log: Commits the synced state (bypasses lint hooks).

### Step 6 (push)

Pick ONE push style:

**A) Normal push (keeps history in this repo)**
```bash
git push -u origin rebase-clean
```
Log: Pushes the branch with whatever history it currently has.

**B) Code-only push (NO VS Code history on origin)**
```bash
git checkout --orphan snapshot
git add -A
git commit --no-verify -m "Snapshot: upstream + roopik"
git push -u origin snapshot --force
```
Log: Pushes a single-commit snapshot branch (no upstream history chain).
