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
 * Add source attributes to template using global regex
 * Handles multiline Vue component tags (e.g., <component v-if="..." class="...">)
 */
function addSourceAttributesToTemplateAST(template, filename, templateStartLine) {
	try {
		const relPath = filename.replace(/\\/g, '/');

		// Process template with global regex to handle multiline tags
		const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)([\s\/>])/g;

		let modifiedTemplate = template;
		let match;
		const replacements = [];

		// Find all tag matches with their positions
		while ((match = tagRegex.exec(template)) !== null) {
			const tagName = match[1];
			const trailing = match[2];
			const matchStart = match.index;
			const matchEnd = matchStart + match[0].length;

			// Skip if already has data-roopik-source
			const surroundingCode = template.substring(matchStart, Math.min(matchEnd + 100, template.length));
			if (surroundingCode.includes('data-roopik-source')) {
				continue;
			}

			// SECURITY: Skip if inside string literal
			// This prevents injecting attributes into code preview/documentation strings
			if (isInsideString(template, matchStart)) {
				continue;
			}

			// Calculate line and column number (relative to template start)
			const beforeMatch = template.substring(0, matchStart);
			const lineOffset = beforeMatch.split('\n').length - 1; // 0-based offset
			const lastNewline = beforeMatch.lastIndexOf('\n');
			const columnNumber = matchStart - lastNewline - 1;

			// Calculate actual line number in .vue file
			const actualLineNumber = templateStartLine + lineOffset;

			// Create replacement
			const sourceAttr = ` data-roopik-source="${relPath}:${actualLineNumber}:${columnNumber}"`;
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
			modifiedTemplate = modifiedTemplate.substring(0, r.start) + r.replacement + modifiedTemplate.substring(r.end);
		}

		return modifiedTemplate;
	} catch (error) {
		console.error('[Roopik Vue Plugin] AST attribute injection error:', error);
		return template;
	}
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
 * Handles multiline Vue component tags
 */
function addSourceAttributesToTemplateRegex(template, filename, templateStartLine) {
	try {
		const relPath = filename.replace(/\\/g, '/');

		// Process template with global regex to handle multiline tags
		const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)([\s\/>])/g;

		let modifiedTemplate = template;
		let match;
		const replacements = [];

		// Find all tag matches with their positions
		while ((match = tagRegex.exec(template)) !== null) {
			const tagName = match[1];
			const trailing = match[2];
			const matchStart = match.index;
			const matchEnd = matchStart + match[0].length;

			// Skip if already has data-roopik-source
			const surroundingCode = template.substring(matchStart, Math.min(matchEnd + 100, template.length));
			if (surroundingCode.includes('data-roopik-source')) {
				continue;
			}

			// SECURITY: Skip if inside string literal
			// This prevents injecting attributes into code preview/documentation strings
			if (isInsideString(template, matchStart)) {
				continue;
			}

			// Calculate line and column number (relative to template start)
			const beforeMatch = template.substring(0, matchStart);
			const lineOffset = beforeMatch.split('\n').length - 1; // 0-based offset
			const lastNewline = beforeMatch.lastIndexOf('\n');
			const columnNumber = matchStart - lastNewline - 1;

			// Calculate actual line number in .vue file
			// templateStartLine includes lines before <template>, +1 for <template> tag itself
			const actualLineNumber = templateStartLine + lineOffset;

			// Create replacement
			const sourceAttr = ` data-roopik-source="${relPath}:${actualLineNumber}:${columnNumber}"`;
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
			modifiedTemplate = modifiedTemplate.substring(0, r.start) + r.replacement + modifiedTemplate.substring(r.end);
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
