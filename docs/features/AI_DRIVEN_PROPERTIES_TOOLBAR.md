# AI-Driven Properties Toolbar

**Status**: Planned (Week 7+)
**Priority**: High
**Complexity**: High

---

## 📋 Overview

The AI-Driven Properties Toolbar is a **Universal Inspector** that allows users to visually edit component properties without writing code. Unlike traditional design tools that hardcode support for specific libraries, this toolbar uses AI to dynamically discover and present editable properties for **any** UI library or framework.

### Design Philosophy

> **"Dumb" Toolbar + "Smart" AI = Universal Support**

The toolbar itself is a generic renderer that displays controls based on a JSON schema. The AI generates this schema by analyzing the selected component, making the system infinitely extensible without manual maintenance.

---

## 🎯 Core Features

### 1. **Progressive Disclosure Pattern**
- **Collapsed State**: Shows minimal UI (AI chat input, selection cursor, screenshot)
- **Expanded State**: Reveals dynamic controls based on user intent
- **Contextual**: Only shows relevant properties for the selected component

### 2. **AI-Powered Schema Generation**
- Analyzes selected component code
- Identifies library (MUI, Ant Design, Chakra, etc.)
- Generates JSON schema with:
  - Available properties
  - Current values
  - Possible options/ranges
  - Control types (slider, dropdown, toggle)

### 3. **Visual Element Selection**
- **Rectangle Overlay Selection**: Drag to select regions
- **Hover Highlighting**: Shows bounding box on hover
- **Click Selection**: Single-click to select element
- **Screenshot Capture**: Capture selected element/region for AI context

### 4. **Multi-Strategy Property Discovery**
```typescript
// Priority order:
1. Local Cache (instant)
2. Cloud Schema API (pre-generated, fast)
3. Library API Docs (if available)
4. AI Inference (fallback, always works)
```

---

## 🏗️ Architecture

### High-Level Flow

```
User Selects Element
        ↓
Extract Context (data-roopik-* attributes)
        ↓
Check Schema Cache
        ↓
    Cache Hit? ──Yes──→ Render Controls Instantly
        ↓ No
        ↓
Generate Schema (AI/API/Cache)
        ↓
Cache for Future Use
        ↓
Render Dynamic Controls
        ↓
User Edits Property
        ↓
Update Code (Regex/AST)
        ↓
Hot Reload Preview
```

---

## 📦 Schema Format

### Standard Control Schema

```json
{
  "componentName": "Button",
  "library": "material-ui",
  "libraryVersion": "5.14.0",
  "controls": [
    {
      "label": "Variant",
      "type": "select",
      "propName": "variant",
      "currentValue": "contained",
      "options": ["text", "contained", "outlined"],
      "description": "The visual style of the button"
    },
    {
      "label": "Color",
      "type": "select",
      "propName": "color",
      "currentValue": "primary",
      "options": ["primary", "secondary", "error", "success", "info", "warning"],
      "description": "The color theme of the button"
    },
    {
      "label": "Size",
      "type": "select",
      "propName": "size",
      "currentValue": "medium",
      "options": ["small", "medium", "large"]
    },
    {
      "label": "Disabled",
      "type": "boolean",
      "propName": "disabled",
      "currentValue": false
    },
    {
      "label": "Full Width",
      "type": "boolean",
      "propName": "fullWidth",
      "currentValue": false
    }
  ]
}
```

### CSS Schema (for style properties)

```json
{
  "target": "css",
  "file": "Button.module.css",
  "selector": ".btn-primary",
  "controls": [
    {
      "label": "Background",
      "type": "color",
      "cssProperty": "background-color",
      "currentValue": "#007bff"
    },
    {
      "label": "Padding",
      "type": "text",
      "cssProperty": "padding",
      "currentValue": "10px 20px",
      "pattern": "^\\d+px\\s+\\d+px$"
    },
    {
      "label": "Border Radius",
      "type": "slider",
      "cssProperty": "border-radius",
      "currentValue": 8,
      "min": 0,
      "max": 50,
      "unit": "px"
    }
  ]
}
```

### Task-Specific Schema (e.g., `/animate` command)

```json
{
  "task": "animation",
  "componentName": "Button",
  "controls": [
    {
      "label": "Duration",
      "type": "slider",
      "propName": "transitionDuration",
      "currentValue": 0.3,
      "min": 0,
      "max": 2,
      "step": 0.1,
      "unit": "s"
    },
    {
      "label": "Easing",
      "type": "select",
      "propName": "transitionTimingFunction",
      "currentValue": "ease",
      "options": ["ease", "ease-in", "ease-out", "ease-in-out", "linear"]
    },
    {
      "label": "Glow Color",
      "type": "color",
      "cssProperty": "box-shadow",
      "currentValue": "#4CAF50"
    },
    {
      "label": "Glow Intensity",
      "type": "slider",
      "propName": "glowSpread",
      "currentValue": 8,
      "min": 0,
      "max": 20,
      "unit": "px"
    }
  ]
}
```

---

## 🧩 Control Registry (The "Dumb" Part)

### Supported Control Types

```typescript
const ControlRegistry = {
  // Basic inputs
  'text': TextInput,           // For strings, classNames
  'number': NumberInput,        // For numeric values

  // Selections
  'select': DropdownSelect,     // For enums (variant, color, size)
  'multiselect': MultiSelect,   // For arrays of values

  // Toggles
  'boolean': ToggleSwitch,      // For true/false props
  'checkbox': Checkbox,         // Alternative boolean UI

  // Range inputs
  'slider': RangeSlider,        // For continuous values (opacity, size)
  'range': RangeInput,          // Min/max range picker

  // Visual pickers
  'color': ColorPicker,         // For hex/rgba colors
  'icon': IconPicker,           // For icon selection
  'image': ImagePicker,         // For image URLs

  // Advanced
  'code': CodeEditor,           // For complex prop values (objects, functions)
  'json': JsonEditor            // For JSON configuration
};
```

### Control Component Interface

```typescript
interface ControlProps {
  label: string;
  value: any;
  onChange: (newValue: any) => void;
  description?: string;

  // Type-specific options
  options?: string[];           // For select/multiselect
  min?: number;                 // For slider/range
  max?: number;                 // For slider/range
  step?: number;                // For slider
  unit?: string;                // Display unit (px, %, deg)
  pattern?: string;             // Validation regex for text
  placeholder?: string;         // Input placeholder
}
```

---

## 🤖 AI Schema Generator

### Prompt Template

```typescript
const SCHEMA_GENERATION_PROMPT = `
Analyze this React/Vue/HTML component and generate a UI control schema.

Component Code:
\`\`\`
{codeSnippet}
\`\`\`

Component Info:
- Name: {componentName}
- File: {filePath}
- Line: {lineNumber}
- Parent Context: {parentContext}

Task:
1. Identify the UI library (Material-UI, Ant Design, Chakra, etc.) or if it's plain HTML/CSS
2. List ALL editable properties for this component
3. For each property:
   - Determine the best control type (select, slider, boolean, color, etc.)
   - Provide current value
   - List possible options/ranges
   - Add helpful description

4. If CSS-based styling:
   - Identify the CSS file location
   - List editable CSS properties
   - Use appropriate control types (color picker, slider for px values, etc.)

Return JSON schema following this format:
{schemaFormat}

Important:
- Only include properties that make sense to edit visually
- Exclude event handlers, complex logic props
- Prefer dropdowns over free text where possible
- Use sliders for numeric ranges (opacity: 0-1, size: 0-100px)
`;
```

### AI Inspector Agent

```typescript
async function generateSchema(element: HTMLElement): Promise<ControlSchema> {
  // 1. Extract context from data attributes
  const sourceInfo = element.dataset.roopikSource;
  const componentName = element.dataset.roopikComponent;
  const parentContext = element.dataset.roopikParent;

  // 2. Extract code snippet
  const codeSnippet = await extractCodeContext(sourceInfo);

  // 3. Check cache first
  const cacheKey = generateCacheKey(componentName, codeSnippet);
  const cached = await schemaCache.get(cacheKey);
  if (cached) return cached;

  // 4. Try cloud API
  const cloudSchema = await fetchCloudSchema(componentName);
  if (cloudSchema) {
    schemaCache.set(cacheKey, cloudSchema);
    return cloudSchema;
  }

  // 5. Generate with AI
  const aiSchema = await ai.generate({
    prompt: SCHEMA_GENERATION_PROMPT
      .replace('{codeSnippet}', codeSnippet)
      .replace('{componentName}', componentName)
      .replace('{parentContext}', parentContext)
  });

  const schema = JSON.parse(aiSchema);

  // 6. Cache and upload to cloud
  schemaCache.set(cacheKey, schema);
  await uploadSchemaToCloud(cacheKey, schema);

  return schema;
}
```

---

## 🔧 Property Update Mechanism

### Hybrid Approach: Fast Path + AI Fallback

```typescript
async function updateProperty(
  propName: string,
  newValue: any,
  schema: ControlSchema
): Promise<void> {

  // 1. Fast path: Simple prop replacement
  if (schema.target === 'prop' && isSimpleProp(propName)) {
    // Use regex/AST for instant update
    await simpleReplace(propName, newValue);
    return;
  }

  // 2. CSS path: Direct CSS file edit
  if (schema.target === 'css') {
    await updateCssFile(schema.file, schema.selector, propName, newValue);
    return;
  }

  // 3. Complex path: Use AI Agent
  await aiAgent.edit({
    type: 'updateProp',
    component: schema.componentName,
    property: propName,
    value: newValue,
    context: await getFileContext()
  });
}

// Simple replacement for known props
function simpleReplace(propName: string, newValue: any): void {
  // Example: variant="contained" → variant="outlined"
  const regex = new RegExp(`${propName}="[^"]*"`);
  const replacement = `${propName}="${newValue}"`;

  // Apply to file via Edit tool
  applyEdit(currentFile, regex, replacement);
}
```

---

## 🎨 UI Components

### Bottom Toolbar Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Cursor] [Screenshot] [/command...____] [Properties ▼]     │
└─────────────────────────────────────────────────────────────┘
                     ↓ (When expanded)
┌─────────────────────────────────────────────────────────────┐
│  Button Properties                                      [×]  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Variant      [Contained ▼]                             ││
│  │ Color        [Primary ▼]                               ││
│  │ Size         [Medium ▼]                                ││
│  │ Disabled     [Toggle: OFF]                             ││
│  │ Full Width   [Toggle: OFF]                             ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Toolbar Modes

```typescript
enum ToolbarMode {
  COLLAPSED = 'collapsed',      // Minimal UI
  SELECTION = 'selection',      // Rectangle overlay active
  PROPERTIES = 'properties',    // Showing controls
  AI_CHAT = 'ai-chat',         // Focused on command input
  SCREENSHOT = 'screenshot'     // Screenshot capture mode
}
```

---

## 📊 Caching Strategy

### Three-Tier Cache System

```typescript
// 1. Local In-Memory Cache (instant)
const memoryCache = new Map<string, ControlSchema>();

// 2. Local Storage Cache (persistent)
const storageCache = {
  async get(key: string): Promise<ControlSchema | null> {
    const stored = localStorage.getItem(`schema:${key}`);
    return stored ? JSON.parse(stored) : null;
  },

  async set(key: string, schema: ControlSchema): Promise<void> {
    localStorage.setItem(`schema:${key}`, JSON.stringify(schema));
  }
};

// 3. Cloud API Cache (shared across users)
const cloudCache = {
  async get(key: string): Promise<ControlSchema | null> {
    const response = await fetch(`/api/schemas/${key}`);
    return response.ok ? await response.json() : null;
  },

  async upload(key: string, schema: ControlSchema): Promise<void> {
    await fetch('/api/schemas', {
      method: 'POST',
      body: JSON.stringify({ key, schema })
    });
  }
};

// Cache key generation
function generateCacheKey(
  componentName: string,
  library: string,
  version: string
): string {
  return `${library}-${componentName}-v${version}`;
}
```

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (Week 7)

**Goal**: Build the "dumb" toolbar infrastructure

- [ ] Create bottom toolbar container component
- [ ] Implement Control Registry with basic types:
  - `TextInput`
  - `DropdownSelect`
  - `ToggleSwitch`
  - `RangeSlider`
  - `ColorPicker`
- [ ] Build schema-to-UI renderer
- [ ] Add toolbar mode switcher (collapsed/expanded)
- [ ] Implement local memory cache

**Deliverable**: Toolbar that can render controls from a hardcoded JSON schema

---

### Phase 2: Selection & Overlay (Week 7-8)

**Goal**: Visual element selection system

- [ ] Rectangle overlay selection (drag to select)
- [ ] Hover highlighting with bounding box
- [ ] Click selection integration with existing data-roopik-* system
- [ ] Selection state management
- [ ] Visual feedback (highlight color, border)

**Deliverable**: Users can select elements visually, toolbar responds to selection

---

### Phase 3: AI Schema Generation (Week 8)

**Goal**: Dynamic schema generation

- [ ] Implement AI Inspector Agent
- [ ] Create schema generation prompt template
- [ ] Build code context extractor
- [ ] Add schema validation
- [ ] Implement local storage cache
- [ ] Add error handling for AI failures

**Deliverable**: AI generates schemas for selected components

---

### Phase 4: Property Updates (Week 9)

**Goal**: Make controls actually work

- [ ] Implement simple prop replacement (regex/AST)
- [ ] Build CSS file updater
- [ ] Integrate with existing hot reload system
- [ ] Add AI fallback for complex updates
- [ ] Implement undo/redo for property changes

**Deliverable**: Changing controls updates code and preview in real-time

---

### Phase 5: Command Palette (Week 9)

**Goal**: Task-specific UI generation

- [ ] Build `/command` input system
- [ ] Implement intent detection (e.g., `/animate`, `/resize`)
- [ ] Create task-specific schema generators
- [ ] Add command history
- [ ] Implement command suggestions

**Deliverable**: Users can type `/animate` and get animation-specific controls

---

### Phase 6: Screenshot & Visual Context (Week 10)

**Goal**: Visual AI assistance

- [ ] Implement element screenshot capture (html2canvas)
- [ ] Add region screenshot (drag selection)
- [ ] Integrate screenshots with AI context
- [ ] Build visual diff highlighting
- [ ] Add "Show me the change" feature

**Deliverable**: AI can see visual appearance when generating schemas

---

### Phase 7: Cloud Schema API (Week 10+)

**Goal**: Pre-generated schemas for instant loading

- [ ] Design cloud schema storage (DB schema)
- [ ] Build schema upload/download API
- [ ] Pre-generate schemas for popular libraries:
  - Material-UI (all versions)
  - Ant Design
  - Chakra UI
  - Tailwind UI components
- [ ] Implement version tracking
- [ ] Add community contribution system

**Deliverable**: Most components load schemas instantly from cloud

---

### Phase 8: Polish & Optimization (Week 11)

**Goal**: Production-ready

- [ ] Performance optimization (lazy loading, virtualization)
- [ ] Keyboard shortcuts (Ctrl+E for edit mode, etc.)
- [ ] Mobile/tablet responsive design
- [ ] Error handling improvements
- [ ] Accessibility (ARIA labels, keyboard navigation)
- [ ] User documentation

**Deliverable**: Smooth, fast, accessible toolbar

---

## 🔍 Technical Challenges & Solutions

### Challenge 1: CSS File Discovery

**Problem**: How do we find which CSS file to edit?

**Solution**:
1. AI analyzes `className` prop
2. Searches workspace for CSS/SCSS files containing that selector
3. Uses import statements to narrow down scope
4. Returns file path + selector in schema

```typescript
// AI prompt addition:
"If the component uses CSS classes, find the CSS file by:
1. Looking at import statements in the component file
2. Searching for the className in .css/.scss files
3. Return the file path and selector in the schema"
```

---

### Challenge 2: Library Version Compatibility

**Problem**: MUI v4 and v5 have different props

**Solution**:
1. Extract library version from package.json
2. Include version in cache key
3. AI generates version-specific schema
4. Cloud API stores version-specific schemas

```typescript
function detectLibraryVersion(): string {
  const packageJson = fs.readFileSync('package.json', 'utf8');
  const deps = JSON.parse(packageJson).dependencies;

  // Extract version
  const muiVersion = deps['@mui/material'] || deps['@material-ui/core'];
  return muiVersion.replace('^', '').replace('~', '');
}
```

---

### Challenge 3: Complex Prop Values

**Problem**: Props like `style={{ padding: '10px', margin: '20px' }}` are hard to edit

**Solution**:
1. AI detects complex prop types
2. Uses `JsonEditor` or `CodeEditor` control
3. Validates JSON before applying
4. Provides "Extract to CSS" button for style props

---

### Challenge 4: Theming vs Direct Props

**Problem**: Some libraries use theme providers (MUI `<ThemeProvider>`)

**Solution**:
1. AI detects theme usage
2. Schema includes both direct props AND theme overrides
3. Show "Edit in Theme" button that opens theme file
4. Highlight that changing theme affects all components

---

## 📐 Design Patterns Used

### 1. **Registry Pattern**
The Control Registry maps control types to React components

### 2. **Strategy Pattern**
Multiple strategies for property updates (simple, CSS, AI)

### 3. **Command Pattern**
`/command` system for task-specific schemas

### 4. **Observer Pattern**
Property changes trigger code updates and hot reload

### 5. **Factory Pattern**
Schema generation based on component type

### 6. **Adapter Pattern**
Converting library-specific props to universal control types

---

## 🎓 Why This Approach is Superior

### vs. Hardcoding (Figma, Framer)

| **Hardcoding** | **AI-Driven** |
|---|---|
| ❌ Requires manual updates for every library | ✅ Automatically supports ANY library |
| ❌ Breaks when libraries update | ✅ Adapts to new versions automatically |
| ❌ Can't support custom components | ✅ Works with user's custom components |
| ❌ Months of work for each library | ✅ Works day one with zero config |

### vs. Browser DevTools

| **DevTools** | **Roopik Toolbar** |
|---|---|
| ⚠️ Shows computed styles (hard to edit source) | ✅ Edits source files directly |
| ⚠️ Changes lost on refresh | ✅ Persists changes to code |
| ⚠️ No component-level understanding | ✅ Knows component structure |
| ⚠️ No AI assistance | ✅ AI suggests best practices |

---

## 📚 References

### Inspiration
- **Figma**: Properties panel design
- **Framer**: Component variants
- **Builder.io**: Visual editing
- **Google Project IDX**: AI-generated controls
- **Cursor IDE**: Command palette UX

### Technologies
- **html2canvas**: Element screenshot capture
- **React**: UI framework
- **Zustand**: State management
- **Babel/Acorn**: AST manipulation
- **Claude AI**: Schema generation

---

## 📝 Notes for Future Development

### Ideas to Explore

1. **Collaborative Schemas**: Users can suggest corrections to AI-generated schemas
2. **Schema Marketplace**: Community-contributed schemas for niche libraries
3. **Visual Regression Testing**: Screenshot-based testing when properties change
4. **Design Tokens Integration**: Sync with Figma/design token systems
5. **A/B Testing**: Generate multiple variants and let AI pick the best
6. **Accessibility Checker**: AI suggests ARIA improvements in toolbar

### Known Limitations

1. **Complex Animations**: Keyframe animations are hard to visualize in controls
2. **Dynamic Props**: Props computed from state/props are read-only
3. **Third-Party Widgets**: Non-standard libraries might confuse AI
4. **Large Schemas**: Components with 50+ props need better organization

---

## 🤝 Contributing

This is a complex feature that requires expertise in:
- React/TypeScript
- AI prompt engineering
- UI/UX design
- AST manipulation
- CSS parsing

If you want to contribute, start with Phase 1 (Control Registry) as it's self-contained.

---

---

## 🔧 Additional Implementation Details

### Unified Mode Support

**Key Insight**: Mode 1 (component sandboxes) and Mode 2 (full project) are fundamentally the same - both work with React/Vue/HTML components. The **only difference** is how we access the source code:

| Aspect | Mode 1 (Canvas Sandbox) | Mode 2 (Project Preview) |
|--------|-------------------------|--------------------------|
| **Component Nature** | React/Vue/HTML component | React/Vue/HTML component |
| **Toolbar Features** | ✅ Same (props, styles, AI) | ✅ Same (props, styles, AI) |
| **Code Access** | Direct via `sandboxCode` variable | Read from file at `filePath:line:column` |
| **Selection Method** | Click sandbox card | Click element (uses `data-roopik-source`) |
| **Update Mechanism** | Update sandbox code → postMessage | Edit file → Vite HMR |
| **Context Available** | Component code only | Full project, imports, theme |

**Implementation**: Single unified API with mode-agnostic interface:

```typescript
interface PropertyToolbarContext {
  mode: 'mode1' | 'mode2';

  // Code access (mode-specific)
  getCode: () => Promise<string>;
  updateCode: (newCode: string) => Promise<void>;

  // Element reference (both modes)
  element: HTMLElement;

  // Source location (Mode 2 only)
  sourceLocation?: {
    filePath: string;
    line: number;
    column: number;
  };
}

// Usage is identical for both modes
const schema = await generateSchema(context);
const toolbar = <PropertyToolbar schema={schema} context={context} />;
```

---

### Error Handling & Fallbacks

#### Scenario 1: AI Schema Generation Fails

**Fallback Strategy**: Graceful degradation to universal CSS controls

```typescript
async function generateSchemaWithFallback(context: PropertyToolbarContext) {
  try {
    // Try AI generation
    return await generateSchemaWithAI(context);
  } catch (aiError) {
    logger.warn('AI schema generation failed, using fallback', aiError);

    // Fallback 1: Try cache (might have old version)
    const cached = await schemaCache.getLatest(context.componentName);
    if (cached) {
      return { ...cached, warning: 'Using cached schema (AI unavailable)' };
    }

    // Fallback 2: Universal CSS controls
    return {
      componentName: context.componentName || 'Unknown',
      source: 'fallback',
      warning: 'Using generic controls. AI schema generation failed.',
      controls: [
        // Universal CSS properties that work for all elements
        { label: 'Width', type: 'text', cssProperty: 'width', currentValue: getComputedStyle(context.element).width },
        { label: 'Height', type: 'text', cssProperty: 'height', currentValue: getComputedStyle(context.element).height },
        { label: 'Padding', type: 'text', cssProperty: 'padding', currentValue: getComputedStyle(context.element).padding },
        { label: 'Margin', type: 'text', cssProperty: 'margin', currentValue: getComputedStyle(context.element).margin },
        { label: 'Background', type: 'color', cssProperty: 'backgroundColor', currentValue: getComputedStyle(context.element).backgroundColor },
        { label: 'Text Color', type: 'color', cssProperty: 'color', currentValue: getComputedStyle(context.element).color },
        { label: 'Border Radius', type: 'slider', cssProperty: 'borderRadius', currentValue: parseInt(getComputedStyle(context.element).borderRadius), min: 0, max: 50, unit: 'px' },
        { label: 'Opacity', type: 'slider', cssProperty: 'opacity', currentValue: parseFloat(getComputedStyle(context.element).opacity) * 100, min: 0, max: 100, unit: '%' }
      ]
    };
  }
}
```

#### Scenario 2: Unknown Library Detection

**Fallback**: Combine runtime styles + AST-based prop detection

```typescript
async function handleUnknownLibrary(code: string, element: HTMLElement) {
  return {
    componentName: extractComponentName(code),
    library: 'unknown',
    warning: 'Unknown library. Showing detected properties.',
    controls: [
      // Runtime CSS styles (always available)
      ...extractRuntimeStyles(element),

      // Props detected from AST (generic parsing)
      ...extractPropsFromAST(code, {
        inferTypes: true,  // boolean → toggle, string → text, etc.
        includeAll: false  // Exclude functions, complex objects
      })
    ]
  };
}
```

#### Scenario 3: Code Update Fails

**Fallback**: Show AI chat with error context

```typescript
async function handleUpdateFailure(error: Error, context: UpdateContext) {
  // Log error
  logger.error('Property update failed', { error, context });

  // Show AI chat with pre-filled context
  showAIChat({
    mode: 'error-recovery',
    prefilledMessage: `I tried to update ${context.propName} to "${context.newValue}" but got an error: ${error.message}. Can you help fix this?`,
    context: {
      code: context.code,
      error: error.stack,
      componentName: context.componentName
    },
    suggestedActions: [
      'Try a different value',
      'Edit code manually',
      'Revert change'
    ]
  });

  // Revert optimistic UI update
  revertPropertyChange(context.propName);
}
```

#### Scenario 4: Complex Prop Values (Functions, JSX)

**Behavior**: Mark as read-only with "Edit in Code" action

```typescript
function detectComplexProps(props: Record<string, any>, code: string) {
  return Object.entries(props).map(([propName, propValue]) => {
    const propType = detectPropType(propValue, code);

    if (propType === 'function') {
      return {
        type: 'readonly',
        label: propName,
        propName,
        value: extractFunctionSignature(propValue), // e.g., "(event) => handleClick(event)"
        icon: '⚡',
        actions: [
          {
            label: 'Edit in Code',
            onClick: () => openInEditor(propName)
          }
        ],
        description: 'Event handlers must be edited in code'
      };
    }

    if (propType === 'jsx' || propType === 'component') {
      return {
        type: 'readonly',
        label: propName,
        propName,
        value: '<Component />',
        icon: '📦',
        actions: [
          {
            label: 'Edit in Code',
            onClick: () => openInEditor(propName)
          }
        ],
        description: 'JSX props cannot be edited visually'
      };
    }

    if (propType === 'object' && isLargeObject(propValue)) {
      return {
        type: 'json',
        label: propName,
        propName,
        value: JSON.stringify(propValue, null, 2),
        actions: [
          { label: 'Format', onClick: () => formatJSON(propName) },
          { label: 'Expand All', onClick: () => expandJSON(propName) }
        ]
      };
    }

    // Simple prop - return normal control
    return createControl(propName, propValue, propType);
  });
}
```

---

### Performance Optimization

#### Loading States & User Feedback

```typescript
enum SchemaLoadingState {
  INSTANT = 'instant',      // Memory cache (<10ms)
  FAST = 'fast',            // Local storage (<50ms)
  LOADING = 'loading',      // Cloud API (100-500ms)
  GENERATING = 'generating' // AI generation (1-3s)
}

function PropertyToolbar({ context }: Props) {
  const [loadingState, setLoadingState] = useState<SchemaLoadingState>('INSTANT');
  const [schema, setSchema] = useState<ControlSchema | null>(null);

  useEffect(() => {
    loadSchema(context).then(({ schema, source }) => {
      setSchema(schema);

      // Track performance
      analytics.track('schema_loaded', {
        source,
        loadTime: Date.now() - startTime,
        componentName: schema.componentName
      });
    });
  }, [context]);

  // Show loading UI
  if (loadingState === 'GENERATING') {
    return (
      <div className="toolbar-loading">
        <Spinner />
        <p>AI analyzing component...</p>
        <ProgressBar value={estimatedProgress} />
      </div>
    );
  }

  if (loadingState === 'LOADING') {
    return <SkeletonToolbar />;
  }

  // Show badge for cache hits
  return (
    <div className="property-toolbar">
      {loadingState === 'INSTANT' && <Badge variant="success">⚡ Cached</Badge>}
      {schema && <ControlList controls={schema.controls} />}
    </div>
  );
}
```

#### Debouncing Property Updates

**Problem**: Dragging sliders causes too many file edits

**Solution**: Debounce updates while showing optimistic UI

```typescript
function usePropertyUpdate(context: PropertyToolbarContext) {
  const [localValues, setLocalValues] = useState<Record<string, any>>({});

  // Debounced file update (300ms delay)
  const debouncedUpdate = useDebouncedCallback(
    async (propName: string, value: any) => {
      try {
        await context.updateCode(propName, value);
        // Success - local value is now in sync with file
      } catch (error) {
        // Revert on error
        setLocalValues(prev => ({ ...prev, [propName]: schema.controls.find(c => c.propName === propName)?.currentValue }));
        handleUpdateFailure(error, { propName, value, code: await context.getCode() });
      }
    },
    300 // Wait 300ms after user stops dragging
  );

  const handleChange = (propName: string, value: any) => {
    // Update UI immediately (optimistic)
    setLocalValues(prev => ({ ...prev, [propName]: value }));

    // Debounce file update
    debouncedUpdate(propName, value);
  };

  return { localValues, handleChange };
}
```

#### Virtual Scrolling for Large Schemas

**Problem**: Components with 50+ properties cause UI lag

**Solution**: Virtualized list rendering

```typescript
import { FixedSizeList } from 'react-window';

function ControlList({ controls }: { controls: Control[] }) {
  if (controls.length < 20) {
    // Simple rendering for small lists
    return controls.map(control => <ControlRenderer key={control.propName} control={control} />);
  }

  // Virtual scrolling for large lists
  return (
    <FixedSizeList
      height={400}
      itemCount={controls.length}
      itemSize={60} // Height of each control row
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <ControlRenderer control={controls[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

---

### Multi-Selection Support

**Strategy**: Show only common properties when multiple elements selected

```typescript
function mergeSchemas(schemas: ControlSchema[]): ControlSchema {
  if (schemas.length === 1) return schemas[0];

  // Find properties that exist in ALL selected components
  const commonProps = schemas[0].controls.filter(control =>
    schemas.every(schema =>
      schema.controls.some(c =>
        c.propName === control.propName && c.type === control.type
      )
    )
  );

  // For each common prop, check if values match
  return {
    componentName: `${schemas.length} Components`,
    library: 'mixed',
    controls: commonProps.map(control => {
      const values = schemas.map(s =>
        s.controls.find(c => c.propName === control.propName)?.currentValue
      );

      const allSame = values.every(v => v === values[0]);

      return {
        ...control,
        currentValue: allSame ? values[0] : '(Mixed)',
        isMixed: !allSame,
        // When user changes a mixed value, update ALL selected elements
        affectsMultiple: true
      };
    })
  };
}

// UI Display
function MixedValueControl({ control }: { control: Control }) {
  if (control.isMixed) {
    return (
      <div className="control mixed">
        <label>{control.label}</label>
        <input
          value={control.currentValue}
          placeholder="(Mixed values)"
          className="mixed-value"
          onChange={e => {
            // Update all selected elements to this new value
            updateMultiple(control.propName, e.target.value);
          }}
        />
        <InfoTooltip>
          Selected elements have different values.
          Changing this will update all {control.affectedCount} elements.
        </InfoTooltip>
      </div>
    );
  }

  return <NormalControl control={control} />;
}
```

---

### Undo/Redo System

```typescript
interface PropertyChange {
  timestamp: number;
  filePath?: string;        // Mode 2: file path
  sandboxId?: string;       // Mode 1: sandbox ID
  propName: string;
  oldValue: any;
  newValue: any;
  affectedElements: string[]; // For multi-selection
}

class PropertyHistory {
  private stack: PropertyChange[] = [];
  private position = -1;
  private maxSize = 50;

  push(change: PropertyChange) {
    // Remove any redo history
    this.stack = this.stack.slice(0, this.position + 1);

    // Add new change
    this.stack.push(change);
    this.position++;

    // Limit stack size
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
      this.position--;
    }
  }

  async undo(): Promise<void> {
    if (!this.canUndo()) return;

    const change = this.stack[this.position];
    this.position--;

    // Apply reverse change
    await applyChange({
      ...change,
      newValue: change.oldValue // Swap values
    });
  }

  async redo(): Promise<void> {
    if (!this.canRedo()) return;

    this.position++;
    const change = this.stack[this.position];

    // Re-apply change
    await applyChange(change);
  }

  canUndo(): boolean {
    return this.position >= 0;
  }

  canRedo(): boolean {
    return this.position < this.stack.length - 1;
  }

  getHistory(): PropertyChange[] {
    return this.stack.slice(0, this.position + 1);
  }
}

// Keyboard shortcuts
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        propertyHistory.undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        propertyHistory.redo();
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

---

### TypeScript Prop Detection

**Enhanced AI Prompt for TypeScript:**

```typescript
const TYPESCRIPT_SCHEMA_PROMPT = `
Analyze this TypeScript React component and extract prop types.

Component Code:
\`\`\`typescript
{code}
\`\`\`

TypeScript Interface/Type:
\`\`\`typescript
{interfaceDefinition}
\`\`\`

Generate control schema with these rules:
1. Union types → select dropdown (e.g., 'small' | 'medium' | 'large' → select)
2. Boolean → toggle switch
3. Number → number input or slider (if range is obvious)
4. String → text input
5. Optional props → mark as not required, show default value
6. Function types → mark as readonly (event handlers)
7. Generic types → try to infer from usage

Return JSON schema.
`;

// TypeScript AST parsing
import ts from 'typescript';

function extractTypeScriptProps(code: string) {
  const sourceFile = ts.createSourceFile('temp.tsx', code, ts.ScriptTarget.Latest, true);

  const interfaces: Record<string, ts.InterfaceDeclaration> = {};

  // Find all interfaces
  ts.forEachChild(sourceFile, node => {
    if (ts.isInterfaceDeclaration(node)) {
      interfaces[node.name.text] = node;
    }
  });

  // Extract props from interface
  const propsInterface = interfaces['ButtonProps']; // or detect from component
  if (!propsInterface) return null;

  const props = propsInterface.members.map(member => {
    if (ts.isPropertySignature(member)) {
      const name = member.name.getText();
      const type = member.type;
      const optional = !!member.questionToken;

      return {
        name,
        type: typeToControlType(type),
        required: !optional,
        options: extractUnionOptions(type)
      };
    }
  });

  return props;
}

function typeToControlType(type: ts.TypeNode): string {
  if (ts.isUnionTypeNode(type)) {
    // 'small' | 'medium' | 'large' → select
    return 'select';
  }

  if (type.kind === ts.SyntaxKind.BooleanKeyword) {
    return 'boolean';
  }

  if (type.kind === ts.SyntaxKind.NumberKeyword) {
    return 'number';
  }

  if (type.kind === ts.SyntaxKind.StringKeyword) {
    return 'text';
  }

  if (ts.isFunctionTypeNode(type)) {
    return 'readonly';
  }

  return 'text'; // fallback
}
```

---

### Accessibility (A11y)

```typescript
function AccessiblePropertyToolbar({ schema }: Props) {
  const [focusedControlIndex, setFocusedControlIndex] = useState(0);
  const controlsRef = useRef<HTMLDivElement[]>([]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Tab':
          // Default Tab behavior (browser handles focus)
          break;

        case 'ArrowUp':
        case 'ArrowDown':
          e.preventDefault();
          const direction = e.key === 'ArrowDown' ? 1 : -1;
          const nextIndex = (focusedControlIndex + direction + schema.controls.length) % schema.controls.length;
          setFocusedControlIndex(nextIndex);
          controlsRef.current[nextIndex]?.focus();
          break;

        case 'Escape':
          e.preventDefault();
          closeToolbar();
          restoreFocusToElement();
          break;

        case 'Enter':
        case ' ':
          // Handled by individual controls
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedControlIndex]);

  return (
    <div
      role="region"
      aria-label="Component Properties Editor"
      className="property-toolbar"
    >
      <div className="toolbar-header">
        <h2 id="toolbar-title">{schema.componentName} Properties</h2>
        <button
          aria-label="Close properties toolbar"
          onClick={closeToolbar}
        >
          ✕
        </button>
      </div>

      <div
        role="group"
        aria-labelledby="toolbar-title"
        className="controls-container"
      >
        {schema.controls.map((control, index) => (
          <AccessibleControl
            key={control.propName}
            control={control}
            ref={el => controlsRef.current[index] = el}
            isFocused={index === focusedControlIndex}
          />
        ))}
      </div>

      {/* Screen reader live region for updates */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {lastUpdate && `${lastUpdate.propName} changed to ${lastUpdate.newValue}`}
      </div>
    </div>
  );
}

function AccessibleControl({ control, isFocused }: ControlProps) {
  const controlId = `control-${control.propName}`;
  const descriptionId = `${controlId}-description`;

  return (
    <div className="control-wrapper">
      <label htmlFor={controlId}>
        {control.label}
        {control.required && <span className="required" aria-label="required">*</span>}
        <span className="sr-only">
          (Current value: {control.currentValue})
        </span>
      </label>

      {control.type === 'select' && (
        <select
          id={controlId}
          aria-describedby={descriptionId}
          value={control.currentValue}
          onChange={handleChange}
          autoFocus={isFocused}
        >
          {control.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {control.type === 'slider' && (
        <input
          id={controlId}
          type="range"
          min={control.min}
          max={control.max}
          step={control.step || 1}
          value={control.currentValue}
          onChange={handleChange}
          aria-describedby={descriptionId}
          aria-valuetext={`${control.currentValue}${control.unit || ''}`}
          autoFocus={isFocused}
        />
      )}

      {control.description && (
        <span id={descriptionId} className="control-description">
          {control.description}
        </span>
      )}
    </div>
  );
}
```

---

### Testing Strategy

```typescript
// Unit Tests
describe('Schema Generator', () => {
  it('generates schema for Material-UI Button', async () => {
    const schema = await generateSchema({
      mode: 'mode2',
      getCode: async () => '<Button variant="contained" color="primary" />',
      element: mockElement
    });

    expect(schema.controls).toContainEqual(
      expect.objectContaining({
        propName: 'variant',
        type: 'select',
        options: expect.arrayContaining(['contained', 'outlined', 'text'])
      })
    );
  });

  it('falls back to cache on AI failure', async () => {
    mockAIService.generate.mockRejectedValue(new Error('AI failed'));

    const schema = await generateSchemaWithFallback(context);

    expect(schema.source).toBe('cache');
    expect(schema.warning).toContain('AI unavailable');
  });

  it('handles unknown libraries gracefully', async () => {
    const schema = await generateSchema({
      mode: 'mode1',
      getCode: async () => '<CustomButton foo="bar" />',
      element: mockElement
    });

    expect(schema.library).toBe('unknown');
    expect(schema.controls.length).toBeGreaterThan(0);
  });
});

// Integration Tests
describe('Property Update Flow', () => {
  it('updates prop and triggers hot reload (Mode 2)', async () => {
    const { toolbar, preview } = await setupTestEnvironment('mode2');

    // Select button element
    await preview.click('[data-testid="mui-button"]');
    await waitFor(() => expect(toolbar.isVisible()).toBe(true));

    // Change variant dropdown
    await toolbar.selectDropdown('variant', 'outlined');

    // Verify code updated
    const code = await readFile('Button.tsx');
    expect(code).toContain('variant="outlined"');

    // Verify preview updated (HMR)
    await waitForHotReload();
    expect(preview.element('button')).toHaveClass('MuiButton-outlined');
  });

  it('handles multi-selection correctly', async () => {
    const { toolbar, preview } = await setupTestEnvironment('mode2');

    // Select multiple buttons
    await preview.click('[data-testid="button-1"]', { metaKey: true });
    await preview.click('[data-testid="button-2"]', { metaKey: true });

    expect(toolbar.title()).toBe('2 Components');

    // Change shared property
    await toolbar.selectDropdown('size', 'large');

    // Both buttons updated
    expect(await getButtonProp('button-1', 'size')).toBe('large');
    expect(await getButtonProp('button-2', 'size')).toBe('large');
  });

  it('supports undo/redo', async () => {
    const { toolbar } = await setupTestEnvironment('mode1');

    await toolbar.selectDropdown('variant', 'outlined');
    expect(toolbar.currentValue('variant')).toBe('outlined');

    // Undo
    await keyboard.press('Control+Z');
    expect(toolbar.currentValue('variant')).toBe('contained');

    // Redo
    await keyboard.press('Control+Shift+Z');
    expect(toolbar.currentValue('variant')).toBe('outlined');
  });
});

// E2E Tests (Playwright)
test('complete user workflow', async ({ page }) => {
  // Open project preview
  await page.click('[data-testid="open-project-preview"]');
  await page.waitForSelector('iframe');

  const preview = page.frameLocator('iframe');

  // Enable selection mode
  await page.click('[data-testid="selection-tool"]');

  // Click button in preview
  await preview.locator('button').first().click();

  // Toolbar appears
  await expect(page.locator('.property-toolbar')).toBeVisible();
  await expect(page.locator('.toolbar-header h2')).toContainText('Button');

  // Change property
  await page.selectOption('[name="variant"]', 'outlined');

  // Visual change reflected
  await expect(preview.locator('button').first()).toHaveClass(/outlined/);

  // Take screenshot for visual regression
  await page.screenshot({ path: 'toolbar-test.png' });
});

test('accessibility compliance', async ({ page }) => {
  await page.click('[data-testid="open-toolbar"]');

  // Keyboard navigation
  await page.keyboard.press('Tab'); // Focus first control
  await page.keyboard.press('ArrowDown'); // Next control
  await page.keyboard.press('Enter'); // Activate

  // Screen reader
  const ariaLabel = await page.getAttribute('.property-toolbar', 'aria-label');
  expect(ariaLabel).toBe('Component Properties Editor');

  // Run axe accessibility tests
  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
```

---

**Last Updated**: 2025-11-20
**Author**: Roopik Team
**Status**: Ready for implementation
**Reviewed**: Enhanced with error handling, performance, accessibility, and testing strategies

---

---

## 🏗️ Extension Architecture: Separation of Concerns

### Critical Architectural Decision

**Roopik will NOT contain hardcoded AI/LLM functionality.** Instead, we maintain a **clean separation** between the visual IDE (Roopik Extension) and the coding agent (AI Agent Extension).

### Design Principles

1. **Roopik Extension = Visual IDE Only**
   - Provides canvas, preview, toolbar UI
   - Exposes APIs and context to other extensions
   - Never makes direct LLM API calls
   - No hardcoded agentic features

2. **AI Agent Extension = Separate Extension**
   - Handles ALL AI/LLM interactions
   - Works like GitHub Copilot or Cursor
   - Can work with or without Roopik canvas
   - Provides coding assistance for both regular code and visual components

3. **Communication = Clean API Layer**
   - Well-defined abstraction layer between extensions
   - Service interfaces with clear contracts
   - No tight coupling or direct dependencies

---

### Why This Separation Matters

#### Maintainability
- **Modularity**: Each extension has a single, clear responsibility
- **Independent Updates**: AI Agent can be updated without touching Roopik core
- **Testability**: Components can be tested in isolation
- **Debugging**: Clearer boundaries make issues easier to trace

#### Flexibility
- **Multiple AI Providers**: AI Agent can support different LLM backends (Claude, GPT-4, local models)
- **Optional Installation**: Users can use Roopik without AI features
- **Licensing**: Different extensions can have different licensing models
- **Customization**: Users can replace AI Agent with their own implementation

#### Performance
- **Lazy Loading**: AI features only loaded when needed
- **Resource Isolation**: AI processing doesn't impact canvas rendering
- **Separate Processes**: Extensions run in separate processes (VS Code architecture)

---

### Extension Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                     Roopik Extension                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Visual IDE Features (No AI)                            │ │
│  │ • Canvas rendering                                     │ │
│  │ • Component tree                                       │ │
│  │ • Preview management                                   │ │
│  │ • Element selection                                    │ │
│  │ • Properties toolbar UI (schema renderer only)        │ │
│  │ • File/code manipulation (read/write/AST)             │ │
│  │ • Hot module reload                                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Public APIs (for AI Agent Extension)                   │ │
│  │ • getRoopikContext(): Context                          │ │
│  │ • getSelectedElement(): Element                        │ │
│  │ • updateCode(changes): void                            │ │
│  │ • captureScreenshot(): ImageData                       │ │
│  │ • onSelectionChange(callback): Disposable             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↕
           Clean API Layer (VS Code Extension API)
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                  AI Agent Extension                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ AI/LLM Features                                        │ │
│  │ • Schema generation (via LLM)                          │ │
│  │ • Intent detection                                     │ │
│  │ • Code completion                                      │ │
│  │ • Refactoring suggestions                             │ │
│  │ • Natural language to code                            │ │
│  │ • Visual context understanding (screenshot analysis)   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ LLM Provider Layer                                     │ │
│  │ • Claude API client                                    │ │
│  │ • GPT-4 client (optional)                             │ │
│  │ • Local model support (optional)                      │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

### Abstract Service Layer

Roopik uses **abstract services** for all AI-related functionality. This allows the AI Agent Extension to provide implementations without tight coupling.

#### Service Interface Definition

```typescript
// File: extensions/roopik/src/services/IAISchemaService.ts

/**
 * Abstract interface for AI-driven schema generation
 * Implementation provided by AI Agent Extension
 */
export interface IAISchemaService {
  /**
   * Generate property schema for a component
   * @param context - Component context (code, element, location)
   * @returns Control schema or null if unavailable
   */
  generateSchema(context: SchemaGenerationContext): Promise<ControlSchema | null>;

  /**
   * Check if AI service is available
   */
  isAvailable(): boolean;

  /**
   * Get service status (connected, rate-limited, error)
   */
  getStatus(): AIServiceStatus;
}

export interface SchemaGenerationContext {
  mode: 'mode1' | 'mode2';
  componentName?: string;
  code: string;
  element: HTMLElement;
  filePath?: string;
  screenshot?: ImageData;
  parentContext?: string;
}

export interface ControlSchema {
  componentName: string;
  library: string;
  libraryVersion?: string;
  controls: Control[];
  source?: 'ai' | 'cache' | 'fallback';
  warning?: string;
}

export enum AIServiceStatus {
  AVAILABLE = 'available',
  UNAVAILABLE = 'unavailable',
  RATE_LIMITED = 'rate-limited',
  ERROR = 'error'
}
```

#### Service Provider Pattern

```typescript
// File: extensions/roopik/src/services/ServiceRegistry.ts

/**
 * Central registry for pluggable services
 * Extensions register implementations at activation
 */
class ServiceRegistry {
  private services: Map<string, any> = new Map();

  /**
   * Register a service implementation
   * Called by AI Agent Extension during activation
   */
  register<T>(serviceId: string, implementation: T): void {
    this.services.set(serviceId, implementation);
  }

  /**
   * Get service implementation
   * Returns null if not registered (AI Agent not installed/activated)
   */
  get<T>(serviceId: string): T | null {
    return this.services.get(serviceId) || null;
  }

  /**
   * Check if service is available
   */
  has(serviceId: string): boolean {
    return this.services.has(serviceId);
  }
}

export const serviceRegistry = new ServiceRegistry();

// Service IDs (constants)
export const SERVICE_IDS = {
  AI_SCHEMA: 'roopik.ai.schema',
  AI_CODE_EDIT: 'roopik.ai.codeEdit',
  AI_INTENT: 'roopik.ai.intent',
  AI_VISUAL_CONTEXT: 'roopik.ai.visualContext'
} as const;
```

#### Roopik's Usage (with Fallback)

```typescript
// File: extensions/roopik/src/toolbar/PropertyToolbar.ts

import { serviceRegistry, SERVICE_IDS } from '../services/ServiceRegistry';
import { IAISchemaService } from '../services/IAISchemaService';

async function loadSchemaForElement(context: PropertyToolbarContext): Promise<ControlSchema> {
  // 1. Check if AI service is available
  const aiService = serviceRegistry.get<IAISchemaService>(SERVICE_IDS.AI_SCHEMA);

  if (aiService?.isAvailable()) {
    try {
      // AI Agent Extension is installed and ready
      const schema = await aiService.generateSchema({
        mode: context.mode,
        code: await context.getCode(),
        element: context.element,
        filePath: context.sourceLocation?.filePath,
        screenshot: await captureElementScreenshot(context.element)
      });

      if (schema) {
        return schema;
      }
    } catch (error) {
      logger.warn('AI schema generation failed, using fallback', error);
    }
  } else {
    logger.info('AI Agent Extension not available, using fallback schema');
  }

  // 2. Fallback: Use cache or universal controls
  return generateFallbackSchema(context);
}
```

#### AI Agent Extension Implementation

```typescript
// File: extensions/ai-agent/src/extension.ts

import * as vscode from 'vscode';
import { serviceRegistry, SERVICE_IDS } from '../roopik/src/services/ServiceRegistry';
import { IAISchemaService } from '../roopik/src/services/IAISchemaService';

export function activate(context: vscode.ExtensionContext) {
  // Register AI Schema Service implementation
  const aiSchemaService: IAISchemaService = {
    async generateSchema(context) {
      // TODO: Implement using Claude API
      const response = await claudeAPI.generate({
        prompt: buildSchemaPrompt(context),
        images: context.screenshot ? [context.screenshot] : []
      });

      return JSON.parse(response);
    },

    isAvailable() {
      return claudeAPI.isConnected();
    },

    getStatus() {
      return claudeAPI.getStatus();
    }
  };

  // Register with Roopik's service registry
  serviceRegistry.register(SERVICE_IDS.AI_SCHEMA, aiSchemaService);

  // Register other AI services...
  serviceRegistry.register(SERVICE_IDS.AI_CODE_EDIT, aiCodeEditService);
  serviceRegistry.register(SERVICE_IDS.AI_INTENT, aiIntentService);

  logger.info('AI Agent Extension activated and services registered');
}
```

---

### Implementation Guidelines

#### ✅ DO: Use Abstract Services

```typescript
// GOOD: Uses service registry
const aiService = serviceRegistry.get<IAISchemaService>(SERVICE_IDS.AI_SCHEMA);
if (aiService) {
  const schema = await aiService.generateSchema(context);
}
```

#### ❌ DON'T: Hardcode AI Calls

```typescript
// BAD: Direct LLM API call in Roopik
import { ClaudeAPI } from 'some-ai-library';
const schema = await ClaudeAPI.generate(prompt); // ❌ NEVER DO THIS
```

#### ✅ DO: Provide Fallbacks

```typescript
// GOOD: Always have a fallback when AI unavailable
const schema = aiService
  ? await aiService.generateSchema(context)
  : generateFallbackSchema(context);
```

#### ❌ DON'T: Fail Hard Without AI

```typescript
// BAD: Breaking when AI Agent not installed
if (!aiService) {
  throw new Error('AI Agent Extension required'); // ❌ BAD UX
}
```

#### ✅ DO: Write TODOs for Future AI Integration

```typescript
// GOOD: Clear TODO with context
async function generateSchema(context: SchemaGenerationContext) {
  // TODO: This will be implemented by AI Agent Extension
  // For now, return fallback schema based on runtime styles
  return {
    componentName: context.componentName || 'Unknown',
    source: 'fallback',
    controls: extractRuntimeStyles(context.element)
  };
}
```

---

### Communication Protocol

#### Message Types (Roopik → AI Agent)

```typescript
// File: extensions/roopik/src/services/messages.ts

export enum RoopikMessageType {
  // Request schema for selected element
  REQUEST_SCHEMA = 'roopik.requestSchema',

  // Request code edit
  REQUEST_CODE_EDIT = 'roopik.requestCodeEdit',

  // Notify element selection changed
  SELECTION_CHANGED = 'roopik.selectionChanged',

  // Request intent detection for user command
  REQUEST_INTENT = 'roopik.requestIntent',

  // Provide visual context (screenshot)
  PROVIDE_SCREENSHOT = 'roopik.provideScreenshot'
}

export interface RoopikMessage {
  type: RoopikMessageType;
  payload: any;
  requestId?: string; // For request/response pairing
}
```

#### Context Provider API

```typescript
// File: extensions/roopik/src/api/contextProvider.ts

/**
 * Provides context about Roopik's current state to other extensions
 * AI Agent Extension subscribes to this to know what user is doing
 */
export class RoopikContextProvider {
  private onSelectionChangeEmitter = new vscode.EventEmitter<SelectionChangeEvent>();

  /**
   * Event fired when user selects element(s) in canvas/preview
   */
  readonly onSelectionChange = this.onSelectionChangeEmitter.event;

  /**
   * Get currently selected element(s) with full context
   */
  getSelection(): RoopikSelection | null {
    if (!this.selectedElements.length) return null;

    return {
      mode: this.currentMode,
      elements: this.selectedElements.map(el => ({
        element: el,
        component: el.dataset.roopikComponent,
        source: el.dataset.roopikSource,
        parent: el.dataset.roopikParent,
        computedStyles: getComputedStyle(el)
      })),
      code: this.getCodeForSelection(),
      screenshot: this.captureSelectionScreenshot()
    };
  }

  /**
   * Apply code changes from AI Agent
   */
  async applyCodeChanges(changes: CodeChange[]): Promise<void> {
    for (const change of changes) {
      await this.fileService.edit(change.filePath, change.edits);
    }
    await this.preview.reload();
  }
}

// Export API for other extensions
export function getRoopikAPI(): RoopikAPI {
  return {
    contextProvider: new RoopikContextProvider(),
    version: '1.0.0'
  };
}
```

---

### Migration Strategy

Since the AI Agent Extension doesn't exist yet, we follow a **progressive enhancement** approach:

#### Phase 1: Build Visual IDE (Current)
- ✅ Focus on Roopik core features (canvas, preview, toolbar UI)
- ✅ Implement fallback schemas (runtime styles, universal CSS controls)
- ✅ Define service interfaces with clear contracts
- ✅ Write TODOs where AI integration will happen

#### Phase 2: Service Abstraction Layer (Week 7-8)
- [ ] Implement `ServiceRegistry`
- [ ] Define all `IAIService` interfaces
- [ ] Create stub/dummy implementations
- [ ] Test that Roopik works without AI Agent installed
- [ ] Document API for future AI Agent development

#### Phase 3: Build AI Agent Extension (Week 9+)
- [ ] Create separate `extensions/ai-agent` folder
- [ ] Implement AI service interfaces using Claude API
- [ ] Register services with Roopik's `ServiceRegistry`
- [ ] Test integration between both extensions
- [ ] Ensure graceful degradation when AI Agent disabled

#### Phase 4: Enhance AI Capabilities (Week 10+)
- [ ] Add screenshot-based schema generation
- [ ] Implement intent detection for `/command` system
- [ ] Add design system memory
- [ ] Build schema caching layer in AI Agent
- [ ] Pre-generate schemas for popular libraries

---

### Benefits of This Architecture

| Benefit | Description |
|---------|-------------|
| **Independent Development** | Teams can work on Roopik and AI Agent separately |
| **Graceful Degradation** | Roopik works perfectly without AI Agent (uses fallbacks) |
| **Testability** | Each extension can be tested in isolation |
| **Multiple AI Providers** | AI Agent can support Claude, GPT-4, local models |
| **User Choice** | Users can disable AI features without losing core functionality |
| **Clear Boundaries** | No confusion about where AI logic belongs |
| **Future-Proof** | Easy to add new AI capabilities without touching Roopik core |
| **Performance** | AI processing isolated from UI rendering |

---

### Summary

**Roopik Extension:**
- Visual IDE features only
- No direct LLM API calls
- Exposes APIs and context
- Works standalone with fallback schemas

**AI Agent Extension:**
- Separate extension (like Copilot/Cursor)
- Handles ALL AI/LLM interactions
- Registers service implementations
- Optional installation

**Communication:**
- Service Registry pattern
- Well-defined interfaces
- Event-based context sharing
- Clear abstraction layers

**Implementation:**
- Phase 1: Build Roopik core (now)
- Phase 2: Define service interfaces (Week 7-8)
- Phase 3: Build AI Agent Extension (Week 9+)
- Phase 4: Enhance AI capabilities (Week 10+)

**Key Principle:**
> "Roopik provides the canvas and context. AI Agent provides the intelligence. They communicate through clean APIs, never through tight coupling."

---

**Architecture Last Updated**: 2025-11-20
**Author**: Roopik Architecture Team
**Reviewed**: Confirmed separation of concerns between visual IDE and AI agent
