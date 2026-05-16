# Configuration Reference

Quick reference for where to find and modify key configurations in the Roopik IDE and roopik-roo extension.

## Experimental Settings (Dio Agent)

### Background Editing (preventFocusDisruption)

**Default:** `true` (enabled)

Prevents editor focus disruption when Dio makes file edits. Files are edited in the background without opening diff views or stealing focus.

**Files:**
- `extensions/roopik-roo/src/shared/experiments.ts` - Default value in `experimentConfigsMap`
- `extensions/roopik-roo/packages/types/src/experiment.ts` - Schema definition
- `extensions/roopik-roo/webview-ui/src/i18n/locales/en/settings.json` - UI labels

**Tests:**
- `extensions/roopik-roo/src/shared/__tests__/experiments.spec.ts`
- `extensions/roopik-roo/src/shared/__tests__/experiments-preventFocusDisruption.spec.ts`

---

## Tool Definitions (MCP & Native Tools)

### Tool Descriptions and Parameters

**Files:**
- `extensions/roopik-roo/src/core/prompts/tools/native-tools/roopik.ts` - OpenAI-compatible tool schemas (component_add, project_start, etc.)
- `extensions/roopik-roo/src/core/prompts/tools/roopik/roopik-tools.ts` - XML-style tool descriptions and workflow documentation
