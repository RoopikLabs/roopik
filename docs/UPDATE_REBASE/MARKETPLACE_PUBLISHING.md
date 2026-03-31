# Publishing Roopik-Roo Extension to Marketplace

## Setup Complete! ✅

Your extension is now configured for marketplace auto-updates.

### What Changed:
1. **product.json** - Added `roodio` to `builtInExtensions` with:
   - `isBuiltin: true` - Marks as system extension
   - `isUninstallable: false` - Users cannot uninstall it

2. **package.json** - Added `__metadata` field with same flags

3. **Marketplace Account** - Created publisher "roopik"

---

## Publishing Workflow

### First Time Publish:

```bash
# 1. Install vsce (one-time)
npm install -g @vscode/vsce

# 2. Login to marketplace (one-time)
vsce login roopik
# Enter your Personal Access Token when prompted

# 3. Navigate to extension folder
cd extensions/roopik-roo

# 4. Build the extension
npm run build

npm version patch

# 5. Publish to marketplace
vsce publish

or

vsce publish --allow-package-env-file

# ⚠️ IMPORTANT: Unlist via UI
# After publishing, go to the Marketplace Manage page:
# https://marketplace.visualstudio.com/manage
# Click "..." on your extension and select "Unlist" to make it private/unlisted.
```

### For Future Updates:

```bash
# 1. Sync changes from upstream (if needed)
node docs/sync-from-upstream.cjs --last 5

# 2. Navigate to extension
cd extensions/roopik-roo

# 3. Rebuild types if needed
cd packages/types && npm run build && cd ../..

# 4. Build extension
npm run build

# 5. Bump version (choose one)
npm version patch   # 3.37.1 -> 3.37.2
npm version minor   # 3.37.1 -> 3.38.0
npm version major   # 3.37.1 -> 4.0.0

# 6. Publish update
vsce publish --no-public

or

vsce publish --allow-package-env-file

# Done! Users get update in ~5-10 minutes
```

---

## Creating Personal Access Token (PAT)

If you haven't created a PAT yet:

1. Go to: https://dev.azure.com/
2. Click your profile icon → Personal Access Tokens
3. Click "New Token"
4. Settings:
   - **Name**: "Roopik Marketplace Publisher"
   - **Organization**: All accessible organizations
   - **Expiration**: 90 days (or custom)
   - **Scopes**:
     - ✅ Marketplace → **Manage** (full access)
5. Copy the token (you won't see it again!)
6. Use it when running `vsce login roopik`

---

## Important Notes

### Extension Updates:
- ✅ Users get updates **automatically** from marketplace
- ✅ Extension **cannot be uninstalled** by users
- ✅ All features (sidebar, commands, etc.) work normally
- ✅ **No IDE rebuild needed** for extension updates

### IDE Builds:
- Only rebuild IDE when you add **new IDE features** (not extension updates)
- Extension version in IDE will auto-update from marketplace
- Keep `product.json` version in sync with latest published version

### Version Management:
- Always bump version before publishing (`npm version patch`)
- Version in `package.json` must be higher than marketplace version
- Update `product.json` builtInExtensions version when building new IDE

---

## Troubleshooting

### "Extension already exists"
- You're trying to publish same version twice
- Bump version with `npm version patch`

### "Publisher not found"
- Run `vsce login roopik` again
- Check your PAT hasn't expired

### "Users not getting updates"
- Check marketplace shows latest version
- Users need to restart IDE to check for updates
- Updates can take 5-10 minutes to propagate

### "Extension shows as uninstallable"
- Check `product.json` has `isUninstallable: false`
- Rebuild IDE with updated `product.json`

---

## Quick Commands Reference

```bash
# Check current version
cat extensions/roopik-roo/package.json | grep '"version"'

# Build extension only
cd extensions/roopik-roo && npm run build

# Publish without building (if already built)
cd extensions/roopik-roo && vsce publish

# Package as .vsix (for manual upload)
cd extensions/roopik-roo && vsce package

# List all published versions
vsce show roopik.roodio
```

---

## Your Workflow Summary

**For Extension Updates** (Fast - No IDE Rebuild):
1. Sync upstream changes
2. Build extension
3. Bump version
4. Publish to marketplace
5. ✅ Done! Users get update automatically

**For IDE Updates** (When you add IDE features):
1. Make IDE changes
2. Update extension if needed (follow above)
3. Build full IDE
4. Distribute to users

This saves you from rebuilding the entire IDE for every extension update! 🚀
