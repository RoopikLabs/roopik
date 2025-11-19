/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * React Source Mapping Plugin
 * Adds data-roopik-source attributes to React JSX elements using Babel AST transformation
 */

const path = require('path');

/**
 * Create React source plugin for Vite
 * @param {string} extensionNodeModules - Path to extension's node_modules
 * @returns {Object} Vite plugin
 */
function createReactSourcePlugin(extensionNodeModules) {
	return {
		name: 'roopik-react-source',
		enforce: 'pre', // Run BEFORE @vitejs/plugin-react

		transform(code, id) {
			// Only process JSX/TSX files
			if (!/\.[jt]sx$/.test(id)) {
				return null;
			}

			try {
				// Load Babel from EXTENSION's node_modules (not user's!)
				const babelPath = path.join(extensionNodeModules, '@babel', 'core');
				const babel = require(babelPath);

				// Transform with Babel
				const result = babel.transformSync(code, {
					filename: id,
					plugins: [
						// Inline Babel plugin for adding data-roopik-source
						function roopikBabelPlugin({ types: t }) {
							return {
								visitor: {
									JSXOpeningElement(path, state) {
										const { node } = path;
										const loc = node.loc;
										if (!loc) return;

										const filename = state.filename || id;
										const relPath = filename.replace(/\\/g, '/');
										const sourceValue = `${relPath}:${loc.start.line}:${loc.start.column}`;

										// Create JSXAttribute node
										const sourceAttr = t.jsxAttribute(
											t.jsxIdentifier('data-roopik-source'),
											t.stringLiteral(sourceValue)
										);

										// Add attribute (only if not already present)
										const hasRoopikAttr = node.attributes.some(
											attr => t.isJSXAttribute(attr) && attr.name.name === 'data-roopik-source'
										);

										if (!hasRoopikAttr) {
											node.attributes.push(sourceAttr);
										}
									}
								}
							};
						}
					],
					sourceType: 'module',
					parserOpts: {
						sourceType: 'module',
						plugins: ['jsx', 'typescript']
					}
				});

				if (result && result.code) {
					return {
						code: result.code,
						map: result.map
					};
				}

				return null;
			} catch (error) {
				console.error('[Roopik React Plugin] Babel transform error:', error);

				// Fallback: Try regex-based injection
				return tryRegexFallback(code, id);
			}
		}
	};
}

/**
 * Fallback: Regex-based source attribute injection
 * Less reliable than AST, but works when Babel fails
 */
function tryRegexFallback(code, filename) {
	try {
		const relPath = filename.replace(/\\/g, '/');

		// Simple regex to inject data-roopik-source into JSX opening tags
		// Matches: <ComponentName or <div
		const modifiedCode = code.replace(
			/<([A-Z][a-zA-Z0-9]*|[a-z]+)(\s|>|\/)/g,
			(match, tagName, trailing) => {
				// Approximate line number (very rough!)
				const lineNumber = code.substring(0, match.index).split('\n').length;
				return `<${tagName} data-roopik-source="${relPath}:${lineNumber}:0"${trailing}`;
			}
		);

		console.log('[Roopik React Plugin] Using regex fallback for:', filename);

		return {
			code: modifiedCode,
			map: null
		};
	} catch (error) {
		console.error('[Roopik React Plugin] Regex fallback error:', error);
		return null;
	}
}

module.exports = { createReactSourcePlugin };
