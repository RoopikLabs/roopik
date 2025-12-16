# DOM Tree Bidirectional Sync - Challenges & Solutions

## Overview
Implementing bidirectional sync between browser element selection and the Components tree panel required solving several tricky edge cases.

## Challenge 1: Multiple Siblings with Same Tag

**Problem**: When there are multiple `<a>` tags (Privacy, Terms, Contact), hovering any of them in the tree would highlight only the first `<a>` in the browser.

**Root Cause**: The selector built was just `a` which `DOM.querySelector` matches to the first occurrence.

**Solution**: Use `:nth-of-type(n)` to disambiguate siblings:
```typescript
// Before: "div.footer-links > a" (always matches first)
// After:  "div.footer-links > a:nth-of-type(2)" (matches second <a>)

if (sameTagSiblings.length > 1) {
  const indexAmongSameTag = sameTagSiblings.findIndex(s => s.nodeId === node.nodeId);
  part += `:nth-of-type(${indexAmongSameTag + 1})`;
}
```

## Challenge 2: nth-child vs nth-of-type

**Problem**: Using `:nth-child()` caused "Could not find element" errors on complex sites like Google.

**Root Cause**:
- Our cached DOM tree only includes ELEMENT nodes (no text nodes, comments, whitespace)
- `:nth-child(n)` counts ALL child nodes including text/comments
- So our calculated index was wrong

**Example**:
```html
<!-- Real DOM -->
<div>
  <!-- comment -->
  text node
  <span>A</span>  ← Real nth-child(3)
  <span>B</span>  ← Real nth-child(4)
</div>

<!-- Our cache (elements only) -->
<span>A</span>  ← We calculated nth-child(1) - WRONG!
<span>B</span>  ← We calculated nth-child(2) - WRONG!
```

**Solution**: Use `:nth-of-type()` instead - it only counts elements of the same tag type, matching our filtered tree.

## Challenge 3: Reverse Sync (Browser → Tree) Ignoring nth-of-type

**Problem**: Clicking the 2nd `<a>` in browser would highlight the 1st `<a>` in tree.

**Root Cause**: `parseSelectorPart()` stripped `:nth-of-type()` from selectors:
```typescript
// This removed :nth-of-type(2) completely!
const cleanPart = part.replace(/:[^.#]+/g, '');
```

**Solution**: Parse and preserve `nthOfType` as a number, then use it during tree traversal:
```typescript
private parseSelectorPart(part: string): { tag?: string; id?: string; classes: string[]; nthOfType?: number } {
  // Extract :nth-of-type(n) BEFORE cleaning
  const nthMatch = part.match(/:nth-of-type\((\d+)\)/);
  if (nthMatch) {
    result.nthOfType = parseInt(nthMatch[1], 10);
  }
  // ... then clean for tag/class parsing
}

private nodeMatchesSelector(node, target, parent, nthIndex): boolean {
  // ... other checks ...
  if (target.nthOfType !== undefined && nthIndex !== target.nthOfType) {
    return false;
  }
  return true;
}
```

## Challenge 4: CDP nodeId Invalidation

**Problem**: nodeIds from our cached tree didn't match CDP's current nodeIds, causing "Could not find node with given id" errors.

**Root Cause**: CDP invalidates all nodeIds whenever `DOM.getDocument` is called.

**Solution**: Don't use cached nodeIds directly. Instead:
1. Build a CSS selector from the cached tree node
2. Call `DOM.getDocument` to get fresh document root
3. Use `DOM.querySelector` with our selector to get fresh nodeId
4. Use that fresh nodeId with `Overlay.highlightNode`

## Key Learnings

1. **nth-of-type > nth-child** when your tree filters out non-element nodes
2. **Always parse pseudo-selectors** before stripping them - you may need the values
3. **CDP nodeIds are ephemeral** - use selectors as the stable identifier
4. **Track sibling counts by tag** when walking trees for nth-of-type matching

## Code Locations

- Selector building: `styleInspect.ts:buildSelectorFromNodeId()`
- Selector parsing: `styleInspect.ts:parseSelectorPart()`
- Node matching: `styleInspect.ts:nodeMatchesSelector()`
- Tree search: `styleInspect.ts:findNodeIdBySelector()`
- Browser highlight: `styleInspect.ts:highlightElementInBrowser()`
