# WebContentsView Visibility Challenge

> Documentation of how WebContentsView renders above DOM and the visibility solution.

**Date**: November 2025
**Status**: RESOLVED
**Related Files**:
- `src/vs/workbench/contrib/roopik/browser/projectModeV2/projectModeV2Editor.ts`
- `src/vs/workbench/contrib/roopik/electron-main/projectModeV2/browserViewServiceV2.ts`

---

## Problem Summary

WebContentsView is a native Electron view that renders at the OS level, ABOVE all DOM elements. This caused issues with placeholder visibility and proper show/hide behavior.

---

## The Visibility Issue

### Symptom
1. Created a placeholder screen: "Enter URL to start browsing"
2. Placeholder was invisible even with `display: flex` and high `z-index`
3. WebContentsView appeared to "block" everything underneath

### Root Cause: Native vs DOM Rendering

```
┌─────────────────────────────────────────────────────────────┐
│                    RENDERING STACK                           │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         WebContentsView (Native OS Layer)             │   │
│  │     - Renders at compositor level                     │   │
│  │     - ABOVE all DOM elements                          │   │
│  │     - z-index has NO effect                          │   │
│  │     - CSS display has NO effect                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↑                                   │
│              Native view always on top                       │
│                          ↑                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              DOM Elements                             │   │
│  │     - Placeholder div                                 │   │
│  │     - Control bar                                     │   │
│  │     - All CSS-styled elements                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**WebContentsView is NOT a DOM element** - it's a native Chromium view managed by Electron. It renders directly to the window's compositor, bypassing the DOM entirely.

---

## Failed Approaches

### 1. CSS z-index
```typescript
// DOESN'T WORK: Native view ignores z-index
this.placeholderElement.style.zIndex = '9999';
```

### 2. CSS display/visibility
```typescript
// DOESN'T WORK: Affects DOM only, not native view
this.placeholderElement.style.display = 'flex';  // Placeholder visible in DOM
// But WebContentsView still covers it!
```

### 3. Setting bounds to 0
```typescript
// PARTIALLY WORKS: Shrinks view but doesn't truly hide
await this.browserService.setBrowserBounds(this.browserViewId, { x: 0, y: 0, width: 0, height: 0 });
// View is "hidden" but still consumes resources
```

---

## Solution: Native Visibility API

Electron's WebContentsView has a native `setVisible()` method:

```typescript
// Main process (browserViewServiceV2.ts)
async setBrowserVisible(browserViewId: number, visible: boolean): Promise<void> {
    const browserView = this.browserViews.get(browserViewId);
    if (browserView) {
        browserView.setVisible(visible);  // Native Electron API
    }
}
```

### Using in Editor

```typescript
// Show placeholder - HIDE native view
private showPlaceholder(): void {
    if (this.placeholderElement) {
        this.placeholderElement.style.display = 'flex';
    }
    // Hide WebContentsView using native API
    if (this.browserViewId) {
        this.browserService.setBrowserVisible(this.browserViewId, false);
    }
}

// Hide placeholder - SHOW native view
private hidePlaceholder(): void {
    if (this.placeholderElement) {
        this.placeholderElement.style.display = 'none';
    }
    // Show WebContentsView using native API
    if (this.browserViewId) {
        this.browserService.setBrowserVisible(this.browserViewId, true);
        this.updateViewBounds();  // Update position after showing
    }
}
```

---

## Visibility State Management

### Track Load State
```typescript
// Track if user has navigated to a real URL
private hasLoadedUrl: boolean = false;

private async navigate(url: string): Promise<void> {
    const isRealUrl = url !== 'about:blank';

    if (isRealUrl) {
        this.hasLoadedUrl = true;
        this.hidePlaceholder();  // Show browser, hide placeholder
    }
    // ... navigate ...
}

private goHome(): void {
    this.hasLoadedUrl = false;
    this.showPlaceholder();  // Show placeholder, hide browser
    this.navigate('about:blank');
}
```

### Tab Switch Handling
```typescript
override setVisible(visible: boolean): void {
    super.setVisible(visible);

    if (visible) {
        if (this.hasLoadedUrl) {
            // User had a URL - show browser
            this.browserService.setBrowserVisible(this.browserViewId, true);
        } else {
            // No URL - show placeholder
            this.showPlaceholder();
        }
    } else {
        // Tab hidden - hide browser (preserves state)
        this.browserService.setBrowserVisible(this.browserViewId, false);
    }
}
```

---

## Benefits of Native Visibility

| Approach | Memory | State | Performance |
|----------|--------|-------|-------------|
| Destroy/Recreate | High churn | Lost | Slow |
| Bounds to 0,0,0,0 | Still allocated | Preserved | Medium |
| **setVisible(false)** | **Minimal** | **Preserved** | **Fast** |

### Why setVisible() is Best
1. **State preserved** - Page keeps running, video keeps playing
2. **Memory efficient** - View is hidden, not destroyed
3. **Fast** - Just a visibility toggle, no recreation
4. **Native** - Uses Electron's built-in mechanism

---

## Cursor IDE Reference

Analysis of Cursor IDE's browser implementation showed they use the same approach:

```
Cursor logs:
[BrowserViewMainService] setBrowserViewVisible: viewId=1, visible=false
[BrowserViewMainService] setBrowserViewVisible: viewId=1, visible=true
```

They never destroy on tab switch - just toggle visibility. This is the proven pattern.

---

## Complete Visibility Flow

```
User Flow                    Native View State
=========                    =================

1. Open Browser Preview      View created, visible=false (placeholder shown)
2. Enter URL, press Enter    visible=true, placeholder hidden
3. Browse website            visible=true
4. Switch to another tab     visible=false (state preserved!)
5. Switch back               visible=true (instant restore!)
6. Click Home button         visible=false, placeholder shown
7. Close tab                 View destroyed (only on actual close)
```

---

## Key Learnings

1. **WebContentsView is native** - Not DOM, not affected by CSS
2. **Use Electron's visibility API** - `setVisible(true/false)`
3. **Don't destroy for hide** - Toggle visibility instead
4. **Track load state** - Know when to show placeholder vs browser
5. **Update bounds after show** - Position might have changed

---

## Related Documentation

- [Browser View Tab Switching](./BROWSER_VIEW_TAB_SWITCHING.md)
- [Browser View Ghost Process](./BROWSER_VIEW_GHOST_PROCESS.md)
