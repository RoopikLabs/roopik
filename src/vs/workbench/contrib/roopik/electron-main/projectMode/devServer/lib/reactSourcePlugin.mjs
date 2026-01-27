/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * React Source Tracking Plugin
 *
 * Adds data-roopik-source attributes to React JSX elements.
 *
 * Strategy:
 * 1. PRIMARY: Babel AST transformation (accurate, handles complex JSX)
 * 2. FALLBACK: Regex-based transformation (when Babel fails)
 *
 * Features:
 * - Multi-line element detection (startLine:startCol:endLine:endCol)
 * - Parent context metadata (ComponentName|tag>parent>grandparent)
 * - Component name from JSX source (not DOM tagName)
 * - Parent component function name detection
 * - Handles JSX member expressions (Foo.Bar)
 */

import { join } from 'path';
import { transformCode, MAX_PARENT_DEPTH, ENABLE_PARENT_METADATA, isR3FElement } from './sourceTrackingCore.mjs';

// Note: isR3FElement is imported from sourceTrackingCore.mjs
// It detects React Three Fiber / Three.js elements that should NOT receive data-roopik-* attributes
// (they're not DOM elements, they're Three.js objects)

/**
 * Create React source plugin for Vite
 *
 * @param {Object} options - Plugin options
 * @param {string} [options.babelPath] - Path to @babel/core (optional, for AST mode)
 * @param {boolean} [options.forceRegexMode=false] - Force regex mode (skip Babel)
 * @param {boolean} [options.verboseLogging=false] - Enable verbose logging
 * @returns {Object} Vite plugin
 */
export function createReactSourcePlugin(options = {}) {
	const {
		babelPath,
		forceRegexMode = false,
		verboseLogging = false
	} = options;

	return {
		name: 'roopik:react-source',
		enforce: 'pre', // Run BEFORE @vitejs/plugin-react

		transform(code, id) {
			// Only process JSX/TSX files
			if (!/\.[jt]sx$/.test(id)) {
				return null;
			}

			// Skip node_modules
			if (id.includes('node_modules')) {
				return null;
			}

			try {
				if (verboseLogging) {
					console.log('[Roopik React Plugin] Processing:', id);
				}

				// Check if regex mode is forced
				if (forceRegexMode) {
					if (verboseLogging) {
						console.log('[Roopik React Plugin] Using forced regex mode');
					}
					return transformWithRegex(code, id, verboseLogging);
				}

				// Try Babel AST first (if babelPath provided)
				if (babelPath) {
					try {
						const result = transformWithBabel(code, id, babelPath, verboseLogging);
						if (result) {
							if (verboseLogging) {
								console.log('[Roopik React Plugin] ✓ Babel transformation successful:', id);
							}
							return result;
						}
					} catch (babelError) {
						if (verboseLogging) {
							console.warn('[Roopik React Plugin] Babel failed, falling back to regex:', babelError.message);
						}
					}
				}

				// Fallback to regex
				return transformWithRegex(code, id, verboseLogging);

			} catch (error) {
				console.error('[Roopik React Plugin] Error processing:', id, error);
				return null;
			}
		}
	};
}

/**
 * Transform JSX using Babel AST (PRIMARY METHOD)
 *
 * @param {string} code - Source code
 * @param {string} id - File path
 * @param {string} babelPath - Path to @babel/core
 * @param {boolean} verboseLogging - Enable verbose logging
 * @returns {{ code: string, map: any } | null}
 */
function transformWithBabel(code, id, babelPath, verboseLogging) {
	// Dynamic import of Babel from specified path
	const babel = require(babelPath);

	const result = babel.transformSync(code, {
		filename: id,
		plugins: [
			createRoopikBabelPlugin(id)
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
}

/**
 * Create the Roopik Babel plugin for JSX transformation.
 *
 * @param {string} filename - Source file path
 * @returns {Function} Babel plugin
 */
function createRoopikBabelPlugin(filename) {
	return function roopikBabelPlugin({ types: t }) {
		/**
		 * Get parent context metadata for an element
		 * Format: "ComponentName|tag>parent>grandparent"
		 */
		function getParentMetadata(path, currentElementName, maxDepth = MAX_PARENT_DEPTH) {
			// Find parent component name (function/arrow function)
			let parentComponent = 'Unknown';
			let currentPath = path.parentPath;

			while (currentPath) {
				if (currentPath.isFunctionDeclaration() && currentPath.node.id) {
					parentComponent = currentPath.node.id.name;
					break;
				} else if (currentPath.isVariableDeclarator() && currentPath.node.id) {
					// Handle: const Component = () => { ... }
					const declarator = currentPath.node;
					if (declarator.init &&
						(t.isArrowFunctionExpression(declarator.init) ||
							t.isFunctionExpression(declarator.init))) {
						parentComponent = declarator.id.name;
						break;
					}
				}
				currentPath = currentPath.parentPath;
			}

			// Collect parent JSX tag chain
			const parentTags = [];
			let parentPath = path.parentPath;
			let meaningfulDepth = 0;

			while (parentPath && meaningfulDepth < maxDepth) {
				if (parentPath.isJSXElement()) {
					const openingElement = parentPath.node.openingElement;
					const name = openingElement.name;

					// Extract tag name (handle namespaced components)
					let tagName;
					if (t.isJSXIdentifier(name)) {
						tagName = name.name;
					} else if (t.isJSXMemberExpression(name)) {
						// Handle: <Foo.Bar>
						tagName = `${name.object.name}.${name.property.name}`;
					} else {
						tagName = 'Unknown';
					}

					// Always add to chain
					parentTags.push(tagName);

					// Check if this is a meaningful parent (not a generic wrapper)
					const isGenericWrapper = (tagName === 'div' || tagName === 'span') &&
						openingElement.attributes.length === 0;

					if (!isGenericWrapper) {
						meaningfulDepth++;
					}
				}
				parentPath = parentPath.parentPath;
			}

			// Reverse to read root → child, append current element
			parentTags.reverse();
			parentTags.push(currentElementName);

			const tagChain = parentTags.length > 0 ? parentTags.join('>') : currentElementName;
			return `${parentComponent}|${tagChain}`;
		}

		return {
			visitor: {
				JSXElement(path, state) {
					const { node } = path;
					const elementLoc = node.loc;
					if (!elementLoc) {
						return;
					}

					const openingElement = node.openingElement;
					if (!openingElement) {
						return;
					}

					// Extract current element's tag name
					const name = openingElement.name;
					let currentElementName;
					if (t.isJSXIdentifier(name)) {
						currentElementName = name.name;
					} else if (t.isJSXMemberExpression(name)) {
						currentElementName = `${name.object.name}.${name.property.name}`;
					} else {
						currentElementName = 'Unknown';
					}

					// SKIP React Three Fiber / Three.js elements
					// These are not DOM elements and don't support data-* attributes
					if (isR3FElement(currentElementName)) {
						return;
					}

					const relPath = (state.filename || filename).replace(/\\/g, '/');

					// Full element location (from opening < to closing >)
					const sourceValue = `${relPath}:${elementLoc.start.line}:${elementLoc.start.column}:${elementLoc.end.line}:${elementLoc.end.column}`;

					// Check if already has our attributes
					const hasRoopikAttr = openingElement.attributes.some(
						attr => t.isJSXAttribute(attr) && attr.name.name === 'data-roopik-source'
					);

					if (!hasRoopikAttr) {
						// Add source attribute
						openingElement.attributes.push(
							t.jsxAttribute(
								t.jsxIdentifier('data-roopik-source'),
								t.stringLiteral(sourceValue)
							)
						);

						// Add component name attribute
						openingElement.attributes.push(
							t.jsxAttribute(
								t.jsxIdentifier('data-roopik-component'),
								t.stringLiteral(currentElementName)
							)
						);

						// Add parent context metadata
						if (ENABLE_PARENT_METADATA) {
							const parentValue = getParentMetadata(path, currentElementName);
							openingElement.attributes.push(
								t.jsxAttribute(
									t.jsxIdentifier('data-roopik-parent'),
									t.stringLiteral(parentValue)
								)
							);
						}
					}
				}
			}
		};
	};
}

/**
 * Transform JSX using regex (FALLBACK METHOD)
 *
 * @param {string} code - Source code
 * @param {string} id - File path
 * @param {boolean} verboseLogging - Enable verbose logging
 * @returns {{ code: string, map: null } | null}
 */
function transformWithRegex(code, id, verboseLogging) {
	const result = transformCode(code, {
		filePath: id,
		baseLineOffset: 0,
		skipTags: [], // JSX doesn't need skip tags
		checkScriptStyle: false
	});

	if (result.count > 0) {
		if (verboseLogging) {
			console.log(`[Roopik React Plugin] ✓ Regex: Added source tracking to ${result.count} elements in:`, id);
		}
		return {
			code: result.code,
			map: null
		};
	}

	return null;
}
