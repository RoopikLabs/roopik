/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Local File Import Adapter
 *
 * Handles importing components from user's local project files.
 * Reads file(s) from disk and normalizes for the component pipeline.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ComponentSource, Framework } from '../../../common/storage/storageTypes.js';
import { SourceData, LocalFileSourceData, ImportResult } from '../../../common/component/types.js';
import { BaseImportAdapter } from './types.js';
import { ComponentParser } from '../../../common/sandboxPipeline/componentParser.js';

export class LocalFileAdapter extends BaseImportAdapter {
	readonly sourceType: ComponentSource = 'local-file';

	private readonly parser: ComponentParser;

	constructor() {
		super();
		this.parser = new ComponentParser();
	}

	async import(sourceData: SourceData): Promise<ImportResult> {
		if (sourceData.type !== 'local-file') {
			throw new Error('LocalFileAdapter: Invalid source type');
		}

		const data = sourceData as LocalFileSourceData;
		const filePath = data.filePath;

		// Check if path exists
		if (!fs.existsSync(filePath)) {
			throw new Error(`LocalFileAdapter: File not found: ${filePath}`);
		}

		const stat = fs.statSync(filePath);
		let files: Record<string, string>;
		let entryFile: string;

		if (stat.isDirectory()) {
			// Import entire directory
			files = this.readDirectory(filePath);
			const framework = this.parser.detectFramework(files);
			entryFile = this.parser.detectEntryFile(files, framework);
		} else {
			// Import single file
			const content = fs.readFileSync(filePath, 'utf-8');
			const filename = path.basename(filePath);
			files = { [filename]: content };
			entryFile = filename;
		}

		// Detect framework
		const framework = this.parser.detectFramework(files);

		// Detect dependencies
		const dependencies = this.detectDependenciesFromFiles(files);

		return {
			files,
			entryFile,
			framework,
			dependencies,
			sourceInfo: {
				originalPath: filePath
			}
		};
	}

	/**
	 * Recursively read all supported files from a directory
	 */
	private readDirectory(dirPath: string, basePath: string = ''): Record<string, string> {
		const files: Record<string, string> = {};
		const supportedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.css', '.html', '.json'];

		const entries = fs.readdirSync(dirPath, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(dirPath, entry.name);
			const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

			if (entry.isDirectory()) {
				// Skip node_modules, .git, etc.
				if (['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
					continue;
				}
				// Recursively read subdirectory
				Object.assign(files, this.readDirectory(fullPath, relativePath));
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name).toLowerCase();
				if (supportedExtensions.includes(ext)) {
					files[relativePath] = fs.readFileSync(fullPath, 'utf-8');
				}
			}
		}

		return files;
	}
}
