/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Drag-Drop Import Adapter
 *
 * Handles importing components dropped from OS file manager onto the canvas.
 * Unlike LocalFileAdapter, we receive file content directly (no file path due to browser security).
 *
 * Flow:
 * 1. User drags file from Windows Explorer/Finder onto canvas
 * 2. Webview reads file content via FileReader API
 * 3. Webview sends { fileName, content } to extension
 * 4. Extension forwards to Core with canvasId
 * 5. This adapter processes the content
 *
 * Supports:
 * - Single file drop (current)
 * - Multiple files drop (future - via files field)
 */

import { ComponentSource } from '../../../common/storage/storageTypes.js';
import { SourceData, DragDropSourceData, ImportResult } from '../../../common/component/types.js';
import { BaseImportAdapter } from './types.js';
import { ComponentParser } from '../../../common/build/componentParser.js';

export class DragDropAdapter extends BaseImportAdapter {
	readonly sourceType: ComponentSource = 'drag-drop';

	private readonly parser: ComponentParser;

	constructor() {
		super();
		this.parser = new ComponentParser();
	}

	async import(sourceData: SourceData): Promise<ImportResult> {
		if (sourceData.type !== 'drag-drop') {
			throw new Error('DragDropAdapter: Invalid source type');
		}

		const data = sourceData as DragDropSourceData;

		// Normalize to files map
		let files: Record<string, string>;

		if (data.files && Object.keys(data.files).length > 0) {
			// Multiple files provided (future support)
			files = { ...data.files };
		} else if (data.fileName && data.content) {
			// Single file drop (current)
			files = { [data.fileName]: data.content };
		} else {
			throw new Error('DragDropAdapter: No fileName/content or files provided');
		}

		// Detect framework from files
		const framework = this.parser.detectFramework(files);

		// Detect entry file
		const entryFile = this.parser.detectEntryFile(files, framework);

		// Detect dependencies from imports
		const dependencies = this.detectDependenciesFromFiles(files);

		return {
			files,
			entryFile,
			framework,
			dependencies,
			sourceInfo: {
				// No original path available (browser security)
				// Could add drop timestamp or other metadata in future
			}
		};
	}
}
