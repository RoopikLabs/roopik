/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik Canvas Extension
 *
 * This extension provides the canvas webview panel for the Roopik Design IDE.
 *
 * ARCHITECTURE:
 * Import functionality uses the Adapter Pattern defined in Core:
 * - src/vs/workbench/contrib/roopik/common/import/importTypes.ts (interfaces)
 * - src/vs/workbench/contrib/roopik/electron-main/import/importService.ts (orchestrator)
 * - src/vs/workbench/contrib/roopik/electron-main/import/localFileAdapter.ts (adapter)
 *
 * The extension is a THIN LAYER that:
 * 1. Receives import requests from Core commands
 * 2. Processes imports using local adapter implementation
 * 3. Forwards ComponentInput to webview for rendering
 * 4. Handles UI prompts (duplicate detection, error messages)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { CanvasPanel } from './panels/CanvasPanel';
import { Logger, LogLevel } from './services/Logger';
import { CanvasStateManager } from './services/CanvasStateManager';
import type { ComponentInput, Framework } from './types/pipeline';

/** Map of canvas name to panel instance */
const canvasPanels = new Map<string, CanvasPanel>();
let logger: Logger;
let workspacePath: string = '';

// ============================================
// Import Types (mirrors Core's importTypes.ts)
// ============================================

type ComponentStatus = 'imported' | 'modified' | 'exported';
type ImportErrorCode =
	| 'UNSUPPORTED_FORMAT'
	| 'FOLDER_NOT_ALLOWED'
	| 'HAS_COMPONENT_DEPS'
	| 'MISSING_DEP'
	| 'PARSE_ERROR'
	| 'STAGING_ERROR'
	| 'FILE_NOT_FOUND'
	| 'DUPLICATE_COMPONENT';

interface ComponentMeta {
	originalPath: string;
	importedAt: number;
	dependencies: string[];
	framework: Framework;
	status: ComponentStatus;
	canvasId: string;
}

interface ImportRequest {
	path: string;
	canvasId: string;
	position?: { x: number; y: number };
}

interface ImportSuccess {
	success: true;
	componentInput: ComponentInput;
	stagingPath: string;
	meta: ComponentMeta;
}

interface ImportError {
	success: false;
	code: ImportErrorCode;
	message: string;
	details?: unknown;
}

interface DuplicateInfo {
	isDuplicate: true;
	existingName: string;
	existingMeta: ComponentMeta;
}

interface ImportDuplicateError extends ImportError {
	code: 'DUPLICATE_COMPONENT';
	duplicateInfo: DuplicateInfo;
}

type ImportResult = ImportSuccess | ImportError | ImportDuplicateError;

interface CategorizedImports {
	css: string[];
	js: string[];
	components: string[];
	packages: string[];
}

// ============================================
// Import Implementation (LocalFileAdapter logic)
// ============================================

const SUPPORTED_EXTENSIONS = ['.tsx', '.jsx', '.vue', '.svelte'];

function getRoopikDir(): string {
	return path.join(workspacePath, '.roopik');
}

function getStagingDir(canvasId: string, componentName: string): string {
	return path.join(getRoopikDir(), canvasId, 'components', componentName);
}

function scanImports(code: string): string[] {
	const imports: string[] = [];
	const seen = new Set<string>();

	const patterns = [
		/import\s+(?:[\w{},\s*]+\s+from\s+)?['"](\.[^'"]+)['"]/g,
		/import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
		/require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
		/@import\s+['"](\.[^'"]+)['"]/g
	];

	for (const regex of patterns) {
		let match;
		while ((match = regex.exec(code)) !== null) {
			const importPath = match[1];
			if (!seen.has(importPath)) {
				seen.add(importPath);
				imports.push(importPath);
			}
		}
	}

	return imports;
}

function categorizeImports(imports: string[]): CategorizedImports {
	const result: CategorizedImports = { css: [], js: [], components: [], packages: [] };

	for (const imp of imports) {
		if (imp.startsWith('node:')) continue;

		const isRelative = imp.startsWith('./') || imp.startsWith('../');
		if (!isRelative) {
			result.packages.push(imp);
			continue;
		}

		const ext = path.extname(imp).toLowerCase();
		if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
			result.css.push(imp);
		} else if (['.tsx', '.jsx', '.vue', '.svelte'].includes(ext)) {
			result.components.push(imp);
		} else if (['.js', '.ts', '.mjs', '.cjs'].includes(ext)) {
			result.js.push(imp);
		} else if (!ext) {
			const basename = path.basename(imp);
			if (/^[A-Z]/.test(basename)) {
				result.components.push(imp);
			} else {
				result.js.push(imp);
			}
		}
	}

	return result;
}

function detectFramework(files: Record<string, string>, mainExt: string): Framework {
	const mainCode = Object.values(files)[0] || '';

	if (mainExt === '.vue') return 'vue';
	if (mainExt === '.svelte') return 'svelte';
	if (mainCode.includes("from 'react'") || mainCode.includes('from "react"')) return 'react';
	if (mainExt === '.tsx' || mainExt === '.jsx') return 'react';

	return 'html';
}

async function resolveDependency(
	baseDir: string,
	importPath: string
): Promise<{ success: boolean; content?: string; error?: string }> {
	let resolvedPath = path.resolve(baseDir, importPath);

	if (!path.extname(importPath)) {
		for (const ext of ['.ts', '.js', '.mjs']) {
			const tryPath = resolvedPath + ext;
			if (existsSync(tryPath)) {
				resolvedPath = tryPath;
				break;
			}
		}
	}

	try {
		if (!existsSync(resolvedPath)) {
			return { success: false, error: `Dependency not found: ${importPath}` };
		}
		const content = await fs.readFile(resolvedPath, 'utf-8');
		return { success: true, content };
	} catch (err) {
		return { success: false, error: `Failed to read dependency ${importPath}: ${(err as Error).message}` };
	}
}

async function copyToStaging(
	canvasId: string,
	componentName: string,
	files: Record<string, string>
): Promise<string | null> {
	const stagingDir = getStagingDir(canvasId, componentName);

	try {
		await fs.mkdir(stagingDir, { recursive: true });

		for (const [filename, content] of Object.entries(files)) {
			const filePath = path.join(stagingDir, filename);
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			await fs.writeFile(filePath, content, 'utf-8');
		}

		return stagingDir;
	} catch (err) {
		logger.error('Extension', `Failed to copy to staging: ${(err as Error).message}`);
		return null;
	}
}

async function saveComponentMeta(canvasId: string, componentName: string, meta: ComponentMeta): Promise<void> {
	const metaPath = path.join(getStagingDir(canvasId, componentName), '_meta.json');
	await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

async function checkForDuplicate(canvasId: string, originalPath: string): Promise<DuplicateInfo | null> {
	const componentsDir = path.join(getRoopikDir(), canvasId, 'components');

	if (!existsSync(componentsDir)) return null;

	try {
		const entries = await fs.readdir(componentsDir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.isDirectory()) {
				const metaPath = path.join(componentsDir, entry.name, '_meta.json');
				if (existsSync(metaPath)) {
					const metaContent = await fs.readFile(metaPath, 'utf-8');
					const meta = JSON.parse(metaContent) as ComponentMeta;

					if (meta.originalPath === originalPath) {
						return { isDuplicate: true, existingName: entry.name, existingMeta: meta };
					}
				}
			}
		}
	} catch (err) {
		logger.warn('Extension', `Error checking for duplicates: ${(err as Error).message}`);
	}

	return null;
}

function createError(code: ImportErrorCode, message: string, details?: unknown): ImportError {
	logger.warn('Extension', `${code}: ${message}`);
	return { success: false, code, message, details };
}

async function importComponent(request: ImportRequest, forceReplace: boolean = false): Promise<ImportResult> {
	const { path: filePath, canvasId } = request;

	logger.info('Extension', `Importing component: ${filePath}`);

	// 1. Validate file exists
	if (!existsSync(filePath)) {
		return createError('FILE_NOT_FOUND', `File not found: ${filePath}`);
	}

	// 2. Check for duplicate
	if (!forceReplace) {
		const duplicate = await checkForDuplicate(canvasId, filePath);
		if (duplicate) {
			logger.info('Extension', `Duplicate found: ${duplicate.existingName}`);
			return {
				success: false,
				code: 'DUPLICATE_COMPONENT',
				message: `Component "${duplicate.existingName}" already imported from this file`,
				duplicateInfo: duplicate
			} as ImportDuplicateError;
		}
	}

	// 3. Validate extension
	const ext = path.extname(filePath).toLowerCase();
	if (!SUPPORTED_EXTENSIONS.includes(ext)) {
		return createError('UNSUPPORTED_FORMAT', `Only ${SUPPORTED_EXTENSIONS.join(', ')} files supported. Got: ${ext}`);
	}

	// 4. Read the file
	let code: string;
	try {
		code = await fs.readFile(filePath, 'utf-8');
	} catch (err) {
		return createError('PARSE_ERROR', `Failed to read file: ${(err as Error).message}`);
	}

	// 5. Scan for imports
	const imports = scanImports(code);
	const categorized = categorizeImports(imports);

	// 6. Block if has component dependencies
	if (categorized.components.length > 0) {
		return createError(
			'HAS_COMPONENT_DEPS',
			`Component imports other components: ${categorized.components.join(', ')}. Only self-contained components allowed.`,
			{ dependencies: categorized.components }
		);
	}

	// 7. Resolve local dependencies
	const componentDir = path.dirname(filePath);
	const componentName = path.basename(filePath, ext);
	const files: Record<string, string> = {};

	const mainFileName = path.basename(filePath);
	files[mainFileName] = code;

	for (const cssImport of categorized.css) {
		const result = await resolveDependency(componentDir, cssImport);
		if (!result.success) return createError('MISSING_DEP', result.error!);
		files[cssImport] = result.content!;
	}

	for (const jsImport of categorized.js) {
		const result = await resolveDependency(componentDir, jsImport);
		if (!result.success) return createError('MISSING_DEP', result.error!);
		files[jsImport] = result.content!;
	}

	// 8. Detect framework
	const framework = detectFramework(files, ext);

	// 9. Copy to staging directory
	const stagingPath = await copyToStaging(canvasId, componentName, files);
	if (!stagingPath) {
		return createError('STAGING_ERROR', 'Failed to copy files to staging directory');
	}

	// 10. Create and save metadata
	const meta: ComponentMeta = {
		originalPath: filePath,
		importedAt: Date.now(),
		dependencies: [...categorized.css, ...categorized.js],
		framework,
		status: 'imported',
		canvasId
	};

	await saveComponentMeta(canvasId, componentName, meta);

	// 11. Create ComponentInput for pipeline
	const componentInput: ComponentInput = {
		id: `import-${componentName}-${Date.now()}`,
		source: 'import',
		framework,
		files,
		entryFile: mainFileName
	};

	logger.info('Extension', `Import successful: ${componentName} (${framework})`);

	return { success: true, componentInput, stagingPath, meta };
}

// ============================================
// Extension Activation
// ============================================

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	const logDirectory = workspaceFolders
		? path.join(workspaceFolders[0].uri.fsPath, '.roopik', 'logs')
		: path.join(context.extensionPath, 'logs');

	logger = Logger.getInstance({
		level: LogLevel.DEBUG,
		enableFileLogging: true,
		logDirectory,
		maxLogFileSize: 5 * 1024 * 1024,
		maxLogFiles: 5,
		showOutputChannel: false
	});

	logger.info('Extension', 'Roopik Canvas extension activating...');

	// Initialize workspace path for import functions
	if (workspaceFolders && workspaceFolders.length > 0) {
		workspacePath = workspaceFolders[0].uri.fsPath;
	}

	// Initialize CanvasStateManager
	const stateManager = CanvasStateManager.getInstance();
	await stateManager.initialize();
	logger.info('Extension', `CanvasStateManager initialized: ${stateManager.getRoopikDir()}`);

	// Dispose logger on deactivation
	context.subscriptions.push({ dispose: () => logger.dispose() });

	// Main command - opens the canvas webview panel with canvas name
	context.subscriptions.push(
		vscode.commands.registerCommand('roopik.canvas.open', async (canvasName?: string) => {
			if (!canvasName) {
				logger.warn('Extension', 'No canvas name provided, using default');
				canvasName = 'Untitled Canvas';
			}

			logger.info('Extension', `Opening canvas: ${canvasName}`);

			const existingPanel = canvasPanels.get(canvasName);
			if (existingPanel) {
				logger.info('Extension', `Revealing existing canvas: ${canvasName}`);
				existingPanel.reveal();
				return;
			}

			let canvasState = await stateManager.loadCanvas(canvasName);
			if (!canvasState) {
				logger.info('Extension', `Creating new canvas: ${canvasName}`);
				canvasState = await stateManager.createCanvas(canvasName);
			}

			const panel = new CanvasPanel(context.extensionUri, canvasName, canvasState);
			canvasPanels.set(canvasName, panel);

			panel.onDidDispose(() => {
				logger.info('Extension', `Canvas panel disposed: ${canvasName}`);
				canvasPanels.delete(canvasName!);
			});
		})
	);

	// Import component command - called from Core's import commands
	context.subscriptions.push(
		vscode.commands.registerCommand('roopik.canvas.importComponent', async (request: {
			path: string;
			canvasId: string;
			position?: { x: number; y: number };
			forceReplace?: boolean;
		}) => {
			logger.info('Extension', `Import request received`, request);

			let isReplacing = false;
			let replaceComponentName: string | undefined;

			let result = await importComponent(request, request.forceReplace ?? false);

			// Handle duplicate case
			if (!result.success && result.code === 'DUPLICATE_COMPONENT') {
				const duplicateResult = result as ImportDuplicateError;
				const componentName = duplicateResult.duplicateInfo.existingName;

				logger.info('Extension', `Duplicate component found: ${componentName}`);

				const choice = await vscode.window.showWarningMessage(
					`Component "${componentName}" is already on this canvas. What would you like to do?`,
					{ modal: true },
					'Replace',
					'Cancel'
				);

				if (choice === 'Replace') {
					logger.info('Extension', `User chose to replace: ${componentName}`);
					isReplacing = true;
					replaceComponentName = componentName;
					result = await importComponent(request, true);
				} else {
					return { success: false, error: 'Import cancelled - component already exists' };
				}
			}

			if (!result.success) {
				logger.error('Extension', `Import failed: ${result.message}`);
				vscode.window.showErrorMessage(`Import failed: ${result.message}`);
				return { success: false, error: result.message };
			}

			logger.info('Extension', `Import successful: ${result.componentInput.id}`);

			const panel = canvasPanels.get(request.canvasId);
			if (panel) {
				panel.addImportedComponent(
					result.componentInput,
					request.position,
					isReplacing,
					replaceComponentName
				);
				return { success: true, componentInput: result.componentInput };
			} else {
				logger.warn('Extension', `No panel open for canvas: ${request.canvasId}`);
				vscode.window.showWarningMessage('Please open a canvas first, then import.');
				return { success: false, error: 'Canvas not open' };
			}
		})
	);

	logger.info('Extension', 'Roopik Canvas extension activated');
}

export function deactivate(): void {
	Logger.getInstance().info('Extension', 'Extension deactivating');

	for (const [name, panel] of canvasPanels) {
		Logger.getInstance().info('Extension', `Disposing canvas: ${name}`);
		panel.dispose();
	}
	canvasPanels.clear();
}
