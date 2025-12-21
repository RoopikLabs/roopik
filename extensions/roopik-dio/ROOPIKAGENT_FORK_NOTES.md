# RoopikAgent – Roo Code Fork Notes

Short summary of how this fork differs from upstream Roo Code (`RooCodeInc/Roo-Code`). Use this as a checklist when rebasing or updating from upstream.

## 1. Removed from upstream clone

From `extensions/roopik-dio/` root we **deleted**:

- `.git/` – upstream repo metadata (we track history in Roopik repo instead)
- `.husky/` – upstream git hooks
- `.changeset/` – upstream release/versioning metadata
- `releases/` – marketing screenshots for Roo
- `apps/web-roo-code/` – Roo public marketing/docs website

We **kept** (for now):

- `apps/vscode-e2e/` – VS Code E2E tests
- `apps/web-evals/` – evals dashboard (optional tooling)

## 2. Localization simplification

In `extensions/roopik-dio/src/`:

- **Kept**: `package.json`, `package.nls.json` (base English)
- **Deleted**: all language-specific `package.nls.<lang>.json` files:
  - `package.nls.ca.json`, `de`, `es`, `fr`, `hi`, `id`, `it`, `ja`, `ko`, `pl`, `pt-BR`, `ru`, `tr`, `vi`, `zh-CN`, `zh-TW`

The built `dist/i18n/locales/*` are still present; this change only affects manifest/localized string files.

## 3. Root package.json tweak (workspace root inside fork)

File: `extensions/roopik-dio/package.json`

- **Added**:
  - `"version": "0.0.0-dev"` at the top level (Roopik’s extension loader expects `version` on any `package.json` under `extensions/*`).

All other fields (scripts, devDependencies, pnpm overrides) are unchanged from upstream.

## 4. Dev docs added

Added two docs to the fork root:

- `ROOPIKAGENT_DEV_SETUP.md` – how to:
  - enable `pnpm` via corepack
  - install deps with `pnpm install`
  - build webview + extension:
    - `pnpm --filter @roo-code/vscode-webview build`
    - `pnpm --filter roo-cline bundle`
  - run Roopik with the extension in dev mode:
    - `scripts\code.bat --extensionDevelopmentPath=...\extensions\roopik-dio\src`

- `ROOPIKAGENT_FORK_NOTES.md` (this file) – summary of structural edits.

## 5. Env file for local dev

Upstream expects an env file for the extension:

- **New file (manual)**: `extensions/roopik-dio/src/.env`
  - Created by copying from upstream `.env.sample` in the fork root and adjusting values as needed.
  - Used for provider keys / telemetry; may be further customized or disabled as Roopik integrates its own config.

---

When updating from upstream Roo Code:

1. Reapply deletions in section 1 if those folders reappear.
2. Re-delete extra `package.nls.*.json` files if reintroduced.
3. Ensure `extensions/roopik-dio/package.json` still has a `version` field.
4. Keep `ROOPIKAGENT_*` docs at the fork root for Roopik-specific usage.
