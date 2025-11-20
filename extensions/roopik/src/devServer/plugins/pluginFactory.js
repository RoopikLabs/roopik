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
 * @param {Object} pluginConfig - Plugin configuration {forceRegexMode, verboseLogging}
 * @returns {Object} Vite plugin
 */
function getSourcePlugin(framework, extensionNodeModules, pluginConfig) {
	switch (framework) {
		case 'react-vite':
			return createReactSourcePlugin(extensionNodeModules, pluginConfig);

		case 'vue-vite':
			return createVueSourcePlugin(extensionNodeModules, pluginConfig);

		case 'svelte-vite':
			// TODO: Implement Svelte plugin
			console.log('[Roopik] Svelte source plugin not yet implemented');
			return createPlainHtmlSourcePlugin(pluginConfig);

		case 'solid-vite':
			// Solid uses JSX like React, so we can reuse the React plugin!
			return createReactSourcePlugin(extensionNodeModules, pluginConfig);

		case 'plain-html-vite':
			return createPlainHtmlSourcePlugin(pluginConfig);

		default:
			console.warn('[Roopik] Unknown framework, using plain HTML plugin:', framework);
			return createPlainHtmlSourcePlugin(pluginConfig);
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
		'vue-vite',           // ✅ Supported via regex-based template transformation
		'solid-vite',         // ✅ Reuses React plugin (JSX-based)
		'plain-html-vite',    // ✅ Supported via regex-based HTML transformation
	];

	return supportedFrameworks.includes(framework);
}

module.exports = {
	getSourcePlugin,
	supportsClickToSource
};
