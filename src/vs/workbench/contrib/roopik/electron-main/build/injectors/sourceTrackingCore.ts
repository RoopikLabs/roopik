/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Source Tracking Core Module
 *
 * Shared regex-based source tracking logic used by all framework plugins.
 * This module provides the common functionality for:
 * - Parsing HTML/JSX/Vue templates to find elements
 * - Calculating line/column positions (including multi-line spans)
 * - Building parent context chains
 * - String literal safety checks
 *
 * Features:
 * - Multi-line element detection (startLine:startCol:endLine:endCol)
 * - Parent context metadata (DISABLED - using CSS selectors instead)
 * - Component name tracking (data-roopik-component)
 * - String literal safety (skip tags inside strings/template literals)
 * - Configurable skip tags for HTML
 *
 * Supports: React, Vue, Svelte, HTML (all frameworks)
 */

import { basename, extname } from 'path';

// ============================================
// Configuration
// ============================================

/** Maximum number of parent elements to track in hierarchy */
export const MAX_PARENT_DEPTH = 3;

/** Enable/disable parent metadata collection (DISABLED - using CSS selectors instead) */
export const ENABLE_PARENT_METADATA = false;

// ============================================
// Types
// ============================================

export interface Position {
	line: number;
	column: number;
}

export interface TagMatch {
	type: 'opening' | 'closing';
	tagName: string;
	trailing?: string;
	start: number;
	end: number;
	fullMatch?: string;
}

export interface ParseOptions {
	/** Path to the source file */
	filePath: string;
	/** Line offset for templates (Vue) */
	baseLineOffset?: number;
	/** Tags to skip (HTML: script, style, etc.) */
	skipTags?: string[];
	/** Check for script/style context (HTML) */
	checkScriptStyle?: boolean;
	/** Override component name extraction */
	componentName?: string;
}

export interface ElementReplacement {
	/** Start position in code */
	start: number;
	/** End position in code */
	end: number;
	/** Original matched string */
	original: string | undefined;
	/** Replacement string with attributes */
	replacement: string;
}

export interface TransformResult {
	/** Modified code with source tracking attributes */
	code: string;
	/** Number of elements transformed */
	count: number;
}

// ============================================
// Regex Patterns (Shared by all frameworks)
// ============================================

/**
 * Match opening tags: <TagName (followed by space, /, or >)
 * Captures: [1] = tagName, [2] = trailing character (space, /, or >)
 */
export const OPENING_TAG_REGEX = /<([a-zA-Z][a-zA-Z0-9.-]*)([\s\/>])/g;

/**
 * Match closing tags: </TagName>
 * Captures: [1] = tagName
 */
export const CLOSING_TAG_REGEX = /<\/([a-zA-Z][a-zA-Z0-9.-]*)>/g;

// ============================================
// String Safety Checks
// ============================================

/**
 * Check if a position in code is inside a TypeScript type context.
 * This prevents injecting attributes into TypeScript generics like:
 *   - React.MouseEvent<HTMLDivElement> (type annotation)
 *   - Array<string> (generic parameter)
 *   - T extends HTMLElement (extends clause)
 *   - Promise<Result<T>> (nested generics)
 *
 * @param code - The full source code
 * @param position - Character position to check (position of '<')
 * @returns True if inside a TypeScript type context
 */
export function isInsideTypeScriptTypeContext(code: string, position: number): boolean {
	// Look backwards from position to find context
	const beforeMatch = code.substring(Math.max(0, position - 100), position);

	// CRITICAL Pattern: Generic function/method calls - "useState<", "React.useState<", "useRef<T>"
	// This is the MOST COMMON case that causes bugs!
	// If an identifier immediately precedes '<', it's almost always a TypeScript generic, NOT JSX
	// The ONLY exception is: "return <Component>" (the 'return' keyword)
	// Note: "=> <Component>" doesn't match because '=>' isn't an identifier
	const identifierBeforeAngleBracket = /[A-Za-z_$][A-Za-z0-9_$.]*\s*$/.exec(beforeMatch);
	if (identifierBeforeAngleBracket) {
		const matchedIdentifier = identifierBeforeAngleBracket[0].trim();
		// If the identifier is 'return', it's JSX (e.g., "return <div>")
		// Otherwise, it's a TypeScript generic (e.g., "useState<T>", "Array<string>")
		if (matchedIdentifier !== 'return') {
			return true; // Skip - it's a generic
		}
	}

	// Pattern 1: Type annotation - "event: React.MouseEvent<" or "value: Array<"
	// Look for ": TypeName<" pattern (colon followed by identifier then our position)
	if (/:\s*[A-Za-z_$][A-Za-z0-9_$.<>]*$/.test(beforeMatch)) {
		return true;
	}

	// Pattern 2: Generic parameter - "Promise<Result<" (nested angle brackets)
	// Count unclosed < before this position
	let angleBracketDepth = 0;
	for (let i = 0; i < beforeMatch.length; i++) {
		const char = beforeMatch[i];
		if (char === '<') {
			angleBracketDepth++;
		} else if (char === '>') {
			angleBracketDepth = Math.max(0, angleBracketDepth - 1);
		}
	}
	if (angleBracketDepth > 0) {
		return true;
	}

	// Pattern 3: Extends clause - "T extends HTMLElement" or "interface Foo extends Bar<"
	if (/\bextends\s+[A-Za-z_$][A-Za-z0-9_$.<>]*$/.test(beforeMatch)) {
		return true;
	}

	// Pattern 4: Type parameter declaration - "function foo<T extends "
	if (/[<,]\s*[A-Za-z_$][A-Za-z0-9_$]*\s+extends\s+[A-Za-z_$][A-Za-z0-9_$.<>]*$/.test(beforeMatch)) {
		return true;
	}

	// Pattern 5: Return type annotation - "): Promise<" or "=> Array<"
	if (/[):]\s*[A-Za-z_$][A-Za-z0-9_$.<>]*$/.test(beforeMatch)) {
		// Extra check: make sure it's not JSX return like "return <div>"
		// JSX returns usually have whitespace/newline after return keyword
		if (!/\breturn\s+$/.test(beforeMatch) && !/=>\s*$/.test(beforeMatch.replace(/[A-Za-z_$][A-Za-z0-9_$.<>]*$/, ''))) {
			return true;
		}
	}

	// Pattern 6: Type assertion - "as HTMLDivElement" or "<HTMLDivElement>"
	if (/\bas\s+[A-Za-z_$][A-Za-z0-9_$.<>]*$/.test(beforeMatch)) {
		return true;
	}

	return false;
}

/**
 * Check if a position in code is inside a string literal or template literal.
 * This prevents modifying HTML code that's displayed as text content
 * (e.g., code examples on tutorial websites).
 *
 * @param code - The full source code
 * @param position - Character position to check
 * @returns True if inside a string/template literal
 */
export function isInsideString(code: string, position: number): boolean {
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
 * Check if a position is inside a script or style tag (for HTML files).
 * Also checks for string literals within attribute values.
 *
 * @param html - The HTML code
 * @param position - Character position to check
 * @returns True if inside script/style tag or attribute value
 */
export function isInsideScriptOrStyle(html: string, position: number): boolean {
	let inScript = false;
	let inStyle = false;
	let inSingleQuote = false;
	let inDoubleQuote = false;
	let prevChar = '';

	for (let i = 0; i < position; i++) {
		const char = html[i];
		const remaining = html.substring(i, Math.min(i + 20, html.length));

		// Skip escaped characters
		if (prevChar === '\\') {
			prevChar = char;
			continue;
		}

		// Check for script/style tag boundaries
		if (remaining.startsWith('<script')) {
			inScript = true;
		} else if (remaining.startsWith('</script>')) {
			inScript = false;
		} else if (remaining.startsWith('<style')) {
			inStyle = true;
		} else if (remaining.startsWith('</style>')) {
			inStyle = false;
		}

		// Track quote context (for attribute values)
		if (!inScript && !inStyle) {
			if (char === "'" && !inDoubleQuote) {
				inSingleQuote = !inSingleQuote;
			} else if (char === '"' && !inSingleQuote) {
				inDoubleQuote = !inDoubleQuote;
			}
		}

		prevChar = char;
	}

	return inScript || inStyle || inSingleQuote || inDoubleQuote;
}

// ============================================
// Position Calculation
// ============================================

/**
 * Calculate line and column from character offset.
 *
 * @param code - The source code
 * @param offset - Character offset
 * @param baseLineOffset - Base line offset (for Vue templates)
 * @returns Position with line and column (1-based)
 */
export function calculatePosition(code: string, offset: number, baseLineOffset: number = 0): Position {
	const beforeMatch = code.substring(0, offset);
	const lineOffset = beforeMatch.split('\n').length - 1;
	const lastNewline = beforeMatch.lastIndexOf('\n');
	const column = offset - lastNewline - 1;
	const line = baseLineOffset + lineOffset + 1; // 1-based line numbers

	return { line, column };
}

// ============================================
// Tag Matching
// ============================================

/**
 * Collect all opening and closing tags from code.
 *
 * @param code - The source code
 * @returns Array of tag matches sorted by position
 */
export function collectAllTags(code: string): TagMatch[] {
	const allMatches: TagMatch[] = [];

	// Collect opening tags
	const openingRegex = new RegExp(OPENING_TAG_REGEX.source, 'g');
	let match: RegExpExecArray | null;
	while ((match = openingRegex.exec(code)) !== null) {
		allMatches.push({
			type: 'opening',
			tagName: match[1],
			trailing: match[2],
			start: match.index,
			end: match.index + match[0].length,
			fullMatch: match[0]
		});
	}

	// Collect closing tags
	const closingRegex = new RegExp(CLOSING_TAG_REGEX.source, 'g');
	while ((match = closingRegex.exec(code)) !== null) {
		allMatches.push({
			type: 'closing',
			tagName: match[1],
			start: match.index,
			end: match.index + match[0].length
		});
	}

	// Sort by position
	allMatches.sort((a, b) => a.start - b.start);

	return allMatches;
}

/**
 * Find matching closing tag for an opening tag (handles nesting).
 *
 * @param allMatches - All collected tags
 * @param openingPos - Position of opening tag
 * @param tagName - Tag name to match
 * @returns Matching closing tag or null
 */
export function findMatchingClosingTag(allMatches: TagMatch[], openingPos: number, tagName: string): TagMatch | null {
	let depth = 1;
	let foundOpening = false;

	for (const match of allMatches) {
		if (match.start < openingPos) continue;
		if (match.start === openingPos && match.type === 'opening') {
			foundOpening = true;
			continue;
		}
		if (!foundOpening) {
			continue;
		}

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

// ============================================
// Main Parsing Function
// ============================================

/**
 * Parse code to find all elements and generate replacements with source tracking attributes.
 *
 * @param code - The source code to parse
 * @param options - Parsing options
 * @returns Array of replacements to apply
 */
export function parseElements(code: string, options: ParseOptions): ElementReplacement[] {
	const {
		filePath,
		baseLineOffset = 0,
		skipTags = [],
		checkScriptStyle = false,
		componentName: overrideComponentName
	} = options;

	const replacements: ElementReplacement[] = [];
	const elementStack: Array<{ tagName: string; startPos: number }> = [];

	// Normalize file path (forward slashes)
	const relPath = filePath.replace(/\\/g, '/');

	// Extract component name from filename
	const componentName = overrideComponentName || basename(filePath, extname(filePath));

	// Collect all tags
	const allMatches = collectAllTags(code);

	// Process matches to build element tree
	for (const item of allMatches) {
		if (item.type === 'opening') {
			const matchStart = item.start;
			const matchEnd = item.end;
			const tagName = item.tagName;
			const trailing = item.trailing;

			// Skip configured tags (case-insensitive)
			if (skipTags.length > 0 && skipTags.includes(tagName.toLowerCase())) {
				continue;
			}

			// Skip if already has data-roopik-source
			const surroundingCode = code.substring(matchStart, Math.min(matchEnd + 100, code.length));
			if (surroundingCode.includes('data-roopik-source')) {
				continue;
			}

			// SECURITY: Skip if inside string literal
			if (isInsideString(code, matchStart)) {
				continue;
			}

			// SECURITY: Skip if inside script/style tag (HTML only)
			if (checkScriptStyle && isInsideScriptOrStyle(code, matchStart)) {
				continue;
			}

			// TYPESCRIPT: Skip if inside TypeScript type context (generics, type annotations)
			// This prevents injecting into: React.MouseEvent<HTMLDivElement>, Array<string>, etc.
			if (isInsideTypeScriptTypeContext(code, matchStart)) {
				continue;
			}

			// Calculate start position
			const startPos = calculatePosition(code, matchStart, baseLineOffset);

			// Check if this is a self-closing tag (ends with />)
			const isSelfClosing = trailing === '/';

			// Find end position
			let endLine = startPos.line;
			let endColumn = startPos.column;

			if (!isSelfClosing) {
				// Find the matching closing tag
				const closingTag = findMatchingClosingTag(allMatches, matchStart, tagName);
				if (closingTag) {
					const endPos = calculatePosition(code, closingTag.end, baseLineOffset);
					endLine = endPos.line;
					endColumn = endPos.column;
				}
			} else {
				// Self-closing: end is same as opening tag end
				const endPos = calculatePosition(code, matchEnd, baseLineOffset);
				endLine = endPos.line;
				endColumn = endPos.column;
			}

			// Build parent chain (root → child order)
			let parentChain = '';
			if (ENABLE_PARENT_METADATA) {
				const parents = elementStack.slice(-MAX_PARENT_DEPTH).map(p => p.tagName);
				parents.push(tagName); // Append current element
				parentChain = parents.join('>');
			}

			// Create attributes
			// Format: file:startLine:startCol:endLine:endCol
			const sourceAttr = ` data-roopik-source="${relPath}:${startPos.line}:${startPos.column}:${endLine}:${endColumn}"`;
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
 * Apply replacements to code (in reverse order to maintain positions).
 *
 * @param code - Original code
 * @param replacements - Replacements to apply
 * @returns Modified code
 */
export function applyReplacements(code: string, replacements: ElementReplacement[]): string {
	let modifiedCode = code;

	// Apply in reverse order to maintain positions
	for (let i = replacements.length - 1; i >= 0; i--) {
		const elem = replacements[i];
		modifiedCode = modifiedCode.substring(0, elem.start) + elem.replacement + modifiedCode.substring(elem.end);
	}

	return modifiedCode;
}

/**
 * Convenience function: Parse and apply replacements in one step.
 *
 * @param code - The source code
 * @param options - Parsing options
 * @returns Modified code and replacement count
 */
export function transformCode(code: string, options: ParseOptions): TransformResult {
	const replacements = parseElements(code, options);

	if (replacements.length === 0) {
		return { code, count: 0 };
	}

	const modifiedCode = applyReplacements(code, replacements);
	return { code: modifiedCode, count: replacements.length };
}
