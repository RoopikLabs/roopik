# Week 1 - Extension Scaffold

**What we built:** Basic Roopik extension that loads on startup

---

## Types of VS Code Extensions

VS Code has **3 main types** of extensions:

### 1. **Declarative Extensions** (No Code)
- **Example:** `extensions/css/`, `extensions/html/`
- **No `main` field** in package.json
- **No `.ts/.js` files** - only JSON configs
- **What they contain:**
  - `syntaxes/*.tmLanguage.json` - Syntax highlighting rules (TextMate grammars)
  - `language-configuration.json` - Bracket matching, comments, auto-closing pairs
  - `snippets/*.json` - Code snippets
- **When they activate:** Automatically when file type opens (no activation code needed)
- **Use case:** Language support (syntax highlighting, snippets, bracket matching)

### 2. **Programmatic Extensions** (With Code)
- **Example:** `extensions/git/` (uses `main.ts`), our `extensions/roopik/` (uses `extension.ts`)
- **Has `"main"` field** pointing to entry point (`./out/main.js` or `./out/extension.js`)
- **Has `src/` folder** with TypeScript/JavaScript code
- **Must export** `activate()` and optionally `deactivate()`
- **When they activate:** Based on `activationEvents` in package.json
- **Use case:** Complex logic, API integration, UI panels, commands, custom functionality

### 3. **Hybrid Extensions** (Code + Declarative)
- **Example:** `extensions/typescript-language-features/`
- **Has both:**
  - Programmatic code (`main` field, TypeScript files)
  - Declarative configs (language configs, grammars)
- **Use case:** Full language support (syntax + IntelliSense + formatting + refactoring)

**Key insight:** The entry point file name doesn't matter! It can be:
- `extension.ts` (our convention)
- `main.ts` (git extension uses this)
- `index.ts` (some extensions use this)
- Whatever you want - just point `"main"` to the compiled `.js` file

---

## Extension Architecture (Programmatic Type)

### Extension Entry Point

**File:** `src/extension.ts` (or `main.ts`, `index.ts` - your choice)
- **Purpose:** First file VS Code loads when extension activates
- **Must export:**
  - `activate(context: vscode.ExtensionContext)` - called when extension starts
  - `deactivate()` - optional cleanup when extension stops
- **How VS Code finds it:** `"main": "./out/extension.js"` in package.json

### Extension Manifest (`package.json`)

**Key fields:**

1. **`activationEvents`** - WHEN to load extension
   - `"onStartupFinished"` - After IDE finishes loading (recommended for most)
   - `"*"` - Immediately on any event (heavy, slows startup, **avoid**)
   - `"onCommand:your.command"` - When user runs specific command (lazy loading)
   - `"onLanguage:typescript"` - When TS file opens (language-specific)
   - **Declarative extensions don't need this** - they activate automatically

2. **`main`** - Path to compiled entry point
   - VS Code loads this file first
   - Must point to `.js` file (compiled from `.ts`)
   - Example: `"main": "./out/extension.js"`

3. **`contributes`** - WHAT your extension adds to VS Code
   - `commands` - New commands in command palette
   - `views` - New panels/sidebars
   - `menus` - Context menu items
   - `keybindings` - Keyboard shortcuts
   - `languages` - File type definitions
   - `grammars` - Syntax highlighting
   - `snippets` - Code snippets

4. **`scripts`** - Build commands
   - `compile` - Build once
   - `watch` - Rebuild on file changes

---

## TypeScript Configuration Chain

### 1. `tsconfig.base.json` (Shared)
- **Location:** `extensions/tsconfig.base.json`
- **Purpose:** Base TypeScript settings for ALL extensions
- **Defines:** Compiler options, target version, module system
- **We inherit this** to follow VS Code standards

### 2. `tsconfig.json` (Our Extension)
- **Location:** `extensions/roopik/tsconfig.json`
- **Purpose:** Extension-specific TypeScript config
- **Extends:** `../tsconfig.base.json` to inherit base settings
- **Must include:** `../../src/vscode-dts/vscode.d.ts` for VS Code API types

### 3. `vscode.d.ts` (VS Code API Types)
- **Location:** `src/vscode-dts/vscode.d.ts`
- **Purpose:** TypeScript definitions for VS Code API
- **Provides:** Types for `vscode.commands`, `vscode.window`, `vscode.extensions`, etc.
- **Without this:** No autocomplete, no type checking for VS Code APIs
- **Why include it:** TypeScript needs to know what `vscode.*` APIs exist

---

## Build System Integration

### Extension Registration

**File:** `build/gulpfile.extensions.mjs`
- **Purpose:** VS Code's Gulp build system discovers extensions from this file
- **What we did:** Added `'extensions/roopik/tsconfig.json'` to `compilations` array
- **What it does:** Compiles `.ts` → `.js` in `out/` folder during `npm run compile`

### Build Process Flow
1. Run `npm run compile`
2. Gulp reads `build/gulpfile.extensions.mjs`
3. Finds all tsconfig.json paths in `compilations` array
4. Compiles each extension's TypeScript to JavaScript
5. Output goes to each extension's `out/` folder

---

## Code Quality & Standards

### Pre-commit Checks (Both Required!)

1. **`build/hygiene.mjs`**
   - Checks copyright headers
   - Validates indentation (tabs only)
   - Detects unicode characters (emojis, special chars)
   - Runs on `git commit` via Husky hook

2. **`eslint.config.js`**
   - Lints code style and patterns
   - Enforces header/header rule (copyright format)
   - Checks for common code issues
   - Also runs on `git commit`

**Both must pass** or commit fails!

### Code Standards

- **Indentation:** Use **tabs**, not spaces
- **Unicode:** No emojis in code (use `// allow-any-unicode-next-line` to suppress)
- **Copyright:** Required header in every source file
- **Formatting:** Follow Microsoft's code style (inherited from base configs)

### Copyright Header Format
```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
```

**What we modified:**
- `build/hygiene.mjs` - Accept both Microsoft and Roopik copyrights
- `eslint.config.js` - Override header rule for `extensions/roopik/` files

---

## Files Created

- `extensions/roopik/package.json` - Extension manifest
- `extensions/roopik/src/extension.ts` - Entry point
- `extensions/roopik/tsconfig.json` - TypeScript config
- `extensions/roopik/.gitignore` - Ignore build artifacts

## VS Code Files Modified

- `build/gulpfile.extensions.mjs:47` - Register extension in build
- `build/hygiene.mjs:19-32,114-136` - Allow Roopik copyright
- `eslint.config.js:2185-2205` - Override header rule for roopik

---

## Summary

**Extension types:**
- Declarative = JSON configs only (syntax, snippets)
- Programmatic = Code with activate() (complex logic, UI)
- Hybrid = Both code and configs (full language support)

**Our extension (Roopik):**
- Type: Programmatic
- Entry: `extension.ts` → `activate()`
- Activates: `onStartupFinished`
- Contributes: Commands (Open Canvas)

**Key learning:** Entry point filename doesn't matter - `main` field in package.json determines what VS Code loads!
