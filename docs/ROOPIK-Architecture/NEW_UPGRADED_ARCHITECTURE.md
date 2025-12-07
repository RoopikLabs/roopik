# Roopik IDE: Final Architecture Blueprint

## 1. Core Philosophy & Key Insights

1.  **The Boilerplate Insight:** No component renders in isolation. It *always* requires a runtime, a DOM mount point, mock data, and dependencies. Our architecture's primary job is to manage this boilerplate intelligently and automatically.
2.  **The Two-Mode Solution:** A "one-size-fits-all" sandbox is impossible. Users need two distinct modes:
    * **Mode 1: "Headless" Component Sandbox:** For instantly previewing and customizing individual components (from AI, Figma, or Git). This must be fast, isolated, and scalable to hundreds of instances.
    * **Mode 2: "Full App" Project Sandbox:** For previewing an entire, assembled application with real routing and state, running from a full project structure.
3.  **The Incremental Roadmap:** We will build from maximum control (AI) to maximum complexity (existing Git repos):
    * **Phase 1:** AI-Generated Components
    * **Phase 2:** Figma Import
    * **Phase 3:** GitHub/Local Project Import
4.  **The "Source of Truth" Principle:** The AI (or import analyzer) must produce a single, self-contained, human-readable file that contains *both* the component's code and a "manifest" of its dependencies. This file is the single "source of truth" for all other processes.

## 2. Architecture Overview: "The Hybrid Engine"

Our architecture is a hybrid, "best-of-both-worlds" design. It uses a different engine for each of its two modes, all orchestrated by a central `PreviewManager`.

* **Mode 1 Engine (Client-Side Transpilation):**
    * **Used For:** Phase 1 (AI) & Phase 2 (Figma), and individual components from Phase 3 (Git).
    * **Mechanism:** Loads a single, reusable `sandbox_template.html` into an `<iframe>`.
    * **Action:** Component code and CDN URLs are sent to the `iframe` via `postMessage`. All transpilation (Babel) and rendering (React) happen *inside the browser*.
    * **Pros:** Instant cold start (<50ms), zero server processes, perfect isolation, and scales to 1,000+ sandboxes.

* **Mode 2 Engine (Project Dev Server):**
    * **Used For:** Assembled app previews from Phase 3 (Git).
    * **Mechanism:** Spins up **one (1) single** Node.js dev server (e.g., Vite) for the *entire project*.
    * **Action:** Renders the server's URL (e.g., `http://localhost:5173`) into a single, full-screen `<iframe>`.
    * **Pros:** 100% project fidelity, handles complex routing, state, and file-based imports.

## 3. The "Source of Truth" Pipeline (The Core of Mode 1)

This is the complete, end-to-end process for generating, rendering, and customizing a new component in "Mode 1".

### Step 1: The "Golden Prompt"

This is the explicit, machine-readable prompt your IDE sends to the AI.

> "Generate 1 variation of a "Login Form" using React, Tailwind CSS, and Material UI.
>
> CRITICAL:
>
> 1.  Provide the variation as a **separate, single, isolated `.jsx` file**.
>
> 2.  The code **MUST** be standard, modern React code.
>
> 3.  The code **MUST** use `import` statements for all dependencies (e.g., `import { Button } from '@mui/material';`).
>
> 4.  The code **MUST** have a `default export`.
>
> **DEPENDENCY MANIFEST (VERY IMPORTANT):**
> At the *very top* of the file, you **MUST** include a JSON comment block that maps *every* imported package to its CDN URL and the global variable it creates. The CDN URL **MUST** include a specific version.
>
> **EXAMPLE MANIFEST:**
>
> ```jsx
> // DEPENDENCIES: [
> //   { "npm": "@mui/material", "global": "mui", "url": "[https://unpkg.com/@mui/material@5.15.14/umd/material-ui.development.js](https://unpkg.com/@mui/material@5.15.14/umd/material-ui.development.js)" }
> // ]
> ```

### Step 2: The AI's Response (The "Source of Truth" File)

The AI returns *one* file. This file is loaded into your IDE's memory and is the "Source of Truth" for this component.

```jsx
// DEPENDENCIES: [
//   { "npm": "@mui/material", "global": "mui", "url": "[https://unpkg.com/@mui/material@5.15.14/umd/material-ui.development.js](https://unpkg.com/@mui/material@5.15.14/umd/material-ui.development.js)" },
//   { "npm": "@mui/icons-material", "global": "MuiIcons", "url": "[https://unpkg.com/@mui/icons-material@5.15.14/umd/icons-material.development.js](https://unpkg.com/@mui/icons-material@5.15.14/umd/icons-material.development.js)" }
// ]

import React, { useState } from 'react';
import { Button, TextField, Box, Typography } from '@mui/material';
import { Email } from '@mui/icons-material';

export default function MuiLoginForm() {
  const [email, setEmail] = useState('user@example.com');

  return (
    <Box
      component="form"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: 3,
        borderRadius: 2,
        boxShadow: 3,
        width: 350,
        backgroundColor: 'white'
      }}
    >
      <Typography variant="h5" component="h2" align="center">
        Login
      </Typography>
      <TextField
        label="Email"
        variant="outlined"
        size="small"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        InputProps={{
          startAdornment: <Email sx={{ marginRight: 1 }} />
        }}
      />
      <TextField
        label="Password"
        type="password"
        variant="outlined"
        size="small"
      />
      <Button variant="contained" size="large">
        Log In
      </Button>
    </Box>
  );
}
```

### Step 3: The "On-Load" Transformation (IDE -> Editor)

This happens **once** when the component is loaded into the editor.

1.  **Parse Manifest:** The IDE reads the `// DEPENDENCIES` JSON.
2.  **Create Translation Map:** It builds a `Map` object and stores it for the session:
    * `"@mui/material"` => `"mui"`
    * `"@mui/icons-material"` => `"MuiIcons"`
3.  **Get CDN List:** It extracts the `url`s for the sandbox.
4.  **Transform Code:** It converts the "Source of Truth" code into **"Session Code"**:
    * `import { Button, ... } from '@mui/material';` **becomes** `const { Button, ... } = mui;`
    * `import { Email } from '@mui/icons-material';` **becomes** `const { Email } = MuiIcons;`
    * `export default function...` **becomes** `function...`
5.  **Load Editor:** This new, transformed "Session Code" (the `const` version) is loaded into the user's code editor.

### Step 4: The Live-Editing Loop (Hot-Reload)

This is the core editing loop.

1.  **Send to Sandbox:** The **"Session Code"** (from Step 3) and the **CDN List** are sent to the `sandbox_template.html` `iframe` via `postMessage`.
2.  **User Edits:** The user types in the editor *or* uses your UI panel (which programmatically edits the editor's text).
3.  **Hot-Reload:** On *any* change, the new "Session Code" from the editor is sent via `postMessage` to the *same iframe*. The sandbox instantly re-transpiles and re-renders.
4.  **Result:** A 1:1 sync between the editor and preview, providing an instant, seamless hot-reload with no build step.

### Step 5: The "On-Download" Transformation (Editor -> File)

This happens **once** when the user clicks "Download."

1.  **Get Code:** The IDE takes the final "Session Code" from the editor.
2.  **Get Map:** It retrieves the "Translation Map" from Step 3.
3.  **Reverse Transform:** It uses the map to reverse the process:
    * `const { Button, ... } = mui;` **becomes** `import { Button, ... } from '@mui/material';`
    * `const { Email } = MuiIcons;` **becomes** `import { Email } from '@mui/icons-material';`
4.  **Save:** The user downloads a **100% clean, standard, `import`-based** `.jsx` file, ready for any professional project.

## 4. Core Technical Deep Dive: Isolation & Caching

This design achieves perfect isolation *and* shared caching using the `iframe` model.

* **The Building (The Browser/Electron App):** This is the single Chromium instance. It has **one (1) shared network and cache layer** (the "building's plumbing").
* **The Apartment (The `<iframe>` Sandbox):** This is the isolated sandbox. It has **one (1) private `window` object** (the "apartment's air").

This solves both problems:

* **Caching Works (Shared Plumbing):**
    1.  `Sandbox 1` (an `iframe`) requests `react@18.js`.
    2.  The "Building" (Browser) downloads this file, **saves it to the cache**, and gives it to `Sandbox 1`.
    3.  `Sandbox 2` (a different `iframe`) also requests `react@18.js`.
    4.  The "Building" says "I have this!" and **instantly serves it from the cache**.
    * **Pro:** You get blazing-fast loads for shared dependencies.

* **Isolation Works (Private Air):**
    1.  `Sandbox 1` loads `mui@5.js`. This creates `WINDOW_1.mui`.
    2.  `Sandbox 2` loads `mui@4.js`. This creates `WINDOW_2.mui`.
    * **Pro:** There is **zero conflict**. The two `window` objects are completely separate and cannot see or affect each other, even when using different versions of the same library.

## 5. Final Module Responsibilities

This is the unified module structure for your IDE.

* **`preview/core/PreviewManager` (The Smart Translator)**
    * Orchestrates the "Source of Truth" pipeline.
    * Performs the "On-Load" (`import` -> `const`) and "On-Download" (`const` -> `import`) transformations.
    * Stores the "Translation Map" for each active sandbox.
    * Routes requests to the correct renderer (Mode 1 or Mode 2).

* **`preview/source/` (ai, figma, project) (The "Source of Truth" Generators)**
    * **`ai/`:** Implements the "Golden Prompt" logic.
    * **`figma/`:** Parses Figma exports and generates the "Source of Truth" `.jsx` file.
    * **`project/`:** (Used by `analyzer/`) Helps generate the "Source of Truth" manifest for existing user files.

* **`preview/boilerplate/BoilerplateGenerator` (The Sandbox Template Owner)**
    * **Does NOT** generate boilerplate *files* for each component.
    * **Manages** and serves the single, reusable `sandbox_template.html` for Mode 1.
    * **Manages** the "Full App" templates for Mode 2.
    * Provides the base CDN list (React, Babel) to the `PreviewManager`.

* **`preview/renderer/ComponentRenderer` (The Mode 1 "Client-Side" Engine)**
    * Manages the pool of `<iframe>`s loading `sandbox_template.html`.
    * Receives `postMessage` payloads from the `PreviewManager` and routes them to the correct `iframe`.
    * This is the *entire* "Headless" preview system.

* **`preview/renderer/AppRenderer` (The Mode 2 "Project" Engine)**
    * Manages the `<iframe>` for the "Full App" preview.
    * Its *only* job is to point its `iframe`'s `src` to the URL provided by the `server/DevServerManager`.

* **`preview/server/DevServerManager` (The Mode 2 Server)**
    * **Does NOT** run for individual components.
    * **Used ONLY** for "Full App" (Mode 2) previews.
    * Spins up, manages, and terminates the single Node.js dev server (Vite, etc.) for a full project.

* **`preview/analyzer/` (The Phase 3 Engine)**
    * **Responsibility:** Scans Git/Local projects (AST analysis, etc.).
    * **Output:** Identifies renderable components and dependencies.
    * **Goal:** Works with `source/project` to generate the "Source of Truth" (Manifest + `import` code) for *existing* files.

* **`preview/composer/` (The App Assembler)**
    * **Responsibility:** Manages the logic for which component variations are "selected" to be assembled into the "Full App" (Mode 2) preview.

## 6. Implementation Roadmap & Success Criteria

This architecture directly supports an incremental, 3-phase roadmap.

* **Phase 1: AI-Generated Components**
    * **Goal:** Prove the core "Mode 1" concept.
    * **Focus:** Build the `PreviewManager`, `ComponentRenderer`, and `source/ai` modules.
    * **Success:** A user can type a prompt, see an isolated sandbox, edit it, and get an instant hot-reload. **Fast rendering (<100ms)**.

* **Phase 2: Figma Import**
    * **Goal:** Bridge design-to-code.
    * **Focus:** Build the `source/figma` module.
    * **Success:** A Figma export is parsed and *plugs directly into the existing "Source of Truth" pipeline*, reusing all of Phase 1's infrastructure.

* **Phase 3: GitHub/Local Project Import**
    * **Goal:** Support existing, complex projects.
    * **Focus:** Build the "Mode 2" engine: `analyzer/`, `server/`, and `AppRenderer`.
    * **Success:** A user can import a real-world project, see a "Full App" preview, *and* see its individual components isolated in our "Mode 1" sandboxes.

## 7. Proposed VS Code Extension File Structure

This file structure organizes the architecture within a standard VS Code extension.

```plaintext
roopik-ide/
├── .vscode/
│   ├── launch.json         # VS Code debugging configurations
│   └── tasks.json
├── .gitignore
├── package.json            # 📜 The extension manifest. CRITICAL.
├── tsconfig.json           # TypeScript configuration for the extension
├── webpack.config.js       # Bundler config (for extension & webviews)
├── README.md
├── node_modules/
│
├── media/                  # Icons, logos, and static assets
│   └── icon.png
│
├── out/                    # Compiled extension JavaScript (from `src/`)
│
├── src/                    # 🧠 "THE EXTENSION BACKEND" (Runs in VS Code's Node.js host)
│   │
│   ├── extension.ts        # 🚀 Main entry point. `activate()` and `deactivate()`
│   ├── commands.ts         # Registers all commands (e.g., "Roopik: New Canvas")
│   │
│   ├── preview/            # 🌟 CORE ARCHITECTURE LIVES HERE
│   │   │
│   │   ├── core/
│   │   │   ├── PreviewManager.ts   # 💡 **THE SMART TRANSLATOR** (Manages the "Two-State" logic)
│   │   │   │                     # 1. Stores the "Translation Map"
│   │   │   │                     # 2. Performs "On-Load" (`import` -> `const`) transform
│   │   │   │                     # 3. Performs "On-Download" (`const` -> `import`) transform
│   │   │   │                     # 4. Orchestrates all other modules
│   │   │   │
│   │   │   ├── PreviewRegistry.ts  # Tracks all active sandboxes and their state
│   │   │   └── WebviewProvider.ts  # Manages creating/showing the Canvas & Panel webviews
│   │   │
│   │   ├── source/             # 📖 "SOURCE OF TRUTH" GENERATORS
│   │   │   ├── aiGenerator.ts    # 1. Implements the "Golden Prompt"
│   │   │   │                     # 2. Calls the AI
│   │   │   │                     # 3. Returns the "Source of Truth" .jsx file
│   │   │   │
│   │   │   ├── figmaImporter.ts  # 2. Parses Figma export -> "Source of Truth" .jsx
│   │   │   └── gitImporter.ts    # 3. Helps `analyzer` create "Source of Truth" for existing files
│   │   │
│   │   ├── analyzer/           # 🔬 "PHASE 3" ENGINE (For Git/Local Import)
│   │   │   ├── astParser.ts      # Reads code to find imports, components, etc.
│   │   │   └── dependencyAnalyzer.ts
│   │   │
│   │   ├── renderer/           # 📦 "MODE 1" (Client-Side) & "MODE 2" (Server-Side)
│   │   │   ├── ComponentSandbox.ts # Handles "Mode 1": sends `postMessage` payloads
│   │   │   └── AppSandbox.ts       # Handles "Mode 2": manages the `iframe`'s `src` URL
│   │   │
│   │   ├── server/             # 💻 "MODE 2" ENGINE (Full Project)
│   │   │   ├── DevServerManager.ts # Manages the single Vite/dev-server process
│   │   │   └── portManager.ts      # Finds and allocates free ports
│   │   │
│   │   └── composer/           # 🧩 "App Assembler" (Links Mode 1 selections to Mode 2)
│   │       └── VariantResolver.ts
│   │
│   └── utils/                # Common helpers, logger, etc.
│       └── logger.ts
│
└── webviews/               # 🖥️ "THE EXTENSION FRONTENDS" (Run in browser contexts)
    │
    ├── canvas/             # 🎨 "THE INFINITE CANVAS" WEBVIEW (A full React App)
    │   ├── index.html
    │   ├── main.tsx        # React entry point for the canvas
    │   ├── App.tsx         # The main <App>
    │   ├── components/
    │   │   ├── Canvas.tsx        # The main panning/zooming canvas UI
    │   │   └── SandboxFrame.tsx  # React component that renders the `<iframe>`
    │   │                         # and listens for `status: 'ready'`
    │   │
    │   ├── hooks/
    │   │   ├── useVscodeApi.ts   # Hook for communicating with `extension.ts`
    │   │   └── useSandbox.ts     # Hook to manage `postMessage` to a sandbox `iframe`
    │   │
    │   └── vite.config.ts  # Its own build config
    │
    ├── panel/              # 💬 "THE PROPERTIES/AI" WEBVIEW (A separate React App)
    │   ├── index.html
    │   ├── main.tsx        # React entry point for the panel
    │   ├── App.tsx         # The main <App>
    │   ├── components/
    │   │   ├── PropertyEditor.tsx  # UI for changing props (sends message to extension)
    │   │   └── AiChat.tsx        # AI chat.
    │   │
    │   └── vite.config.ts
    │
    └── sandbox/            # 🚗 **THE MODE 1 "SANDBOX ENGINE"**
        │
        └── sandbox_template.html # 🔧 **THE REUSABLE SANDBOX TEMPLATE**
                                  # This single, static HTML file is loaded into
                                  # every "Mode 1" iframe. It contains the
                                  # `postMessage` listener and Babel/CDN logic.
```
