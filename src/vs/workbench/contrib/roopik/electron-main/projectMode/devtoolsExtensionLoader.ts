/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { session, Session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Extension manifest entry in manifest.json
 */
interface ExtensionEntry {
	name: string;
	path: string;
	enabled: boolean;
	description?: string;
	chromeWebStoreId?: string;
}

/**
 * DevTools extensions manifest format
 */
interface ExtensionsManifest {
	extensions: ExtensionEntry[];
}

/**
 * Result of loading an extension
 */
interface ExtensionLoadResult {
	name: string;
	success: boolean;
	error?: string;
}

/**
 * DevTools Extension Loader
 *
 * Loads Chrome DevTools extensions (React DevTools, Vue DevTools, etc.)
 * into Electron's session for use with BrowserView DevTools.
 *
 * Extensions are configured in resources/devtools-extensions/manifest.json
 * and the actual extension files are stored in subdirectories.
 *
 * Usage:
 *   1. User downloads extension from Chrome Web Store (via CRX extractor)
 *   2. User extracts to resources/devtools-extensions/<extension-name>/
 *   3. User adds entry to manifest.json with enabled: true
 *   4. Roopik loads extensions on startup
 *
 * Supports: React DevTools, Vue DevTools, Redux DevTools, Angular DevTools,
 *           Preact DevTools, Svelte DevTools, and other DevTools-panel extensions
 *
 * NOT Supported: Extensions requiring chrome.tabs, chrome.storage.sync,
 *                browser UI modifications (toolbars, popups), ad blockers, etc.
 */
export class DevToolsExtensionLoader {
	private static instance: DevToolsExtensionLoader | null = null;
	private loadedExtensions: Map<string, Electron.Extension> = new Map();
	private extensionsDir: string;
	private manifestPath: string;

	private constructor(appPath: string) {
		// Extensions are stored in resources/devtools-extensions/
		this.extensionsDir = path.join(appPath, 'resources', 'devtools-extensions');
		this.manifestPath = path.join(this.extensionsDir, 'manifest.json');
	}

	/**
	 * Get singleton instance
	 */
	static getInstance(appPath: string): DevToolsExtensionLoader {
		if (!DevToolsExtensionLoader.instance) {
			DevToolsExtensionLoader.instance = new DevToolsExtensionLoader(appPath);
		}
		return DevToolsExtensionLoader.instance;
	}

	/**
	 * Load all enabled DevTools extensions into the given session
	 *
	 * @param targetSession - Electron session to load extensions into
	 * @returns Array of load results (success/failure for each extension)
	 */
	async loadExtensions(targetSession: Session): Promise<ExtensionLoadResult[]> {
		const results: ExtensionLoadResult[] = [];

		// Check if extensions directory exists
		if (!fs.existsSync(this.extensionsDir)) {
			return results;
		}

		// Check if manifest exists
		if (!fs.existsSync(this.manifestPath)) {
			return results;
		}

		// Read and parse manifest
		let manifest: ExtensionsManifest;
		try {
			const manifestContent = fs.readFileSync(this.manifestPath, 'utf-8');
			manifest = JSON.parse(manifestContent);
		} catch (e) {
			console.error('[DevToolsExtensions] Failed to parse manifest:', e);
			return results;
		}

		// Validate manifest structure
		if (!manifest.extensions || !Array.isArray(manifest.extensions)) {
			console.error('[DevToolsExtensions] Invalid manifest: missing extensions array');
			return results;
		}

		// Load each enabled extension
		for (const entry of manifest.extensions) {
			if (!entry.enabled) {
				continue;
			}

			const result = await this.loadExtension(targetSession, entry);
			results.push(result);
		}

		return results;
	}

	/**
	 * Load a single extension
	 */
	private async loadExtension(targetSession: Session, entry: ExtensionEntry): Promise<ExtensionLoadResult> {
		const extensionPath = path.join(this.extensionsDir, entry.path);

		// Check if extension directory exists
		if (!fs.existsSync(extensionPath)) {
			console.warn(`[DevToolsExtensions] Extension directory not found: ${extensionPath}`);
			return {
				name: entry.name,
				success: false,
				error: `Directory not found: ${entry.path}`
			};
		}

		// Check if extension has manifest.json
		const extensionManifestPath = path.join(extensionPath, 'manifest.json');
		if (!fs.existsSync(extensionManifestPath)) {
			console.warn(`[DevToolsExtensions] Extension manifest not found: ${extensionManifestPath}`);
			return {
				name: entry.name,
				success: false,
				error: 'Extension manifest.json not found'
			};
		}

		try {
			// Load extension into session
			// Electron's loadExtension returns a Promise<Extension>
			const extension = await targetSession.loadExtension(extensionPath, {
				allowFileAccess: true // Required for some DevTools extensions
			});

			this.loadedExtensions.set(entry.name, extension);

			return {
				name: entry.name,
				success: true
			};
		} catch (e: any) {
			console.error(`[DevToolsExtensions] Failed to load ${entry.name}:`, e);
			return {
				name: entry.name,
				success: false,
				error: e.message || String(e)
			};
		}
	}

	/**
	 * Get list of loaded extensions
	 */
	getLoadedExtensions(): string[] {
		return Array.from(this.loadedExtensions.keys());
	}

	/**
	 * Check if a specific extension is loaded
	 */
	isExtensionLoaded(name: string): boolean {
		return this.loadedExtensions.has(name);
	}

	/**
	 * Reload all extensions (useful after user adds new extension)
	 */
	async reloadExtensions(targetSession: Session): Promise<ExtensionLoadResult[]> {
		// Remove all loaded extensions first
		for (const [name, extension] of this.loadedExtensions) {
			try {
				await targetSession.removeExtension(extension.id);
			} catch (e) {
				console.error(`[DevToolsExtensions] Failed to remove ${name}:`, e);
			}
		}
		this.loadedExtensions.clear();

		// Load fresh
		return this.loadExtensions(targetSession);
	}
}

/**
 * Convenience function to load DevTools extensions into the Roopik browser session
 *
 * Call this once during app startup or when creating the first browser view.
 *
 * @param appPath - Application root path (where resources/ folder is)
 * @returns Array of load results
 */
export async function loadDevToolsExtensions(appPath: string): Promise<ExtensionLoadResult[]> {
	const loader = DevToolsExtensionLoader.getInstance(appPath);

	// Get the Roopik browser session (same partition used by BrowserViewService)
	const browserSession = session.fromPartition('persist:roopik-browser', { cache: true });

	return loader.loadExtensions(browserSession);
}
