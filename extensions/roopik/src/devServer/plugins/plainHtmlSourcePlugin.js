/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plain HTML Source Plugin
 * No source tracking for plain HTML (static content has no compilation step)
 */

/**
 * Create plain HTML source plugin (no-op)
 * Plain HTML files don't have a compilation step, so we can't add source tracking
 * @returns {Object} Vite plugin (no-op)
 */
function createPlainHtmlSourcePlugin() {
	return {
		name: 'roopik-plain-html-source',

		transform(code, id) {
			// No transformation needed for plain HTML/JS/CSS
			// Click-to-source won't work, but preview will still function
			return null;
		}
	};
}

/**
 * Note: Plain HTML projects can still use Roopik preview with:
 * - ✅ Authentication (User-Agent + handshake)
 * - ✅ HTML injection (postMessage, navigation tracking)
 * - ❌ Click-to-source (no source mapping available)
 *
 * For click-to-source in plain HTML, we would need to:
 * - Parse HTML files
 * - Add data-roopik-source to every element
 * - Track line numbers manually
 *
 * This is fragile and not recommended. Better to encourage users
 * to adopt a component-based framework (React, Vue, Svelte).
 */

module.exports = { createPlainHtmlSourcePlugin };
