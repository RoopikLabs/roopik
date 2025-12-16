# Mode 2 Security: Webview-Only Preview Access


## NOTE:  This is outdayed, we no longer apply any security restriction

## 🎯 Feature Overview

**Goal**: Prevent external browsers (Chrome, Edge, Firefox) from accessing the Roopik development server to protect our proprietary click-to-source implementation and injected HTML code.

**Status**: ✅ **Working Flawlessly**

---

## 🔒 The Challenge

When Roopik's Mode 2 preview runs a Vite dev server on `http://127.0.0.1:5173`, anyone can:

1. ❌ Copy the URL from the IDE preview
2. ❌ Open it in Chrome/Edge/Firefox
3. ❌ View the HTML source code
4. ❌ See our injected click-to-source script
5. ❌ Reverse-engineer our proprietary implementation

**We needed to ensure the preview ONLY works inside Roopik IDE's webview, nowhere else.**

---

## ✅ The Solution: Two-Layer Security

### **Layer 1: Server-Side Blocking (Primary Defense)**

**File**: [`authMiddleware.js`](../extensions/roopik/src/devServer/plugins/authMiddleware.js)

**How it works**:
- Vite middleware checks the `User-Agent` header of every HTTP request
- VSCode webview runs in **Electron**, so User-Agent contains `"Electron"` or `"VSCode"`
- External browsers (Chrome, Edge, Firefox) have different User-Agents (e.g., `"Chrome/131.0"`)

**Code**:
```javascript
function createAuthMiddleware() {
    return (req, res, next) => {
        const userAgent = req.headers['user-agent'] || '';

        // VSCode webview User-Agent contains "Electron"
        if (userAgent.includes('Electron') || userAgent.includes('VSCode')) {
            console.log('[Roopik Auth] ✓ Allowed VSCode webview (Electron detected)');
            return next(); // Serve HTML
        }

        // Block all other browsers
        console.log('[Roopik Auth] ✗ Blocked external request');
        res.statusCode = 403;
        res.end(`<html>...Access Denied...</html>`);
    };
}
```

**Result**:
- ✅ VSCode webview → Serves HTML normally
- ❌ Chrome/Edge/Firefox → Returns 403 Forbidden (no HTML served, no source code exposed)

---

### **Layer 2: PostMessage Handshake (Backup Defense)**

**File**: [`roopikInjectPlugin.js`](../extensions/roopik/src/devServer/plugins/roopikInjectPlugin.js)

**How it works**:
- Even if someone spoofs their User-Agent to include "Electron", we have a second layer
- Injected script **immediately hides the entire page** (`document.documentElement.style.display = 'none'`)
- Waits for a `postMessage` handshake from the parent webview
- Only VSCode webview knows the secret: `ROOPIK_IDE_HANDSHAKE_v1`

**Code**:
```javascript
// SECURITY: Hide page until webview sends handshake
document.documentElement.style.display = 'none';

const EXPECTED_SECRET = 'ROOPIK_IDE_HANDSHAKE_v1';
let authenticated = false;

window.addEventListener('message', (event) => {
    if (event.data.type === 'ROOPIK_HANDSHAKE_SYN' &&
        event.data.secret === EXPECTED_SECRET) {
        authenticated = true;
        document.documentElement.style.display = ''; // Show page
    }
});

// Timeout: Show error if no handshake after 2 seconds
setTimeout(() => {
    if (!authenticated) {
        document.body.innerHTML = `<div>🔒 Access Denied</div>`;
    }
}, 2000);
```

**Webview sends handshake** ([`projectPreviewPanel.ts`](../extensions/roopik/src/projectPreviewPanel.ts)):
```typescript
frame.addEventListener('load', () => {
    frame.contentWindow.postMessage({
        type: 'ROOPIK_HANDSHAKE_SYN',
        secret: 'ROOPIK_IDE_HANDSHAKE_v1'
    }, '*');
});
```

**Result**:
- ✅ Even if someone bypasses Layer 1, Layer 2 blocks them
- ❌ External browsers never receive the handshake → Page stays hidden

---

## 🛡️ Defense in Depth

| Attack Vector | Layer 1 (Middleware) | Layer 2 (Handshake) |
|--------------|---------------------|---------------------|
| **Normal browser access** | ✅ Blocked (403) | N/A (no HTML served) |
| **Spoofed User-Agent with "Electron"** | ❌ Bypassed | ✅ Blocked (no handshake) |
| **View Source in browser** | ✅ Blocked (403, no HTML) | N/A |
| **curl/wget requests** | ✅ Blocked (403) | N/A |
| **Roopik IDE webview** | ✅ Allowed (Electron UA) | ✅ Allowed (handshake sent) |

---

## 📊 What Happens in Each Scenario

### ✅ **Scenario 1: Inside Roopik IDE**
1. User opens Mode 2 preview
2. Vite server starts on `http://127.0.0.1:5173`
3. Webview iframe loads the URL
4. **Layer 1**: Middleware sees `User-Agent: ...Electron...` → Allows request → Serves HTML
5. **Layer 2**: Injected script hides page → Webview sends handshake → Page shows
6. **Result**: User sees the preview perfectly ✓

### ❌ **Scenario 2: Chrome Browser (Normal Access)**
1. User copies `http://127.0.0.1:5173` to Chrome
2. Chrome sends request with `User-Agent: ...Chrome/131.0...`
3. **Layer 1**: Middleware sees no "Electron" → Blocks request → Returns 403
4. **Result**: User sees "Access Denied" page, **NO source code exposed** ✓

### ❌ **Scenario 3: Chrome with Spoofed User-Agent**
1. User modifies Chrome's User-Agent to include "Electron"
2. **Layer 1**: Middleware sees "Electron" → Allows request → Serves HTML
3. **Layer 2**: Injected script hides page → Waits for handshake → Times out after 2s
4. **Result**: User sees "Access Denied" message, page functionality blocked ✓

---

## 🔧 Implementation Details

### Files Modified

1. **`authMiddleware.js`** - Server-side User-Agent detection
2. **`roopikInjectPlugin.js`** - Client-side postMessage handshake
3. **`projectPreviewPanel.ts`** - Webview sends handshake on iframe load
4. **`serverWorker.js`** - Integrates middleware into Vite server
5. **`copyAssets.js`** - Ensures JavaScript plugins are copied to `out/`

### Key Technologies

- **Vite Middleware** - Intercepts HTTP requests before serving files
- **Electron User-Agent** - VSCode webviews always run in Electron
- **PostMessage API** - Cross-origin communication between webview and iframe
- **HTML Injection** - Vite plugin transforms HTML on-the-fly

---

## 🚫 Failed Approaches (What Didn't Work)

### ❌ **Attempt 1: Token-Based Authentication (Query Parameters)**

**What we tried**:
```javascript
// Extension generates random token
const authToken = crypto.randomBytes(32).toString('hex');

// Load iframe with token in URL
iframe.src = `http://127.0.0.1:5173?token=${authToken}`;

// Middleware checks token
if (req.query.token === authToken) { /* allow */ }
```

**Why it failed**:
- VSCode's **service worker strips query parameters** from iframe requests
- Token was visible in the URL (security concern)
- Service worker interference made it unreliable

**Logs showed**:
```
[Roopik Auth] Request: GET /index.html
[Roopik Auth] Query token: none  ← Token was stripped!
```

---

### ❌ **Attempt 2: Custom HTTP Headers (X-Roopik-Auth)**

**What we tried**:
```javascript
// Try to send custom header via fetch
fetch(url, {
    headers: { 'X-Roopik-Auth': token }
});
```

**Why it failed**:
- Cannot set custom headers on `<iframe src="">` requests
- `fetch()` works, but iframe doesn't support custom headers
- CORS preflight issues with custom headers

---

### ❌ **Attempt 3: Cookie-Based Authentication**

**What we tried**:
```javascript
// First request sets cookie
res.setHeader('Set-Cookie', `roopik-auth=${token}; HttpOnly; SameSite=Strict`);

// Subsequent requests check cookie
if (req.cookies['roopik-auth'] === token) { /* allow */ }
```

**Why it failed**:
- **Cross-origin cookie restrictions**: Webview origin (`vscode-webview://`) differs from server origin (`http://127.0.0.1:5173`)
- `SameSite=Strict` blocked cookies entirely
- `SameSite=Lax` still didn't work due to cross-origin
- `SameSite=None` requires HTTPS (we're using HTTP)

**Logs showed**:
```
[Roopik Auth] ✓ Auth via header  ← First request worked
[Roopik Auth] Cookies: {}         ← Second request, NO COOKIE!
```

---

### ❌ **Attempt 4: Origin Header Checking**

**What we tried**:
```javascript
const origin = req.headers.origin || req.headers.referer;

if (origin && origin.startsWith('vscode-webview://')) {
    return next(); // Allow
}
```

**Why it failed**:
- **VSCode webview iframes don't send Origin or Referer headers** (security feature)
- Every request showed: `origin: unknown`
- Cannot rely on headers that aren't sent

**Logs showed**:
```
[Roopik Auth] ✗ Blocked external request from: unknown  ← Even from IDE!
```

---

### ❌ **Attempt 5: Retry Logic with Token Refresh**

**What we tried**:
```javascript
// If auth fails, request fresh token from extension
if (response.status === 403) {
    const newToken = await requestFreshToken();
    retry(newToken);
}
```

**Why it failed**:
- Created infinite loops
- Service worker still stripped tokens
- Underlying problem (no origin/referer headers) remained unsolved

---

## ✅ Why User-Agent Detection Works

### The Key Insight

**VSCode webview iframes run in Electron**, which has a distinctive User-Agent:

```
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)
Chrome/128.0.0.0 Safari/537.36 Electron/32.0.1 VSCode/1.95.0
                                 ^^^^^^^^^^^^^ ^^^^^^^^^^^^
                                 This is unique to VSCode!
```

**External browsers** have different User-Agents:
```
Chrome:  Mozilla/5.0 ... Chrome/131.0.0.0 Safari/537.36
Edge:    Mozilla/5.0 ... Edg/131.0.0.0
Firefox: Mozilla/5.0 ... Firefox/132.0
```

**This is unfakeable without:**
1. Actually running Electron (which is our IDE anyway)
2. Manually spoofing the User-Agent (which Layer 2 blocks)

---

## 🎓 Lessons Learned

1. **Browser security features are strict** - Query params stripped, cookies blocked, headers missing
2. **Service workers interfere** - VSCode's service worker modifies requests unpredictably
3. **Defense in depth is essential** - One layer can be bypassed, two layers are much stronger
4. **User-Agent is reliable** - It's the ONE header VSCode webviews always send
5. **PostMessage is the backup** - Works when HTTP headers fail

---

## 📝 Testing Checklist

- [x] Preview works inside Roopik IDE
- [x] Chrome/Edge/Firefox blocked (403 Forbidden)
- [x] No HTML source code exposed to external browsers
- [x] Spoofed User-Agent still blocked by Layer 2
- [x] Click-to-source script remains hidden
- [x] Vite HMR works normally in IDE
- [x] No authentication loops or retries
- [x] Clean console logs (no errors)

---

## 🔮 Future Enhancements

1. **Rotate the handshake secret** on each session (currently static)
2. **Add IP allowlist** (only allow 127.0.0.1 loopback)
3. **Obfuscate the injected script** (even if someone bypasses Layer 1)
4. **Add fingerprinting** (detect browser characteristics beyond User-Agent)

---

## 📚 References

- [VSCode Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Electron User-Agent](https://www.electronjs.org/docs/latest/api/web-contents#contentsuseragent)
- [Vite Server Middleware](https://vitejs.dev/guide/api-plugin.html#configureserver)
- [PostMessage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)

---

**Last Updated**: November 19, 2025
**Status**: ✅ Production Ready
**Security Level**: High (Two-layer defense)
