/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Vue Source Mapping Plugin
 * Adds source tracking to Vue components (future implementation)
 */

/**
 * Create Vue source plugin for Vite
 * @param {string} extensionNodeModules - Path to extension's node_modules
 * @returns {Object} Vite plugin
 */
function createVueSourcePlugin(extensionNodeModules) {
	return {
		name: 'roopik-vue-source',
		enforce: 'pre', // Run before @vitejs/plugin-vue

		transform(code, id) {
			// Only process .vue files
			if (!id.endsWith('.vue')) {
				return null;
			}

			// TODO: Implement Vue SFC template transformation
			// For now, return null (no transformation)
			// Vue components will still work in preview, just without line-level click-to-source

			console.log('[Roopik Vue Plugin] Vue SFC detected (click-to-source not yet implemented):', id);

			return null;
		}
	};
}

/**
 * Future implementation notes:
 *
 * To add source tracking to Vue templates, we need to:
 * 1. Parse .vue file using @vue/compiler-sfc
 * 2. Transform the <template> section AST
 * 3. Add data-roopik-source attributes to template elements
 * 4. Recompile the template
 *
 * Example:
 *
 * const { parse, compileTemplate } = require('@vue/compiler-sfc');
 *
 * const { descriptor } = parse(code, { filename: id });
 *
 * if (descriptor.template) {
 *   // Transform template AST to add source attributes
 *   const transformedTemplate = addSourceAttributes(descriptor.template.ast);
 *
 *   // Recompile
 *   const compiled = compileTemplate({
 *     source: transformedTemplate,
 *     filename: id
 *   });
 * }
 *
 * This is similar to how @vitejs/plugin-vue works internally.
 */

module.exports = { createVueSourcePlugin };
