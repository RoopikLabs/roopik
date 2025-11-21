/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * React Source Mapping Plugin
 * Adds data-roopik-source attributes to React JSX elements using Babel AST transformation
 */

const path = require('path');

// Configuration: Parent Context Metadata
const MAX_PARENT_DEPTH = 3; // Maximum number of parent JSX elements to track
const ENABLE_PARENT_METADATA = true; // Toggle to enable/disable parent metadata collection

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
						// Inline Babel plugin for adding data-roopik-source and data-roopik-parent
						function roopikBabelPlugin({ types: t }) {
							/**
							 * Get parent context metadata for an element
							 * Format: "ComponentName|tag>parent>grandparent"
							 * @param {Object} path - Babel AST path
							 * @param {number} maxDepth - Maximum depth to traverse
							 * @returns {string} Parent metadata string
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
								// ALWAYS include all parents in chain, but only COUNT meaningful ones toward depth limit
								const parentTags = [];
								let parentPath = path.parentPath;
								let meaningfulDepth = 0; // Only count non-generic wrappers

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

										// ALWAYS add to chain (preserve complete structure)
										parentTags.push(tagName);

										// Check if this is a meaningful parent (not a generic wrapper)
										const isGenericWrapper = (tagName === 'div' || tagName === 'span') &&
											openingElement.attributes.length === 0;

										// Only increment depth counter for meaningful parents
										if (!isGenericWrapper) {
											meaningfulDepth++;
										}
									}
									parentPath = parentPath.parentPath;
								}

								// Reverse chain to read root → child (more natural)
								// and append the clicked element at the end (doesn't count toward depth limit)
								parentTags.reverse();
								parentTags.push(currentElementName);

								// Format: "ComponentName|section>div>div>Link" (root → child)
								const tagChain = parentTags.length > 0 ? parentTags.join('>') : currentElementName;
								return `${parentComponent}|${tagChain}`;
							}

							return {
								visitor: {
									JSXElement(path, state) {
										// Visit complete JSX element (opening + children + closing)
										const { node } = path;
										const elementLoc = node.loc; // Full element span
										if (!elementLoc) return;

										const openingElement = node.openingElement;
										if (!openingElement) return;

										// Extract current element's tag name (for component name)
										const name = openingElement.name;
										let currentElementName;
										if (t.isJSXIdentifier(name)) {
											currentElementName = name.name;
										} else if (t.isJSXMemberExpression(name)) {
											// Handle: <Foo.Bar>
											currentElementName = `${name.object.name}.${name.property.name}`;
										} else {
											currentElementName = 'Unknown';
										}

										const filename = state.filename || id;
										const relPath = filename.replace(/\\/g, '/');

										// Use FULL ELEMENT location (from opening < to closing >)
										// This captures the entire element including children and closing tag
										const sourceValue = `${relPath}:${elementLoc.start.line}:${elementLoc.start.column}:${elementLoc.end.line}:${elementLoc.end.column}`;

										// Create JSXAttribute node for source location
										const sourceAttr = t.jsxAttribute(
											t.jsxIdentifier('data-roopik-source'),
											t.stringLiteral(sourceValue)
										);

										// Add source attribute (only if not already present)
										const hasRoopikAttr = openingElement.attributes.some(
											attr => t.isJSXAttribute(attr) && attr.name.name === 'data-roopik-source'
										);

										if (!hasRoopikAttr) {
											openingElement.attributes.push(sourceAttr);
										}

										// Store actual component name (from source, not DOM)
										const componentNameAttr = t.jsxAttribute(
											t.jsxIdentifier('data-roopik-component'),
											t.stringLiteral(currentElementName)
										);

										const hasComponentAttr = openingElement.attributes.some(
											attr => t.isJSXAttribute(attr) && attr.name.name === 'data-roopik-component'
										);

										if (!hasComponentAttr) {
											openingElement.attributes.push(componentNameAttr);
										}

										// Add parent context metadata if enabled
										if (ENABLE_PARENT_METADATA) {
											const parentValue = getParentMetadata(path, currentElementName);

											// Create JSXAttribute for parent metadata
											const parentAttr = t.jsxAttribute(
												t.jsxIdentifier('data-roopik-parent'),
												t.stringLiteral(parentValue)
											);

											// Add attribute (only if not already present)
											const hasParentAttr = openingElement.attributes.some(
												attr => t.isJSXAttribute(attr) && attr.name.name === 'data-roopik-parent'
											);

											if (!hasParentAttr) {
												openingElement.attributes.push(parentAttr);
											}
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
 * Check if a position in code is inside a string literal or template literal
 * This prevents modifying HTML code that's displayed as text content
 * @param {string} code - The full source code
 * @param {number} position - Character position to check
 * @returns {boolean} - True if inside a string/template literal
 */
function isInsideString(code, position) {
	// Track string context by scanning character by character
	let inSingleQuote = false;
	let inDoubleQuote = false;
	let inTemplateString = false;
	let prevChar = '';

	for (let i = 0; i < position; i++) {
		const char = code[i];

		// Skip escaped characters
		if (prevChar === '\\') {
			prevChar = char;
			continue;
		}

		// Toggle string states
		if (char === "'" && !inDoubleQuote && !inTemplateString) {
			inSingleQuote = !inSingleQuote;
		} else if (char === '"' && !inSingleQuote && !inTemplateString) {
			inDoubleQuote = !inDoubleQuote;
		} else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
			inTemplateString = !inTemplateString;
		}

		prevChar = char;
	}

	return inSingleQuote || inDoubleQuote || inTemplateString;
}

/**
 * Fallback: Regex-based source attribute injection
 * Less reliable than AST, but works when Babel fails
 *
 * Features (matching AST mode):
 * - Multi-line element detection (start + end positions)
 * - Parent context metadata (component name + tag chain)
 * - Component name from source
 * - Reversed chain order (root → child)
 */
function tryRegexFallback(code, filename, verboseLogging) {
	try {
		const relPath = filename.replace(/\\/g, '/');

		// Extract component name from filename (e.g., "Home.jsx" → "Home")
		const componentName = path.basename(filename, path.extname(filename));

		// Parse JSX to build element tree with positions
		const elements = parseJsxElements(code, relPath, componentName);

		// Apply replacements in reverse order to maintain positions
		let modifiedCode = code;
		for (let i = elements.length - 1; i >= 0; i--) {
			const elem = elements[i];
			modifiedCode = modifiedCode.substring(0, elem.start) + elem.replacement + modifiedCode.substring(elem.end);
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

/**
 * Parse JSX to find all elements with their positions and parent chains
 * Returns array of replacement operations
 */
function parseJsxElements(code, relPath, componentName) {
	const replacements = [];
	const elementStack = []; // Stack to track parent elements

	// Match opening tags: <TagName (followed by space, /, or >)
	const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)([\s\/>])/g;
	const closingTagRegex = /<\/([a-zA-Z][a-zA-Z0-9-]*)>/g;

	let match;
	const allMatches = [];

	// Collect all opening and closing tags with positions
	while ((match = tagRegex.exec(code)) !== null) {
		allMatches.push({
			type: 'opening',
			tagName: match[1],
			trailing: match[2],
			start: match.index,
			end: match.index + match[0].length,
			fullMatch: match[0]
		});
	}

	// Reset regex
	closingTagRegex.lastIndex = 0;

	while ((match = closingTagRegex.exec(code)) !== null) {
		allMatches.push({
			type: 'closing',
			tagName: match[1],
			start: match.index,
			end: match.index + match[0].length
		});
	}

	// Sort by position
	allMatches.sort((a, b) => a.start - b.start);

	// Process matches to build element tree
	for (const item of allMatches) {
		if (item.type === 'opening') {
			const matchStart = item.start;
			const matchEnd = item.end;
			const tagName = item.tagName;
			const trailing = item.trailing;

			// Skip if already has data-roopik-source
			const surroundingCode = code.substring(matchStart, Math.min(matchEnd + 100, code.length));
			if (surroundingCode.includes('data-roopik-source')) {
				continue;
			}

			// SECURITY: Skip if inside string literal or template literal
			if (isInsideString(code, matchStart)) {
				continue;
			}

			// Calculate start position
			const beforeMatch = code.substring(0, matchStart);
			const startLine = beforeMatch.split('\n').length;
			const lastNewline = beforeMatch.lastIndexOf('\n');
			const startColumn = matchStart - lastNewline - 1;

			// Check if this is a self-closing tag (ends with />)
			const isSelfClosing = trailing === '/';

			// Find matching closing tag to get end position
			let endLine = startLine;
			let endColumn = startColumn;

			if (!isSelfClosing) {
				// Find the matching closing tag
				const closingTag = findMatchingClosingTag(code, matchStart, tagName, allMatches);
				if (closingTag) {
					const beforeClosing = code.substring(0, closingTag.end);
					endLine = beforeClosing.split('\n').length;
					const closingLastNewline = beforeClosing.lastIndexOf('\n');
					endColumn = closingTag.end - closingLastNewline - 1;
				}
			} else {
				// Self-closing: end is same as opening tag end
				const beforeEnd = code.substring(0, matchEnd);
				endLine = beforeEnd.split('\n').length;
				const endLastNewline = beforeEnd.lastIndexOf('\n');
				endColumn = matchEnd - endLastNewline - 1;
			}

			// Build parent chain (root → child order, reversed)
			let parentChain = '';
			if (ENABLE_PARENT_METADATA) {
				const parents = elementStack.slice(-MAX_PARENT_DEPTH).map(p => p.tagName);
				parents.push(tagName); // Append clicked element
				parentChain = parents.join('>');
			}

			// Create attributes
			const sourceAttr = ` data-roopik-source="${relPath}:${startLine}:${startColumn}:${endLine}:${endColumn}"`;
			const componentAttr = ` data-roopik-component="${tagName}"`;
			const parentAttr = ENABLE_PARENT_METADATA ? ` data-roopik-parent="${componentName}|${parentChain}"` : '';

			const replacement = `<${tagName}${sourceAttr}${componentAttr}${parentAttr}${trailing}`;

			replacements.push({
				start: matchStart,
				end: matchEnd,
				original: item.fullMatch,
				replacement: replacement
			});

			// Push to stack if not self-closing
			if (!isSelfClosing) {
				elementStack.push({ tagName, startPos: matchStart });
			}
		} else if (item.type === 'closing') {
			// Pop from stack when closing tag found
			if (elementStack.length > 0 && elementStack[elementStack.length - 1].tagName === item.tagName) {
				elementStack.pop();
			}
		}
	}

	return replacements;
}

/**
 * Find matching closing tag for an opening tag
 */
function findMatchingClosingTag(code, openingPos, tagName, allMatches) {
	let depth = 1;
	let foundOpening = false;

	for (const match of allMatches) {
		if (match.start < openingPos) continue;
		if (match.start === openingPos && match.type === 'opening') {
			foundOpening = true;
			continue;
		}
		if (!foundOpening) continue;

		if (match.tagName === tagName) {
			if (match.type === 'opening') {
				depth++;
			} else if (match.type === 'closing') {
				depth--;
				if (depth === 0) {
					return match;
				}
			}
		}
	}

	return null;
}

module.exports = { createReactSourcePlugin };
