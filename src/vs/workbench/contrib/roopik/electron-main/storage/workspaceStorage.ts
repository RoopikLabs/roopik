/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { dirname } from '../../../../../base/common/path.js';
import {
	CanvasInfo,
	CanvasRegistry,
	CanvasFile,
	ComponentReference,
	WorkspaceConfig,
	DEFAULT_WORKSPACE_CONFIG,
	DEFAULT_CANVAS_PREFERENCES,
	ProjectInfo,
	ProjectIndex,
	DEFAULT_PROJECT_INDEX
} from '../../common/storage/storageTypes.js';
import { CanvasMeta } from '../../common/canvas/types.js';
import {
	getWorkspaceRoopikPath,
	getConfigPath,
	getCanvasesFolderPath,
	getCanvasRegistryPath,
	getCanvasPath,
	getProjectsFolderPath,
	getProjectRegistryPath
} from './paths.js';

/**
 * Workspace Storage (Metadata-Only Architecture)
 *
 * Handles all file operations in the .roopik/ folder:
 * - config.json: Workspace configuration
 * - canvases/canvases.json: Canvas registry (lightweight)
 * - canvases/{canvas-id}.json: Per-canvas file (metadata + component references)
 *
 * NO file copying. NO per-component source files. NO index.json or meta.json per component.
 * Components are stored as REFERENCES (folderPath + entryFile) in canvas files.
 */
export class WorkspaceStorage {
	private workspacePath: string = '';
	private initialized: boolean = false;

	// ========================================================================
	// Initialization
	// ========================================================================

	/**
	 * Initialize workspace storage
	 * Creates .roopik/ folder structure if it doesn't exist
	 */
	async initialize(workspacePath: string): Promise<void> {
		this.workspacePath = workspacePath;

		// Create .roopik folder if it doesn't exist
		const roopikPath = getWorkspaceRoopikPath(workspacePath);
		await this.ensureDir(roopikPath);

		// Create config.json if it doesn't exist
		const configPath = getConfigPath(workspacePath);
		if (!await this.fileExists(configPath)) {
			await this.writeJson(configPath, DEFAULT_WORKSPACE_CONFIG);
		}

		// Create canvases folder if it doesn't exist
		const canvasesPath = getCanvasesFolderPath(workspacePath);
		await this.ensureDir(canvasesPath);

		// Create canvases/canvases.json if it doesn't exist
		const canvasRegistryPath = getCanvasRegistryPath(workspacePath);
		if (!await this.fileExists(canvasRegistryPath)) {
			const emptyRegistry: CanvasRegistry = { canvases: [] };
			await this.writeJson(canvasRegistryPath, emptyRegistry);
		}

		this.initialized = true;
	}

	/**
	 * Check if storage is initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	/**
	 * Get workspace path
	 */
	getWorkspacePath(): string {
		return this.workspacePath;
	}

	// ========================================================================
	// Config Operations
	// ========================================================================

	/**
	 * Read workspace configuration
	 */
	async getConfig(): Promise<WorkspaceConfig> {
		this.ensureInitialized();

		const configPath = getConfigPath(this.workspacePath);
		try {
			const config = await this.readJson<WorkspaceConfig>(configPath);
			// Merge with defaults to handle missing fields
			return { ...DEFAULT_WORKSPACE_CONFIG, ...config };
		} catch {
			return { ...DEFAULT_WORKSPACE_CONFIG };
		}
	}

	/**
	 * Update workspace configuration
	 */
	async updateConfig(updates: Partial<WorkspaceConfig>): Promise<void> {
		this.ensureInitialized();

		const configPath = getConfigPath(this.workspacePath);
		const currentConfig = await this.getConfig();
		const newConfig = { ...currentConfig, ...updates };
		await this.writeJson(configPath, newConfig);
	}

	// ========================================================================
	// Canvas Registry (Lightweight)
	// ========================================================================

	/**
	 * Load canvas registry (.roopik/canvases.json)
	 * Just lists all canvases, not their contents
	 */
	private async getCanvasRegistry(): Promise<CanvasRegistry> {
		const registryPath = getCanvasRegistryPath(this.workspacePath);
		try {
			return await this.readJson<CanvasRegistry>(registryPath);
		} catch {
			return { canvases: [] };
		}
	}

	/**
	 * Create a new canvas
	 * Creates the canvas file with empty components and default preferences
	 */
	async createCanvas(id: string, name: string): Promise<void> {
		this.ensureInitialized();

		// Create canvas file (.roopik/canvases/{id}.json)
		const now = Date.now();
		const canvasFile: CanvasFile = {
			id,
			name,
			createdAt: now,
			updatedAt: now,
			preferences: { ...DEFAULT_CANVAS_PREFERENCES },
			components: {}
		};

		const canvasFilePath = getCanvasPath(this.workspacePath, id);
		await this.writeJson(canvasFilePath, canvasFile);

		// Update registry
		const registry = await this.getCanvasRegistry();
		const canvasInfo: CanvasInfo = {
			id,
			name,
			createdAt: now,
			updatedAt: now
		};
		registry.canvases.push(canvasInfo);
		await this.writeJson(getCanvasRegistryPath(this.workspacePath), registry);
	}

	/**
	 * Get all canvases from registry (lightweight list)
	 */
	async getCanvases(): Promise<CanvasInfo[]> {
		this.ensureInitialized();

		const registry = await this.getCanvasRegistry();
		return registry.canvases;
	}

	/**
	 * Load full canvas file (.roopik/canvases/{canvas-id}.json)
	 * Returns null if canvas doesn't exist
	 */
	async loadCanvasFile(canvasId: string): Promise<CanvasFile | null> {
		this.ensureInitialized();

		const canvasFilePath = getCanvasPath(this.workspacePath, canvasId);

		try {
			return await this.readJson<CanvasFile>(canvasFilePath);
		} catch {
			return null;
		}
	}

	/**
	 * Save full canvas file (.roopik/canvases/{canvas-id}.json)
	 * Also updates the registry (updatedAt timestamp)
	 */
	async saveCanvasFile(canvasFile: CanvasFile): Promise<void> {
		this.ensureInitialized();

		// Save canvas file directly
		const canvasFilePath = getCanvasPath(this.workspacePath, canvasFile.id);
		await this.writeJson(canvasFilePath, canvasFile);

		// Update registry timestamp
		const registry = await this.getCanvasRegistry();
		const entry = registry.canvases.find(c => c.id === canvasFile.id);
		if (entry) {
			entry.updatedAt = canvasFile.updatedAt;
			await this.writeJson(getCanvasRegistryPath(this.workspacePath), registry);
		}
	}

	/**
	 * Delete a canvas and its file
	 */
	async deleteCanvas(canvasId: string): Promise<void> {
		this.ensureInitialized();

		// Delete canvas file
		const canvasFilePath = getCanvasPath(this.workspacePath, canvasId);
		try {
			await fs.promises.unlink(canvasFilePath);
		} catch {
			// Ignore if already deleted
		}

		// Update registry
		const registry = await this.getCanvasRegistry();
		registry.canvases = registry.canvases.filter(c => c.id !== canvasId);
		await this.writeJson(getCanvasRegistryPath(this.workspacePath), registry);
	}

	/**
	 * List all canvas IDs
	 */
	async listCanvases(): Promise<string[]> {
		this.ensureInitialized();

		const registry = await this.getCanvasRegistry();
		return registry.canvases.map(c => c.id);
	}

	/**
	 * Load canvas metadata
	 * Returns the canvas metadata (name, preferences, etc.) from the canvas file
	 */
	async loadCanvasMeta(canvasId: string): Promise<CanvasMeta | null> {
		this.ensureInitialized();

		const canvasFile = await this.loadCanvasFile(canvasId);
		if (!canvasFile) {
			return null;
		}

		return {
			id: canvasFile.id,
			name: canvasFile.name,
			createdAt: canvasFile.createdAt,
			updatedAt: canvasFile.updatedAt,
			componentCount: Object.keys(canvasFile.components).length
		};
	}

	/**
	 * Save canvas metadata
	 * Updates the canvas file with new metadata (name, preferences, etc.)
	 */
	async saveCanvasMeta(canvasId: string, meta: CanvasMeta): Promise<void> {
		this.ensureInitialized();

		const canvasFile = await this.loadCanvasFile(canvasId);
		if (!canvasFile) {
			throw new Error(`Canvas ${canvasId} not found`);
		}

		// Update metadata fields
		canvasFile.name = meta.name;
		canvasFile.updatedAt = Date.now();

		await this.saveCanvasFile(canvasFile);
	}



	// ========================================================================
	// Component Reference Operations (Metadata-Only)
	// ========================================================================

	/**
	 * Add component reference to canvas
	 *
	 * Stores a REFERENCE to component's original location, not a copy!
	 * folderPath + entryFile point to the original source.
	 */
	async addComponentReference(
		canvasId: string,
		componentId: string,
		reference: ComponentReference
	): Promise<void> {
		this.ensureInitialized();

		const canvasFile = await this.loadCanvasFile(canvasId);
		if (!canvasFile) {
			throw new Error(`Canvas ${canvasId} not found`);
		}

		// Add reference to canvas
		canvasFile.components[componentId] = reference;
		canvasFile.updatedAt = Date.now();

		// Save canvas file
		await this.saveCanvasFile(canvasFile);
		console.log(`[WorkspaceStorage] Added component ${componentId} to canvas ${canvasId}`);
	}

	/**
	 * Remove component reference from canvas
	 */
	async removeComponentReference(canvasId: string, componentId: string): Promise<void> {
		this.ensureInitialized();

		const canvasFile = await this.loadCanvasFile(canvasId);
		if (!canvasFile) {
			throw new Error(`Canvas ${canvasId} not found`);
		}

		// Remove reference from canvas
		delete canvasFile.components[componentId];
		canvasFile.updatedAt = Date.now();

		// Save canvas file
		await this.saveCanvasFile(canvasFile);
		console.log(`[WorkspaceStorage] Removed component ${componentId} from canvas ${canvasId}`);
	}

	/**
	 * Get component reference from canvas
	 */
	async getComponentReference(canvasId: string, componentId: string): Promise<ComponentReference | null> {
		const canvasFile = await this.loadCanvasFile(canvasId);
		if (!canvasFile) {
			return null;
		}

		return canvasFile.components[componentId] ?? null;
	}

	/**
	 * List all components in a canvas
	 */
	async listCanvasComponents(canvasId: string): Promise<Array<{ id: string; reference: ComponentReference }>> {
		const canvasFile = await this.loadCanvasFile(canvasId);
		if (!canvasFile) {
			return [];
		}

		return Object.entries(canvasFile.components).map(([id, reference]) => ({ id, reference }));
	}

	/**
	 * Update component reference (e.g., after build, update buildState/contentHash)
	 */
	async updateComponentReference(
		canvasId: string,
		componentId: string,
		updates: Partial<ComponentReference>
	): Promise<void> {
		this.ensureInitialized();

		const canvasFile = await this.loadCanvasFile(canvasId);
		if (!canvasFile) {
			throw new Error(`Canvas ${canvasId} not found`);
		}

		const reference = canvasFile.components[componentId];
		if (!reference) {
			throw new Error(`Component ${componentId} not found in canvas ${canvasId}`);
		}

		// Update fields
		Object.assign(reference, updates);
		reference.updatedAt = Date.now();
		canvasFile.updatedAt = Date.now();

		// Save canvas file
		await this.saveCanvasFile(canvasFile);
	}

	/**
	 * Delete component from canvas
	 * Removes the component reference from the canvas file
	 */
	async deleteComponent(canvasId: string, componentId: string): Promise<void> {
		this.ensureInitialized();

		// Simply remove the component reference from canvas
		await this.removeComponentReference(canvasId, componentId);
	}

	// ========================================================================
	// Project Operations (Mode 2 - Browser Preview)
	// ========================================================================

	/**
	 * Get project index (registry of all projects)
	 * Creates projects folder and registry if they don't exist
	 */
	private async getProjectIndex(): Promise<ProjectIndex> {
		this.ensureInitialized();

		// Ensure projects folder exists
		const projectsPath = getProjectsFolderPath(this.workspacePath);
		await this.ensureDir(projectsPath);

		// Read or create registry
		const registryPath = getProjectRegistryPath(this.workspacePath);
		try {
			return await this.readJson<ProjectIndex>(registryPath);
		} catch {
			// Create default registry
			const defaultIndex = { ...DEFAULT_PROJECT_INDEX };
			await this.writeJson(registryPath, defaultIndex);
			return defaultIndex;
		}
	}

	/**
	 * Get recent projects (sorted by updatedAt, most recent first)
	 * @param limit Max number of projects to return (default: 5)
	 */
	async getRecentProjects(limit: number = 5): Promise<ProjectInfo[]> {
		const index = await this.getProjectIndex();
		return [...index.projects]
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.slice(0, limit);
	}

	/**
	 * Add or update a project in the registry
	 * If project with same path exists, updates updatedAt; otherwise creates new
	 * @param name Display name (e.g., folder name)
	 * @param projectPath Workspace-relative path to project root
	 * @param framework Optional framework identifier (e.g., "react-vite")
	 * @param frameworkDisplayName Optional human-readable framework name (e.g., "React + Vite")
	 * @returns The project ID
	 */
	async upsertProject(name: string, projectPath: string, framework?: string, frameworkDisplayName?: string): Promise<string> {
		this.ensureInitialized();

		const index = await this.getProjectIndex();
		const now = Date.now();
		const normalizedPath = projectPath.replace(/\\/g, '/');

		// Check if project with same path already exists
		const existing = index.projects.find(p => p.path.replace(/\\/g, '/') === normalizedPath);

		if (existing) {
			// Update existing - touch updatedAt and update framework if provided
			existing.name = name;
			existing.updatedAt = now;
			if (framework !== undefined) {
				existing.framework = framework;
			}
			if (frameworkDisplayName !== undefined) {
				existing.frameworkDisplayName = frameworkDisplayName;
			}
			await this.writeJson(getProjectRegistryPath(this.workspacePath), index);
			return existing.id;
		}

		// Create new project
		const projectId = this.generateProjectId(name);
		index.projects.push({
			id: projectId,
			name,
			path: normalizedPath,
			updatedAt: now,
			framework,
			frameworkDisplayName
		});

		await this.writeJson(getProjectRegistryPath(this.workspacePath), index);
		return projectId;
	}

	/**
	 * Delete a project from registry
	 */
	async deleteProject(projectId: string): Promise<void> {
		this.ensureInitialized();

		const index = await this.getProjectIndex();
		index.projects = index.projects.filter(p => p.id !== projectId);
		await this.writeJson(getProjectRegistryPath(this.workspacePath), index);
	}

	// ========================================================================
	// Active Project Metadata
	// ========================================================================

	/**
	 * Set active dev server metadata (called when server starts)
	 */
	async setActiveProject(projectId: string, pid: number, port: number, url: string): Promise<void> {
		this.ensureInitialized();

		const index = await this.getProjectIndex();
		index.activeProject = {
			projectId,
			pid,
			port,
			url,
			startedAt: Date.now()
		};
		await this.writeJson(getProjectRegistryPath(this.workspacePath), index);
	}

	/**
	 * Clear active project metadata (called when server stops)
	 */
	async clearActiveProject(): Promise<void> {
		this.ensureInitialized();

		const index = await this.getProjectIndex();
		delete index.activeProject;
		await this.writeJson(getProjectRegistryPath(this.workspacePath), index);
	}

	/**
	 * Get active project metadata (returns undefined if no server running)
	 */
	async getActiveProject(): Promise<import('../../common/storage/storageTypes.js').ActiveProjectMetadata | undefined> {
		const index = await this.getProjectIndex();
		return index.activeProject;
	}

	// ========================================================================
	// Project ID Generator
	// ========================================================================

	/**
	 * Generate a unique project ID based on project name
	 * Format: proj_{sanitized-name}_{random}
	 * Example: proj_vue-taskflow_k0
	 */
	private generateProjectId(projectName: string): string {
		// Sanitize: lowercase, replace spaces/special chars with hyphens
		const sanitized = projectName
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
			.replace(/^-+|-+$/g, '')       // Remove leading/trailing hyphens
			.substring(0, 50);              // Limit length to 50 chars

		// Add 2-char random suffix for uniqueness
		const random = Math.random().toString(36).substring(2, 4);  // 2 chars
		return `proj_${sanitized}_${random}`;
	}

	// ========================================================================
	// Private Helpers
	// ========================================================================

	private ensureInitialized(): void {
		if (!this.initialized) {
			throw new Error('WorkspaceStorage not initialized. Call initialize() first.');
		}
	}

	private async ensureDir(dirPath: string): Promise<void> {
		await fs.promises.mkdir(dirPath, { recursive: true });
	}

	private async fileExists(filePath: string): Promise<boolean> {
		try {
			await fs.promises.access(filePath, fs.constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}

	private async readFile(filePath: string): Promise<string> {
		return fs.promises.readFile(filePath, 'utf-8');
	}

	private async writeFile(filePath: string, content: string): Promise<void> {
		// Ensure parent directory exists
		await this.ensureDir(dirname(filePath));
		await fs.promises.writeFile(filePath, content, 'utf-8');
	}

	private async readJson<T>(filePath: string): Promise<T> {
		const content = await this.readFile(filePath);
		return JSON.parse(content) as T;
	}

	private async writeJson<T>(filePath: string, data: T): Promise<void> {
		const content = JSON.stringify(data, null, 2);
		await this.writeFile(filePath, content);
	}
}
