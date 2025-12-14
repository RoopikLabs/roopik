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
