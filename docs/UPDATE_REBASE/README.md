# ROOPIK IDE - Rebase & Branding Guide

This directory contains tools and documentation for maintaining Roopik branding after rebasing with upstream VS Code.

## 📁 Contents

- **`BRANDING_REFERENCE.md`** - Complete reference of all branding locations
- **`branding-config.json`** - Centralized branding configuration
- **`apply-branding.js`** - Automated script to apply branding changes
- **`generate-icons.js`** - Icon generator (creates all icon formats from one image)
- **`README.md`** - This file (usage instructions)

---

## 🚀 Quick Start

### First Time Setup

1. **Initialize branding structure:**
   ```bash
   node docs/UPDATE_REBASE/apply-branding.js --init
   ```
   This creates the `branding/icons/` directory structure with placeholder files.

2. **Replace placeholder files** in `branding/icons/` with your actual Roopik icons

3. **Edit `branding-config.json`** if you need to customize any branding values

### After Rebasing with VS Code

1. **Rebase with upstream:**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Resolve any conflicts** in core VS Code files

3. **Apply branding:**
   ```bash
   node docs/UPDATE_REBASE/apply-branding.js
   ```

4. **Verify changes:**
   ```bash
   git status
   git diff
   ```

5. **Commit branding updates:**
   ```bash
   git add -A
   git commit -m "chore: apply Roopik branding after rebase"
   ```

### Preferred Sync Flow (avoids merge conflicts)

1. **Keep a clean upstream clone** (e.g. `vscode_initi_diff_reference`). After pulling Microsoft/vscode, run `node docs/UPDATE_REBASE/apply-branding.js` there so branding stays correct in the reference copy.
2. **Copy Roopik code manually** into the reference clone:
   - Copy `extensions/roopik/`
	```
	robocopy "C:\Users\Humblebee\Documents\GitHub\roopik\extensions\roopik" "C:\Users\Humblebee\Documents\GitHub\vscode_initi_diff_reference\extensions\roopik" //E //XD node_modules out build .build
	```
   - Copy any custom core folders (e.g. `src/vs/workbench/contrib/roopik/`)
	```
	robocopy "C:\Users\Humblebee\Documents\GitHub\roopik\src\vs\workbench\contrib\roopik" "C:\Users\Humblebee\Documents\GitHub\vscode_initi_diff_reference\src\vs\workbench\contrib\roopik" //E //XD node_modules out
	```

3. **Build/test once** in the reference clone (`npm install`, `npm run watch-extensions`, etc.) to ensure it compiles.
4. **Sync back to your main repo with `robocopy`** in two passes:
   - Pass 1 (copy only): `/E` + `/XD extensions\roopik node_modules out .build .claude .config .vscode .git .github` – brings in new files/updates but keeps destination extras.
   - Pass 2 (cleanup): `/MIR` + the same `/XD …` list – removes files deleted upstream while protecting your custom folders.
5. **Review + commit** in your main repo.


robocopy "C:\Users\Humblebee\Documents\GitHub\vscode_initi_diff_reference" "C:\Users\Humblebee\Documents\GitHub\roopik" /E /XD node_modules out .build .claude .config .vscode .git .github

robocopy "C:\Users\Humblebee\Documents\GitHub\vscode_initi_diff_reference" "C:\Users\Humblebee\Documents\GitHub\roopik" /MIR /XD extensions\roopik docs node_modules out .build .claude .config .vscode .git .github

This flow keeps Microsoft changes separate, minimizes merge conflicts, and ensures `extensions/roopik` (and other custom code) never gets wiped during mirroring.

---

## 📖 Script Usage

### Basic Usage

```bash
# Apply all branding changes
node docs/UPDATE_REBASE/apply-branding.js
```

### Options

#### Initialize Structure (`--init`)

Create the branding directory structure with placeholder files:

```bash
node docs/UPDATE_REBASE/apply-branding.js --init
```

**This creates:**
- `branding/icons/` directory structure
- Placeholder files for each required icon with instructions
- Shows you exactly which files you need to create

**Use this:**
- First time setup
- When you need to see what icons are required
- To refresh placeholder files if deleted

#### Dry Run Mode (`--dry-run`)

Preview what would be changed without making any modifications:

```bash
node docs/UPDATE_REBASE/apply-branding.js --dry-run
```

**Use this to:**
- See what files need updating
- Verify the script works correctly
- Check for any issues before applying changes

#### Skip Icons (`--skip-icons`)

Skip icon file replacements (useful if icon files don't exist yet):

```bash
node docs/UPDATE_REBASE/apply-branding.js --skip-icons
```

**Use this when:**
- Icon files haven't been created yet
- You only want to update text/metadata
- Testing the script without icon dependencies

#### Combined Options

```bash
# Dry run without icons
node docs/UPDATE_REBASE/apply-branding.js --dry-run --skip-icons
```

---

## 🎯 What the Script Does

The script reads from `branding-config.json` and automatically:

1. **Updates `product.json`**
   - Verifies all Roopik-specific fields are correct
   - Fixes any fields that were reset during rebase
   - Uses values from `branding-config.json` → `product`

2. **Updates `package.json`**
   - Changes package name, author, repository URLs
   - Uses values from `branding-config.json` → `package`

3. **Updates Windows Manifest**
   - Changes `ShortDisplayName` to "Roopik"
   - Uses values from `branding-config.json` → `windows.visualElementsManifest`

4. **Updates Linux Desktop File**
   - Changes description to "AI-Native Canvas-First IDE"
   - Uses values from `branding-config.json` → `linux.desktop`

5. **Updates PWA Manifest**
   - Changes app name and short name to "Roopik"
   - Uses values from `branding-config.json` → `server.manifest`

6. **Installs Roopik Dependencies** ✨ NEW
   - Automatically installs required npm packages (esbuild, Vue/Svelte compilers, etc.)
   - Gets latest compatible versions from npm
   - Skips packages already installed
   - Uses values from `branding-config.json` → `dependencies`

7. **Replaces Icons** (if `--skip-icons` not used)
   - Reads icon list from `branding-config.json` → `icons`
   - Copies from `branding/icons/` to VS Code locations
   - Windows icons (`.ico`, `.png` files)
   - macOS icons (`.icns` files)
   - Linux icons (`.png` files)
   - Server/PWA icons (`.png`, `.ico` files)
   - Workbench SVG icon

---

## 📁 Branding Configuration

### Centralized Configuration

All branding data is stored in **`branding-config.json`** - a single JSON file that contains:
- Product information (name, IDs, URLs)
- Package metadata (name, author, repository)
- Text replacements
- Icon definitions and requirements

**Edit this file** to customize any branding values - no need to modify the script!

### Icon Generation

Use **`generate-icons.js`** to automatically generate all required icon formats from a single source image:

```bash
# Install dependencies (one time)
npm install sharp to-ico

# Generate icons (uses mylogo.png in current directory by default)
node docs/UPDATE_REBASE/generate-icons.js

# Or specify custom path
node docs/UPDATE_REBASE/generate-icons.js path/to/your-icon.png
```

**Features:**
- Preserves transparency automatically
- Generates all required sizes and formats
- Creates `output_icons/` folder in current directory
- Can be copied and run anywhere (standalone)

**Source image requirements:**
- Format: PNG or SVG
- Size: At least 512x512 (1024x1024 recommended)
- Must have transparent background

### Branding Directory Structure

The script looks for Roopik icons in a `branding/` directory at the repository root. This keeps your branding assets separate from VS Code core files, making rebasing easier.

### Recommended Structure

```
roopik/
├── branding/                    # Branding overlay directory
│   └── icons/
│       ├── win32/
│       │   ├── roopik.ico
│       │   ├── roopik_150x150.png
│       │   └── roopik_70x70.png
│       ├── darwin/
│       │   └── roopik.icns
│       ├── linux/
│       │   └── roopik.png
│       ├── server/
│       │   ├── roopik-192.png
│       │   ├── roopik-512.png
│       │   └── roopik-favicon.ico
│       └── workbench/
│           └── roopik-icon.svg
└── ... (rest of VS Code fork)
```

### How It Works

The script follows this flow for each icon:

```
1. Look for Roopik icon in: branding/icons/win32/roopik.ico
   ↓ (if not found)
2. Check fallback: resources/win32/roopik.ico
   ↓ (if found)
3. Copy TO: resources/win32/code.ico (replaces VS Code icon)
```

**Example:**
- **Source (Roopik icon):** `branding/icons/win32/roopik.ico` ✅
- **Target (VS Code location):** `resources/win32/code.ico` ← Gets replaced
- **Result:** VS Code uses Roopik icon, but file is still named `code.ico` (VS Code expects this name)

### Creating the Branding Directory

**Option 1: Use the script (Recommended)**
```bash
# Automatically creates structure with placeholder files
node docs/UPDATE_REBASE/apply-branding.js --init
```

**Option 2: Manual creation**
```bash
# Create directory structure
mkdir -p branding/icons/{win32,darwin,linux,server,workbench}

# Then place your icon files in the appropriate subdirectories
# Example:
# cp my-roopik-icon.ico branding/icons/win32/roopik.ico
```

The `--init` option creates placeholder files with instructions, making it clear what each file needs!

---

## 📋 Manual Checklist

After running the script, verify these items manually:

### High Priority

- [ ] **Icons Created:** Ensure all icon files exist in `branding/icons/` directory
  - `branding/icons/win32/roopik.ico`
  - `branding/icons/win32/roopik_150x150.png`
  - `branding/icons/win32/roopik_70x70.png`
  - `branding/icons/darwin/roopik.icns`
  - `branding/icons/linux/roopik.png`
  - `branding/icons/server/roopik-192.png`
  - `branding/icons/server/roopik-512.png`
  - `branding/icons/server/roopik-favicon.ico`
  - `branding/icons/workbench/roopik-icon.svg`

  **OR** place them in fallback locations:
  - `resources/win32/roopik.ico` (etc.)

- [ ] **Build Scripts:** Check if `build/win32/code.iss` needs publisher info updates
- [ ] **CLI Constants:** Verify or set build-time environment variables for CLI branding

### Medium Priority

- [ ] **Custom Themes:** Add any new custom theme files if desired
- [ ] **File Type Icons:** Update file association icons if needed

---

## 🔧 Troubleshooting

### Script Fails with "Cannot read file"

**Problem:** The script can't find a file that should exist.

**Solution:**
1. Check if you're running from the repository root
2. Verify the file path in the error message
3. Check if the file was moved/renamed in the VS Code rebase
4. Update the script if the file path changed

### Icons Not Replaced

**Problem:** Icon files aren't being replaced.

**Possible Causes:**
1. **Icon files don't exist:** Create the Roopik icon files first
2. **Wrong file names:** Ensure icon files match expected names
3. **Permissions:** Check file permissions

**Solution:**
1. Create missing icon files in the correct locations
2. Run the script again
3. Or use `--skip-icons` to skip icon replacements

### Script Says "Already Correct" But Looks Wrong

**Problem:** The script thinks files are correct, but they're not.

**Solution:**
1. Check the file manually
2. The check logic might need updating
3. Manually fix the file and update the script's check function

### Build Fails After Branding

**Problem:** After applying branding, the build fails.

**Possible Causes:**
1. JSON syntax errors from script
2. Missing required fields
3. Invalid file paths

**Solution:**
1. Check build error messages
2. Verify JSON files are valid: `node -e "JSON.parse(require('fs').readFileSync('product.json'))"`
3. Review git diff to see what changed
4. Revert and fix manually if needed

---

## 📝 Creating Icon Files

### Quick Method: Use Icon Generator Script

**Easiest way:** Use the built-in icon generator:

```bash
# 1. Place your source image as mylogo.png in any directory
# 2. Run the generator
node docs/UPDATE_REBASE/generate-icons.js

# 3. Copy generated icons from output_icons/ to branding/icons/
```

The script automatically:
- Generates all required sizes
- Preserves transparency
- Creates ICO files with multiple resolutions
- Handles all formats (PNG, ICO, SVG)

### Manual Method: Where to Place Icons

**Option 1: Branding Directory (Recommended)**
Place all icons in `branding/icons/` subdirectories. This keeps branding separate from VS Code core.

**Option 2: Direct Replacement**
Place icons directly in the target locations (e.g., `resources/win32/roopik.ico`). The script will find them as fallback.

### Icon Requirements

If creating icons manually, here are the requirements:

### Windows Icons

- **`roopik.ico`**: Multi-resolution ICO file (16x16, 32x32, 48x48, 256x256)
- **`roopik_150x150.png`**: 150x150 pixels, PNG format
- **`roopik_70x70.png`**: 70x70 pixels, PNG format

### macOS Icons

- **`roopik.icns`**: Icon bundle containing multiple sizes (16x16 to 1024x1024)
  - Use tools like `iconutil` on macOS or online converters

### Linux Icons

- **`roopik.png`**: 512x512 pixels recommended, PNG format

### Server/PWA Icons

- **`roopik-192.png`**: 192x192 pixels, PNG format
- **`roopik-512.png`**: 512x512 pixels, PNG format
- **`roopik-favicon.ico`**: 16x16 or 32x32, ICO format

### Workbench Icon

- **`roopik-icon.svg`**: SVG format, should work at any size

---

## 🔄 Workflow Example

Here's a complete example workflow:

```bash
# 1. Fetch latest VS Code
git fetch upstream

# 2. Rebase
git rebase upstream/main

# 3. Resolve conflicts (if any)
# ... edit conflicted files ...
git add .
git rebase --continue

# 4. Preview branding changes
node docs/UPDATE_REBASE/apply-branding.js --dry-run

# 5. Apply branding
node docs/UPDATE_REBASE/apply-branding.js

# 6. Verify changes
git status
git diff product.json
git diff package.json

# 7. Test build (optional but recommended)
npm run compile

# 8. Commit
git add -A
git commit -m "chore: apply Roopik branding after rebase to VS Code v1.XX.X"
```

---

## 📚 Additional Resources

- **`BRANDING_REFERENCE.md`** - Complete list of all branding locations
- VS Code Upstream: https://github.com/microsoft/vscode
- VS Code Rebase Guide: (add your internal docs link)

---

## 💡 Tips

1. **Always use `--dry-run` first** to see what will change
2. **Commit branding separately** from rebase commits for cleaner history
3. **Keep icon files in version control** so they're always available
4. **Document any manual changes** you make outside the script
5. **Test the build** after applying branding to catch issues early

---

## 🐛 Reporting Issues

If you encounter issues with the branding script:

1. Check the error message carefully
2. Review `BRANDING_REFERENCE.md` for the file in question
3. Verify the file exists and has correct permissions
4. Try running with `--dry-run` to see what would happen
5. Update the script if file paths changed in VS Code

---

**Last Updated:** 2025-01-XX
**Maintained By:** Roopik Team

