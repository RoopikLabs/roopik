/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Roopik Configuration Schema
 * Loaded from .roopik/config.json in the workspace root
 */
export interface RoopikConfig {
	performance: {
		maxCanvases: number;
		warnAtCanvases: number;
		maxComponentsPerCanvas: number;
		enableGPUAcceleration: boolean;
	};
	canvas: {
		autoSaveInterval: number;
		enableCrashRecovery: boolean;
		restoreLastSession: boolean;
		showDashboardOnStartup: boolean;
	};
	ai: {
		enableContextIsolation: boolean;
		maxChatHistory: number;
		enableDesignMemory: boolean;
	};
	plugins: {
		/**
		 * Force regex-based transformation for all frameworks
		 *
		 * When true:
		 * - Skips AST-based transformation (Babel, Vue SFC, etc.)
		 * - Always uses regex fallback
		 *
		 * When false (default):
		 * - Tries AST-based first (more accurate)
		 * - Falls back to regex if AST fails
		 *
		 * Use cases:
		 * - Testing regex implementation
		 * - Debugging AST issues
		 * - Performance comparison
		 */
		forceRegexMode: boolean;

		/**
		 * Enable verbose logging for plugin transformations
		 */
		verboseLogging: boolean;

		/**
		 * Framework-specific overrides (future use)
		 */
		frameworkOverrides?: {
			[framework: string]: {
				forceRegex?: boolean;
			};
		};
	};
}

/**
 * Default configuration if .roopik/config.json doesn't exist
 */
const DEFAULT_CONFIG: RoopikConfig = {
	performance: {
		maxCanvases: 5,
		warnAtCanvases: 3,
		maxComponentsPerCanvas: 100,
		enableGPUAcceleration: true
	},
	canvas: {
		autoSaveInterval: 30000, // 30 seconds
		enableCrashRecovery: true,
		restoreLastSession: true,
		showDashboardOnStartup: true
	},
	ai: {
		enableContextIsolation: true,
		maxChatHistory: 50,
		enableDesignMemory: true
	},
	plugins: {
		forceRegexMode: false,  // Set to true to test regex mode
		verboseLogging: true,
		frameworkOverrides: {}
	}
};

/**
 * Configuration Manager
 * Handles loading, saving, and validating Roopik configuration
 */
export class ConfigManager {
	private static instance: ConfigManager;
	private config: RoopikConfig;
	private configPath: string;

	private constructor(workspaceRoot: string) {
		this.configPath = path.join(workspaceRoot, '.roopik', 'config.json');
		this.config = this.loadConfig();
	}

	/**
	 * Get singleton instance
	 */
	public static getInstance(workspaceRoot: string): ConfigManager {
		if (!ConfigManager.instance) {
			ConfigManager.instance = new ConfigManager(workspaceRoot);
		}
		return ConfigManager.instance;
	}

	/**
	 * Load configuration from .roopik/config.json
	 * Falls back to default config if file doesn't exist or is invalid
	 */
	private loadConfig(): RoopikConfig {
		try {
			if (fs.existsSync(this.configPath)) {
				const configFile = fs.readFileSync(this.configPath, 'utf8');
				const userConfig = JSON.parse(configFile) as Partial<RoopikConfig>;

				// Merge with defaults (in case user config is partial)
				return this.mergeWithDefaults(userConfig);
			}
		} catch (error) {
			console.error('[Roopik Config] Failed to load config:', error);
			vscode.window.showWarningMessage(
				'Failed to load Roopik config. Using defaults.'
			);
		}

		// Return default config if file doesn't exist or failed to load
		return { ...DEFAULT_CONFIG };
	}

	/**
	 * Merge user config with defaults (handles partial configs)
	 */
	private mergeWithDefaults(userConfig: Partial<RoopikConfig>): RoopikConfig {
		return {
			performance: {
				...DEFAULT_CONFIG.performance,
				...userConfig.performance
			},
			canvas: {
				...DEFAULT_CONFIG.canvas,
				...userConfig.canvas
			},
			ai: {
				...DEFAULT_CONFIG.ai,
				...userConfig.ai
			},
			plugins: {
				...DEFAULT_CONFIG.plugins,
				...userConfig.plugins
			}
		};
	}

	/**
	 * Get current configuration
	 */
	public getConfig(): RoopikConfig {
		return this.config;
	}

	/**
	 * Update configuration and save to disk
	 */
	public async updateConfig(updates: Partial<RoopikConfig>): Promise<void> {
		this.config = this.mergeWithDefaults({ ...this.config, ...updates });

		try {
			const configDir = path.dirname(this.configPath);

			// Ensure .roopik directory exists
			if (!fs.existsSync(configDir)) {
				fs.mkdirSync(configDir, { recursive: true });
			}

			// Write config to disk
			fs.writeFileSync(
				this.configPath,
				JSON.stringify(this.config, null, '\t'),
				'utf8'
			);

			console.log('[Roopik Config] Configuration updated successfully');
		} catch (error) {
			console.error('[Roopik Config] Failed to save config:', error);
			vscode.window.showErrorMessage('Failed to save Roopik configuration.');
		}
	}

	/**
	 * Reload configuration from disk
	 */
	public reload(): void {
		this.config = this.loadConfig();
		console.log('[Roopik Config] Configuration reloaded');
	}

	/**
	 * Get canvas state file path for a given canvas ID
	 */
	public getCanvasStatePath(canvasId: string): string {
		const workspaceRoot = path.dirname(path.dirname(this.configPath));
		return path.join(workspaceRoot, '.roopik', `canvas-${canvasId}.json`);
	}

	/**
	 * Get AI context file path for a given canvas ID
	 */
	public getAIContextPath(canvasId: string): string {
		const workspaceRoot = path.dirname(path.dirname(this.configPath));
		return path.join(workspaceRoot, '.roopik', 'ai-contexts', `${canvasId}.json`);
	}

	/**
	 * Get session file path (stores last open canvas IDs)
	 */
	public getSessionPath(): string {
		const workspaceRoot = path.dirname(path.dirname(this.configPath));
		return path.join(workspaceRoot, '.roopik', 'session.json');
	}

	/**
	 * Check if regex mode is forced
	 * @returns {boolean}
	 */
	public isRegexModeForced(): boolean {
		return this.config.plugins.forceRegexMode;
	}

	/**
	 * Get plugin strategy for a specific framework
	 * @param {string} framework - Framework identifier
	 * @returns {Object} Strategy configuration
	 */
	public getPluginStrategy(framework: string): {
		forceRegex: boolean;
		verboseLogging: boolean;
	} {
		// Check framework-specific override first
		const override = this.config.plugins.frameworkOverrides?.[framework];
		if (override) {
			return {
				forceRegex: override.forceRegex ?? this.isRegexModeForced(),
				verboseLogging: this.config.plugins.verboseLogging
			};
		}

		// Return global strategy
		return {
			forceRegex: this.isRegexModeForced(),
			verboseLogging: this.config.plugins.verboseLogging
		};
	}
}
