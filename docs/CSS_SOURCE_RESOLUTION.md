# CSS Source Resolution in Style Inspect

## Overview

The Style Inspect panel uses Chrome DevTools Protocol (CDP) to resolve CSS source files for inspected elements. This document explains the key timing issue we solved.

## The Problem

**Symptom**: CSS rules showed `index.html` as the source file instead of the actual `styles.css`.

**Root Cause**: CDP's `CSS.styleSheetAdded` events fire when stylesheets load during page rendering. If the CSS domain is enabled too late (after stylesheets load) or not re-enabled on page reload, these events are missed and the stylesheet cache remains empty.

## How CDP Stylesheet Discovery Works

```
Page Load Timeline:
─────────────────────────────────────────────────────────────────►

did-start-loading     HTML parsed       Stylesheets loaded     did-stop-loading
        │                  │                    │                      │
        │                  │                    │                      │
        ▼                  ▼                    ▼                      ▼
   [Enable CSS]      [<link> tags]     [CSS.styleSheetAdded]    [Too late!]
                      encountered           events fire
```

**Key insight**: `CSS.styleSheetAdded` events fire synchronously when stylesheets are parsed. The CSS domain must be enabled BEFORE stylesheets load to capture these events.

## The Solution

1. **Enable CSS domain in `did-start-loading`** (not `did-stop-loading`)
2. **Reset state on each page load** via `resetForPageLoad()`:
   - Clear stylesheet cache
   - Remove from `cssEnabledViews` set (allows re-enabling)
   - Clean up old event listeners

```typescript
// browserViewService.ts - did-start-loading handler
webContents.on('did-start-loading', () => {
    this.enableCSSForStyleInspection(browserViewId);
});

// enableCSSForStyleInspection
private async enableCSSForStyleInspection(browserViewId: number): Promise<void> {
    this.cdpCssService.resetForPageLoad(browserViewId);  // Clear old state
    await this.cdpCssService.ensureCSSEnabled(browserViewId);  // Re-enable & listen
}
```

## Files Involved

| File | Purpose |
|------|---------|
| `cdpCssService.ts` | CDP wrapper, stylesheet cache, event listener |
| `browserViewService.ts` | Page lifecycle hooks, triggers CSS enabling |
| `styleSourceOrchestrator.ts` | Queries cache for stylesheet URLs |

## Debugging Tips

If CSS sources aren't resolving:
1. Check that `CSS.styleSheetAdded` events are being received
2. Verify `resetForPageLoad()` is called on navigation
3. Ensure debugger is attached before setting up event listener
