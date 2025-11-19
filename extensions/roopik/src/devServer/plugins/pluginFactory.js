/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plugin Factory - Strategy Pattern
 * Creates appropriate source tracking plugin based on framework type
 */

const { createReactSourcePlugin } = require('./reactSourcePlugin');
const { createVueSourcePlugin } = require('./vueSourcePlugin');
const { createPlainHtmlSourcePlugin } = require('./plainHtmlSourcePlugin');

/**
 * Get source plugin for framework
 * @param {string} framework - Framework identifier ('react-vite', 'vue-vite', etc.)
 * @param {string} extensionNodeModules - Path to extension's node_modules
 * @returns {Object} Vite plugin
 */
function getSourcePlugin(framework, extensionNodeModules) {
	switch (framework) {
		case 'react-vite':
			return createReactSourcePlugin(extensionNodeModules);

		case 'vue-vite':
			return createVueSourcePlugin(extensionNodeModules);

		case 'svelte-vite':
			// TODO: Implement Svelte plugin
			console.log('[Roopik] Svelte source plugin not yet implemented');
			return createPlainHtmlSourcePlugin();

		case 'solid-vite':
			// Solid uses JSX like React, so we can reuse the React plugin!
			return createReactSourcePlugin(extensionNodeModules);

		case 'plain-html-vite':
			return createPlainHtmlSourcePlugin();

		default:
			console.warn('[Roopik] Unknown framework, using plain HTML plugin:', framework);
			return createPlainHtmlSourcePlugin();
	}
}

/**
 * Check if framework supports click-to-source
 * @param {string} framework - Framework identifier
 * @returns {boolean}
 */
function supportsClickToSource(framework) {
	const supportedFrameworks = [
		'react-vite',
		'solid-vite',
		// 'vue-vite' will be supported once we implement the Vue compiler plugin
	];

	return supportedFrameworks.includes(framework);
}

module.exports = {
	getSourcePlugin,
	supportsClickToSource
};
