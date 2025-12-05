/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sandbox Renderer - Usage Examples
 *
 * Shows how to use the new sandbox renderer with the pipeline.
 */

import { ISandboxPipelineService } from '../../../common/sandboxPipeline/sandboxPipelineService.js';
import { createSandboxIframe, executeSandboxCode, extractDependenciesFromCode } from './sandboxRenderer.js';

/**
 * Example 1: Simple React Component
 */
export async function example1_SimpleReact(
	pipelineService: ISandboxPipelineService,
	container: HTMLElement
) {
	const aiCode = `
import React, { useState } from 'react';

export default function Counter() {
	const [count, setCount] = useState(0);
	return (
		<div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
			<h1>Count: {count}</h1>
			<button onClick={() => setCount(count + 1)}>
				Increment
			</button>
		</div>
	);
}
	`;

	// 1. Create sandbox iframe
	const iframe = createSandboxIframe('react-sandbox');
	container.appendChild(iframe);

	// 2. Wait for iframe to be ready
	await new Promise(resolve => {
		window.addEventListener('message', function handler(event) {
			if (event.data.type === 'ready') {
				window.removeEventListener('message', handler);
				resolve(undefined);
			}
		});
	});

	// 3. Execute code via pipeline
	await executeSandboxCode(pipelineService, iframe, {
		id: 'react-counter',
		source: 'ai',
		files: { 'Counter.jsx': aiCode },
		dependencies: { 'react': '19', 'react-dom': '19' }
	});

	console.log('✅ React component rendered!');
}

/**
 * Example 2: Multi-File Vue Component
 */
export async function example2_MultiFileVue(
	pipelineService: ISandboxPipelineService,
	container: HTMLElement
) {
	const files = {
		'App.vue': `
<template>
	<div class="app">
		<Header title="My App" />
		<p>Welcome to Vue!</p>
	</div>
</template>

<script setup>
import Header from './Header.vue';
</script>

<style scoped>
.app {
	padding: 20px;
	font-family: sans-serif;
}
</style>
		`,
		'Header.vue': `
<template>
	<header class="header">
		<h1>{{ title }}</h1>
	</header>
</template>

<script setup>
defineProps(['title']);
</script>

<style scoped>
.header {
	background: #42b983;
	color: white;
	padding: 20px;
	margin-bottom: 20px;
}
</style>
		`
	};

	const iframe = createSandboxIframe('vue-sandbox');
	container.appendChild(iframe);

	await new Promise(resolve => {
		window.addEventListener('message', function handler(event) {
			if (event.data.type === 'ready') {
				window.removeEventListener('message', handler);
				resolve(undefined);
			}
		});
	});

	await executeSandboxCode(pipelineService, iframe, {
		id: 'vue-app',
		source: 'ai',
		framework: 'vue',
		files,
		dependencies: { 'vue': '3' }
	});

	console.log('✅ Multi-file Vue component rendered with CSS!');
}

/**
 * Example 3: Error Handling
 */
export async function example3_ErrorHandling(
	pipelineService: ISandboxPipelineService,
	container: HTMLElement
) {
	const brokenCode = `
import React from 'react';

export default function Broken() {
	// This will throw an error
	throw new Error('Intentional error for testing');
	return <div>This won't render</div>;
}
	`;

	const iframe = createSandboxIframe('error-sandbox');
	container.appendChild(iframe);

	// Listen for errors
	window.addEventListener('message', (event) => {
		if (event.data.type === 'error') {
			console.error('Sandbox error:', event.data.error);
			// Show error UI to user
		}
	});

	await new Promise(resolve => {
		window.addEventListener('message', function handler(event) {
			if (event.data.type === 'ready') {
				window.removeEventListener('message', handler);
				resolve(undefined);
			}
		});
	});

	try {
		await executeSandboxCode(pipelineService, iframe, {
			id: 'broken-component',
			source: 'ai',
			files: { 'Broken.jsx': brokenCode }
		});
	} catch (error) {
		console.log('✅ Error handled gracefully:', error);
	}
}

/**
 * Example 4: Auto-Detect Dependencies
 */
export async function example4_AutoDetect(
	pipelineService: ISandboxPipelineService,
	container: HTMLElement
) {
	const code = `
import React from 'react';
import { format } from 'date-fns';

export default () => (
	<div>
		<h1>Today is {format(new Date(), 'yyyy-MM-dd')}</h1>
	</div>
);
	`;

	const iframe = createSandboxIframe('auto-detect-sandbox');
	container.appendChild(iframe);

	await new Promise(resolve => {
		window.addEventListener('message', function handler(event) {
			if (event.data.type === 'ready') {
				window.removeEventListener('message', handler);
				resolve(undefined);
			}
		});
	});

	// Auto-detect dependencies
	const deps = extractDependenciesFromCode(code);

	await executeSandboxCode(pipelineService, iframe, {
		id: 'auto-detect',
		source: 'ai',
		files: { 'App.jsx': code },
		dependencies: deps // Will auto-detect React
		// date-fns will use @latest from esm.sh
	});

	console.log('✅ Auto-detected dependencies:', deps);
}
