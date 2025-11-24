# Week 04 - Core Integration Fundamentals

## Overview
This week we learned the fundamentals of integrating features into VSCode core (`workbench/contrib`) vs building extensions. We started migrating Roopik from an extension to native core integration.

---

## VSCode Architecture Fundamentals

### **Extension vs Core (contrib)**

| Aspect | Extensions (`extensions/`) | Core Contrib (`workbench/contrib/`) |
|--------|---------------------------|-------------------------------------|
| **Process** | Separate process | Same process as VSCode |
| **Performance** | Slower (IPC overhead) | Faster (direct access) |
| **APIs** | Limited extension APIs | Full internal VSCode APIs |
| **Security** | Sandboxed | Full system access |
| **Use Case** | Third-party features | Core features, native tools |

**When to use each:**
- **Extension**: Third-party tools, marketplace distribution, isolation
- **Core contrib**: Native features, performance-critical, deep integration (like Roopik)

---

## Folder Structure

```
src/vs/workbench/contrib/roopik/
├── common/          # Shared interfaces (no Node.js, no DOM)
│   └── roopik.ts    # Service interfaces, types
├── browser/         # UI layer (renderer process, DOM access)
│   └── roopik.contribution.ts  # Registration point
├── electron-main/   # Main process (Node.js, native APIs)
│   └── (future)
└── node/            # Node.js utilities
    └── (future)
```

**Why this separation?**
- **common/**: Shared by both browser and electron-main (no platform-specific code)
- **browser/**: Where UI happens (DOM, editor panes, webviews)
- **electron-main/**: Native operations (file system, BrowserView, native menus)

---

## How Registration Works

### **1. Entry Point: `workbench.common.main.ts`**

This file is the heart of VSCode's module loading system. It imports all contrib modules:

```typescript
// workbench.common.main.ts
import './contrib/roopik/browser/roopik.contribution.js';
```

**What happens:**
1. VSCode loads `workbench.common.main.ts` on startup
2. Each import executes immediately
3. Contribution files register their features (commands, services, views)
4. VSCode's DI system makes them globally available

### **2. Contribution File: `roopik.contribution.ts`**

This is where we register everything:

```typescript
// Register a command
class RoopikTestCommand extends Action2 {
	constructor() {
		super({
			id: 'roopik.test',
			title: {
				value: 'Roopik: Test Command',
				original: 'Roopik: Test Command'
			},
			category: Categories.Developer,
			f1: true  // Show in command palette
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		console.log('[Roopik] Core integration working!');
	}
}

registerAction2(RoopikTestCommand);
```

**Key concepts:**
- `Action2`: Base class for commands
- `registerAction2()`: Makes command globally available
- `f1: true`: Command appears in command palette (F1)
- `accessor`: Provides access to all VSCode services via DI

---

## Dependency Injection (DI)

VSCode uses DI to manage services as singletons. This is **critical** for both UI and agents.

### **Defining a Service Interface**

```typescript
// common/roopik.ts
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ICanvasStateService = createDecorator<ICanvasStateService>('roopikCanvasStateService');

export interface ICanvasStateService {
	readonly _serviceBrand: undefined;  // DI marker

	// Service methods (callable by UI and agents)
	createCanvas(name: string): Promise<string>;
	getCanvas(id: string): Promise<any>;
	deleteCanvas(id: string): Promise<void>;
}
```

### **Implementing a Service** (future)

```typescript
// browser/services/canvasStateService.ts
class CanvasStateService implements ICanvasStateService {
	readonly _serviceBrand: undefined;

	async createCanvas(name: string): Promise<string> {
		// Implementation
	}
}

// Register as singleton
registerSingleton(ICanvasStateService, CanvasStateService, InstantiationType.Delayed);
```

### **Using a Service**

```typescript
// Anywhere in VSCode
class MyClass {
	constructor(
		@ICanvasStateService private readonly canvasService: ICanvasStateService
	) {}

	async doSomething() {
		const canvas = await this.canvasService.createCanvas('New Canvas');
	}
}
```

**Why DI?**
- ✅ Single instance across entire app
- ✅ No manual instantiation (`new CanvasStateService()`)
- ✅ Easy to mock for testing
- ✅ Same service used by UI, agents, and API

---

## Tool-First Design

Every feature **must** be programmatically callable from day one.

### **Why?**
- UI calls the same methods as AI agents
- No refactoring needed when adding agent support
- Consistent API surface
- External tools can integrate

### **Example: Inspect Element**

```typescript
// Service interface (common/roopik.ts)
export interface IInspectService {
	inspectElement(selector: string): Promise<ElementInfo>;
}

// UI calls it
const info = await inspectService.inspectElement('.btn');
showPropertiesPanel(info);

// Agent calls the same method
const info = await inspectService.inspectElement('.btn');
return info;  // Return to agent for decision-making
```

---

## Command Registration Details

### **Command Title Format**

VSCode requires titles to be objects, not strings:

```typescript
// ❌ Wrong
title: 'Roopik: Test Command'

// ✅ Correct
title: {
	value: 'Roopik: Test Command',      // Display text
	original: 'Roopik: Test Command'    // For i18n (we ignore for now)
}
```

### **Command Options**

```typescript
{
	id: 'roopik.test',           // Unique ID (callable via API)
	title: { ... },              // Display name
	category: Categories.Developer,  // Groups commands in palette
	f1: true,                    // Show in command palette (F1)
	keybinding: { ... },         // Optional keyboard shortcut
	menu: { ... },               // Optional menu placement
	when: ContextKeyExpr,        // Optional: when command is enabled
}
```

---

## Execution Flow

### **From Registration to Execution**

```
1. workbench.common.main.ts imports roopik.contribution.js
   ↓
2. roopik.contribution.js executes
   ↓
3. registerAction2(RoopikTestCommand) runs
   ↓
4. VSCode stores command in global registry
   ↓
5. User presses F1, types "Roopik: Test"
   ↓
6. VSCode finds command by ID
   ↓
7. VSCode creates ServicesAccessor (DI container)
   ↓
8. Calls RoopikTestCommand.run(accessor)
   ↓
9. Command executes
```

### **Programmatic Execution**

```typescript
// From anywhere in VSCode
await commandService.executeCommand('roopik.test');

// With arguments
await commandService.executeCommand('roopik.createCanvas', 'My Canvas');

// From agent
const result = await executeCommand('roopik.inspectElement', { selector: '.btn' });
```

---

## Build System

### **Watch Mode (Development)**

```bash
npm run watch
```

**What it does:**
- Monitors file changes
- Incremental compilation (~5 seconds)
- Auto-reloads VSCode

**Two parallel processes:**
1. `watch-client`: Core VSCode (our contrib lives here)
2. `watch-extensions`: Extensions folder (legacy Roopik extension)

### **Compilation Flow**

```
1. TypeScript compiles .ts → .js
2. VSCode bundles modules
3. Output: out/vs/workbench/contrib/roopik/...
4. VSCode loads from out/ directory
```

---

## Testing

### **Manual Testing**

```bash
# 1. Start watch mode
npm run watch

# 2. Wait for "Finished compilation with 0 errors"

# 3. Launch VSCode
.\scripts\code.bat

# 4. Test command
# Press F1 → Type "Roopik: Test Command" → Enter

# 5. Check console
# Help → Toggle Developer Tools → Console
# Should see: "[Roopik] Core integration working! 🎨"
```

---

## Key Takeaways

1. **Extensions vs Core**: Core contrib = faster, full access, native integration
2. **DI is critical**: Services are singletons, injected everywhere
3. **Tool-first design**: Every feature must be programmatically callable
4. **Registration**: Import in `workbench.common.main.ts` → Feature becomes global
5. **Layered architecture**: common/ (interfaces) → browser/ (UI) → electron-main/ (native)
6. **Watch mode**: Fast incremental builds during development

---

## Next Steps (Week 05 Preview)

- [ ] Welcome screen (first visual feature)
- [ ] Activity bar icon
- [ ] Tree view (canvases, projects)
- [ ] Canvas editor (Mode 1)
- [ ] Browser preview (Mode 2)

---

## Common Errors & Fixes

### **Error: `Type 'string' is not assignable to type 'ICommandActionTitle'`**

**Fix:** Use object format for title:
```typescript
title: {
	value: 'Command Name',
	original: 'Command Name'
}
```

### **Error: `Cannot find module 'vs/...'`**

**Fix:** Use relative paths, not absolute:
```typescript
// ❌ Wrong
import { foo } from 'vs/platform/bar';

// ✅ Correct
import { foo } from '../../../../platform/bar.js';
```

### **Error: Module not loading**

**Fix:** Check `workbench.common.main.ts` import is present:
```typescript
import './contrib/roopik/browser/roopik.contribution.js';
```

---

## Resources

- [VSCode Source Code Organization](https://github.com/microsoft/vscode/wiki/Source-Code-Organization)
- [VSCode Extension API vs Internal API](https://github.com/microsoft/vscode/wiki)
- Our codebase: `/docs/CORE_MIGRATION_ARCHITECTURE.md`
