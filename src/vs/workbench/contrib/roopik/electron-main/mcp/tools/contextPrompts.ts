/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Contextual Prompts
 *
 * Pre-written workflow guides that teach AI agents how to chain MCP tools effectively.
 * These are NOT tools - they're recipes for common tasks.
 */

/**
 * Register all contextual prompts with the MCP server
 *
 * @param server - McpServer instance (dynamically imported)
 */
export function registerContextPrompts(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	server: any
): void {

	// --------------------------------------------------------------
	// PROMPT: How to Start a Project
	// --------------------------------------------------------------
	server.prompt(
		'how-to-start-project',
		'Step-by-step guide for starting a development server for an existing project',
		async () => {
			return {
				messages: [{
					role: 'user' as const,
					content: {
						type: 'text' as const,
						text: `# How to Start a Project in Roopik

This workflow teaches you how to start a development server for an existing project.

## Step-by-Step Process:

### 1. Detect the Project Framework
First, call **roopik_detectFramework** to identify the project type:
- Provide the project path
- Returns: framework (react/vue/angular/nextjs/etc), packageManager (npm/yarn/pnpm), detectedScripts

### 2. Start the Development Server
Call **roopik_startProject** with the detected information:
- Provide projectPath, framework, and packageManager
- The dev server will start in the background
- Returns immediately with success status

### 3. Wait for the Server to Be Ready
Call **roopik_getActiveProject** repeatedly (every 2-3 seconds) until:
- status === 'running'
- url is available (e.g., http://localhost:3000)
- This usually takes 5-15 seconds

### 4. Navigate to the Running App
Once running, call **roopik_navigate** to view the app:
- Get the browserViewId from the active canvas
- Use the url from getActiveProject
- The browser will load the running application

### 5. Take a Screenshot (Optional)
Call **roopik_takeScreenshot** to see the initial state:
- Helps verify the app loaded correctly
- Provides visual feedback to the user

## Common Pitfalls:
- Don't navigate before status === 'running' (server not ready yet)
- Don't start multiple servers for the same project
- Always check for existing running projects first with getActiveProject

## Example Tool Chain:
detectFramework → startProject → (wait) → getActiveProject → navigate → takeScreenshot`
					}
				}]
			};
		}
	);

	// --------------------------------------------------------------
	// PROMPT: How to Create a Component
	// --------------------------------------------------------------
	server.prompt(
		'how-to-create-component',
		'Step-by-step guide for creating a new canvas component',
		async () => {
			return {
				messages: [{
					role: 'user' as const,
					content: {
						type: 'text' as const,
						text: `# How to Create a Component in Roopik

This workflow teaches you how to create a new component on a canvas.

## Step-by-Step Process:

### 1. Get or Create a Canvas
Call **roopik_getActiveCanvas** to find the current canvas:
- If no active canvas, call **roopik_createCanvas** with a name
- Returns canvasId which you'll need for the next steps

### 2. Create the Component
Call **roopik_createComponent** with:
- canvasId: from step 1
- name: component name (e.g., "Button", "Card")
- type: 'html', 'react', 'vue', 'angular'
- initialCode: the HTML/JSX/template code
- styles: CSS/SCSS/LESS code (optional)
- Returns componentId and metadata

### 3. Wait for Build to Complete
Call **roopik_getComponentStatus** every 1-2 seconds until:
- buildStatus === 'success'
- buildErrors.length === 0
- This usually takes 2-5 seconds

### 4. Check the Build Result
If buildStatus === 'failed':
- Read buildErrors array for specific error messages
- Most common: syntax errors, missing imports, invalid CSS
- Fix the code and call **roopik_updateComponent**

### 5. View the Component (Optional)
Once build succeeds:
- The component will be visible in the canvas
- Call **roopik_takeScreenshot** to see the rendered result
- Or call **roopik_listComponents** to verify it appears in the list

## Common Pitfalls:
- Don't create components with duplicate names in the same canvas
- Always wait for build completion before checking visual results
- Remember to provide valid code for the component type (JSX for React, template for Vue, etc.)

## Example Tool Chain:
getActiveCanvas → createComponent → (wait) → getComponentStatus → takeScreenshot`
					}
				}]
			};
		}
	);

	// --------------------------------------------------------------
	// PROMPT: How to Inspect & Fix CSS
	// --------------------------------------------------------------
	server.prompt(
		'how-to-inspect-css',
		'Step-by-step guide for inspecting CSS and finding source files to edit',
		async () => {
			return {
				messages: [{
					role: 'user' as const,
					content: {
						type: 'text' as const,
						text: `# How to Inspect & Fix CSS in Roopik

This workflow teaches you THE MOAT capability - CSS inspection with source resolution that competitors can't match.

## Step-by-Step Process:

### 1. Navigate to the Page
Call **roopik_navigate** to load the page with the element you want to inspect:
- Get browserViewId from the active canvas
- Provide the URL (usually http://localhost:3000 or similar)
- Wait for page to fully load

### 2. Take a Screenshot (Optional but Helpful)
Call **roopik_takeScreenshot** to see the visual state:
- Helps you describe what element you're targeting
- Useful for confirming the issue exists

### 3. Inspect the Element's CSS
Call **roopik_inspectElement** with:
- browserViewId: from step 1
- selector: CSS selector (e.g., ".btn-primary", "#header", "button.submit")
- includeInherited: true (to see inherited styles)
- includeUserAgent: false (usually don't need browser defaults)

### 4. Analyze the CSS Data
The response gives you THE MOAT - file:line:column precision:
- **matchedRules**: Array of CSS rules that apply to this element
  - Each rule has: selector, file (absolute path), location { line, column }
  - Properties with isOverridden: true are being overridden by more specific rules
  - Specificity scores help understand cascade order
- **properties**: Final computed styles with values
- **cssInJs**: Detection of CSS-in-JS frameworks (styled-components, emotion, etc.)
- **inheritedStyles**: Styles from parent elements

### 5. Find the Source File to Edit
Look at matchedRules to find where to make changes:
- Filter by origin !== 'user-agent' to skip browser defaults
- Look for highest specificity rules that aren't overridden
- Use the **file** and **location** fields to know exactly where to edit
- Example: "/project/src/styles/button.scss" at line 45, column 3

### 6. Make the Edit
Use your file editing capabilities to:
- Open the source file from matchedRules[].file
- Go to the line number from matchedRules[].location.line
- Modify the CSS property
- Save the file

### 7. Reload and Verify
Call **roopik_reload** to see the changes:
- browserViewId: same as step 1
- ignoreCache: true (for hard reload)
- Then call takeScreenshot or inspectElement again to verify the fix

## Why This Is THE MOAT:
- Traditional tools: "This element has color: red" (but where does it come from?)
- Roopik: "color: red is defined in button.scss at line 45:3, overriding button.css line 12:5"
- Includes source maps: SCSS/LESS/PostCSS files, not just compiled CSS
- Detects CSS-in-JS with component file locations
- Shows the full cascade: what's overridden and why

## Common Pitfalls:
- Don't inspect before the page is fully loaded
- For dynamic elements, wait for them to appear in the DOM
- Some styles might be from CSS-in-JS (check cssInJs field)
- Check isOverridden: if true, your edit won't have visible effect

## Example Tool Chain:
navigate → takeScreenshot → inspectElement → (analyze matchedRules) → (edit file) → reload → takeScreenshot`
					}
				}]
			};
		}
	);

	// --------------------------------------------------------------
	// PROMPT: Full Development Workflow
	// --------------------------------------------------------------
	server.prompt(
		'full-dev-workflow',
		'Complete workflow from starting a project to creating and previewing components',
		async () => {
			return {
				messages: [{
					role: 'user' as const,
					content: {
						type: 'text' as const,
						text: `# Full Development Workflow in Roopik

This workflow teaches you the complete cycle of starting a project, creating components, and previewing results.

## Step-by-Step Process:

### Phase 1: Start the Project
1. Call **roopik_detectFramework** to identify project type
2. Call **roopik_startProject** with detected info
3. Poll **roopik_getActiveProject** until status === 'running'

### Phase 2: Setup Canvas
4. Call **roopik_getActiveCanvas** to check for existing canvas
5. If no canvas, call **roopik_createCanvas** with a meaningful name
6. Store the canvasId for all subsequent operations

### Phase 3: Create Components
7. Call **roopik_createComponent** for each component you want to add:
   - Provide canvasId from Phase 2
   - Use appropriate type (react/vue/html)
   - Include both code and styles
8. After each component, poll **roopik_getComponentStatus** until buildStatus === 'success'
9. If build fails, read buildErrors and fix the code with **roopik_updateComponent**

### Phase 4: Preview in Browser
10. Call **roopik_navigate** to load the canvas preview:
    - Get browserViewId from canvas
    - URL will be the canvas preview URL (usually http://localhost:3001/canvas/<id>)
11. Call **roopik_takeScreenshot** to see the rendered components
12. Optionally call **roopik_inspectElement** to check specific element styles

### Phase 5: Iterate and Refine
13. Based on the screenshot or inspection results:
    - Call **roopik_updateComponent** to modify component code/styles
    - Wait for build completion with getComponentStatus
    - Call **roopik_reload** to refresh the preview
    - Take another screenshot to verify changes

### Phase 6: Final Validation
14. Call **roopik_listComponents** to verify all components exist
15. Call **roopik_getCanvasDetails** to see metadata and stats
16. Take a final screenshot to show the complete result

## Real-World Example:
User: "Create a landing page with a header, hero section, and footer"

You would:
1. Start project (Phase 1)
2. Create canvas called "LandingPage" (Phase 2)
3. Create 3 components (Phase 3):
   - "Header" with nav markup and styles
   - "Hero" with headline and CTA
   - "Footer" with links and copyright
4. Preview and screenshot (Phase 4)
5. User feedback: "Make header sticky"
6. Inspect header CSS, find source file (Phase 5)
7. Update component with position: sticky
8. Reload and verify (Phase 5)
9. Show final result (Phase 6)

## Common Pitfalls:
- Don't create components before project is running
- Don't navigate to preview before builds complete
- Don't forget to reload after making changes
- Always check getActiveProject before starting a new project

## Tool Chain Summary:
detectFramework → startProject → getActiveProject → getActiveCanvas/createCanvas → createComponent × N → getComponentStatus × N → navigate → takeScreenshot → (iterate with inspectElement/updateComponent/reload) → listComponents → getCanvasDetails`
					}
				}]
			};
		}
	);

	// --------------------------------------------------------------
	// PROMPT: How to Debug Build Errors
	// --------------------------------------------------------------
	server.prompt(
		'how-to-debug-build-errors',
		'Step-by-step guide for diagnosing and fixing component build failures',
		async () => {
			return {
				messages: [{
					role: 'user' as const,
					content: {
						type: 'text' as const,
						text: `# How to Debug Build Errors in Roopik

This workflow teaches you how to diagnose and fix component build failures.

## Step-by-Step Process:

### 1. Identify the Failure
Call **roopik_getComponentStatus** for the failing component:
- Check buildStatus: if 'failed', proceed with debugging
- Look at buildErrors array for error messages
- Check lastBuildTime to see when it failed

### 2. Analyze Error Types
Common build errors fall into categories:

**Syntax Errors:**
- Unclosed tags, brackets, or quotes
- Invalid JSX/template syntax
- Typos in component code
- Example: "Unexpected token" or "Expected }"

**Import Errors:**
- Missing imports for used components/functions
- Incorrect import paths
- Example: "Cannot find module" or "Module not found"

**Type Errors (TypeScript/JSX):**
- Invalid prop types
- Missing required props
- Type mismatches
- Example: "Property 'X' does not exist"

**CSS Errors:**
- Invalid CSS syntax
- Unknown CSS properties
- Malformed selectors
- Example: "Unknown property" or "Parse error"

### 3. Get Component Details
Call **roopik_getComponent** to see the current code:
- Returns code, styles, and metadata
- Check for obvious syntax issues
- Verify the component type matches the code (JSX for React, etc.)

### 4. Fix the Code
Based on the error category, call **roopik_updateComponent** with fixes:
- For syntax errors: fix brackets, quotes, tags
- For import errors: add missing imports
- For type errors: adjust props or add type annotations
- For CSS errors: fix CSS syntax

### 5. Wait for Rebuild
After updating, poll **roopik_getComponentStatus** again:
- Wait for buildStatus to change from 'building' to 'success' or 'failed'
- If still failing, read new buildErrors (may reveal next issue)
- Repeat steps 3-5 until build succeeds

### 6. Verify Visual Result
Once buildStatus === 'success':
- Call **roopik_navigate** to view the canvas
- Call **roopik_takeScreenshot** to see the rendered component
- Verify the component looks and works as expected

## Debugging Strategies:

**Strategy 1: Simplify**
- Strip down to minimal working code
- Gradually add back features to isolate the problem

**Strategy 2: Check Examples**
- Call **roopik_listComponents** to see other working components
- Call **roopik_getComponent** on a working component for reference
- Copy patterns that work

**Strategy 3: Framework-Specific Checks**
- React: Valid JSX, proper hooks usage, correct prop names
- Vue: Valid template syntax, proper directives, correct script setup
- Angular: Valid template, proper decorators, correct module imports

## Common Pitfalls:
- Don't ignore buildErrors array - it has the exact error message
- Don't make multiple changes at once - fix one error at a time
- Don't forget to wait for rebuild completion before checking results
- Don't assume CSS errors mean invalid CSS - might be SCSS/LESS syntax

## Example Tool Chain:
getComponentStatus → (analyze buildErrors) → getComponent → updateComponent → (wait) → getComponentStatus → navigate → takeScreenshot`
					}
				}]
			};
		}
	);

	// console.log('[MCP] Registered 5 contextual prompts (start-project, create-component, inspect-css, full-dev-workflow, debug-build-errors)');
}
