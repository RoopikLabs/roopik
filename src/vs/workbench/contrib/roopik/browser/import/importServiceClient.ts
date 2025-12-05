/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Import Service Client (Browser Process)
 *
 * Acts as an IPC proxy to the main process ImportService.
 * All file reading, validation, and staging happens in the main process.
 *
 * This follows the same pattern as SandboxPipelineClient.
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import type {
	ImportRequest,
	ImportResult,
	ComponentMeta,
	ComponentStatus,
	ExportRequest,
	ExportResult,
	IImportService,
	DuplicateInfo,
	AdapterSourceType
} from '../../common/import/importTypes.js';

/**
 * Import Service Client - IPC proxy to main process
 */
export class ImportServiceClient extends Disposable implements IImportService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService
	) {
		super();
	}

	private get channel() {
		return this.mainProcessService.getChannel('roopikImport');
	}

	/**
	 * Get available import sources for UI
	 */
	async getAvailableSources(): Promise<{ id: AdapterSourceType; displayName: string }[]> {
		return this.channel.call('getAvailableSources');
	}

	/**
	 * Import a component from a source path/URL
	 */
	async importComponent(request: ImportRequest): Promise<ImportResult> {
		return this.channel.call('importComponent', request);
	}

	/**
	 * Check for duplicate before import
	 */
	async checkForDuplicate(source: string, canvasId: string): Promise<DuplicateInfo | null> {
		return this.channel.call('checkForDuplicate', [source, canvasId]);
	}

	/**
	 * Export a component from staging
	 */
	async exportComponent(request: ExportRequest): Promise<ExportResult> {
		return this.channel.call('exportComponent', request);
	}

	/**
	 * Update component status (e.g., mark as modified)
	 */
	async updateComponentStatus(canvasId: string, componentName: string, status: ComponentStatus): Promise<void> {
		return this.channel.call('updateComponentStatus', [canvasId, componentName, status]);
	}

	/**
	 * Get component metadata
	 */
	async getComponentMeta(canvasId: string, componentName: string): Promise<ComponentMeta | null> {
		return this.channel.call('getComponentMeta', [canvasId, componentName]);
	}

	/**
	 * List all components in a canvas staging area
	 */
	async listStagedComponents(canvasId: string): Promise<ComponentMeta[]> {
		return this.channel.call('listStagedComponents', canvasId);
	}

	/**
	 * Delete a staged component
	 */
	async deleteStagedComponent(canvasId: string, componentName: string): Promise<boolean> {
		return this.channel.call('deleteStagedComponent', [canvasId, componentName]);
	}

	override dispose(): void {
		super.dispose();
	}
}
