/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Import Service Implementation
 *
 * Handles importing components from various sources using adapter pattern.
 * Each source type (ai-agent, local-file, github, manual) has its own adapter.
 *
 * Does NOT handle storage - just imports and returns normalized files.
 */

import { ComponentSource } from '../../common/storage/storageTypes.js';
import { SourceData, ImportResult } from '../../common/component/types.js';
import { IImportService, IImportAdapter } from '../../common/import/importService.js';
import {
	AIAgentAdapter,
	LocalFileAdapter,
	DragDropAdapter,
	GitHubAdapter,
	ManualAdapter
} from './adapters/index.js';

export class ImportService implements IImportService {
	readonly _serviceBrand: undefined;

	private readonly adapters: Map<ComponentSource, IImportAdapter> = new Map();

	constructor() {
		// Register default adapters
		this.registerAdapter(new AIAgentAdapter());
		this.registerAdapter(new LocalFileAdapter());
		this.registerAdapter(new DragDropAdapter());
		this.registerAdapter(new GitHubAdapter());
		this.registerAdapter(new ManualAdapter());
	}

	/**
	 * Import component from source
	 *
	 * Flow:
	 * 1. Find adapter for source type
	 * 2. Validate adapter can handle this specific source data
	 * 3. Call adapter.import()
	 * 4. Return normalized ImportResult
	 */
	async import(sourceData: SourceData): Promise<ImportResult> {
		const sourceType = sourceData.type as ComponentSource;

		// Find adapter
		const adapter = this.adapters.get(sourceType);
		if (!adapter) {
			throw new Error(`ImportService: No adapter registered for source type: ${sourceType}`);
		}

		// Validate adapter can handle
		if (!adapter.canHandle(sourceData)) {
			throw new Error(`ImportService: Adapter cannot handle source data: ${sourceType}`);
		}

		// Import via adapter
		const result = await adapter.import(sourceData);

		// Validate result
		this.validateImportResult(result);

		return result;
	}

	/**
	 * Register a new import adapter
	 *
	 * @param adapter Adapter to register
	 * @throws Error if adapter for source type already registered
	 */
	registerAdapter(adapter: IImportAdapter): void {
		if (this.adapters.has(adapter.sourceType)) {
			throw new Error(`ImportService: Adapter already registered for: ${adapter.sourceType}`);
		}
		this.adapters.set(adapter.sourceType, adapter);
	}

	/**
	 * Check if a source type is supported
	 */
	isSupported(sourceType: ComponentSource): boolean {
		return this.adapters.has(sourceType);
	}

	/**
	 * Get list of supported source types
	 */
	getSupportedSources(): ComponentSource[] {
		return Array.from(this.adapters.keys());
	}

	/**
	 * Validate import result has required fields
	 */
	private validateImportResult(result: ImportResult): void {
		if (!result.files || Object.keys(result.files).length === 0) {
			throw new Error('ImportService: Import result has no files');
		}

		if (!result.entryFile) {
			throw new Error('ImportService: Import result has no entry file');
		}

		if (!result.files[result.entryFile]) {
			throw new Error(`ImportService: Entry file not found in files: ${result.entryFile}`);
		}

		if (!result.framework) {
			throw new Error('ImportService: Import result has no framework');
		}
	}
}
