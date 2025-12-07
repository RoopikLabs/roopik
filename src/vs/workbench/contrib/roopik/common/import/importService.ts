/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ComponentSource } from '../storage/storageTypes.js';
import { SourceData, ImportResult } from '../component/types.js';

// ============================================================================
// Service Interface
// ============================================================================

export const IImportService = createDecorator<IImportService>('roopikImportService');

/**
 * Import Service Interface
 *
 * Handles importing components from various sources.
 * Uses adapter pattern - each source type has its own adapter.
 */
export interface IImportService {
	readonly _serviceBrand: undefined;

	/**
	 * Import component from source
	 * Delegates to appropriate adapter based on sourceData.type
	 */
	import(sourceData: SourceData): Promise<ImportResult>;

	/**
	 * Register a new import adapter
	 */
	registerAdapter(adapter: IImportAdapter): void;

	/**
	 * Check if a source type is supported
	 */
	isSupported(sourceType: ComponentSource): boolean;
}

// ============================================================================
// Import Adapter Interface
// ============================================================================

/**
 * Import Adapter Interface
 *
 * Each source type (ai-agent, local-file, github, figma, manual)
 * implements this interface.
 */
export interface IImportAdapter {
	/** Which source type this adapter handles */
	readonly sourceType: ComponentSource;

	/**
	 * Check if this adapter can handle the given source data
	 */
	canHandle(sourceData: SourceData): boolean;

	/**
	 * Import and return normalized files
	 */
	import(sourceData: SourceData): Promise<ImportResult>;
}
