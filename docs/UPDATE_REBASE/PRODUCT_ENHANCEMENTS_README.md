# Product Enhancements System

## Overview

The `product-enhancements.json` file contains additional fields that should be added or updated in `product.json` during the branding process. This separates **data** (what to add) from **logic** (how to add it), making it easy to maintain and update.

## How It Works

1. **`product-enhancements.json`** - Contains all the fields you want to add/update in `product.json`
2. **`apply-branding.js`** - Reads this file and merges the fields into `product.json`

### Execution Flow

```
apply-branding.js
  ↓
  1. updateProductJson(config)        ← Applies basic branding from branding-config.json
  ↓
  2. applyProductEnhancements()       ← Applies enhancements from product-enhancements.json
  ↓
  3. Continue with other updates...
```

## Adding New Enhancements

To add new fields to `product.json`, simply edit `product-enhancements.json`:

### Example: Adding a New Field

```json
{
  "myNewField": "myValue",
  "myNewArray": ["item1", "item2"],
  "myNewObject": {
    "nested": "value"
  }
}
```

Then run:
```bash
node docs/UPDATE_REBASE/apply-branding.js
```

The script will automatically:
- ✅ Add new fields that don't exist
- ✅ Update existing fields with new values
- ✅ Deep merge objects (preserves existing nested fields)
- ✅ Replace arrays entirely
- ✅ Report what was added/updated

## Merge Behavior

### Arrays
Arrays are **replaced entirely**:
```json
// Before
"myArray": ["old1", "old2"]

// Enhancement
"myArray": ["new1", "new2", "new3"]

// After
"myArray": ["new1", "new2", "new3"]  ← Completely replaced
```

### Objects
Objects are **deep merged**:
```json
// Before
"myObject": {
  "existing": "value",
  "nested": { "old": "data" }
}

// Enhancement
"myObject": {
  "new": "field",
  "nested": { "new": "data" }
}

// After
"myObject": {
  "existing": "value",      ← Preserved
  "new": "field",           ← Added
  "nested": {
    "old": "data",          ← Preserved
    "new": "data"           ← Added
  }
}
```

### Primitives
Primitives (strings, numbers, booleans) are **replaced**:
```json
// Before
"quality": "insider"

// Enhancement
"quality": "stable"

// After
"quality": "stable"  ← Replaced
```

## Current Enhancements

The `product-enhancements.json` file currently includes:

### 🔴 Critical (Core Functionality)
- `languageExtensionTips` - Popular language extensions shown in "Get Started"
- `configBasedExtensionTips` - Smart extension suggestions based on workspace files
- `exeBasedExtensionTips` - Extension suggestions based on installed software
- `commonlyUsedSettings` - Prioritized settings in Settings UI

### 🟡 Important (Security & UX)
- `crashReporter` - Crash reporting configuration
- `extensionAllowedBadgeProviders` - Whitelist of badge domains
- `extensionAllowedBadgeProvidersRegex` - Regex patterns for badge providers
- `extensionPublisherOrgs` - Trusted publisher organizations
- `trustedExtensionPublishers` - Auto-trusted publishers

### 🟢 Nice to Have (Polish)
- `aiGeneratedWorkspaceTrust` - Custom trust dialog for AI-generated workspaces
- `extensionUntrustedWorkspaceSupport` - Extensions allowed in untrusted workspaces
- `commandPaletteSuggestedCommandIds` - Commands shown at top of command palette

## Updating from VS Code

When VS Code adds new fields to their `product.json`:

1. Check `docs/productjson/vs-code-final-product.json` (latest VS Code build)
2. Copy relevant fields to `product-enhancements.json`
3. Customize values for Roopik (e.g., change URLs, branding)
4. Run `apply-branding.js`

## Best Practices

### ✅ DO:
- Add generic, reusable fields (e.g., extension recommendations)
- Use this for fields that are the same across all VS Code forks
- Document why you're adding each field (use comments in this README)
- Test after adding new fields

### ❌ DON'T:
- Add Roopik-specific branding (use `branding-config.json` instead)
- Add fields that change per build (e.g., `commit` - use GitHub Actions)
- Add Microsoft/Google-specific fields (e.g., `aiConfig.ariaKey`)

## Separation of Concerns

| File | Purpose | Example Fields |
|------|---------|----------------|
| `branding-config.json` | **Branding** - Roopik-specific names, IDs, URLs | `nameShort`, `applicationName`, `reportIssueUrl` |
| `product-enhancements.json` | **Enhancements** - Generic VS Code improvements | `languageExtensionTips`, `configBasedExtensionTips` |
| GitHub Actions | **Build-time** - Dynamic values | `commit`, `updateUrl` (injected during build) |

## Troubleshooting

### Enhancement not applying?
1. Check JSON syntax: `node -e "JSON.parse(require('fs').readFileSync('docs/UPDATE_REBASE/product-enhancements.json'))"`
2. Run with verbose output: `node docs/UPDATE_REBASE/apply-branding.js`
3. Check the console output for errors

### Field keeps getting overwritten?
- If the field is in `branding-config.json`, it will be applied **before** enhancements
- Move it to `product-enhancements.json` if it should be an enhancement

### Want to remove a field?
- Remove it from `product-enhancements.json`
- Manually delete it from `product.json` (enhancements only add/update, never delete)

## Example Workflow

```bash
# 1. After rebasing with VS Code upstream
git rebase upstream/main

# 2. Check what changed in VS Code's product.json
git diff upstream/main -- product.json

# 3. Add new fields to product-enhancements.json
code docs/UPDATE_REBASE/product-enhancements.json

# 4. Apply branding (includes enhancements)
node docs/UPDATE_REBASE/apply-branding.js

# 5. Verify changes
git diff product.json
```

## Future Improvements

- [ ] Add validation schema for `product-enhancements.json`
- [ ] Add `--validate` flag to check enhancements before applying
- [ ] Add `--diff` flag to show what would change
- [ ] Auto-sync from VS Code's product.json (with manual review)
