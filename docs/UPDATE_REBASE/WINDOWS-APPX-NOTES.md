# Windows AppX/MSIX Notes

This repo ships the normal Windows outputs:
- User installer (.exe)
- Portable folder (.zip / extracted)

AppX/MSIX is a separate Windows Store / enterprise packaging format that is not
used for the community build. The packaging pipeline includes an AppX manifest
template, and the Windows build used to fail because it expected AppX context
menu metadata (win32ContextMenu CLSIDs) that we do not configure.

## What changed
- build/gulpfile.vscode.ts now checks for win32ContextMenu.<arch>.clsid before
  wiring the AppX manifest.
- If the CLSID is missing, the build skips AppX packaging and logs a warning.
- build/gulpfile.vscode.win32.ts now only wires AppX files into the Inno Setup
  installer when the AppX package + DLL are present. This keeps the .exe
  installer working even when AppX output is disabled.

## Why we changed it
- We are not shipping AppX/MSIX builds.
- Skipping AppX avoids a hard failure in the Windows packaging step.
- The normal installer and portable outputs are unaffected.

## How to apply during rebase
After running `apply-branding.js`, apply the AppX patches:

```bash
# Apply the patches
git apply docs/UPDATE_REBASE/patches/disable-appx-gulpfile-vscode.patch
git apply docs/UPDATE_REBASE/patches/disable-appx-gulpfile-win32.patch
```

These patches are automatically applied by `apply-branding.js` at the end of the branding process.

## If we ever want AppX/MSIX later
- Add win32ContextMenu CLSIDs to product.json for each arch.
- Provide a context menu COM server DLL (replace the default code_* DLL).
- Update publisher metadata in resources/win32/appx/AppxManifest.xml.
