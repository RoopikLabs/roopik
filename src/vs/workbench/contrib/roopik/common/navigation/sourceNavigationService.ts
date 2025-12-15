/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

/**
 * Source Navigation Service
 *
 * Centralized service for opening source files in the editor.
 * Used by:
 * - Style Inspect Panel (CSS source links, "Open in Editor" button)
 * - Context Menu "View Source" (future)
 * - Element inspector click-to-source
 * - Any feature that needs to open a file at a specific location
 *
 * This ensures consistent behavior across all navigation scenarios.
 */

// ============================================
// Types
// ============================================

/**
 * A location in a source file.
 * Generic type that can be used for HTML, CSS, JS, etc.
 */
export interface SourceLocation {
	/** Absolute file path */
	file: string;
	/** Line number (1-indexed) */
	line: number;
	/** Column number (0-indexed) */
	column?: number;
	/** End line (for range selection in editor) */
	endLine?: number;
	/** End column */
	endColumn?: number;
}

/**
 * Options for opening a source file
 */
export interface OpenSourceOptions {
	/** Pin the editor tab (default: false) */
	pinned?: boolean;
	/** Keep focus on current view instead of editor (default: false) */
	preserveFocus?: boolean;
	/** Preview mode - reuse same editor tab (default: true) */
	preview?: boolean;
}

// ============================================
// Shared Parsing Utility
// ============================================

/**
 * Parse data-roopik-source attribute value into a SourceLocation
 *
 * This is the SINGLE source of truth for parsing the attribute.
 * All consumers (context menu, style panel, etc.) should use this function
 * to ensure consistent behavior.
 *
 * Format: file:startLine:startCol:endLine:endCol
 * Windows paths contain colons (C:\), so we parse from the end to find numeric parts.
 *
 * @param sourceAttr - The raw attribute value from data-roopik-source
 * @returns Parsed SourceLocation or null if invalid
 *
 * @example
 * parseRoopikSourceAttribute('C:/project/src/Button.tsx:10:4:15:6')
 * // Returns: { file: 'C:/project/src/Button.tsx', line: 10, column: 4, endLine: 15, endColumn: 6 }
 */
export function parseRoopikSourceAttribute(sourceAttr: string | undefined | null): SourceLocation | null {
	if (!sourceAttr) {
		return null;
	}

	// Split by colons
	const parts = sourceAttr.split(':');

	// Need at least 2 parts: file + line
	if (parts.length < 2) {
		return null;
	}

	// Parse numeric values from the end
	// Find where numbers start from the end
	let numericStartIndex = parts.length;
	for (let i = parts.length - 1; i >= 0; i--) {
		const num = parseInt(parts[i], 10);
		if (isNaN(num)) {
			numericStartIndex = i + 1;
			break;
		}
	}

	// File is everything before numeric parts
	const fileParts = parts.slice(0, numericStartIndex);
	const numericParts = parts.slice(numericStartIndex);

	if (fileParts.length === 0 || numericParts.length === 0) {
		return null;
	}

	const file = fileParts.join(':'); // Rejoin file path (handles Windows C:\)
	const line = parseInt(numericParts[0], 10);

	if (isNaN(line)) {
		return null;
	}

	const result: SourceLocation = {
		file,
		line
	};

	// Optional: column
	if (numericParts.length >= 2) {
		const col = parseInt(numericParts[1], 10);
		if (!isNaN(col)) {
			result.column = col;
		}
	}

	// Optional: endLine
	if (numericParts.length >= 3) {
		const endLine = parseInt(numericParts[2], 10);
		if (!isNaN(endLine)) {
			result.endLine = endLine;
		}
	}

	// Optional: endColumn
	if (numericParts.length >= 4) {
		const endCol = parseInt(numericParts[3], 10);
		if (!isNaN(endCol)) {
			result.endColumn = endCol;
		}
	}

	return result;
}

// ============================================
// Service Interface
// ============================================

export const ISourceNavigationService = createDecorator<ISourceNavigationService>('roopikSourceNavigationService');

export interface ISourceNavigationService {
	readonly _serviceBrand: undefined;

	/**
	 * Open a source file at a specific location
	 *
	 * @param location - The source location to open (file, line, column)
	 * @param options - Optional settings for how to open the file
	 * @returns Promise that resolves when the file is opened
	 *
	 * @example
	 * // Open Button.tsx at line 10
	 * await sourceNavigationService.openSourceLocation({
	 *   file: 'C:/project/src/Button.tsx',
	 *   line: 10,
	 *   column: 4
	 * });
	 *
	 * @example
	 * // Open with range selection
	 * await sourceNavigationService.openSourceLocation({
	 *   file: 'C:/project/src/styles.css',
	 *   line: 20,
	 *   column: 0,
	 *   endLine: 25,
	 *   endColumn: 1
	 * });
	 */
	openSourceLocation(location: SourceLocation, options?: OpenSourceOptions): Promise<void>;

	/**
	 * Open a file without specific line/column (just open the file)
	 *
	 * @param filePath - Absolute path to the file
	 * @param options - Optional settings for how to open the file
	 */
	openFile(filePath: string, options?: OpenSourceOptions): Promise<void>;
}
