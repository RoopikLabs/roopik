/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { ITextResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import {
	ISourceNavigationService,
	SourceLocation,
	OpenSourceOptions
} from '../../common/navigation/sourceNavigationService.js';

/**
 * Source Navigation Service Implementation
 *
 * Provides centralized file navigation for the entire Roopik extension.
 * All features that need to open source files should use this service.
 */
export class SourceNavigationService implements ISourceNavigationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@INotificationService private readonly notificationService: INotificationService
	) { }

	/**
	 * Open a source file at a specific location
	 *
	 * Selection behavior:
	 * - If only line is provided: Position cursor at line start (no selection)
	 * - If line + column: Position cursor at exact position (no selection)
	 * - If line + column + endLine + endColumn (all different): Create selection range
	 *
	 * This handles both:
	 * - CSS rule navigation (just go to line, no selection needed)
	 * - HTML source tracking (may have start/end range from data-roopik-source)
	 */
	async openSourceLocation(location: SourceLocation, options?: OpenSourceOptions): Promise<void> {
		try {
			const uri = URI.file(location.file);

			// Determine selection type:
			// - Default to cursor positioning (no selection)
			// - Only create selection if we have explicit, different end position
			const startLine = location.line;
			const startCol = (location.column ?? 0) + 1; // VSCode is 1-indexed for columns

			// Check if we have a meaningful end position that differs from start
			// A selection is only created if endLine/endColumn are explicitly provided
			// AND they create a range (not just same position)
			const hasExplicitEnd = location.endLine !== undefined && location.endColumn !== undefined;
			const isDifferentPosition = hasExplicitEnd && (
				location.endLine !== startLine ||
				(location.endColumn! + 1) !== startCol
			);

			let selection: { startLineNumber: number; startColumn: number; endLineNumber?: number; endColumn?: number };

			if (isDifferentPosition) {
				// Create a selection range
				selection = {
					startLineNumber: startLine,
					startColumn: startCol,
					endLineNumber: location.endLine!,
					endColumn: location.endColumn! + 1
				};
			} else {
				// Just position cursor (no selection)
				// Setting end = start creates cursor position, not selection
				selection = {
					startLineNumber: startLine,
					startColumn: startCol,
					endLineNumber: startLine,
					endColumn: startCol
				};
			}

			const editorInput: ITextResourceEditorInput = {
				resource: uri,
				options: {
					selection,
					pinned: options?.pinned ?? false,
					preserveFocus: options?.preserveFocus ?? false
				}
			};

			await this.editorService.openEditor(editorInput);
		} catch (error) {
			console.error('[SourceNavigationService] Failed to open file:', error);
			this.notificationService.notify({
				severity: Severity.Error,
				message: `Could not open file: ${location.file}`,
				sticky: false
			});
		}
	}

	/**
	 * Open a file without specific line/column
	 */
	async openFile(filePath: string, options?: OpenSourceOptions): Promise<void> {
		try {
			const uri = URI.file(filePath);

			const editorInput: ITextResourceEditorInput = {
				resource: uri,
				options: {
					pinned: options?.pinned ?? false,
					preserveFocus: options?.preserveFocus ?? false
				}
			};

			await this.editorService.openEditor(editorInput);
		} catch (error) {
			console.error('[SourceNavigationService] Failed to open file:', error);
			this.notificationService.notify({
				severity: Severity.Error,
				message: `Could not open file: ${filePath}`,
				sticky: false
			});
		}
	}
}
