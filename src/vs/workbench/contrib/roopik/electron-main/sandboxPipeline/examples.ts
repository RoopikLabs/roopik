/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * ESBuild Transformer - Usage Examples
 *
 * Demonstrates the new dynamic dependency resolution system.
 */

import { ESBuildTransformer } from './esbuildTransformer.js';
import { ComponentParser } from '../../common/sandboxPipeline/componentParser.js';

const parser = new ComponentParser();
const transformer = new ESBuildTransformer(parser);

/**
 * Example 1: AI Provides Specific Versions
 */
async function example1_AIProvidedVersions() {
	const input = {
		id: 'react19-component',
		source: 'ai' as const,
		files: {
			'App.jsx': `
import React, { useState } from 'react';

export default function Counter() {
	const [count, setCount] = useState(0);
	return (
		<div>
			<h1>Count: {count}</h1>
			<button onClick={() => setCount(count + 1)}>Increment</button>
		</div>
	);
}
			`
		},
		dependencies: {
			'react': '19.0.0',  // AI specifies React 19!
			'react-dom': '19.0.0'
		}
	};

	const result = await transformer.transform(input);

	console.log('✅ AI-Provided Versions Example');
	console.log('Framework:', result.framework);
	console.log('CDN URLs:', result.cdnUrls);
	// Expected: ['https://esm.sh/react@19.0.0', 'https://esm.sh/react-dom@19.0.0']
	console.log('Code size:', result.metadata.size, 'bytes');
	console.log('Transform time:', result.metadata.transformTime, 'ms');
}

/**
 * Example 2: No Versions (Fallback to Latest)
 */
async function example2_FallbackToLatest() {
	const input = {
		id: 'react-latest',
		source: 'ai' as const,
		files: {
			'App.jsx': `
import React from 'react';

export default () => <h1>Hello World</h1>;
			`
		}
		// No dependencies specified!
	};

	const result = await transformer.transform(input);

	console.log('✅ Fallback to Latest Example');
	console.log('CDN URLs:', result.cdnUrls);
	// Expected: ['https://esm.sh/react', 'https://esm.sh/react-dom']
	// esm.sh will resolve to latest stable
}

/**
 * Example 3: Multi-File Vue Component
 */
async function example3_MultiFileVue() {
	const input = {
		id: 'vue-multi-file',
		source: 'user' as const,
		framework: 'vue' as const,
		files: {
			'Header.vue': `
<template>
	<header class="header">
		<h1>{{ title }}</h1>
	</header>
</template>

<script setup>
import { ref } from 'vue';
const title = ref('My App');
</script>

<style src="./Header.css"></style>
			`,
			'Header.css': `
.header {
	background: #333;
	color: white;
	padding: 20px;
}
			`
		},
		dependencies: {
			'vue': '3.4.0'
		}
	};

	const result = await transformer.transform(input);

	console.log('✅ Multi-File Vue Example');
	console.log('Framework:', result.framework);
	console.log('CDN URLs:', result.cdnUrls);
	console.log('Bundled code includes CSS:', result.bundledCode.includes('.header'));
}

/**
 * Example 4: Solid.js with Latest
 */
async function example4_SolidJS() {
	const input = {
		id: 'solid-component',
		source: 'ai' as const,
		files: {
			'Counter.jsx': `
import { createSignal } from 'solid-js';

export default function Counter() {
	const [count, setCount] = createSignal(0);
	return (
		<div>
			<h1>Count: {count()}</h1>
			<button onClick={() => setCount(count() + 1)}>+</button>
		</div>
	);
}
			`
		}
		// No dependencies - will use latest solid-js
	};

	const result = await transformer.transform(input);

	console.log('✅ Solid.js Example');
	console.log('Framework:', result.framework);
	console.log('CDN URLs:', result.cdnUrls);
	// Expected: ['https://esm.sh/solid-js', 'https://esm.sh/solid-js/web']
}

/**
 * Example 5: Verify ESM Module Resolution (No Globals)
 */
async function example5_ESMVerification() {
	const input = {
		id: 'esm-test',
		source: 'ai' as const,
		files: {
			'App.jsx': `
import React from 'react';
export default () => <div>Test</div>;
			`
		}
	};

	const result = await transformer.transform(input);

	console.log('✅ ESM Verification Example');
	console.log('No window.React:', !result.bundledCode.includes('window.React'));
	console.log('Has import React:', result.bundledCode.includes('import'));
	console.log('Has createRoot:', result.bundledCode.includes('createRoot'));
}

/**
 * Example 6: Unknown Package (esm.sh handles it)
 */
async function example6_UnknownPackage() {
	const input = {
		id: 'unknown-pkg',
		source: 'ai' as const,
		files: {
			'App.jsx': `
import React from 'react';
import { format } from 'date-fns'; // Random package

export default () => <div>{format(new Date(), 'yyyy-MM-dd')}</div>;
			`
		}
		// No dependencies specified
	};

	const result = await transformer.transform(input);

	console.log('✅ Unknown Package Example');
	console.log('CDN URLs:', result.cdnUrls);
	// Expected: ['https://esm.sh/react', 'https://esm.sh/react-dom', 'https://esm.sh/date-fns']
	// esm.sh resolves all to latest
}

// Export for testing
export {
	example1_AIProvidedVersions,
	example2_FallbackToLatest,
	example3_MultiFileVue,
	example4_SolidJS,
	example5_ESMVerification,
	example6_UnknownPackage
};
