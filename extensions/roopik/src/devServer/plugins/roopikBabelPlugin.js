/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik Babel Plugin - Adds data-roopik-source attributes to JSX elements
 *
 * This MUST run BEFORE @vitejs/plugin-react transforms JSX to jsxDEV calls!
 */

function createRoopikBabelPlugin() {
	return function roopikBabelPlugin({ types: t }) {
		return {
			name: 'babel-plugin-roopik-source',
			visitor: {
				JSXOpeningElement(path, state) {
					const { node } = path;
					const loc = node.loc;
					if (!loc) return;

					// Get file path - use absolute path for Windows compatibility
					const filename = state.filename || state.file.opts.filename || '';
					const relPath = filename.replace(/\\/g, '/');

					// Create data-roopik-source attribute with file:line:column
					const sourceValue = `${relPath}:${loc.start.line}:${loc.start.column}`;

					// Create JSXAttribute node
					const sourceAttr = t.jsxAttribute(
						t.jsxIdentifier('data-roopik-source'),
						t.stringLiteral(sourceValue)
					);

					// Add attribute to element (only if not already present)
					const hasRoopikAttr = node.attributes.some(
						attr => t.isJSXAttribute(attr) && attr.name.name === 'data-roopik-source'
					);

					if (!hasRoopikAttr) {
						node.attributes.push(sourceAttr);
					}
				}
			}
		};
	};
}

module.exports = { createRoopikBabelPlugin };
