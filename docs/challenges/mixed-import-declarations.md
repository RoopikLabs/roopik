# Challenge: Mixed Import Declarations Causing Duplicate Variable Errors

**Date Encountered**: 2025-11-17
**Phase**: Mode 1 Preview System - Import Transformation
**Status**: Solved

---

## Problem Description

PreviewManager's import transformation was creating duplicate variable declarations when converting `import React, { useState } from 'react'` to const declarations, causing syntax errors in transpiled code.

### Symptoms
- Components failed to render despite CSP being fixed
- Babel transpilation succeeded but code execution failed
- Error appeared in sandbox iframe

### Error Messages
```
Uncaught TypeError: Cannot read properties of undefined (reading '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED')
at react-dom.production.min.js:218:172

[Sandbox] Component error: SyntaxError: Identifier 'React' has already been declared
at new Function (<anonymous>)
at renderComponent (about:srcdoc:37:39)
```

### Environment
- Mode 1 architecture (client-side transpilation)
- React 18.2.0 from unpkg.com CDN
- Sample code with mixed imports: `import React, { useState } from 'react';`

---

## Attempted Solutions

### Attempt 1: Original regex patterns
**Result**: Created `const React = React;` (duplicate!)
**Why it failed**: Didn't handle mixed import pattern (default + named imports in one line)

---

## Solution

Updated `PreviewManager.transformToSessionCode()` to handle three import patterns with special logic for when import name === global name.

### Steps
1. Handle mixed imports first: `import React, { useState } from 'react'`
2. Handle named imports: `import { Button } from '@mui/material'`
3. Handle default imports: `import React from 'react'`
4. Skip transformation when import name matches global variable

### Code Changes

**File: `src/preview/core/PreviewManager.ts`**
```typescript
// Transform imports to const declarations
source.dependencies.forEach(dep => {
  const escapedNpm = dep.npm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 1. Match: import React, { useState } from 'react'
  const mixedImportRegex = new RegExp(
    `import\\s+(\\w+)\\s*,\\s*{([^}]+)}\\s+from\\s+['"]${escapedNpm}['"];?`,
    'g'
  );
  transformedCode = transformedCode.replace(mixedImportRegex, (_, defaultName, namedImports) => {
    // If default name matches global (e.g., React === React), just destructure named imports
    if (defaultName === dep.global) {
      return `const {${namedImports}} = ${dep.global};`;
    }
    // Otherwise, create both const declarations
    return `const ${defaultName} = ${dep.global};\nconst {${namedImports}} = ${dep.global};`;
  });

  // 2. Match: import { ... } from '@mui/material'
  const importRegex = new RegExp(
    `import\\s+{([^}]+)}\\s+from\\s+['"]${escapedNpm}['"];?`,
    'g'
  );
  transformedCode = transformedCode.replace(importRegex, (_, imports) => {
    return `const {${imports}} = ${dep.global};`;
  });

  // 3. Match: import React from 'react'
  const defaultImportRegex = new RegExp(
    `import\\s+(\\w+)\\s+from\\s+['"]${escapedNpm}['"];?`,
    'g'
  );
  transformedCode = transformedCode.replace(defaultImportRegex, (_, name) => {
    // Skip if import name matches global (e.g., import React = React)
    if (name === dep.global) {
      return ''; // Remove the import entirely, global is already available
    }
    return `const ${name} = ${dep.global};`;
  });
});
```

### Transformation Examples

```javascript
// Before transformation:
import React, { useState } from 'react';

// After transformation (correct):
const { useState } = React;
// React is already global from CDN, no need to redeclare

// ---

// Before transformation:
import MyButton, { Icon } from '@mui/material';

// After transformation:
const MyButton = mui;
const { Icon } = mui;
```

### Verification
- ✅ Button sample (simple import) renders
- ✅ Counter sample (mixed import with useState) renders
- ✅ Card sample (simple import) renders
- ✅ No duplicate declaration errors
- ✅ React hooks work correctly

---

## Root Cause

**Import transformation didn't account for:**
1. Mixed imports (default + named in one line)
2. Cases where import name matches the global variable name (React === React)

When globals are loaded from CDN (window.React, window.ReactDOM), we don't need to create const declarations for them - they're already available. We only need to destructure named exports like `useState`, `useEffect`, etc.

---

## Prevention

- Test import transformation with all patterns:
  - `import React from 'react'`
  - `import { useState } from 'react'`
  - `import React, { useState } from 'react'`
  - `import MyButton from '@mui/material'`
- Add unit tests for PreviewManager transformation logic
- Document the "import name === global name" edge case
- Consider using a proper AST parser (Babel) instead of regex for production

---

## Related Issues

- Challenge: CSP blocking external scripts (see `iframe-sandbox-csp-errors.md`)
- PreviewManager architecture: `docs/NEW_UPGRADED_ARCHITECTURE.md`

---

## References

- ES6 import syntax: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import
- React UMD builds: https://legacy.reactjs.org/docs/cdn-links.html
