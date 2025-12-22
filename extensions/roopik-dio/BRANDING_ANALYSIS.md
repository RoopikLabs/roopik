# Roopik Dio Branding Analysis & Cleanup Guide

**Date:** December 20, 2025
**Status:** Analysis Complete - Ready for Implementation

---

## Executive Summary

This document provides a comprehensive analysis of all branding references from `roo-code` that need to be replaced with Roopik branding, plus recommendations for removing unnecessary cloud/telemetry features.

**Total Files Affected:** ~576 files contain branding references
**Priority Levels:**

- 🔴 **CRITICAL** - User-facing, breaks functionality if not changed
- 🟡 **HIGH** - Internal but visible in code/comments
- 🟢 **LOW** - Test files, comments, legacy references

---

## 1. Package Names & Internal References (🔴 CRITICAL)

### 1.1 Workspace Package Names

These are used throughout the codebase as imports and must be renamed:

**Current → Target:**

- `@roo-code/types` → `@roopik-dio/types`
- `@roo-code/telemetry` → `@roopik-dio/telemetry` (or remove if telemetry disabled)
- `@roo-code/ipc` → `@roopik-dio/ipc`
- `@roo-code/cloud` → **REMOVE** (cloud service)
- `@roo-code/config-eslint` → `@roopik-dio/config-eslint` (if exists)
- `@roo-code/config-typescript` → `@roopik-dio/config-typescript` (if exists)

**Files to Update:**

- `src/packages/types/package.json` (line 2)
- `src/packages/telemetry/package.json` (line 2, 14)
- `src/packages/ipc/package.json` (check dependencies)
- `tsconfig.json` (lines 28-31) - path mappings
- All import statements across ~495 files using `@roo-code/*`

**Impact:** High - Will break TypeScript compilation if not updated consistently.

---

## 2. Class/Type Names (🟡 HIGH)

### 2.1 Core Classes

These are internal but appear in many files:

**Current → Target:**

- `ClineProvider` → `DioProvider` or `RoopikDioProvider`
- `ClineMessage` → `DioMessage` or `RoopikDioMessage`
- `ClineAsk` → `DioAsk` or `RoopikDioAsk`
- `ClineSayTool` → `DioSayTool`

**Key Files:**

- `src/core/webview/ClineProvider.ts` - Main provider class (rename class + file)
- `src/shared/combineApiRequests.ts` - Uses `ClineMessage` type
- `src/core/assistant-message/presentAssistantMessage.ts` - Uses `ClineAsk`
- `src/shared/ExtensionMessage.ts` - Uses `ClineSayTool`
- `src/packages/types/src/message.ts` - Type definitions

**Note:** "Cline" appears to be the original name before "Roo Code". Consider keeping internal class names if they're not user-facing, OR rename for consistency.

---

## 3. URLs & External Links (🔴 CRITICAL)

### 3.1 Documentation & Community Links

Replace all Roo Code URLs with Roopik equivalents (or remove if not applicable):

**Current URLs Found:**

- `https://docs.roocode.com` → `https://docs.roopik.com` (or remove)
- `https://github.com/RooCodeInc/Roo-Code` → `https://github.com/RoopikLabs/roopik`
- `https://www.reddit.com/r/RooCode` → Remove or replace
- `https://discord.gg/roocode` → Remove or replace
- `https://roocode.com` → `https://roopik.com`
- `https://careers.roocode.com` → Remove (not applicable)
- `https://app.roocode.com` → **REMOVE** (cloud service)
- `https://api.roocode.com` → **REMOVE** (cloud service)
- `https://ph.roocode.com` → **REMOVE** (PostHog telemetry)
- `https://clerk.roocode.com` → **REMOVE** (authentication service)
- `support@roocode.com` → `support@roopik.com` (or your support email)

**Files Affected:**

- `README.md` (lines 5-6, 9, 63, 76, 81-86, 95)
- `webview/src/utils/docLinks.ts` (line 12)
- `webview/src/components/chat/Announcement.tsx` (lines 67, 106, 109, 117, 120)
- `webview/src/components/marketplace/IssueFooter.tsx` (line 10)
- `webview/src/components/ErrorBoundary.tsx` (line 74)
- `webview/src/components/settings/providers/RooBalanceDisplay.tsx` (line 14) - **REMOVE** (cloud billing)
- `src/i18n/locales/*/common.json` - All locale files (line ~245)
- `webview/src/i18n/locales/*/settings.json` - All locale files (community/feedback sections)
- `src/packages/types/npm/package.metadata.json` (lines 14, 17, 19)
- `CHANGELOG.md` - Multiple references (can keep for historical context or remove)

---

## 4. Asset Files (🔴 CRITICAL)

### 4.1 Logo & Icon Files

**Location:** `assets/images/`

**Files to Replace/Remove:**

- `roo-logo.svg` → Replace with Roopik logo
- `roo.png` → Replace with Roopik logo
- Keep: `openrouter.png`, `requesty.png` (third-party service logos)

**Location:** `assets/icons/`

- Check if `icon.svg`, `icon.png`, `icon-nightly.png` contain Roo Code branding
- `roopik-icon.svg` already exists (good!)

---

## 5. User-Facing Strings (🔴 CRITICAL)

### 5.1 Localization Files

**Files:** `src/package.nls.json` and all locale variants

**Current Issues Found:**

- Line 37: `"D:\\RooCodeStorage"` → `"D:\\RoopikStorage"` or generic
- Line 39: `"roo-code-settings.json"` → `"roopik-dio-settings.json"`
- Line 39: Mentions "RooCode configuration file" → "Roopik Dio configuration file"

**All Locale Files Need Updates:**

- `src/package.nls.json` (English)
- `src/package.nls.nl.json` (Dutch)
- `webview/src/i18n/locales/*/settings.json` - Community/feedback sections mention Roo Code

---

## 6. API Headers & User Agents (🟡 HIGH)

### 6.1 HTTP Headers

**Files:**

- `src/api/providers/constants.ts` (line 5) - `X-Title: "Roo Code"` → `"Roopik Dio"`
- `src/api/providers/utils/image-generation.ts` (line 74) - Same header
- `src/services/code-index/embedders/openrouter.ts` (line 80) - Same header
- `src/services/code-index/embedders/bedrock.ts` (line 44) - `userAgentAppId: "RooCode#${version}"` → `"RoopikDio#${version}"`
- `src/services/code-index/embedders/openrouter.ts` (line 79) - `HTTP-Referer: "https://github.com/RooCodeInc/Roo-Code"` → Update

**User Agent Strings:**

- Search for `"RooCode/"` or `"Roo Code"` in user agent strings
- Found in: `src/api/providers/__tests__/constants.spec.ts` (line 23, 31)

---

## 7. Cloud & Telemetry Services (🔴 CRITICAL - REMOVE)

### 7.1 Cloud Service Integration

**Package:** `src/packages/cloud/` - **RECOMMEND REMOVAL**

**Why:** Roo Code's proprietary cloud sync service. Not needed for Roopik.

**Files Using Cloud:**

- `src/packages/cloud/src/index.ts` - Main cloud service
- `src/core/webview/ClineProvider.ts` - Imports `CloudService`, `BridgeOrchestrator`
- `src/core/task/Task.ts` - Uses cloud for sync
- `test/__tests__/extension.spec.ts` - Mocks cloud service
- `src/core/webview/__tests__/ClineProvider.flicker-free-cancel.spec.ts` - Cloud mocks

**Functions/Classes to Remove:**

- `CloudService`
- `BridgeOrchestrator`
- `getRooCodeApiUrl()` → Remove or replace with local-only

**Environment Variables:**

- `ROO_CODE_PROVIDER_URL` → Remove (used in `src/api/providers/roo.ts`, `src/core/webview/webviewMessageHandler.ts`)

### 7.2 Telemetry Service

**Package:** `src/packages/telemetry/` - **DECISION NEEDED**

**Options:**

1. **Remove entirely** - Cleanest, no telemetry
2. **Keep but disable** - Preserve code structure, set to no-op
3. **Replace with Roopik telemetry** - If you have your own system

**Current Implementation:**

- Uses PostHog (`posthog-node`)
- Sends to `https://ph.roocode.com`
- Found in: `webview/src/utils/TelemetryClient.ts`, `src/packages/telemetry/src/`

**Recommendation:** Remove or disable. PostHog URL hardcoded to Roo Code's instance.

### 7.3 MDM Service (Mobile Device Management?)

**File:** `src/services/mdm/MdmService.ts`

**References:**

- Uses `clerk.roocode.com` for authentication
- Likely enterprise feature - **RECOMMEND REMOVAL** unless you have equivalent

---

## 8. Configuration & Settings (🟡 HIGH)

### 8.1 Settings File Names

**Current:** `roo-code-settings.json`
**Target:** `roopik-dio-settings.json`

**Files:**

- `src/core/config/__tests__/importExport.spec.ts` - Multiple references (lines 571, 598, 606, etc.)
- `src/utils/autoImportSettings.ts` - Settings import logic
- `src/package.nls.json` - User-facing description

### 8.2 Storage Paths

**Current:** `RooCodeStorage`
**Target:** `RoopikStorage` or generic

**Files:**

- `src/package.nls.json` (line 37)

---

## 9. TypeScript Path Mappings (🔴 CRITICAL)

**File:** `tsconfig.json` (lines 28-31)

**Current:**

```json
"@roo-code/types": ["./src/packages/types/src"],
"@roo-code/ipc": ["./src/packages/ipc/src"],
"@roo-code/telemetry": ["./src/packages/telemetry/src"],
"@roo-code/cloud": ["./src/packages/cloud/src"]
```

**Target:**

```json
"@roopik-dio/types": ["./src/packages/types/src"],
"@roopik-dio/ipc": ["./src/packages/ipc/src"],
"@roopik-dio/telemetry": ["./src/packages/telemetry/src"]
// Remove @roopik-dio/cloud
```

**Also check:** `webview/tsconfig.json` for similar mappings

---

## 10. Test Files (🟢 LOW Priority)

Test files contain many references but are lower priority since they're not user-facing:

**Pattern:** Mock URLs, test data with "roo-code", etc.

**Recommendation:** Update gradually, focus on functionality first. Can use find/replace:

- `roo-code` → `roopik-dio`
- `RooCode` → `RoopikDio`
- Mock URLs → Localhost or remove

---

## 11. Comments & Documentation (🟢 LOW Priority)

### 11.1 Code Comments

- `src/core/condense/index.ts` (line 350) - GitHub issue reference
- Various files with `// See https://github.com/RooCodeInc/Roo-Code/issues/...`

**Recommendation:** Update or remove GitHub issue links (they're historical)

### 11.2 CHANGELOG.md

Contains full history of Roo Code releases. **Options:**

1. Keep as-is (historical reference)
2. Remove entirely
3. Extract relevant entries, remove Roo Code-specific ones

**Recommendation:** Keep for now, mark as "Forked from Roo Code" at top.

---

## 12. Internal Variable Names (🟡 MEDIUM)

### 12.1 Variable Naming

Many internal variables use "cline" or "roo" prefixes:

- `cline` (Task instance) - Used extensively in tool handlers
- `rooIgnoreController` - File access control
- `roo_edited` - File tracking tags

**Recommendation:**

- Keep internal variable names if they're not user-facing
- OR rename for consistency: `cline` → `dio` or `task`

**Files with "cline" variables:**

- `src/core/tools/*.ts` - All tool handlers
- `src/core/assistant-message/presentAssistantMessage.ts`
- Many test files

---

## 13. File Names & Directories (🟡 MEDIUM)

### 13.1 Legacy File Support

**Files:** `.clinerules`, `.roorules` (custom instruction files)

**Current:** Code supports both `.clinerules` and `.roorules`
**Location:** `src/core/prompts/sections/custom-instructions.ts` (lines 207-208, 309-310)

**Recommendation:**

- Keep `.roorules` support for backward compatibility
- Add `.roopikrules` or `.diorules` as new standard
- Document migration path

---

## 14. Marketplace Integration (🟡 HIGH)

### 14.1 Marketplace Service

**Files:**

- `src/services/marketplace/` - Extension marketplace
- `webview/src/components/marketplace/` - UI components

**Issues:**

- `IssueFooter.tsx` links to `github.com/RooCodeInc/Roo-Code/issues`
- May depend on Roo Code's marketplace backend

**Recommendation:**

- Update GitHub links
- Check if marketplace backend is needed or can be removed

---

## 15. Event Names & Types (🟡 HIGH)

### 15.1 Event System

**File:** `src/packages/types/src/events.ts` (or similar)

**Current:** `RooCodeEventName` enum
**Target:** `RoopikDioEventName` or `DioEventName`

**Files Using:**

- `test/__tests__/provider-delegation.spec.ts` (line 4, 87)
- `src/core/task/Task.ts` - Emits events

---

## 16. Recommended Removal Checklist

### 16.1 Cloud Service (Complete Removal)

- [ ] Remove `src/packages/cloud/` directory
- [ ] Remove cloud imports from `ClineProvider.ts`
- [ ] Remove `CloudService`, `BridgeOrchestrator` usage
- [ ] Remove `ROO_CODE_PROVIDER_URL` env var references
- [ ] Remove cloud-related UI components (if any)
- [ ] Remove `RooBalanceDisplay.tsx` component (billing UI)

### 16.2 Telemetry (Remove or Disable)

- [ ] Decide: Remove vs Disable
- [ ] If removing: Delete `src/packages/telemetry/`
- [ ] If disabling: Set all telemetry calls to no-op
- [ ] Remove PostHog dependency from `package.json`
- [ ] Remove `https://ph.roocode.com` from CSP headers

### 16.3 MDM Service (Remove)

- [ ] Remove `src/services/mdm/` directory
- [ ] Remove Clerk authentication dependencies
- [ ] Remove `clerk.roocode.com` references

### 16.4 Unnecessary Assets

- [ ] Replace `assets/images/roo-logo.svg`
- [ ] Replace `assets/images/roo.png`
- [ ] Verify icon files don't contain Roo Code branding

---

## 17. Implementation Priority

### Phase 1: Critical (Do First)

1. ✅ Package names (`@roo-code/*` → `@roopik-dio/*`)
2. ✅ TypeScript path mappings
3. ✅ User-facing strings (package.nls.json)
4. ✅ API headers (X-Title, User-Agent)
5. ✅ URLs in UI components

### Phase 2: High Priority

1. Remove cloud service integration
2. Remove/disable telemetry
3. Update all import statements
4. Replace logo assets
5. Update documentation URLs

### Phase 3: Medium Priority

1. Rename internal classes (ClineProvider → DioProvider)
2. Update test files
3. Update comments/documentation
4. Update variable names (if desired)

### Phase 4: Low Priority

1. CHANGELOG.md cleanup
2. Test file mocks
3. Legacy file support (`.clinerules`)

---

## 18. Files Summary

**Total Files with Branding:** ~576 files

**Breakdown:**

- Package.json files: 5
- TypeScript source files: ~400
- Test files: ~100
- Localization files: ~50
- Configuration files: ~10
- Documentation: ~10

---

## 19. Quick Find/Replace Patterns

Use these patterns for bulk replacement (be careful with context):

```bash
# Package names
@roo-code/types → @roopik-dio/types
@roo-code/telemetry → @roopik-dio/telemetry
@roo-code/ipc → @roopik-dio/ipc
@roo-code/cloud → REMOVE

# URLs
roocode.com → roopik.com
github.com/RooCodeInc/Roo-Code → github.com/RoopikLabs/roopik
docs.roocode.com → docs.roopik.com

# Strings
Roo Code → Roopik Dio
roo-code → roopik-dio
RooCode → RoopikDio

# Class names (if renaming)
ClineProvider → DioProvider
ClineMessage → DioMessage
```

---

## 20. Testing Checklist

After rebranding, verify:

- [ ] Extension compiles without errors
- [ ] All imports resolve correctly
- [ ] Extension activates in VS Code
- [ ] UI shows "Roopik Dio" (not "Roo Code")
- [ ] Settings page displays correctly
- [ ] No broken links in UI
- [ ] API requests use correct headers
- [ ] No cloud/telemetry errors in console

---

## Notes

- **Backward Compatibility:** Consider keeping `.roorules` file support for users migrating
- **Gradual Migration:** Can be done incrementally - prioritize user-facing changes first
- **Test Coverage:** Update tests after each major change
- **Documentation:** Update README.md and docs after rebranding complete

---

**Last Updated:** December 20, 2025
**Next Steps:** Begin Phase 1 implementation
