# Browser View Tab Switching Challenges

> Documentation of issues encountered and solutions implemented for WebContentsView tab switching in ProjectModeV2.

**Date**: November 2025
**Status**: RESOLVED
**Related Files**:
- `src/vs/workbench/contrib/roopik/browser/projectModeV2/projectModeV2Editor.ts`
- `src/vs/workbench/contrib/roopik/electron-main/projectModeV2/browserViewServiceV2.ts`

---

## Problem Summary

When switching tabs away from the Browser Preview V2 and back, the website would reload completely, losing all state (video playback position, form data, scroll position, etc.).

---

## Issue 1: Browser View Destroyed on Tab Switch

### Symptom
- Every time user switched to another tab and back, the browser view ID changed (e.g., viewId=2 → viewId=4)
- Website reloaded completely
- State was lost (YouTube videos restarted, forms cleared, etc.)

### Root Cause
VSCode calls `clearInput()` when switching tabs (not just when closing). Our implementation was destroying the browser view in `clearInput()`:

```typescript
// BROKEN CODE - destroyed view on every tab switch
override clearInput(): void {
    super.clearInput();
    if (this.browserViewId) {
        this.browserService.destroyBrowserView(this.browserViewId);  // WRONG!
        this.browserViewId = undefined;
    }
}
```

### Solution
Only HIDE the browser view in `clearInput()`, destroy it only in `dispose()` (actual tab close):

```typescript
// FIXED CODE - preserve view on tab switch
override clearInput(): void {
    super.clearInput();

    // IMPORTANT: Do NOT destroy browser view here!
    // clearInput() is called on tab switch (not just close).
    // Browser view is destroyed in dispose() which is called on actual tab close.

    // Just hide the view to preserve state (like Cursor does)
    if (this.browserViewId) {
        this.browserService.setBrowserVisible(this.browserViewId, false);
    }
}
```

### Key Insight
Cursor IDE's browser implementation uses the same approach - they create ONE browser view per window and toggle visibility, never destroying on tab switch.

---

## Issue 2: New Browser View Created on Tab Switch Back

### Symptom
- When switching back to browser tab, `setInput()` was called
- Since `browserViewId` was undefined (cleared in `clearInput()`), a NEW browser view was created
- Logs showed: "initializing browser view..." on every tab switch back

### Root Cause
The `setInput()` method checked if `browserViewId` was undefined and initialized a new one:

```typescript
// BROKEN: Always created new view when browserViewId was undefined
if (!this.browserViewId) {
    await this.initializeBrowserView();
}
```

Since `clearInput()` destroyed the view and set `browserViewId = undefined`, this check always passed on tab switch back.

### Solution
After fixing `clearInput()` to preserve `browserViewId`, the check now correctly skips initialization on tab switch back. Added explicit handling for tab restoration:

```typescript
if (!this.browserViewId) {
    // First time - initialize
    await this.initializeBrowserView();
} else {
    // Browser view already exists (tab switch back)
    // Just restore visibility - NO re-navigation needed!
    this.syncUrlBarFromBrowser();

    if (this.hasLoadedUrl) {
        this.browserService.setBrowserVisible(this.browserViewId, true);
        this.hidePlaceholder();
    }
}
```

---

## Issue 3: URL Bar Shows Wrong URL After Tab Switch

### Symptom
- User navigates to `https://www.youtube.com/shorts/xyzk`
- Switches to another tab and back
- URL bar shows `https://www.youtube.com` (base URL) instead of actual URL
- But the page content was correct (video still playing at same position)

### Root Cause
On tab switch back, we were setting the URL bar from `input.url` (the original URL passed when creating the editor), not from the current browser URL:

```typescript
// BROKEN: Used stale input URL
if (this.controlBar) {
    this.controlBar.setUrl(initialUrl);  // This is the ORIGINAL url, not current!
}
```

### Solution
Created `syncUrlBarFromBrowser()` to get the current URL from the browser view:

```typescript
private async syncUrlBarFromBrowser(): Promise<void> {
    if (!this.browserViewId || !this.controlBar) {
        return;
    }

    try {
        const state = await this.browserService.getNavigationState(this.browserViewId);
        if (state.url && state.url !== 'about:blank') {
            this.controlBar.setUrl(state.url);
        }
    } catch (error) {
        this.logger.warn('[ProjectModeV2] Failed to sync URL bar:', error);
    }
}
```

Call this on tab switch back instead of using stale input URL.

---

## Issue 4: Welcome Screen Freeze (Double Initialization)

### Symptom
- Opening Browser Preview V2 caused the welcome screen to freeze
- Two browser views were being created simultaneously
- Race condition between `createEditor()` and `setInput()`

### Root Cause
Both `createEditor()` and `setInput()` were calling `initializeBrowserView()`:

```typescript
// createEditor() called first
protected createEditor(parent: HTMLElement): void {
    // ...
    this.initializeBrowserView();  // Call 1
}

// setInput() called immediately after
override async setInput(...): Promise<void> {
    // ...
    await this.initializeBrowserView();  // Call 2
}
```

Both calls passed the `!this.browserViewId` check before either set the ID, causing two browser views.

### Solution
Remove `initializeBrowserView()` from `createEditor()`, only call it from `setInput()`:

```typescript
protected createEditor(parent: HTMLElement): void {
    // Create DOM elements only
    // NOTE: Browser view initialization is handled by setInput()
    // This ensures only ONE initialization happens per editor lifecycle
}
```

---

## Issue 5: Placeholder Not Visible (WebContentsView Renders on Top)

### Symptom
- Created a nice placeholder "Enter URL to start browsing"
- But it was invisible - WebContentsView rendered on top of all DOM elements

### Root Cause
WebContentsView is a native Electron view that renders at the OS level, ABOVE all DOM elements. Setting `display: none` on DOM elements or using z-index doesn't help.

### Solution
Use native visibility API to hide the WebContentsView:

```typescript
// Hide placeholder - show WebContentsView
private hidePlaceholder(): void {
    if (this.placeholderElement) {
        this.placeholderElement.style.display = 'none';
    }
    if (this.browserViewId) {
        this.browserService.setBrowserVisible(this.browserViewId, true);
    }
}

// Show placeholder - hide WebContentsView
private showPlaceholder(): void {
    if (this.placeholderElement) {
        this.placeholderElement.style.display = 'flex';
    }
    if (this.browserViewId) {
        this.browserService.setBrowserVisible(this.browserViewId, false);
    }
}
```

---

## Best Practices Learned

### 1. Understand VSCode Editor Lifecycle
- `createEditor()` - DOM creation only, no async work
- `setInput()` - Called on open AND tab switch back
- `clearInput()` - Called on tab switch away AND close
- `dispose()` - Called only on actual editor close
- `setVisible()` - Called when visibility changes

### 2. Use Visibility Toggle, Not Destruction
Like Cursor IDE:
- Create ONE browser view per editor
- Toggle visibility on tab switch
- Destroy only on actual tab close

### 3. Sync State from Browser, Not Input
- Input URL is the INITIAL url, not current
- Always get current state from browser view
- Use `getNavigationState()` for current URL

### 4. WebContentsView is Native
- Renders above all DOM
- Use native visibility API
- Can't be hidden with CSS

### 5. Add Logging for Debugging
Logs that helped debug:
```
[ProjectModeV2] #1 clearInput: browser view preserved (viewId=2)
[ProjectModeV2] #1 setInput: restoring existing browser view (viewId=2)
[ProjectModeV2] #1 URL bar synced to: https://www.youtube.com/shorts/xyzk
```

---

## Final Architecture

```
Tab Switch Flow:
================

1. User opens Browser Preview V2
   └─> createEditor() - DOM only
   └─> setInput() - Initialize browser view (viewId=2)

2. User loads https://youtube.com/shorts/xyzk
   └─> navigate() - Load URL
   └─> hasLoadedUrl = true

3. User switches to another tab
   └─> clearInput() - HIDE view (not destroy)
   └─> Browser view preserved (viewId=2)

4. User switches back to browser tab
   └─> setInput() - browserViewId exists!
   └─> syncUrlBarFromBrowser() - Get current URL
   └─> setBrowserVisible(true) - Show view
   └─> NO re-navigation, NO reload!

5. User closes browser tab
   └─> dispose() - DESTROY view
   └─> Browser view destroyed (viewId=2)
```

---

## Related Documentation

- [WebContentsView Ghost Process Issue](../WebcontentsView%20Browser%20Ghost.md)
- [Mode 2 Security](../MODE2_SECURITY.md)
