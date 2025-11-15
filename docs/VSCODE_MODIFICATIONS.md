# VS Code Core Modifications

Track of all VS Code core files we've modified (for upstream conflict handling).

| File | Change | Reason |
|------|--------|--------|
| `build/gulpfile.extensions.mjs:47` | Added `extensions/roopik/tsconfig.json` | Register roopik extension in build system |
| `build/hygiene.mjs:19-32` | Added Roopik copyright header check | Allow Roopik copyright alongside Microsoft |
| `build/hygiene.mjs:114-136` | Modified copyright validation logic | Check for either Microsoft or Roopik header |
| `eslint.config.js:2185-2205` | Added roopik extension header override | Allow Roopik copyright in extensions/roopik/ |
