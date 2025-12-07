/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Import Module - Public API
 */

// Service interfaces
export { IImportService, IImportAdapter } from './importService.js';

// Import Scanner (for scanning and categorizing imports)
export { ImportScanner } from './importScanner.js';

// Types
export type {
	ComponentStatus,
	ImportErrorCode,
	ComponentMeta,
	ImportRequest,
	ImportSuccess,
	ImportError,
	DuplicateInfo,
	ImportDuplicateError,
	ImportResultFull,
	CategorizedImports,
	ExportMode,
	ExportRequest,
	ExportResult,
	AdapterOptions,
	AdapterSourceType,
	IComponentImportAdapter,
	IImportServiceFull
} from './importTypes.js';
