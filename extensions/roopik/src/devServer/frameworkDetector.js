/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Framework Detection Utility
 * Detects project framework based on dependencies and file structure
 */

const fs = require('fs');
const path = require('path');

/**
 * Detect framework type from package.json
 * @param {string} projectRoot - Project root directory
 * @returns {string} Framework identifier: 'react-vite', 'vue-vite', 'svelte-vite', 'plain-html-vite', 'nextjs', 'unknown'
 */
function detectFramework(projectRoot) {
	const packageJsonPath = path.join(projectRoot, 'package.json');

	if (!fs.existsSync(packageJsonPath)) {
		return 'unknown';
	}

	try {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
		const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

		// Check for Vite-based frameworks first
		if (deps['vite']) {
			// React + Vite
			if (deps['react'] || deps['@vitejs/plugin-react']) {
				return 'react-vite';
			}

			// Vue + Vite
			if (deps['vue'] || deps['@vitejs/plugin-vue']) {
				return 'vue-vite';
			}

			// Svelte + Vite
			if (deps['svelte'] || deps['@sveltejs/vite-plugin-svelte']) {
				return 'svelte-vite';
			}

			// Solid + Vite
			if (deps['solid-js'] || deps['vite-plugin-solid']) {
				return 'solid-vite';
			}

			// Plain HTML/CSS/JS with Vite
			// (No framework dependencies, just Vite)
			return 'plain-html-vite';
		}

		// Next.js (React metaframework)
		if (deps['next']) {
			return 'nextjs';
		}

		// Nuxt (Vue metaframework)
		if (deps['nuxt']) {
			return 'nuxt';
		}

		// SvelteKit
		if (deps['@sveltejs/kit']) {
			return 'sveltekit';
		}

		// Webpack-based React (CRA, custom webpack)
		if (deps['react-scripts']) {
			return 'react-cra';
		}

		if (deps['webpack'] && deps['react']) {
			return 'react-webpack';
		}

		// Webpack-based Vue
		if (deps['webpack'] && deps['vue']) {
			return 'vue-webpack';
		}

		return 'unknown';
	} catch (error) {
		console.error('[Roopik] Error detecting framework:', error);
		return 'unknown';
	}
}

/**
 * Check if framework is supported
 * @param {string} framework - Framework identifier
 * @returns {boolean}
 */
function isFrameworkSupported(framework) {
	const supported = [
		'react-vite',
		'vue-vite',
		'svelte-vite',
		'solid-vite',
		'plain-html-vite',
		// Future: 'nextjs', 'nuxt', 'sveltekit', 'react-webpack', 'vue-webpack'
	];

	return supported.includes(framework);
}

/**
 * Get human-readable framework name
 * @param {string} framework - Framework identifier
 * @returns {string}
 */
function getFrameworkDisplayName(framework) {
	const names = {
		'react-vite': 'React (Vite)',
		'vue-vite': 'Vue 3 (Vite)',
		'svelte-vite': 'Svelte (Vite)',
		'solid-vite': 'SolidJS (Vite)',
		'plain-html-vite': 'Plain HTML (Vite)',
		'nextjs': 'Next.js',
		'nuxt': 'Nuxt',
		'sveltekit': 'SvelteKit',
		'react-cra': 'React (Create React App)',
		'react-webpack': 'React (Webpack)',
		'vue-webpack': 'Vue (Webpack)',
		'unknown': 'Unknown'
	};

	return names[framework] || 'Unknown';
}

module.exports = {
	detectFramework,
	isFrameworkSupported,
	getFrameworkDisplayName
};
