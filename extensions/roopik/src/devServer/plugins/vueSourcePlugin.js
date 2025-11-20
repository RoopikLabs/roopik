/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Vue Source Mapping Plugin
 * Adds source tracking to Vue Single File Components (SFC)
 *
 * Strategy (like React plugin):
 * 1. Primary: AST-based transformation using @vue/compiler-sfc
 * 2. Fallback: Regex-based transformation (when AST fails)
 */

const path = require('path');

// Configuration: Parent Context Metadata
const MAX_PARENT_DEPTH = 3; // Maximum number of parent elements to track
const ENABLE_PARENT_METADATA = true; // Toggle to enable/disable parent metadata collection

/**
 * Create Vue source plugin for Vite
 * @param {string} extensionNodeModules - Path to extension's node_modules
 * @param {Object} pluginConfig - Plugin configuration {forceRegexMode, verboseLogging}
 * @returns {Object} Vite plugin
 */
function createVueSourcePlugin(extensionNodeModules, pluginConfig = {}) {
	const { forceRegexMode = false, verboseLogging = true } = pluginConfig;

	return {
		name: 'roopik-vue-source',
		enforce: 'pre', // Run before @vitejs/plugin-vue

		transform(code, id) {
			// Only process .vue files
			if (!id.endsWith('.vue')) {
				return null;
			}

			try {
				if (verboseLogging) {
					console.log('[Roopik Vue Plugin] Processing Vue SFC:', id);
				}

				// Check if regex mode is forced
				const forceRegex = forceRegexMode;

				if (forceRegex) {
					console.log('[Roopik Vue Plugin] ⚠️ FORCE REGEX MODE ENABLED');
					const regexResult = tryRegexTransformation(code, id, verboseLogging);
					if (regexResult) {
						if (verboseLogging) {
							console.log('[Roopik Vue Plugin] ✓ Regex transformation successful (forced):', id);
						}
						return regexResult;
					}
					return null;
				}

				// Try AST-based transformation first (more accurate)
				const astResult = tryASTTransformation(code, id, extensionNodeModules, verboseLogging);
				if (astResult) {
					if (verboseLogging) {
						console.log('[Roopik Vue Plugin] ✓ AST transformation successful:', id);
					}
					return astResult;
				}

				// Fallback to regex-based transformation
				console.warn('[Roopik Vue Plugin] AST failed, using regex fallback:', id);
				const regexResult = tryRegexTransformation(code, id, verboseLogging);
				if (regexResult) {
					if (verboseLogging) {
						console.log('[Roopik Vue Plugin] ✓ Regex transformation successful:', id);
					}
					return regexResult;
				}

				return null;
			} catch (error) {
				console.error('[Roopik Vue Plugin] Error processing:', id, error);
				return null;
			}
		}
	};
}

/**
 * AST-based transformation using @vue/compiler-sfc (PRIMARY METHOD)
 * This is the most accurate approach - parses Vue SFC into AST and modifies it
 */
function tryASTTransformation(code, filename, extensionNodeModules, verboseLogging) {
	try {
		// Load @vue/compiler-sfc from EXTENSION's node_modules (not user's!)
		// This ensures we have the correct version regardless of user's project
		const compilerPath = path.join(extensionNodeModules, '@vue', 'compiler-sfc');
		const { parse } = require(compilerPath);

		// Parse .vue file into SFC descriptor
		const { descriptor, errors } = parse(code, { filename });

		if (errors && errors.length > 0) {
			if (verboseLogging) {
				console.warn('[Roopik Vue Plugin] Parse errors:', errors);
			}
			return null;
		}

		if (!descriptor.template || !descriptor.template.content) {
			if (verboseLogging) {
				console.log('[Roopik Vue Plugin] No template section found');
			}
			return null;
		}

		// Get template content and its offset in the original file
		const templateContent = descriptor.template.content;
		const templateLoc = descriptor.template.loc;
		const templateStartLine = templateLoc.start.line; // 1-based line number

		// Transform template by adding data-roopik-source attributes
		const transformedTemplate = addSourceAttributesToTemplateAST(
			templateContent,
			filename,
			templateStartLine
		);

		// Replace template in original code
		const transformedCode = code.replace(
			descriptor.template.content,
			transformedTemplate
		);

		if (transformedCode !== code) {
			return {
				code: transformedCode,
				map: null
			};
		}

		return null;
	} catch (error) {
		// @vue/compiler-sfc not available or other error
		if (verboseLogging) {
			console.warn('[Roopik Vue Plugin] AST transformation failed:', error.message);
		}
		return null;
	}
}

/**
 * Check if a position in template is inside a string literal
 * This prevents modifying HTML code that's displayed as text content
 * @param {string} template - The template code
 * @param {number} position - Character position to check
 * @returns {boolean} - True if inside a string literal
 */
function isInsideString(template, position) {
	// Track string context by scanning character by character
	let inSingleQuote = false;
	let inDoubleQuote = false;
	let prevChar = '';

	for (let i = 0; i < position; i++) {
		const char = template[i];

		// Skip escaped characters
		if (prevChar === '\\') {
			prevChar = char;
			continue;
		}

		// Toggle string states
		if (char === "'" && !inDoubleQuote) {
			inSingleQuote = !inSingleQuote;
		} else if (char === '"' && !inSingleQuote) {
			inDoubleQuote = !inDoubleQuote;
		}

		prevChar = char;
	}

	return inSingleQuote || inDoubleQuote;
}

/**
 * Add source attributes to template using regex
 * Handles multiline Vue component tags with full element span tracking
 *
 * Features (matching React plugin):
 * - Multi-line element detection (start + end positions)
 * - Parent context metadata (component name + tag chain)
 * - Component name from source
 * - Reversed chain order (root → child)
 */
function addSourceAttributesToTemplateAST(template, filename, templateStartLine) {
	try {
		const relPath = filename.replace(/\\/g, '/');

		// Extract component name from .vue filename (e.g., "Home.vue" → "Home")
		const componentName = path.basename(filename, '.vue');

		// Parse template to build element tree with positions
		const elements = parseTemplateElements(template, templateStartLine, relPath, componentName);

		// Apply replacements in reverse order to maintain positions
		let modifiedTemplate = template;
		for (let i = elements.length - 1; i >= 0; i--) {
			const elem = elements[i];
			modifiedTemplate = modifiedTemplate.substring(0, elem.start) + elem.replacement + modifiedTemplate.substring(elem.end);
		}

		return modifiedTemplate;
	} catch (error) {
		console.error('[Roopik Vue Plugin] AST attribute injection error:', error);
		return template;
	}
}

/**
 * Parse template to find all elements with their positions and parent chains
 * Returns array of replacement operations
 */
function parseTemplateElements(template, templateStartLine, relPath, componentName) {
	const replacements = [];
	const elementStack = []; // Stack to track parent elements

	// Match opening tags: <TagName (followed by space, /, or >)
	const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)([\s\/>])/g;
	const closingTagRegex = /<\/([a-zA-Z][a-zA-Z0-9-]*)>/g;

	let match;
	const allMatches = [];

	// Collect all opening and closing tags with positions
	while ((match = tagRegex.exec(template)) !== null) {
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

	while ((match = closingTagRegex.exec(template)) !== null) {
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
			const surroundingCode = template.substring(matchStart, Math.min(matchEnd + 100, template.length));
			if (surroundingCode.includes('data-roopik-source')) {
				continue;
			}

			// SECURITY: Skip if inside string literal
			if (isInsideString(template, matchStart)) {
				continue;
			}

			// Calculate start position
			const beforeMatch = template.substring(0, matchStart);
			const lineOffset = beforeMatch.split('\n').length - 1;
			const lastNewline = beforeMatch.lastIndexOf('\n');
			const startColumn = matchStart - lastNewline - 1;
			const startLine = templateStartLine + lineOffset;

			// Check if this is a self-closing tag (ends with />)
			const isSelfClosing = trailing === '/';

			// Find matching closing tag to get end position
			let endLine = startLine;
			let endColumn = startColumn;

			if (!isSelfClosing) {
				// Find the matching closing tag
				const closingTag = findMatchingClosingTag(template, matchStart, tagName, allMatches);
				if (closingTag) {
					const beforeClosing = template.substring(0, closingTag.end);
					const closingLineOffset = beforeClosing.split('\n').length - 1;
					const closingLastNewline = beforeClosing.lastIndexOf('\n');
					endLine = templateStartLine + closingLineOffset;
					endColumn = closingTag.end - closingLastNewline - 1;
				}
			} else {
				// Self-closing: end is same as opening tag end
				const beforeEnd = template.substring(0, matchEnd);
				const endLineOffset = beforeEnd.split('\n').length - 1;
				const endLastNewline = beforeEnd.lastIndexOf('\n');
				endLine = templateStartLine + endLineOffset;
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
function findMatchingClosingTag(template, openingPos, tagName, allMatches) {
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

/**
 * Regex-based transformation (FALLBACK METHOD)
 * Used when @vue/compiler-sfc is not available
 */
function tryRegexTransformation(code, filename, verboseLogging) {
	try {
		const transformedCode = transformVueTemplateRegex(code, filename, verboseLogging);

		if (transformedCode !== code) {
			return {
				code: transformedCode,
				map: null
			};
		}

		return null;
	} catch (error) {
		console.error('[Roopik Vue Plugin] Regex transformation failed:', error);
		return null;
	}
}

/**
 * Transform Vue template to add data-roopik-source attributes (REGEX FALLBACK)
 * Uses regex-based approach when AST is not available
 */
function transformVueTemplateRegex(code, filename, verboseLogging) {
	// Extract <template> section
	const templateMatch = code.match(/<template>([\s\S]*?)<\/template>/);

	if (!templateMatch) {
		if (verboseLogging) {
			console.log('[Roopik Vue Plugin] No <template> section found in:', filename);
		}
		return code;
	}

	const templateContent = templateMatch[1];

	// Count lines before template to get correct line numbers
	const beforeTemplate = code.substring(0, templateMatch.index);
	const linesBeforeTemplate = beforeTemplate.split('\n').length;

	// Transform template by adding data-roopik-source to HTML elements
	const transformedTemplate = addSourceAttributesToTemplateRegex(
		templateContent,
		filename,
		linesBeforeTemplate
	);

	// Replace original template with transformed one
	const transformedCode = code.replace(
		/<template>([\s\S]*?)<\/template>/,
		`<template>${transformedTemplate}</template>`
	);

	return transformedCode;
}

/**
 * Add data-roopik-source attributes to HTML elements in template (REGEX VERSION)
 * Handles multiline Vue component tags with full element span tracking
 *
 * Features (matching React plugin):
 * - Multi-line element detection (start + end positions)
 * - Parent context metadata (component name + tag chain)
 * - Component name from source
 * - Reversed chain order (root → child)
 */
function addSourceAttributesToTemplateRegex(template, filename, templateStartLine) {
	try {
		const relPath = filename.replace(/\\/g, '/');

		// Extract component name from .vue filename (e.g., "Home.vue" → "Home")
		const componentName = path.basename(filename, '.vue');

		// Parse template to build element tree with positions
		const elements = parseTemplateElements(template, templateStartLine, relPath, componentName);

		// Apply replacements in reverse order to maintain positions
		let modifiedTemplate = template;
		for (let i = elements.length - 1; i >= 0; i--) {
			const elem = elements[i];
			modifiedTemplate = modifiedTemplate.substring(0, elem.start) + elem.replacement + modifiedTemplate.substring(elem.end);
		}

		return modifiedTemplate;
	} catch (error) {
		console.error('[Roopik Vue Plugin] Regex attribute injection error:', error);
		return template;
	}
}

/**
 * Alternative: AST-based transformation (future enhancement)
 *
 * If we need more precision, we can use @vue/compiler-sfc:
 *
 * const { parse, compileTemplate } = require('@vue/compiler-sfc');
 *
 * function transformVueTemplateAST(code, filename) {
 *   const { descriptor } = parse(code, { filename });
 *
 *   if (descriptor.template) {
 *     // Get template AST
 *     const templateAST = descriptor.template.ast;
 *
 *     // Walk AST and add attributes
 *     walkAST(templateAST, (node) => {
 *       if (node.type === 1) { // Element node
 *         node.props.push({
 *           type: 6, // Attribute
 *           name: 'data-roopik-source',
 *           value: {
 *             type: 2, // Text
 *             content: `${filename}:${node.loc.start.line}:${node.loc.start.column}`
 *           }
 *         });
 *       }
 *     });
 *
 *     // Recompile template
 *     const compiled = compileTemplate({
 *       source: descriptor.template.content,
 *       filename: filename,
 *       id: descriptor.id
 *     });
 *   }
 * }
 *
 * This would be more accurate but requires @vue/compiler-sfc in our dependencies.
 */

module.exports = { createVueSourcePlugin };
