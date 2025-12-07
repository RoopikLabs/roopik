/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Manual Import Adapter
 *
 * Handles creating blank components from templates.
 * User selects framework and template type.
 */

import { ComponentSource, Framework } from '../../../common/storage/storageTypes.js';
import { SourceData, ManualSourceData, ImportResult } from '../../../common/component/types.js';
import { BaseImportAdapter } from './types.js';

// ============================================================================
// Component Templates
// ============================================================================

type TemplateType = 'blank' | 'basic' | 'with-state';

interface Template {
	files: Record<string, string>;
	entryFile: string;
	dependencies: Record<string, string>;
}

/**
 * Template generators for each framework
 */
const TEMPLATES: Record<Framework, Record<TemplateType, () => Template>> = {
	react: {
		blank: () => ({
			files: {
				'Component.tsx': `export default function Component() {
	return (
		<div>
			{/* Your component here */}
		</div>
	);
}
`
			},
			entryFile: 'Component.tsx',
			dependencies: {}
		}),
		basic: () => ({
			files: {
				'Component.tsx': `interface ComponentProps {
	title?: string;
}

export default function Component({ title = 'Hello World' }: ComponentProps) {
	return (
		<div className="component">
			<h1>{title}</h1>
			<p>This is a basic React component.</p>
		</div>
	);
}
`,
				'styles.css': `.component {
	padding: 20px;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.component h1 {
	color: #333;
	margin-bottom: 10px;
}

.component p {
	color: #666;
}
`
			},
			entryFile: 'Component.tsx',
			dependencies: {}
		}),
		'with-state': () => ({
			files: {
				'Component.tsx': `import { useState } from 'react';

interface ComponentProps {
	initialCount?: number;
}

export default function Component({ initialCount = 0 }: ComponentProps) {
	const [count, setCount] = useState(initialCount);

	return (
		<div className="counter">
			<h2>Counter: {count}</h2>
			<div className="buttons">
				<button onClick={() => setCount(c => c - 1)}>-</button>
				<button onClick={() => setCount(c => c + 1)}>+</button>
			</div>
		</div>
	);
}
`,
				'styles.css': `.counter {
	padding: 20px;
	text-align: center;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.counter h2 {
	margin-bottom: 16px;
	color: #333;
}

.buttons {
	display: flex;
	gap: 8px;
	justify-content: center;
}

.buttons button {
	padding: 8px 16px;
	font-size: 18px;
	cursor: pointer;
	border: 1px solid #ddd;
	border-radius: 4px;
	background: #f5f5f5;
}

.buttons button:hover {
	background: #e5e5e5;
}
`
			},
			entryFile: 'Component.tsx',
			dependencies: {}
		})
	},

	vue: {
		blank: () => ({
			files: {
				'Component.vue': `<template>
	<div>
		<!-- Your component here -->
	</div>
</template>

<script setup lang="ts">
</script>
`
			},
			entryFile: 'Component.vue',
			dependencies: {}
		}),
		basic: () => ({
			files: {
				'Component.vue': `<template>
	<div class="component">
		<h1>{{ title }}</h1>
		<p>This is a basic Vue component.</p>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	title?: string;
}>();
</script>

<style scoped>
.component {
	padding: 20px;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

h1 {
	color: #333;
	margin-bottom: 10px;
}

p {
	color: #666;
}
</style>
`
			},
			entryFile: 'Component.vue',
			dependencies: {}
		}),
		'with-state': () => ({
			files: {
				'Component.vue': `<template>
	<div class="counter">
		<h2>Counter: {{ count }}</h2>
		<div class="buttons">
			<button @click="count--">-</button>
			<button @click="count++">+</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
	initialCount?: number;
}>();

const count = ref(props.initialCount ?? 0);
</script>

<style scoped>
.counter {
	padding: 20px;
	text-align: center;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

h2 {
	margin-bottom: 16px;
	color: #333;
}

.buttons {
	display: flex;
	gap: 8px;
	justify-content: center;
}

button {
	padding: 8px 16px;
	font-size: 18px;
	cursor: pointer;
	border: 1px solid #ddd;
	border-radius: 4px;
	background: #f5f5f5;
}

button:hover {
	background: #e5e5e5;
}
</style>
`
			},
			entryFile: 'Component.vue',
			dependencies: {}
		})
	},

	svelte: {
		blank: () => ({
			files: {
				'Component.svelte': `<script lang="ts">
</script>

<div>
	<!-- Your component here -->
</div>

<style>
</style>
`
			},
			entryFile: 'Component.svelte',
			dependencies: {}
		}),
		basic: () => ({
			files: {
				'Component.svelte': `<script lang="ts">
	export let title = 'Hello World';
</script>

<div class="component">
	<h1>{title}</h1>
	<p>This is a basic Svelte component.</p>
</div>

<style>
	.component {
		padding: 20px;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	h1 {
		color: #333;
		margin-bottom: 10px;
	}

	p {
		color: #666;
	}
</style>
`
			},
			entryFile: 'Component.svelte',
			dependencies: {}
		}),
		'with-state': () => ({
			files: {
				'Component.svelte': `<script lang="ts">
	export let initialCount = 0;
	let count = initialCount;
</script>

<div class="counter">
	<h2>Counter: {count}</h2>
	<div class="buttons">
		<button on:click={() => count--}>-</button>
		<button on:click={() => count++}>+</button>
	</div>
</div>

<style>
	.counter {
		padding: 20px;
		text-align: center;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	h2 {
		margin-bottom: 16px;
		color: #333;
	}

	.buttons {
		display: flex;
		gap: 8px;
		justify-content: center;
	}

	button {
		padding: 8px 16px;
		font-size: 18px;
		cursor: pointer;
		border: 1px solid #ddd;
		border-radius: 4px;
		background: #f5f5f5;
	}

	button:hover {
		background: #e5e5e5;
	}
</style>
`
			},
			entryFile: 'Component.svelte',
			dependencies: {}
		})
	},

	solid: {
		blank: () => ({
			files: {
				'Component.tsx': `export default function Component() {
	return (
		<div>
			{/* Your component here */}
		</div>
	);
}
`
			},
			entryFile: 'Component.tsx',
			dependencies: {}
		}),
		basic: () => ({
			files: {
				'Component.tsx': `interface ComponentProps {
	title?: string;
}

export default function Component(props: ComponentProps) {
	return (
		<div class="component">
			<h1>{props.title ?? 'Hello World'}</h1>
			<p>This is a basic Solid component.</p>
		</div>
	);
}
`
			},
			entryFile: 'Component.tsx',
			dependencies: {}
		}),
		'with-state': () => ({
			files: {
				'Component.tsx': `import { createSignal } from 'solid-js';

interface ComponentProps {
	initialCount?: number;
}

export default function Component(props: ComponentProps) {
	const [count, setCount] = createSignal(props.initialCount ?? 0);

	return (
		<div class="counter">
			<h2>Counter: {count()}</h2>
			<div class="buttons">
				<button onClick={() => setCount(c => c - 1)}>-</button>
				<button onClick={() => setCount(c => c + 1)}>+</button>
			</div>
		</div>
	);
}
`
			},
			entryFile: 'Component.tsx',
			dependencies: {}
		})
	},

	preact: {
		blank: () => ({
			files: {
				'Component.tsx': `export default function Component() {
	return (
		<div>
			{/* Your component here */}
		</div>
	);
}
`
			},
			entryFile: 'Component.tsx',
			dependencies: {}
		}),
		basic: () => ({
			files: {
				'Component.tsx': `interface ComponentProps {
	title?: string;
}

export default function Component({ title = 'Hello World' }: ComponentProps) {
	return (
		<div className="component">
			<h1>{title}</h1>
			<p>This is a basic Preact component.</p>
		</div>
	);
}
`
			},
			entryFile: 'Component.tsx',
			dependencies: {}
		}),
		'with-state': () => ({
			files: {
				'Component.tsx': `import { useState } from 'preact/hooks';

interface ComponentProps {
	initialCount?: number;
}

export default function Component({ initialCount = 0 }: ComponentProps) {
	const [count, setCount] = useState(initialCount);

	return (
		<div className="counter">
			<h2>Counter: {count}</h2>
			<div className="buttons">
				<button onClick={() => setCount(c => c - 1)}>-</button>
				<button onClick={() => setCount(c => c + 1)}>+</button>
			</div>
		</div>
	);
}
`
			},
			entryFile: 'Component.tsx',
			dependencies: {}
		})
	},

	html: {
		blank: () => ({
			files: {
				'index.html': `<div id="app">
	<!-- Your content here -->
</div>
`,
				'styles.css': `#app {
	padding: 20px;
}
`
			},
			entryFile: 'index.html',
			dependencies: {}
		}),
		basic: () => ({
			files: {
				'index.html': `<div class="component">
	<h1>Hello World</h1>
	<p>This is a basic HTML component.</p>
</div>
`,
				'styles.css': `.component {
	padding: 20px;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.component h1 {
	color: #333;
	margin-bottom: 10px;
}

.component p {
	color: #666;
}
`
			},
			entryFile: 'index.html',
			dependencies: {}
		}),
		'with-state': () => ({
			files: {
				'index.html': `<div class="counter">
	<h2>Counter: <span id="count">0</span></h2>
	<div class="buttons">
		<button id="decrement">-</button>
		<button id="increment">+</button>
	</div>
</div>
`,
				'styles.css': `.counter {
	padding: 20px;
	text-align: center;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.counter h2 {
	margin-bottom: 16px;
	color: #333;
}

.buttons {
	display: flex;
	gap: 8px;
	justify-content: center;
}

.buttons button {
	padding: 8px 16px;
	font-size: 18px;
	cursor: pointer;
	border: 1px solid #ddd;
	border-radius: 4px;
	background: #f5f5f5;
}

.buttons button:hover {
	background: #e5e5e5;
}
`,
				'script.js': `let count = 0;
const countEl = document.getElementById('count');

document.getElementById('decrement').addEventListener('click', () => {
	count--;
	countEl.textContent = count;
});

document.getElementById('increment').addEventListener('click', () => {
	count++;
	countEl.textContent = count;
});
`
			},
			entryFile: 'index.html',
			dependencies: {}
		})
	}
};

// ============================================================================
// Adapter Implementation
// ============================================================================

export class ManualAdapter extends BaseImportAdapter {
	readonly sourceType: ComponentSource = 'manual';

	async import(sourceData: SourceData): Promise<ImportResult> {
		if (sourceData.type !== 'manual') {
			throw new Error('ManualAdapter: Invalid source type');
		}

		const data = sourceData as ManualSourceData;
		const { framework, template = 'blank' } = data;

		// Get template generator for framework
		const frameworkTemplates = TEMPLATES[framework];
		if (!frameworkTemplates) {
			throw new Error(`ManualAdapter: Unsupported framework: ${framework}`);
		}

		const templateGenerator = frameworkTemplates[template];
		if (!templateGenerator) {
			throw new Error(`ManualAdapter: Unsupported template: ${template}`);
		}

		// Generate template
		const generated = templateGenerator();

		return {
			files: generated.files,
			entryFile: generated.entryFile,
			framework,
			dependencies: generated.dependencies,
			sourceInfo: {}
		};
	}
}
