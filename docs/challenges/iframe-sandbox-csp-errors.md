# Challenge: VS Code Webview iframe CSP Blocking External Scripts

**Date Encountered**: 2025-11-17
**Phase**: Mode 1 Preview System Integration
**Status**: Solved

---

## Problem Description

VS Code webview CSP (Content Security Policy) was blocking external scripts from unpkg.com CDN in sandboxed iframes, preventing Babel Standalone and React from loading.

### Symptoms
- Iframes rendered but showed "Initializing sandbox..." forever
- Components never appeared on canvas despite successful message flow
- Console error: `Loading the script 'https://unpkg.com/@babel/standalone@7.23.5/babel.min.js' violates the following Content Security Policy directive: "script-src 'self' https://*.vscode-cdn.net"`

### Error Messages
```
about:srcdoc:1 Loading the script 'https://unpkg.com/@babel/standalone@7.23.5/babel.min.js'
violates the following Content Security Policy directive: "script-src 'self' https://*.vscode-cdn.net".
Note that 'script-src-elem' was not explicitly set, so 'script-src' is used as a fallback.
```

### Environment
- OS: Windows
- VS Code Fork: Electron-based
- Architecture: srcDoc iframes inside VS Code webview

---

## Attempted Solutions

### Attempt 1: Added CSP meta tag in iframe HTML
**Result**: Didn't work
**Why it failed**: Iframes with `srcDoc` inherit parent webview's CSP, ignoring their own meta tags

### Attempt 2: Changed to blob URL instead of srcDoc
**Result**: Made it worse
**Why it failed**: Webview CSP blocked blob URLs in frame-src, iframe showed plain white screen

---

## Solution

Updated CSP in **two places** to allow unpkg.com and enable `unsafe-eval` (critical for Babel):

### Steps
1. Update parent webview CSP in `canvasPanel.ts`
2. Add explicit CSP meta tag in iframe HTML (best practice)
3. Add `'unsafe-eval'` to allow Babel's `new Function()` transpilation

### Code Changes

**File: `src/canvasPanel.ts`**
```typescript
// Before:
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">

// After:
const csp = `
  default-src 'none';
  style-src ${webview.cspSource} 'unsafe-inline';
  script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval' https://unpkg.com;
  font-src ${webview.cspSource};
  img-src ${webview.cspSource} data:;
  connect-src ${webview.cspSource} https://unpkg.com;
  frame-src ${webview.cspSource} data: blob:;
`;
<meta http-equiv="Content-Security-Policy" content="${csp.replace(/\s+/g, ' ').trim()}">
```

**File: `webview-ui/src/components/SandboxPreview.tsx`**
```typescript
// Added explicit CSP in iframe HTML:
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval' https://unpkg.com; connect-src https://unpkg.com;">
```

### Verification
- ✅ Button sample renders correctly
- ✅ Counter sample with state works
- ✅ Card sample with complex styling renders
- ✅ No CSP errors in console
- ✅ React and ReactDOM load from unpkg.com
- ✅ Babel transpilation works

---

## Root Cause

**Two separate issues:**

1. **CSP inheritance**: VS Code webviews have strict default CSP that blocks external domains. Iframes with `srcDoc` inherit this policy.

2. **`unsafe-eval` requirement**: Babel Standalone transpiles JSX using `new Function(...)` which is technically an eval operation. Without `'unsafe-eval'` in CSP, browsers block this even if scripts load successfully.

---

## Prevention

- Always include `'unsafe-eval'` when using Babel Standalone for client-side transpilation
- For VS Code webviews loading external resources in iframes:
  - Allow specific HTTPS domains (e.g., `https://unpkg.com`)
  - Add `connect-src` for network requests
  - Add `frame-src` for iframe sources
- Document CSP requirements in architecture docs
- Test with browser DevTools console for CSP violations

---

## Related Issues

- Challenge: Mixed import declarations (see `mixed-import-declarations.md`)
- VS Code Webview API: https://code.visualstudio.com/api/extension-guides/webview

---

## References

- VS Code Webview CSP docs: https://code.visualstudio.com/api/extension-guides/webview#content-security-policy
- Babel Standalone requires unsafe-eval: https://babeljs.io/docs/en/babel-standalone
- CSP eval directive: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src
