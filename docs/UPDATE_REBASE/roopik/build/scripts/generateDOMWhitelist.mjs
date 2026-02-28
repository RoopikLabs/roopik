/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *---------------------------------------------------------------------------------------------*/

/**
 * Build Script: Generate DOM Element Whitelist
 *
 * Extracts valid DOM elements from @mdn/browser-compat-data
 * and generates a static module for runtime use.
 *
 * Run: node build/scripts/generateDOMWhitelist.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use createRequire to import JSON in ESM
const require = createRequire(import.meta.url);
const bcd = require('@mdn/browser-compat-data');

// Tags where injecting data-roopik-* is useless or dangerous
const SKIP_TAGS = new Set([
	'script',   // JavaScript code - no visual element
	'style',    // CSS code - no visual element
	'head',     // Document metadata container
	'html',     // Root element
	'meta',     // Metadata - not rendered
	'link',     // External resources - not rendered
	'base',     // Base URL - not rendered
	'title',    // Document title - in browser tab
	'noscript', // Fallback content
]);

function extractElements(category) {
	const elements = bcd[category]?.elements || {};
	const tags = [];

	for (const tagName in elements) {
		const lowerTag = tagName.toLowerCase();

		// Skip metadata/non-visual tags
		if (SKIP_TAGS.has(lowerTag)) continue;

		tags.push(lowerTag);
	}

	return tags;
}

function generateWhitelist() {
	const htmlTags = extractElements('html');
	const svgTags = extractElements('svg');
	const mathmlTags = extractElements('mathml');

	// Combine all tags into a single Set (for fast O(1) lookup)
	const allTags = [...new Set([...htmlTags, ...svgTags, ...mathmlTags])].sort();

	const output = `/*---------------------------------------------------------------------------------------------
 *  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 *  Generated from @mdn/browser-compat-data
 *  Run: node build/scripts/generateDOMWhitelist.mjs
 *---------------------------------------------------------------------------------------------*/

/**
 * Valid DOM elements that support data-* attributes.
 * Includes: HTML, SVG, MathML elements (excluding non-visual tags like script, style, head)
 *
 * Generated: ${new Date().toISOString()}
 * Source: @mdn/browser-compat-data
 * Total: ${allTags.length} elements
 */
export const DOM_ELEMENTS = new Set([
	${allTags.map(t => `'${t}'`).join(',\n\t')}
]);

/**
 * Check if element is a valid DOM element that supports data-* attributes.
 * Includes: HTML, SVG, MathML, and Web Components (custom elements with hyphens)
 * Excludes: React components, R3F/Three.js elements, library elements
 *
 * @param {string} name - Element name (case-sensitive for React JSX)
 * @returns {boolean}
 */
export function isDOMElement(name) {
	if (!name || typeof name !== 'string') return false;

	// Skip JSX fragments (<> or React.Fragment)
	if (name === '' || name === 'Fragment' || name === 'React.Fragment') {
		return false;
	}

	// Skip namespaced elements (Foo.Bar, Icons.Home)
	if (name.includes('.')) {
		return false;
	}

	// In JSX, tags starting with uppercase are ALWAYS components, never DOM elements
	// Examples: <Button>, <Canvas>, <MyComponent>, <UserProfile>
	// Note: SVG camelCase elements (clipPath, linearGradient) start with lowercase
	const firstChar = name.charAt(0);
	if (firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()) {
		return false; // PascalCase = React component
	}

	const lowerName = name.toLowerCase();

	// 1. Standard DOM elements (HTML, SVG, MathML)
	if (DOM_ELEMENTS.has(lowerName)) {
		return true;
	}

	// 2. Custom Elements / Web Components
	// Per W3C spec, custom elements MUST contain a hyphen
	// This safely includes <my-navbar>, <sl-button>, <cal-link>
	// while excluding Three.js (<mesh>, <boxGeometry>) which never have hyphens
	if (name.includes('-') && /^[a-z]/.test(name)) {
		return true;
	}

	// 3. Everything else: R3F (<mesh>), react-konva, react-pixi, etc.
	return false;
}
`;

	// Output path
	const outputPath = join(__dirname, '../../src/vs/workbench/contrib/roopik/electron-main/projectMode/devServer/lib/domElements.mjs');

	// Ensure the directory exists
	mkdirSync(dirname(outputPath), { recursive: true });

	writeFileSync(outputPath, output, 'utf8');

	console.log(`Generated DOM whitelist with ${allTags.length} elements`);
	console.log(`  HTML: ${htmlTags.length}, SVG: ${svgTags.length}, MathML: ${mathmlTags.length}`);
	console.log(`  Output: ${outputPath}`);
}

generateWhitelist();
