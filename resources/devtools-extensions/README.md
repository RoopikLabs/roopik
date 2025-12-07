# DevTools Extensions for Roopik

This folder contains Chrome DevTools extensions that can be loaded into Roopik's browser preview.

## Supported Extensions

These extensions work well with Electron's limited Chrome Extension API:

- **React Developer Tools** - Inspect React components, props, state, hooks
- **Vue.js devtools** - Debug Vue.js applications
- **Redux DevTools** - Debug Redux state changes
- **Angular DevTools** - Debug Angular applications
- **Preact DevTools** - Inspect Preact components
- **Svelte DevTools** - Debug Svelte applications

## How to Add an Extension

### Method 1: Manual Download (Recommended)

1. **Get the Extension ID**
   - Go to the Chrome Web Store page for the extension
   - The ID is in the URL: `https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi`
   - In this case, the ID is `fmkadmapgofadopljbjfkapdkoienihi`

2. **Download the CRX file**
   - Use a CRX downloader website like:
     - https://crxextractor.com/
     - https://chrome-extension-downloader.com/
   - Enter the extension URL or ID

3. **Extract the Extension**
   - Rename the `.crx` file to `.zip`
   - Extract the zip contents

4. **Add to This Folder**
   - Create a new folder with a descriptive name (e.g., `react-devtools`)
   - Copy the extracted files into that folder
   - The folder should contain a `manifest.json` file

5. **Update manifest.json**
   - Add an entry to the `extensions` array in `manifest.json`:
   ```json
   {
     "name": "React Developer Tools",
     "path": "react-devtools",
     "enabled": true,
     "description": "Inspect React component hierarchy",
     "chromeWebStoreId": "fmkadmapgofadopljbjfkapdkoienihi"
   }
   ```

6. **Restart Roopik**
   - The extension will be loaded on next startup

### Method 2: From Chrome (if you have it installed)

1. Find Chrome's extension folder:
   - Windows: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions`
   - macOS: `~/Library/Application Support/Google/Chrome/Default/Extensions`
   - Linux: `~/.config/google-chrome/Default/Extensions`

2. Locate the extension by its ID

3. Copy the version folder contents to this directory

## Folder Structure

```
devtools-extensions/
├── manifest.json           # Configuration file
├── README.md              # This file
├── react-devtools/        # React DevTools extension
│   ├── manifest.json      # Extension's manifest
│   ├── build/
│   └── ...
├── vue-devtools/          # Vue DevTools extension
└── redux-devtools/        # Redux DevTools extension
```

## Enabling/Disabling Extensions

Edit `manifest.json` and set `enabled` to `true` or `false`:

```json
{
  "name": "React Developer Tools",
  "path": "react-devtools",
  "enabled": false  // Disabled
}
```

## Limitations

Electron only supports a subset of Chrome Extension APIs. The following will NOT work:

- Extensions requiring `chrome.tabs` API
- Extensions requiring `chrome.windows` API
- Extensions requiring `chrome.storage.sync` (only `local` works)
- Extensions that modify the browser UI (toolbars, popups)
- Content scripts with special permissions
- Background service workers (Manifest V3)

## Troubleshooting

### Extension not loading
- Check the Roopik logs for errors
- Ensure the extension folder has a valid `manifest.json`
- Some extensions require specific manifest versions

### Extension loaded but not working
- Open DevTools and check the console for errors
- The extension might use unsupported Chrome APIs
- Try an older version of the extension

### React DevTools not detecting React
- Make sure the page is using development React build
- Production builds have DevTools disabled by default
