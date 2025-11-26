# Localhost Loading Challenge

> Documentation of the silent failure when loading localhost/dev server URLs in Browser Preview V2.

**Date**: November 2025
**Status**: RESOLVED
**Related Files**:
- `src/vs/workbench/contrib/roopik/electron-main/projectModeV2/browserViewServiceV2.ts`

---

## Problem Summary

External URLs like `https://google.com` loaded fine, but `http://localhost:5173` (React/Vite dev server) showed a white screen with NO errors in the console. The load appeared to succeed but nothing rendered.

---

## The Silent Failure

### Symptom
1. Open Browser Preview V2
2. Enter `http://localhost:5173/` (dev server running)
3. Press Enter
4. Logs show: `Navigating to: http://localhost:5173/`
5. **White screen** - nothing loads
6. **No error messages** anywhere

### Why It's Tricky
- `did-fail-load` event never fired
- No console errors
- External HTTPS sites worked fine
- Dev server was definitely running (worked in Chrome)

---

## Root Causes

### 1. Proxy Routing
Electron inherits system proxy settings. Even if you don't have a proxy configured, network configurations (VPNs, corporate networks) can confuse Electron into trying to route `localhost` through DNS instead of the loopback adapter.

### 2. Certificate Verification
React/Vite/Next.js dev servers often use:
- Self-signed certificates for HTTPS
- WebSocket connections for Hot Module Replacement (HMR)

Electron silently blocks self-signed certs. The WebSocket connection for HMR fails, and React waits for it before rendering → **White Screen**.

### 3. Permission Prompts
Dev servers request permissions (clipboard, notifications) that can cause invisible prompts blocking the page.

---

## The Solution

### A. Configure Session with Proxy Bypass

```typescript
const browserSession = session.fromPartition('persist:roopik-browser', { cache: true });

// Bypass proxy for localhost - force direct connection
await browserSession.setProxy({
    mode: 'direct',  // Skip system proxy entirely
    proxyBypassRules: 'localhost;127.0.0.1;[::1];*.local'
});
```

### B. Disable Certificate Verification

```typescript
// Trust all certificates for dev servers
browserSession.setCertificateVerifyProc((_request, callback) => {
    callback(0);  // 0 = verification success
});
```

### C. Auto-Grant Permissions

```typescript
browserSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = [
        'media', 'geolocation', 'notifications',
        'clipboard-read', 'clipboard-write',
        'midi', 'pointerLock', 'fullscreen'
    ];
    callback(allowedPermissions.includes(permission));
});
```

### D. Enhanced Error Logging

Added event listeners to catch errors that `did-fail-load` misses:

```typescript
// Catches CONNECTION_REFUSED, DNS errors BEFORE silent failure
webContents.on('did-fail-provisional-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[ProjectModeV2] Provisional load failed: ${validatedURL} - ${errorDescription} (${errorCode})`);
    // -102: CONNECTION_REFUSED (server not running)
    // -105: NAME_NOT_RESOLVED (DNS issue)
    // -106: INTERNET_DISCONNECTED
    // -7: TIMED_OUT
});

// Catch and allow certificate errors
webContents.on('certificate-error', (event, url, error, _certificate, callback) => {
    console.log(`[ProjectModeV2] Certificate error for ${url}: ${error} - Allowing anyway`);
    event.preventDefault();
    callback(true);  // Trust the certificate
});
```

---

## Complete Implementation

```typescript
async createBrowserView(windowId: number): Promise<BrowserViewResult> {
    const window = BrowserWindow.fromId(windowId);
    if (!window) {
        throw new Error(`Window ${windowId} not found`);
    }

    // =========================================================
    // Configure Session for Localhost Support
    // =========================================================
    const browserSession = session.fromPartition('persist:roopik-browser', { cache: true });

    // A. Bypass Proxy for Localhost
    console.log('[ProjectModeV2] Setting up proxy bypass for localhost...');
    await browserSession.setProxy({
        mode: 'direct',
        proxyBypassRules: 'localhost;127.0.0.1;[::1];*.local'
    });

    // B. Disable Certificate Verification
    console.log('[ProjectModeV2] Setting up certificate verify proc...');
    browserSession.setCertificateVerifyProc((_request, callback) => {
        callback(0);
    });

    // C. Auto-Grant Permissions
    browserSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        const allowedPermissions = ['media', 'geolocation', 'notifications',
                                     'clipboard-read', 'clipboard-write',
                                     'midi', 'pointerLock', 'fullscreen'];
        callback(allowedPermissions.includes(permission));
    });

    // =========================================================
    // Create WebContentsView with custom session
    // =========================================================
    const browserView = new WebContentsView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,  // Disabled for localhost
            webSecurity: false,
            allowRunningInsecureContent: true,
            session: browserSession
        }
    });

    // ... rest of setup
}
```

---

## Error Codes Reference

| Code | Name | Meaning |
|------|------|---------|
| -102 | CONNECTION_REFUSED | Server not running on that port |
| -105 | NAME_NOT_RESOLVED | DNS lookup failed |
| -106 | INTERNET_DISCONNECTED | No network connection |
| -7 | TIMED_OUT | Connection timed out |
| -200 | CERT_COMMON_NAME_INVALID | SSL certificate mismatch |
| -202 | CERT_AUTHORITY_INVALID | Self-signed certificate |

---

## Debugging Tips

### Check Main Process Console
The main process logs (not DevTools) show the real errors:
```
[ProjectModeV2] Setting up proxy bypass for localhost...
[ProjectModeV2] Setting up certificate verify proc...
[ProjectModeV2] Started loading...
[ProjectModeV2] Navigated to: http://localhost:5173/
[ProjectModeV2] Finished loading
```

### Verify Dev Server is Running
```bash
# Check if port is in use
netstat -an | findstr 5173

# Or curl it
curl http://localhost:5173
```

### Check for Provisional Load Failures
If you see this, the server isn't reachable:
```
[ProjectModeV2] Provisional load failed: http://localhost:5173/ - ERR_CONNECTION_REFUSED (-102)
```

---

## Why Cursor Works

Analysis of Cursor IDE logs showed they implement the same pattern:
```
[BrowserViewMainService] Setting up certificate verify proc for window 1
[BrowserViewMainService] Browser view created for window 1
[BrowserViewMainService] Navigating to http://localhost:5173/ (window 1)
```

They configure certificate verification BEFORE creating the browser view.

---

## Key Learnings

1. **Electron inherits system proxy** - Always bypass for localhost
2. **Certificate errors are SILENT** - Must explicitly handle them
3. **`did-fail-load` misses connection errors** - Use `did-fail-provisional-load`
4. **WebSocket failures = White screen** - React HMR depends on WebSockets
5. **Session configuration must happen BEFORE navigation** - Configure first, navigate after
6. **`mode: 'direct'` is safer than `mode: 'system'`** - Avoids proxy confusion

---

## Related Documentation

- [Browser View Tab Switching](./BROWSER_VIEW_TAB_SWITCHING.md)
- [Browser View Ghost Process](./BROWSER_VIEW_GHOST_PROCESS.md)
- [WebContentsView Visibility](./WEBCONTENTSVIEW_VISIBILITY.md)
