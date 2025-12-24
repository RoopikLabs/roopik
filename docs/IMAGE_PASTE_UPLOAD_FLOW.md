# Image Paste & Upload Flow: Understanding and Extending

## The Question

> **"How does image paste (Ctrl+V) and image upload work in the chat window? Where are images stored temporarily? How can I connect VS Code's core browser screenshot button to automatically send images to the chat window without manually copying? Should I send image data via IPC events or use temporary file locations?"**

## Current Implementation Analysis

### Method 1: Paste Image (Ctrl+V) - In-Memory Processing

**Flow:**
```
User Copies Image → Clipboard → Ctrl+V in Chat → FileReader reads blob →
Base64 Data URL created → Stored in React state → Sent with message
```

**Key Points:**
- ✅ **No temporary files created**
- ✅ **Images stay in memory as base64 data URLs**
- ✅ **Instant preview in chat**
- ⚠️ **Limited to clipboard images only**

**Code Location:** `extensions/roopik-dio/webview/src/components/chat/ChatTextArea.tsx`

**Lines 700-738: Paste Handler**
```typescript
const handlePaste = useCallback(
  async (e: React.ClipboardEvent) => {
    const clipboardItems = e.clipboardData.items
    const imageItems: DataTransferItem[] = []

    // Find all image items in clipboard
    for (let i = 0; i < clipboardItems.length; i++) {
      const item = clipboardItems[i]
      if (item.type.startsWith("image/")) {
        imageItems.push(item)
      }
    }

    if (!shouldDisableImages && imageItems.length > 0) {
      e.preventDefault()

      const imagePromises = imageItems.map((item) => {
        return new Promise<string | null>((resolve) => {
          const blob = item.getAsFile()  // ← Get image as Blob from clipboard

          if (!blob) {
            resolve(null)
            return
          }

          const reader = new FileReader()  // ← Read blob in browser

          reader.onloadend = () => {
            if (reader.error) {
              console.error(t("chat:errorReadingFile"), reader.error)
              resolve(null)
            } else {
              const result = reader.result
              resolve(typeof result === "string" ? result : null)
            }
          }

          reader.readAsDataURL(blob)  // ← Convert to base64 data URL
        })
      })

      const imageDataArray = await Promise.all(imagePromises)
      const dataUrls = imageDataArray.filter((dataUrl): dataUrl is string => dataUrl !== null)

      if (dataUrls.length > 0) {
        // ← Store in React state as data URLs
        setSelectedImages((prevImages) => [...prevImages, ...dataUrls].slice(0, MAX_IMAGES_PER_MESSAGE))
      } else {
        console.warn(t("chat:noValidImages"))
      }
    }
  },
  [shouldDisableImages, setSelectedImages, cursorPosition, setInputValue, inputValue, t],
)
```

**What Happens:**
1. `e.clipboardData.items` - Access clipboard items
2. `item.getAsFile()` - Get image as Blob object
3. `FileReader.readAsDataURL(blob)` - Convert blob to base64 data URL (e.g., `"data:image/png;base64,ABC123..."`)
4. `setSelectedImages([...prevImages, dataUrl])` - Store in React state
5. **NO temporary file created** - Everything stays in memory!

### Method 2: Drag & Drop Image - Same In-Memory Processing

**Flow:**
```
User Drags Image File → Drop on Chat → FileReader reads File →
Base64 Data URL created → Stored in React state → Sent with message
```

**Code Location:** `extensions/roopik-dio/webview/src/components/chat/ChatTextArea.tsx`

**Lines 850-905: Drop Handler**
```typescript
const handleDrop = useCallback(
  async (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()

    // ... (handles file paths first) ...

    const files = Array.from(e.dataTransfer.files)  // ← Get dropped files

    if (files.length > 0) {
      const acceptedTypes = ["png", "jpeg", "webp"]

      const imageFiles = files.filter((file) => {
        const [type, subtype] = file.type.split("/")
        return type === "image" && acceptedTypes.includes(subtype)
      })

      if (!shouldDisableImages && imageFiles.length > 0) {
        const imagePromises = imageFiles.map((file) => {
          return new Promise<string | null>((resolve) => {
            const reader = new FileReader()  // ← Read file in browser

            reader.onloadend = () => {
              if (reader.error) {
                console.error(t("chat:errorReadingFile"), reader.error)
                resolve(null)
              } else {
                const result = reader.result
                resolve(typeof result === "string" ? result : null)
              }
            }

            reader.readAsDataURL(file)  // ← Convert to base64 data URL
          })
        })

        const imageDataArray = await Promise.all(imagePromises)
        const dataUrls = imageDataArray.filter((dataUrl): dataUrl is string => dataUrl !== null)

        if (dataUrls.length > 0) {
          // ← Store in React state as data URLs
          setSelectedImages((prevImages) =>
            [...prevImages, ...dataUrls].slice(0, MAX_IMAGES_PER_MESSAGE),
          )

          if (typeof vscode !== "undefined") {
            vscode.postMessage({ type: "draggedImages", dataUrls: dataUrls })
          }
        } else {
          console.warn(t("chat:noValidImages"))
        }
      }
    }
  },
  [/* ... */],
)
```

**Same pattern:**
- `e.dataTransfer.files` - Get dropped files
- `FileReader.readAsDataURL(file)` - Convert to base64
- `setSelectedImages()` - Store in React state
- **NO temporary file created**

### Method 3: Upload via Button - Creates Temporary Files!

**Flow:**
```
User Clicks Image Icon → VS Code File Dialog → User Selects Files →
Files read from disk → Base64 Data URL created → Sent to Webview →
Stored in React state
```

**Key Points:**
- ✅ **Files already exist on disk** (user selects them)
- ✅ **Extension reads files and converts to base64**
- ✅ **Sends base64 data URLs to webview** (not file paths!)
- ⚠️ **Reading large files can be slow**

**Frontend Code:** `extensions/roopik-dio/webview/src/components/chat/ChatView.tsx`

**Lines 781-783: Button Click Handler**
```typescript
const selectImages = useCallback(() => {
  console.log('[ChatView] selectImages called, sending message to backend')
  vscode.postMessage({ type: "selectImages" })  // ← Ask extension to show file picker
}, [])
```

**Backend Code:** `extensions/roopik-dio/src/core/webview/webviewMessageHandler.ts`

**Lines 642-649: Message Handler**
```typescript
case "selectImages":
  const images = await selectImages()  // ← Call selectImages function
  await provider.postMessageToWebview({
    type: "selectedImages",
    images,  // ← Array of base64 data URLs
    context: message.context,
    messageTs: message.messageTs,
  })
  break
```

**Image Selection Logic:** `extensions/roopik-dio/src/integrations/misc/process-images.ts`

**Lines 5-47: Complete Implementation**
```typescript
export async function selectImages(): Promise<string[]> {
  const options: vscode.OpenDialogOptions = {
    canSelectMany: true,
    openLabel: "Select",
    filters: {
      Images: ["png", "jpg", "jpeg", "webp"],
    },
  }

  const fileUris = await vscode.window.showOpenDialog(options)  // ← Show file picker

  if (!fileUris || fileUris.length === 0) {
    return []
  }

  return await Promise.all(
    fileUris.map(async (uri) => {
      const imagePath = uri.fsPath
      const buffer = await fs.readFile(imagePath)  // ← Read file from disk
      const base64 = buffer.toString("base64")      // ← Convert to base64
      const mimeType = getMimeType(imagePath)       // ← Get MIME type
      const dataUrl = `data:${mimeType};base64,${base64}`  // ← Create data URL
      return dataUrl
    }),
  )
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case ".png":
      return "image/png"
    case ".jpeg":
    case ".jpg":
      return "image/jpeg"
    case ".webp":
      return "image/webp"
    default:
      throw new Error(`Unsupported file type: ${ext}`)
  }
}
```

**What Happens:**
1. User clicks image icon → Webview sends `{ type: "selectImages" }` message
2. Extension shows VS Code file picker dialog
3. User selects image files from disk
4. Extension reads each file using `fs.readFile()`
5. Converts to base64 and wraps in data URL format
6. Sends **base64 data URLs** back to webview
7. Webview stores in React state

**Frontend Receives Response:** `extensions/roopik-dio/webview/src/components/chat/ChatView.tsx`

**Lines 815-823: Handle selectedImages Response**
```typescript
case "selectedImages":
  // Only handle selectedImages if it's not for editing context
  const isForEditingContext = message.context === "edit" && message.messageTs
  if (!isForEditingContext) {
    setSelectedImages((prevImages: string[]) =>
      // ← Append base64 data URLs to state
      [...prevImages, ...(message.images || [])].slice(0, MAX_IMAGES_PER_MESSAGE),
    )
  }
  break
```

### Key Insight: Everything Uses Base64 Data URLs!

**All three methods converge to the same format:**
```typescript
// Example data URL stored in React state
const imageDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."

// State structure
const [selectedImages, setSelectedImages] = useState<string[]>([
  "data:image/png;base64,ABC123...",
  "data:image/jpeg;base64,XYZ789...",
])
```

**When message is sent:** `extensions/roopik-dio/webview/src/components/chat/ChatView.tsx`

**Lines 1374-1376: Send with Images**
```typescript
} else if (!sendingDisabled && !isProfileDisabled && (inputValue.trim() || selectedImages.length > 0)) {
  handleSendMessage(inputValue, selectedImages)  // ← Pass base64 data URLs
}
```

**The base64 data URLs are then:**
1. Sent to extension as part of message
2. Converted to Anthropic format (see IMAGE_HANDLING_ARCHITECTURE.md)
3. Transformed to provider-specific format (Gemini, OpenAI, etc.)
4. Sent to LLM API

## How to Connect Browser Screenshot Button

### ❌ Bad Approach: Send Base64 via IPC Event

```typescript
// DON'T DO THIS - Too much overhead!
const screenshot = await captureScreenshot() // Returns base64 string
vscode.postMessage({
  type: "addScreenshot",
  data: screenshot  // ← Sending large base64 string via IPC (BAD!)
})
```

**Why this is bad:**
- Large base64 strings (100KB-5MB) sent through IPC
- IPC channels have message size limits
- Can cause performance issues
- Unnecessary serialization/deserialization

### ✅ Better Approach: Save Temp File, Send Path

```typescript
// BETTER - Save to temp file, send path
const tempFilePath = await saveScreenshotToTemp() // Save to temp location
vscode.postMessage({
  type: "addScreenshot",
  path: tempFilePath  // ← Send only file path (small!)
})
```

**Extension reads file:**
```typescript
case "addScreenshot":
  const buffer = await fs.readFile(message.path)
  const base64 = buffer.toString("base64")
  const dataUrl = `data:image/png;base64,${base64}`

  await provider.postMessageToWebview({
    type: "selectedImages",
    images: [dataUrl],
  })
  break
```

### ✅ Best Approach: Reuse Existing selectImages Infrastructure

Since `selectImages()` already handles file reading and base64 conversion, we can extend it!

## Recommended Implementation

### Step 1: Extend selectImages to Accept File Paths

**File:** `extensions/roopik-dio/src/integrations/misc/process-images.ts`

Add new function:

```typescript
/**
 * Convert image file paths to base64 data URLs without showing dialog
 * Used for programmatic image additions (e.g., screenshot button)
 */
export async function imagePathsToDataUrls(filePaths: string[]): Promise<string[]> {
  return await Promise.all(
    filePaths.map(async (imagePath) => {
      const buffer = await fs.readFile(imagePath)
      const base64 = buffer.toString("base64")
      const mimeType = getMimeType(imagePath)
      const dataUrl = `data:${mimeType};base64,${base64}`
      return dataUrl
    }),
  )
}
```

### Step 2: Add New Message Type for Screenshot

**File:** `extensions/roopik-dio/src/shared/ExtensionMessage.ts`

Add to the union type:

```typescript
| {
    type: "addScreenshotFromPath"
    path: string
  }
```

### Step 3: Handle Screenshot Message in Extension

**File:** `extensions/roopik-dio/src/core/webview/webviewMessageHandler.ts`

Add new case:

```typescript
case "addScreenshotFromPath":
  // Convert screenshot file to base64 data URL
  const screenshotDataUrls = await imagePathsToDataUrls([message.path])

  // Send to webview to add to selectedImages
  await provider.postMessageToWebview({
    type: "selectedImages",
    images: screenshotDataUrls,
    context: undefined,  // Not for editing, for new message
    messageTs: undefined,
  })

  // Optional: Clean up temp file after sending
  // await fs.unlink(message.path)
  break
```

### Step 4: Create Screenshot Button in Core

**File:** Create new command in core VS Code (wherever browser commands are)

```typescript
import * as vscode from 'vscode'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

async function captureAndSendScreenshot() {
  try {
    // 1. Capture screenshot (your existing logic)
    const screenshotBuffer = await captureScreenshotFromBrowser()

    // 2. Save to temp file
    const tempDir = os.tmpdir()
    const tempFileName = `roopik-screenshot-${Date.now()}.png`
    const tempFilePath = path.join(tempDir, tempFileName)

    await fs.writeFile(tempFilePath, screenshotBuffer)

    // 3. Send file path to roopik-dio extension via IPC
    // This is lightweight - just sending a string path!
    await vscode.commands.executeCommand(
      'roopik-dio.addScreenshotFromPath',
      tempFilePath
    )

    // 4. Show notification
    vscode.window.showInformationMessage('Screenshot added to chat!')

  } catch (error) {
    vscode.window.showErrorMessage(`Failed to capture screenshot: ${error}`)
  }
}
```

### Step 5: Register Command in roopik-dio Extension

**File:** `extensions/roopik-dio/src/extension/extension.ts`

Register the command:

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand(
    'roopik-dio.addScreenshotFromPath',
    async (filePath: string) => {
      // Send to webview via message handler
      const provider = /* get your provider instance */
      await provider.handleWebviewMessage({
        type: "addScreenshotFromPath",
        path: filePath,
      })
    }
  )
)
```

### Alternative: Direct Event to Webview

If you want even more direct control:

**Core → Extension:**
```typescript
// In core, send event
vscode.commands.executeCommand('roopik.browser.screenshotCaptured', tempFilePath)
```

**Extension → Webview:**
```typescript
// In extension, listen and forward
context.subscriptions.push(
  vscode.commands.registerCommand(
    'roopik.browser.screenshotCaptured',
    async (filePath: string) => {
      const dataUrls = await imagePathsToDataUrls([filePath])
      await provider.postMessageToWebview({
        type: "selectedImages",
        images: dataUrls,
      })
    }
  )
)
```

## Architecture Comparison

### Current Manual Flow
```
User: Copy screenshot manually
  ↓
User: Ctrl+V in chat
  ↓
Clipboard → Blob → FileReader → Base64 → React State
```

### Proposed Automated Flow
```
User: Click screenshot button in browser toolbar
  ↓
Core: Capture screenshot → Save to temp file
  ↓
Core → Extension IPC: Send file path (lightweight!)
  ↓
Extension: Read file → Convert to base64
  ↓
Extension → Webview: Send base64 data URL
  ↓
Webview: Add to selectedImages (same as manual paste!)
```

## Performance Considerations

### Why Temp Files Are Better Than IPC Data Transfer

**Bad (Direct Base64 via IPC):**
```typescript
// Screenshot: 1920x1080 PNG ≈ 2MB base64 = 2,700,000 characters
const base64 = screenshot.toString('base64')  // 2.7MB string
await vscode.postMessage({
  type: "screenshot",
  data: base64  // ← Sending 2.7MB through IPC channel!
})
```

Problems:
- JSON stringification of 2.7MB string
- IPC message size limits (varies by platform)
- Memory copies during serialization
- Potential timeouts on large messages

**Good (File Path via IPC):**
```typescript
// File path: ~50-100 characters
const tempPath = "/tmp/screenshot-123.png"  // 50 bytes
await vscode.postMessage({
  type: "screenshot",
  path: tempPath  // ← Sending tiny string!
})

// Extension reads file only when needed
const buffer = await fs.readFile(tempPath)  // Efficient file I/O
```

Benefits:
- Tiny IPC message (just path string)
- File system handles large data efficiently
- Can be cleaned up asynchronously
- No IPC size limits to worry about

### Comparison Table

| Method | IPC Message Size | Memory Usage | Reliability | Speed |
|--------|------------------|--------------|-------------|-------|
| **Base64 via IPC** | 2-5 MB | High (multiple copies) | Risk of size limits | Slow (serialization) |
| **File Path via IPC** | <1 KB | Low (single copy) | Very reliable | Fast (no serialization) |
| **Direct FileReader** | N/A (frontend only) | Medium | Very reliable | Fast (browser native) |

## File Locations Reference

### Frontend (Webview)
- **Paste Handler:** `extensions/roopik-dio/webview/src/components/chat/ChatTextArea.tsx` (Lines 700-738)
- **Drop Handler:** `extensions/roopik-dio/webview/src/components/chat/ChatTextArea.tsx` (Lines 850-905)
- **Image Button:** `extensions/roopik-dio/webview/src/components/chat/ChatView.tsx` (Lines 781-783)
- **Selected Images State:** `extensions/roopik-dio/webview/src/components/chat/ChatView.tsx` (Line 134)
- **Message Receiver:** `extensions/roopik-dio/webview/src/components/chat/ChatView.tsx` (Lines 815-823)

### Backend (Extension)
- **Message Handler:** `extensions/roopik-dio/src/core/webview/webviewMessageHandler.ts` (Lines 642-649)
- **Image Processing:** `extensions/roopik-dio/src/integrations/misc/process-images.ts` (Lines 5-47)
- **Message Types:** `extensions/roopik-dio/src/shared/ExtensionMessage.ts`

### Core VS Code (Your Implementation)
- **Browser Service:** `src/vs/workbench/contrib/roopik/electron-main/projectMode/browserViewService.ts`
- **Screenshot Logic:** `src/vs/workbench/contrib/roopik/electron-main/projectMode/browserViewService.ts` (Lines ~400-450)
- **Browser Commands:** `src/vs/workbench/contrib/roopik/browser/commands/browserCommands.ts`

## Implementation Checklist

- [ ] Create `imagePathsToDataUrls()` function in `process-images.ts`
- [ ] Add `addScreenshotFromPath` message type to `ExtensionMessage.ts`
- [ ] Add case handler in `webviewMessageHandler.ts`
- [ ] Register command in extension: `roopik-dio.addScreenshotFromPath`
- [ ] Create screenshot capture function in core (save to temp file)
- [ ] Call command from core with temp file path
- [ ] Test with actual screenshot
- [ ] Add cleanup logic for temp files (optional)
- [ ] Add error handling for file read failures
- [ ] Update UI to show screenshot button (if needed)

## Testing Strategy

### Manual Test Steps

1. **Test Paste (Existing):**
   - Copy any image to clipboard
   - Ctrl+V in chat
   - Verify image appears in preview
   - Send message
   - Verify LLM receives image

2. **Test Upload (Existing):**
   - Click image icon in chat
   - Select image file
   - Verify image appears in preview
   - Send message
   - Verify LLM receives image

3. **Test Screenshot Button (New):**
   - Navigate to a web page in browser
   - Click screenshot button in toolbar
   - Verify image appears in chat preview automatically
   - Send message
   - Verify LLM receives image

4. **Test Multiple Images:**
   - Add image via paste
   - Add image via upload
   - Add image via screenshot button
   - Verify all 3 appear
   - Send message
   - Verify LLM receives all 3

### Edge Cases to Test

- [ ] Screenshot while chat has max images (should show error)
- [ ] Screenshot while model doesn't support images (should show warning)
- [ ] Large screenshots (>5MB)
- [ ] Screenshot of invalid format (should never happen, but handle gracefully)
- [ ] Temp file cleanup after sending
- [ ] Concurrent screenshot captures
- [ ] Screenshot while another message is being sent

## Summary

### How Images Currently Work

1. **Paste (Ctrl+V):**
   - Clipboard → Blob → FileReader → Base64 → React State
   - **No temp files**, all in memory

2. **Drag & Drop:**
   - File → FileReader → Base64 → React State
   - **No temp files**, all in memory

3. **Upload Button:**
   - File Picker → Extension reads file → Base64 → Webview → React State
   - Files exist on disk (user's files)

### Best Way to Connect Screenshot Button

**Recommended Approach:**
1. Core captures screenshot
2. Save to **temporary file** (e.g., `/tmp/roopik-screenshot-123.png`)
3. Send **file path** via IPC (lightweight!)
4. Extension reads file and converts to base64
5. Extension sends base64 data URL to webview
6. Webview adds to `selectedImages` (same as paste/upload)
7. User sends message (image included automatically)

**Why This Works:**
- ✅ Reuses existing infrastructure (`selectedImages` state)
- ✅ Minimal IPC overhead (just path string)
- ✅ Same user experience as paste
- ✅ Automatic preview in chat
- ✅ No changes needed to LLM integration

**Key Principle:**
> "Don't send large data through IPC - send a reference to where the data is (file path), and let the receiver read it efficiently."
