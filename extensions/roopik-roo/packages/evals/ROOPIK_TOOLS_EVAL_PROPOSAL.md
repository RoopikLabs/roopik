# Roopik Tools Evaluation Proposal

## Overview

This document proposes eval scenarios for Roopik's custom IDE tools. While the existing eval system tests general coding capabilities, these tools require specialized testing that validates IDE-specific interactions.

## Why Separate Evals for Roopik Tools?

| Aspect | Coding Evals | Roopik Tool Evals |
|--------|--------------|-------------------|
| **Environment** | Isolated containers | Requires Roopik IDE |
| **Success Criteria** | Unit tests pass | UI state validated |
| **Validation** | Automated test suite | Visual + state checks |
| **Scope** | General programming | IDE-specific features |
| **Isolation** | Complete | Requires IPC connection |

## Proposed Eval Structure

```
packages/evals/src/roopik-tools/
├── browser/
│   ├── navigation.eval.ts
│   ├── interaction.eval.ts
│   ├── debugging.eval.ts
│   └── performance.eval.ts
├── canvas/
│   ├── component-lifecycle.eval.ts
│   └── multi-component.eval.ts
├── project/
│   └── dev-server.eval.ts
└── integration/
    └── end-to-end.eval.ts
```

---

## Browser Tools Evals

### 1. Navigation Eval

**Objective:** Test ability to navigate and interact with web pages

```typescript
export const browserNavigationEval = {
  id: "browser_navigation_basic",
  description: "Navigate to a page and verify URL",

  setup: async () => {
    // Start a test HTTP server
    return await startTestServer({
      port: 5000,
      routes: {
        "/": "<h1>Home</h1>",
        "/about": "<h1>About</h1>",
        "/contact": "<h1>Contact</h1>"
      }
    })
  },

  prompt: `
Navigate to http://localhost:5000
Then navigate to the /about page
Take a screenshot to verify you're on the correct page
`,

  expectedBehavior: {
    tools: [
      { name: "browser_open", params: { url: "http://localhost:5000" } },
      { name: "browser_navigate", params: { url: "/about" } },
      { name: "browser_screenshot" }
    ],
    minTools: 3,
    maxTools: 5 // Allow some flexibility
  },

  validate: async (result) => {
    // Check tool calls
    const usedBrowserOpen = result.tools.some(t => t.name === "browser_open")
    const usedNavigate = result.tools.some(t => t.name === "browser_navigate")
    const usedScreenshot = result.tools.some(t => t.name === "browser_screenshot")

    // Check final state
    const browserState = await getBrowserState()
    const onCorrectPage = browserState.url.includes("/about")

    return {
      success: usedBrowserOpen && usedNavigate && usedScreenshot && onCorrectPage,
      metrics: {
        toolCallCorrectness: usedBrowserOpen && usedNavigate ? 1.0 : 0.5,
        finalStateCorrect: onCorrectPage,
        efficiency: result.tools.length <= 5 ? 1.0 : 0.8
      }
    }
  },

  cleanup: async (server) => {
    await server.stop()
  }
}
```

### 2. Form Interaction Eval

**Objective:** Test form filling and submission

```typescript
export const browserFormInteractionEval = {
  id: "browser_form_interaction",
  description: "Fill and submit a login form",

  setup: async () => {
    return await startTestServer({
      port: 5001,
      routes: {
        "/login": `
          <form id="login-form">
            <input id="username" type="text" />
            <input id="password" type="password" />
            <button id="submit">Login</button>
          </form>
        `,
        "/dashboard": "<h1>Welcome to Dashboard</h1>"
      },
      handlers: {
        "POST /login": (req) => {
          if (req.body.username === "test" && req.body.password === "pass123") {
            return { redirect: "/dashboard" }
          }
          return { status: 401 }
        }
      }
    })
  },

  prompt: `
Navigate to http://localhost:5001/login
Fill in the username field with "test"
Fill in the password field with "pass123"
Click the submit button
Verify you reach the dashboard
`,

  expectedBehavior: {
    tools: ["browser_open", "browser_action_input", "browser_screenshot"],
    requiredSequence: [
      { name: "browser_open" },
      { name: "browser_action_input", count: 3 }, // type username, password, click
      { name: "browser_screenshot" }
    ]
  },

  validate: async (result) => {
    const finalUrl = await getCurrentBrowserUrl()
    const onDashboard = finalUrl.includes("/dashboard")

    const typeActions = result.tools.filter(t =>
      t.name === "browser_action_input" &&
      t.params.action === "type"
    ).length

    const clickActions = result.tools.filter(t =>
      t.name === "browser_action_input" &&
      t.params.action === "click"
    ).length

    return {
      success: onDashboard && typeActions >= 2 && clickActions >= 1,
      metrics: {
        formInteractionCorrect: typeActions >= 2 && clickActions >= 1,
        authenticationSuccessful: onDashboard,
        toolUsageEfficiency: result.tools.length <= 7 ? 1.0 : 0.7
      }
    }
  }
}
```

### 3. CSS Inspection Eval

**Objective:** Test element inspection and style analysis

```typescript
export const browserCssInspectionEval = {
  id: "browser_css_inspection",
  description: "Inspect element styles and identify CSS source",

  setup: async () => {
    return await startTestServer({
      port: 5002,
      routes: {
        "/": `
          <style>
            .btn-primary {
              background: blue;
              color: white;
            }
          </style>
          <button class="btn-primary">Click Me</button>
        `
      }
    })
  },

  prompt: `
Navigate to http://localhost:5002
Inspect the button element and tell me what color its background is
`,

  expectedBehavior: {
    tools: ["browser_open", "browser_inspect_element"],
    criticalTool: "browser_inspect_element"
  },

  validate: async (result) => {
    const usedInspect = result.tools.some(t => t.name === "browser_inspect_element")
    const mentionedBlue = result.response.toLowerCase().includes("blue")

    return {
      success: usedInspect && mentionedBlue,
      metrics: {
        usedCorrectTool: usedInspect,
        extractedCorrectInfo: mentionedBlue,
        responseQuality: mentionedBlue && usedInspect ? 1.0 : 0.5
      }
    }
  }
}
```

### 4. Error Detection Eval

**Objective:** Test ability to identify JavaScript errors

```typescript
export const browserErrorDetectionEval = {
  id: "browser_error_detection",
  description: "Detect and report JavaScript errors",

  setup: async () => {
    return await startTestServer({
      port: 5003,
      routes: {
        "/": `
          <h1>Page with Error</h1>
          <script>
            throw new Error("Something went wrong!");
          </script>
        `
      }
    })
  },

  prompt: `
Navigate to http://localhost:5003
Check if there are any JavaScript errors on the page
Report what errors you find
`,

  expectedBehavior: {
    tools: ["browser_open", "browser_get_errors"],
    mustUse: ["browser_get_errors"]
  },

  validate: async (result) => {
    const usedGetErrors = result.tools.some(t => t.name === "browser_get_errors")
    const reportedError = result.response.toLowerCase().includes("something went wrong")

    return {
      success: usedGetErrors && reportedError,
      metrics: {
        usedDebuggingTool: usedGetErrors,
        identifiedError: reportedError,
        debuggingCompleteness: usedGetErrors && reportedError ? 1.0 : 0.6
      }
    }
  }
}
```

---

## Canvas & Component Tools Evals

### 5. Component Creation Eval

**Objective:** Test component creation and canvas integration

```typescript
export const canvasComponentCreationEval = {
  id: "canvas_component_basic",
  description: "Create React component and add to canvas",

  setup: async () => {
    // Ensure Roopik IDE is running
    await ensureRoopikIDE()
    // Create test workspace
    const workspace = await createTestWorkspace({
      framework: "react",
      dependencies: ["react", "react-dom"]
    })
    return workspace
  },

  prompt: `
Create a simple React button component in the current workspace.
The button should:
- Accept a 'text' prop
- Accept an 'onClick' prop
- Have basic styling

Save it to a folder called "Button" and add it to the active canvas.
`,

  expectedBehavior: {
    tools: [
      "write_to_file",
      "component_add"
    ],
    fileCreated: /Button\.(tsx|jsx)$/,
    canvasUpdate: true
  },

  validate: async (result, workspace) => {
    // Check file was created
    const buttonFile = await findFile(workspace.path, /Button\.(tsx|jsx)$/)
    const fileExists = buttonFile !== null

    // Check component was added to canvas
    const components = await listComponents(await getActiveCanvasId())
    const buttonComponent = components.find(c => c.name.toLowerCase().includes("button"))
    const addedToCanvas = buttonComponent !== null

    // Check component builds successfully
    let buildsSuccessfully = false
    if (buttonComponent) {
      const buildResult = await waitForComponentBuild(buttonComponent.id, { timeout: 30000 })
      buildsSuccessfully = buildResult.success
    }

    // Check code quality
    const code = fileExists ? await readFile(buttonFile) : ""
    const hasTextProp = code.includes("text")
    const hasOnClickProp = code.includes("onClick")

    return {
      success: fileExists && addedToCanvas && buildsSuccessfully,
      metrics: {
        fileCreation: fileExists ? 1.0 : 0.0,
        canvasIntegration: addedToCanvas ? 1.0 : 0.0,
        buildSuccess: buildsSuccessfully ? 1.0 : 0.0,
        codeQuality: (hasTextProp && hasOnClickProp) ? 1.0 : 0.5,
        overallQuality: (fileExists + addedToCanvas + buildsSuccessfully + (hasTextProp && hasOnClickProp)) / 4
      }
    }
  },

  cleanup: async (workspace) => {
    await deleteWorkspace(workspace.path)
  }
}
```

### 6. Multi-Component Batch Eval

**Objective:** Test batch component addition

```typescript
export const canvasBatchComponentEval = {
  id: "canvas_component_batch",
  description: "Create multiple components and batch add to canvas",

  setup: async () => {
    const workspace = await createTestWorkspace({ framework: "react" })
    return workspace
  },

  prompt: `
Create three different button components:
1. PrimaryButton - blue background
2. SecondaryButton - gray background
3. DangerButton - red background

Add all three to the active canvas at once using batch operations.
`,

  expectedBehavior: {
    tools: ["write_to_file", "component_add_batch"],
    mustUse: ["component_add_batch"],
    minFiles: 3
  },

  validate: async (result, workspace) => {
    // Check files created
    const files = await findFiles(workspace.path, /Button\.(tsx|jsx)$/)
    const createdThreeFiles = files.length >= 3

    // Check batch add was used
    const usedBatchAdd = result.tools.some(t => t.name === "component_add_batch")

    // Check all components in canvas
    const components = await listComponents(await getActiveCanvasId())
    const buttonComponents = components.filter(c =>
      c.name.toLowerCase().includes("button")
    )
    const addedThreeComponents = buttonComponents.length >= 3

    return {
      success: createdThreeFiles && usedBatchAdd && addedThreeComponents,
      metrics: {
        fileCreation: createdThreeFiles ? 1.0 : (files.length / 3),
        usedBatchOperation: usedBatchAdd ? 1.0 : 0.0,
        canvasIntegration: addedThreeComponents ? 1.0 : (buttonComponents.length / 3),
        efficiency: usedBatchAdd ? 1.0 : 0.5 // Penalize if used individual adds
      }
    }
  }
}
```

### 7. Component Rebuild Eval

**Objective:** Test modification and rebuild workflow

```typescript
export const canvasComponentRebuildEval = {
  id: "canvas_component_rebuild",
  description: "Modify component code and trigger rebuild",

  setup: async () => {
    const workspace = await createTestWorkspace({ framework: "react" })

    // Pre-create a component
    const componentPath = `${workspace.path}/TestComponent`
    await writeFile(`${componentPath}/index.tsx`, `
      export const TestComponent = () => {
        return <div>Original</div>
      }
    `)

    const component = await addComponent({
      folderPath: componentPath,
      name: "TestComponent"
    })

    await waitForComponentBuild(component.id)

    return { workspace, componentId: component.id, componentPath }
  },

  prompt: `
Modify the TestComponent to display "Modified" instead of "Original"
Then rebuild the component to see the changes in the canvas
`,

  expectedBehavior: {
    tools: ["write_to_file", "component_rebuild"],
    mustModifyFile: true
  },

  validate: async (result, context) => {
    // Check file was modified
    const newCode = await readFile(`${context.componentPath}/index.tsx`)
    const wasModified = newCode.includes("Modified") && !newCode.includes("Original")

    // Check rebuild was triggered
    const usedRebuild = result.tools.some(t => t.name === "component_rebuild")

    // Check component built successfully
    const buildResult = await getComponentBuildStatus(context.componentId)
    const buildSuccessful = buildResult.success

    return {
      success: wasModified && usedRebuild && buildSuccessful,
      metrics: {
        codeModification: wasModified ? 1.0 : 0.0,
        triggeredRebuild: usedRebuild ? 1.0 : 0.0,
        buildSuccess: buildSuccessful ? 1.0 : 0.0
      }
    }
  }
}
```

---

## Project Mode Evals

### 8. Dev Server Lifecycle Eval

**Objective:** Test project start/stop workflow

```typescript
export const projectDevServerEval = {
  id: "project_dev_server_lifecycle",
  description: "Start and stop a dev server for a project",

  setup: async () => {
    // Create a minimal Vite project
    const projectPath = await createTestProject({
      framework: "vite-react",
      template: "minimal"
    })
    return { projectPath }
  },

  prompt: `
Start the dev server for the project at the current workspace
Verify it's running by checking the active project
Then stop the server
`,

  expectedBehavior: {
    tools: ["project_start", "project_get_active", "project_stop"],
    sequence: [
      { name: "project_start" },
      { name: "project_get_active" }, // Verify
      { name: "project_stop" }
    ]
  },

  validate: async (result, context) => {
    const usedStart = result.tools.some(t => t.name === "project_start")
    const usedGetActive = result.tools.some(t => t.name === "project_get_active")
    const usedStop = result.tools.some(t => t.name === "project_stop")

    // Check no server is running now
    const finalState = await getActiveProject()
    const serverStopped = finalState === null

    return {
      success: usedStart && usedGetActive && usedStop && serverStopped,
      metrics: {
        lifecycleComplete: usedStart && usedStop ? 1.0 : 0.5,
        verification: usedGetActive ? 1.0 : 0.8,
        cleanShutdown: serverStopped ? 1.0 : 0.0
      }
    }
  },

  cleanup: async (context) => {
    // Ensure server is stopped
    await stopProject()
    await deleteProject(context.projectPath)
  }
}
```

---

## Integration Evals (End-to-End)

### 9. Full Workflow Eval

**Objective:** Test complete workflow from component creation to browser verification

```typescript
export const fullWorkflowEval = {
  id: "integration_component_to_browser",
  description: "Create component, add to canvas, start project, verify in browser",

  setup: async () => {
    const workspace = await createTestWorkspace({
      framework: "vite-react",
      includeRouter: true
    })
    return workspace
  },

  prompt: `
Create a landing page component with:
- A heading "Welcome to Roopik"
- A button "Get Started"

Add it to the canvas, then start the dev server and verify it renders correctly in the browser.
`,

  expectedBehavior: {
    tools: [
      "write_to_file",
      "component_add",
      "project_start",
      "browser_open",
      "browser_screenshot"
    ],
    minTools: 5
  },

  validate: async (result, workspace) => {
    // Component creation
    const componentFile = await findFile(workspace.path, /Landing\.(tsx|jsx)$/i)
    const componentCreated = componentFile !== null

    // Canvas integration
    const canvasComponents = await listComponents(await getActiveCanvasId())
    const addedToCanvas = canvasComponents.some(c =>
      c.name.toLowerCase().includes("landing")
    )

    // Project started
    const activeProject = await getActiveProject()
    const projectRunning = activeProject !== null

    // Browser verification
    const usedBrowser = result.tools.some(t => t.name.startsWith("browser_"))

    // Content verification
    const code = componentCreated ? await readFile(componentFile) : ""
    const hasHeading = code.includes("Welcome to Roopik")
    const hasButton = code.includes("Get Started")

    return {
      success: componentCreated && addedToCanvas && projectRunning && usedBrowser,
      metrics: {
        componentCreation: componentCreated ? 1.0 : 0.0,
        canvasIntegration: addedToCanvas ? 1.0 : 0.0,
        projectSetup: projectRunning ? 1.0 : 0.0,
        browserVerification: usedBrowser ? 1.0 : 0.0,
        contentQuality: (hasHeading && hasButton) ? 1.0 : 0.5,
        workflowCompleteness: (componentCreated + addedToCanvas + projectRunning + usedBrowser) / 4
      }
    }
  },

  cleanup: async (workspace) => {
    await stopProject()
    await deleteWorkspace(workspace.path)
  }
}
```

---

## Metrics Collection

Each eval should collect standardized metrics:

```typescript
interface RoopikToolEvalMetrics {
  // Tool Usage
  toolSelectionAccuracy: number      // Did it choose the right tools?
  parameterCorrectness: number       // Were tool arguments correct?
  toolCallEfficiency: number         // Did it use minimal necessary tools?

  // Task Completion
  taskCompletionRate: number         // Did it complete the full task?
  partialCompletionSteps: number     // How many steps completed?

  // Quality
  codeQuality: number                // Code correctness/style
  uiStateCorrectness: number         // Final UI state matches expected
  buildSuccess: number               // Component builds without errors

  // Efficiency
  executionTime: number              // Total time taken
  tokenUsage: number                 // Tokens consumed
  costEstimate: number               // API cost

  // Reliability
  errorRecovery: number              // Handled errors gracefully?
  edgeCaseHandling: number           // Dealt with unusual inputs?
}
```

---

## Implementation Priority

### Phase 1: High-Value, Low-Complexity ✅

1. **Browser Navigation** - Tests core browser tool usage
2. **Component Creation** - Validates canvas integration
3. **Dev Server Lifecycle** - Ensures project management works

### Phase 2: Interaction & Edge Cases 🎯

4. **Form Interaction** - Tests complex browser actions
5. **Component Rebuild** - Validates modification workflow
6. **CSS Inspection** - Tests debugging capabilities

### Phase 3: Advanced & Integration 🚀

7. **Batch Component** - Validates efficiency features
8. **Error Detection** - Tests debugging tools
9. **Full Workflow** - End-to-end integration

---

## Running the Evals

### Option 1: Standalone Script

```bash
# Run specific eval
pnpm eval:roopik --test browser_navigation_basic

# Run all browser evals
pnpm eval:roopik --category browser

# Run full suite
pnpm eval:roopik --all
```

### Option 2: Integration with Existing System

```typescript
// Add to packages/evals/src/cli/runEvals.ts

import { roopikToolEvals } from '../roopik-tools'

// Register Roopik tool evals alongside coding evals
const allEvals = [
  ...codingExerciseEvals,
  ...roopikToolEvals
]
```

---

## Success Criteria

An eval is considered **successful** if:

1. ✅ **Tool Selection** ≥ 80% accuracy
2. ✅ **Parameter Correctness** ≥ 90%
3. ✅ **Task Completion** = 100%
4. ✅ **Build Success** ≥ 95% (for component evals)
5. ✅ **No Errors** in execution

---

## Next Steps

1. **Choose 3 priority evals** from Phase 1
2. **Implement minimal test harness** (setup/validate utilities)
3. **Run manually** to establish baseline
4. **Add to CI/CD** for regression testing
5. **Iterate** based on findings

This gives you a **practical, incremental path** to evaluating your custom Roopik tools while leveraging the existing eval infrastructure! 🎯
