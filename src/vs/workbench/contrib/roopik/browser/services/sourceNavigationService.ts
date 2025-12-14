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
	 */
	async openSourceLocation(location: SourceLocation, options?: OpenSourceOptions): Promise<void> {
		try {
			const uri = URI.file(location.file);

			const editorInput: ITextResourceEditorInput = {
				resource: uri,
				options: {
					selection: {
						startLineNumber: location.line,
						startColumn: (location.column ?? 0) + 1, // VSCode is 1-indexed for columns
						endLineNumber: location.endLine ?? location.line,
						endColumn: ((location.endColumn ?? location.column) ?? 0) + 1
					},
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
