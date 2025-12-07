/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Logger } from './logger';

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
		/**
		 * Enable style context gathering for AI
		 *
		 * When true:
		 * - Automatically finds related CSS/style files when user clicks element
		 * - Includes style files in AI context for better style modifications
		 * - Helps AI understand CSS Modules, Tailwind, inline styles, etc.
		 *
		 * When false:
		 * - Only sends the component file (like standard IDEs)
		 * - Reduces token usage
		 * - May result in less accurate style suggestions
		 *
		 * Use cases:
		 * - Enable: User frequently asks for style changes ("make it bigger", "change color")
		 * - Disable: Concerns about LLM hallucination or token costs
		 */
		enableStyleContext: boolean;
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
	logging: {
		/**
		 * Log level (TRACE=0, DEBUG=1, INFO=2, WARN=3, ERROR=4, NONE=5)
		 *
		 * - TRACE: Most verbose, includes function entry/exit, variable values
		 * - DEBUG: Debugging information (state changes, intermediate values)
		 * - INFO: General informational messages (normal operations)
		 * - WARN: Warning messages (potential issues)
		 * - ERROR: Error messages only
		 * - NONE: Disable all logging
		 *
		 * Default: INFO (2)
		 */
		level: number;

		/**
		 * Enable file-based logging
		 *
		 * When true:
		 * - Logs are written to .roopik/logs/ directory
		 * - Useful for customer support diagnostics
		 * - Automatic log rotation when size limit reached
		 *
		 * When false:
		 * - Logs only appear in VS Code Output Channel
		 */
		enableFileLogging: boolean;

		/**
		 * Maximum log file size in bytes (default: 10MB)
		 * When exceeded, log file is rotated automatically
		 */
		maxLogFileSize: number;

		/**
		 * Maximum number of log files to keep (default: 5)
		 * Older log files are automatically deleted
		 */
		maxLogFiles: number;

		/**
		 * Auto-show Output Channel on ERROR level logs
		 * Useful for immediate error visibility
		 */
		showOutputOnError: boolean;
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
		enableDesignMemory: true,
		enableStyleContext: true  // Enable by default for better AI suggestions
	},
	plugins: {
		forceRegexMode: false,  // Set to true to test regex mode
		verboseLogging: true,
		frameworkOverrides: {}
	},
	logging: {
		level: 2,  // INFO level (TRACE=0, DEBUG=1, INFO=2, WARN=3, ERROR=4, NONE=5)
		enableFileLogging: true,  // Enable file logging for customer support
		maxLogFileSize: 10 * 1024 * 1024,  // 10MB
		maxLogFiles: 5,  // Keep last 5 log files
		showOutputOnError: true  // Auto-show Output Channel on errors
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
	private logger: ReturnType<typeof Logger.prototype.createScoped>;

	private constructor(workspaceRoot: string) {
		this.configPath = path.join(workspaceRoot, '.roopik', 'config.json');
		this.logger = Logger.getInstance().createScoped('ConfigManager');
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
			this.logger.error('Failed to load config', error);
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
			},
			logging: {
				...DEFAULT_CONFIG.logging,
				...userConfig.logging
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

			this.logger.info('Configuration updated successfully');
		} catch (error) {
			this.logger.error('Failed to save config', error);
			vscode.window.showErrorMessage('Failed to save Roopik configuration.');
		}
	}

	/**
	 * Reload configuration from disk
	 */
	public reload(): void {
		this.config = this.loadConfig();
		this.logger.info('Configuration reloaded');
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
