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
 * @param {Object} pluginConfig - Plugin configuration {forceRegexMode, verboseLogging}
 * @returns {Object} Vite plugin
 */
function createReactSourcePlugin(extensionNodeModules, pluginConfig = {}) {
	const { forceRegexMode = false, verboseLogging = true } = pluginConfig;

	return {
		name: 'roopik-react-source',
		enforce: 'pre', // Run BEFORE @vitejs/plugin-react

		transform(code, id) {
			// Only process JSX/TSX files
			if (!/\.[jt]sx$/.test(id)) {
				return null;
			}

			try {
				if (verboseLogging) {
					console.log('[Roopik React Plugin] Processing JSX/TSX:', id);
				}

				// Check if regex mode is forced
				const forceRegex = forceRegexMode;

				if (forceRegex) {
					console.log('[Roopik React Plugin] ⚠️ FORCE REGEX MODE ENABLED');
					const regexResult = tryRegexFallback(code, id, verboseLogging);
					if (regexResult) {
						if (verboseLogging) {
							console.log('[Roopik React Plugin] ✓ Regex transformation successful (forced):', id);
						}
						return regexResult;
					}
					return null;
				}

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
					if (verboseLogging) {
						console.log('[Roopik React Plugin] ✓ Babel transformation successful:', id);
					}
					return {
						code: result.code,
						map: result.map
					};
				}

				return null;
			} catch (error) {
				console.error('[Roopik React Plugin] Babel transform error:', error);

				// Fallback: Try regex-based injection
				console.warn('[Roopik React Plugin] Babel failed, using regex fallback:', id);
				return tryRegexFallback(code, id, verboseLogging);
			}
		}
	};
}

/**
 * Fallback: Regex-based source attribute injection
 * Less reliable than AST, but works when Babel fails
 * Uses line-by-line approach like Vue plugin for accurate line numbers
 */
function tryRegexFallback(code, filename, verboseLogging) {
	try {
		const relPath = filename.replace(/\\/g, '/');

		// Process code with global regex to handle multiline JSX tags
		// Match opening tags: <TagName (followed by space, /, or >)
		const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)([\s\/>])/g;

		let modifiedCode = code;
		let match;
		const replacements = [];

		// Find all tag matches with their positions
		while ((match = tagRegex.exec(code)) !== null) {
			const tagName = match[1];
			const trailing = match[2];
			const matchStart = match.index;
			const matchEnd = matchStart + match[0].length;

			// Skip if already has data-roopik-source
			const surroundingCode = code.substring(matchStart, Math.min(matchEnd + 100, code.length));
			if (surroundingCode.includes('data-roopik-source')) {
				continue;
			}

			// Calculate line and column number
			const beforeMatch = code.substring(0, matchStart);
			const lineNumber = beforeMatch.split('\n').length;
			const lastNewline = beforeMatch.lastIndexOf('\n');
			const columnNumber = matchStart - lastNewline - 1;

			// Create replacement
			const sourceAttr = ` data-roopik-source="${relPath}:${lineNumber}:${columnNumber}"`;
			const replacement = `<${tagName}${sourceAttr}${trailing}`;

			replacements.push({
				start: matchStart,
				end: matchEnd,
				original: match[0],
				replacement: replacement
			});
		}

		// Apply replacements in reverse order to maintain positions
		for (let i = replacements.length - 1; i >= 0; i--) {
			const r = replacements[i];
			modifiedCode = modifiedCode.substring(0, r.start) + r.replacement + modifiedCode.substring(r.end);
		}

		if (verboseLogging) {
			console.log('[Roopik React Plugin] Using regex fallback for:', filename);
		}

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
