/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik Logger Service
 *
 * Centralized logging solution with:
 * - Multiple log levels (INFO, WARN, ERROR, DEBUG, TRACE)
 * - VS Code Output Channel integration
 * - File-based log persistence with rotation
 * - Filtering capabilities
 * - Customer support diagnostics
 * - Industry standard practices
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Log levels in order of severity
 */
export enum LogLevel {
	TRACE = 0,
	DEBUG = 1,
	INFO = 2,
	WARN = 3,
	ERROR = 4,
	NONE = 5  // Disable all logging
}

/**
 * Log entry structure for structured logging
 */
interface LogEntry {
	timestamp: string;
	level: string;
	component: string;
	message: string;
	data?: any;
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
	level: LogLevel;
	enableFileLogging: boolean;
	logDirectory: string;
	maxLogFileSize: number;  // In bytes
	maxLogFiles: number;     // Number of log files to keep
	showOutputChannel: boolean;  // Auto-show Output Channel on ERROR
}

/**
 * Centralized Logger Service (Singleton)
 */
export class Logger {
	private static instance: Logger;
	private outputChannel: vscode.OutputChannel;
	private debugChannel: vscode.OutputChannel;
	private config: LoggerConfig;
	private currentLogFile: string | null = null;
	private currentLogFileSize: number = 0;

	private constructor(config: LoggerConfig) {
		this.config = config;
		this.outputChannel = vscode.window.createOutputChannel('Roopik Canvas');
		this.debugChannel = vscode.window.createOutputChannel('Roopik Canvas Debug');

		// Ensure log directory exists
		if (config.enableFileLogging) {
			this.ensureLogDirectory();
			this.rotateLogsIfNeeded();
		}
	}

	/**
	 * Get singleton instance
	 */
	public static getInstance(config?: LoggerConfig): Logger {
		if (!Logger.instance) {
			if (!config) {
				throw new Error('Logger not initialized. Provide config on first call.');
			}
			Logger.instance = new Logger(config);
		} else if (config) {
			// Update config if provided
			Logger.instance.updateConfig(config);
		}
		return Logger.instance;
	}

	/**
	 * Update logger configuration
	 */
	public updateConfig(config: Partial<LoggerConfig>): void {
		this.config = { ...this.config, ...config };

		if (this.config.enableFileLogging) {
			this.ensureLogDirectory();
		}
	}

	/**
	 * Get current log level
	 */
	public getLevel(): LogLevel {
		return this.config.level;
	}

	/**
	 * Set log level
	 */
	public setLevel(level: LogLevel): void {
		this.config.level = level;
		this.info('Logger', `Log level changed to: ${LogLevel[level]}`);
	}

	// ========================================================================
	// PUBLIC LOGGING METHODS
	// ========================================================================

	/**
	 * Log TRACE level message
	 * Use for detailed debugging information (function entry/exit, variable values)
	 */
	public trace(component: string, message: string, data?: any): void {
		this.log(LogLevel.TRACE, component, message, data);
	}

	/**
	 * Log DEBUG level message
	 * Use for debugging information (state changes, intermediate values)
	 */
	public debug(component: string, message: string, data?: any): void {
		this.log(LogLevel.DEBUG, component, message, data);
	}

	/**
	 * Log INFO level message
	 * Use for general informational messages (normal operations, milestones)
	 */
	public info(component: string, message: string, data?: any): void {
		this.log(LogLevel.INFO, component, message, data);
	}

	/**
	 * Log WARN level message
	 * Use for warning messages (potential issues, deprecated usage)
	 */
	public warn(component: string, message: string, data?: any): void {
		this.log(LogLevel.WARN, component, message, data);
	}

	/**
	 * Log ERROR level message
	 * Use for error messages (exceptions, failures)
	 */
	public error(component: string, message: string, error?: any): void {
		this.log(LogLevel.ERROR, component, message, error);

		// Auto-show Output Channel on ERROR if configured
		if (this.config.showOutputChannel) {
			this.showOutputChannel();
		}
	}

	// ========================================================================
	// OUTPUT CHANNEL CONTROLS
	// ========================================================================

	/**
	 * Show the main Roopik Output Channel
	 */
	public showOutputChannel(): void {
		this.outputChannel.show(true); // preserveFocus = true
	}

	/**
	 * Show the Roopik Debug Output Channel
	 */
	public showDebugChannel(): void {
		this.debugChannel.show(true);
	}

	/**
	 * Clear the main Output Channel
	 */
	public clear(): void {
		this.outputChannel.clear();
	}

	/**
	 * Clear the Debug Output Channel
	 */
	public clearDebug(): void {
		this.debugChannel.clear();
	}

	/**
	 * Dispose both Output Channels (cleanup on extension deactivation)
	 */
	public dispose(): void {
		this.outputChannel.dispose();
		this.debugChannel.dispose();
	}

	// ========================================================================
	// CORE LOGGING LOGIC
	// ========================================================================

	/**
	 * Core logging method (private)
	 */
	private log(level: LogLevel, component: string, message: string, data?: any): void {
		// Check if this log level should be output
		if (level < this.config.level) {
			return;
		}

		const timestamp = this.getTimestamp();
		const levelName = LogLevel[level];
		const formattedMessage = this.formatMessage(timestamp, levelName, component, message);

		// Write to appropriate Output Channel
		if (level === LogLevel.TRACE || level === LogLevel.DEBUG) {
			this.debugChannel.appendLine(formattedMessage);
		} else {
			this.outputChannel.appendLine(formattedMessage);
		}

		// Add data if present
		if (data !== undefined) {
			const dataString = this.formatData(data);
			if (level === LogLevel.TRACE || level === LogLevel.DEBUG) {
				this.debugChannel.appendLine(`  ${dataString}`);
			} else {
				this.outputChannel.appendLine(`  ${dataString}`);
			}
		}

		// Write to log file if enabled
		if (this.config.enableFileLogging) {
			const logEntry: LogEntry = {
				timestamp,
				level: levelName,
				component,
				message,
				data
			};
			this.writeToFile(logEntry);
		}
	}

	/**
	 * Format log message for Output Channel
	 */
	private formatMessage(timestamp: string, level: string, component: string, message: string): string {
		const levelPadded = level.padEnd(5, ' ');
		const componentPadded = component.padEnd(20, ' ');
		return `[${timestamp}] ${levelPadded} [${componentPadded}] ${message}`;
	}

	/**
	 * Format data object for display
	 */
	private formatData(data: any): string {
		if (data instanceof Error) {
			return `Error: ${data.message}\n${data.stack || ''}`;
		}

		if (typeof data === 'object') {
			try {
				return JSON.stringify(data, null, 2);
			} catch (err) {
				return String(data);
			}
		}

		return String(data);
	}

	/**
	 * Get current timestamp in ISO format
	 */
	private getTimestamp(): string {
		return new Date().toISOString();
	}

	// ========================================================================
	// FILE-BASED LOGGING
	// ========================================================================

	/**
	 * Ensure log directory exists
	 */
	private ensureLogDirectory(): void {
		try {
			if (!fs.existsSync(this.config.logDirectory)) {
				fs.mkdirSync(this.config.logDirectory, { recursive: true });
			}
		} catch (error) {
			console.error('[Logger] Failed to create log directory:', error);
		}
	}

	/**
	 * Write log entry to file
	 */
	private writeToFile(entry: LogEntry): void {
		try {
			// Get or create current log file
			if (!this.currentLogFile) {
				this.currentLogFile = this.getCurrentLogFilePath();
				this.currentLogFileSize = this.getFileSize(this.currentLogFile);
			}

			// Format log entry as JSON line
			const logLine = JSON.stringify(entry) + '\n';
			const logLineSize = Buffer.byteLength(logLine, 'utf8');

			// Check if we need to rotate log file
			if (this.currentLogFileSize + logLineSize > this.config.maxLogFileSize) {
				this.rotateLogFile();
			}

			// Append to log file
			fs.appendFileSync(this.currentLogFile, logLine, 'utf8');
			this.currentLogFileSize += logLineSize;
		} catch (error) {
			console.error('[Logger] Failed to write to log file:', error);
		}
	}

	/**
	 * Get current log file path
	 */
	private getCurrentLogFilePath(): string {
		const date = new Date();
		const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD
		const fileName = `roopik-canvas-${dateString}.log`;
		return path.join(this.config.logDirectory, fileName);
	}

	/**
	 * Get file size in bytes
	 */
	private getFileSize(filePath: string): number {
		try {
			if (fs.existsSync(filePath)) {
				const stats = fs.statSync(filePath);
				return stats.size;
			}
		} catch (error) {
			console.error('[Logger] Failed to get file size:', error);
		}
		return 0;
	}

	/**
	 * Rotate log file when size limit reached
	 */
	private rotateLogFile(): void {
		if (!this.currentLogFile) return;

		try {
			const timestamp = Date.now();
			const ext = path.extname(this.currentLogFile);
			const base = path.basename(this.currentLogFile, ext);
			const dir = path.dirname(this.currentLogFile);
			const rotatedFile = path.join(dir, `${base}-${timestamp}${ext}`);

			// Rename current log file
			fs.renameSync(this.currentLogFile, rotatedFile);

			// Create new log file
			this.currentLogFile = this.getCurrentLogFilePath();
			this.currentLogFileSize = 0;

			// Clean up old log files
			this.cleanupOldLogFiles();
		} catch (error) {
			console.error('[Logger] Failed to rotate log file:', error);
		}
	}

	/**
	 * Rotate logs on startup if needed
	 */
	private rotateLogsIfNeeded(): void {
		const currentLogFile = this.getCurrentLogFilePath();
		const currentSize = this.getFileSize(currentLogFile);

		if (currentSize > this.config.maxLogFileSize) {
			this.currentLogFile = currentLogFile;
			this.rotateLogFile();
		}
	}

	/**
	 * Clean up old log files (keep only maxLogFiles)
	 */
	private cleanupOldLogFiles(): void {
		try {
			const files = fs.readdirSync(this.config.logDirectory);
			const logFiles = files
				.filter(f => f.startsWith('roopik-canvas-') && f.endsWith('.log'))
				.map(f => ({
					name: f,
					path: path.join(this.config.logDirectory, f),
					mtime: fs.statSync(path.join(this.config.logDirectory, f)).mtime.getTime()
				}))
				.sort((a, b) => b.mtime - a.mtime); // Sort by modification time (newest first)

			// Delete old files beyond maxLogFiles limit
			if (logFiles.length > this.config.maxLogFiles) {
				const filesToDelete = logFiles.slice(this.config.maxLogFiles);
				filesToDelete.forEach(file => {
					try {
						fs.unlinkSync(file.path);
						this.debug('Logger', `Deleted old log file: ${file.name}`);
					} catch (error) {
						console.error('[Logger] Failed to delete old log file:', file.name, error);
					}
				});
			}
		} catch (error) {
			console.error('[Logger] Failed to cleanup old log files:', error);
		}
	}

	// ========================================================================
	// UTILITY METHODS
	// ========================================================================

	/**
	 * Get all log files (for customer support diagnostics)
	 */
	public getLogFiles(): string[] {
		try {
			const files = fs.readdirSync(this.config.logDirectory);
			return files
				.filter(f => f.startsWith('roopik-canvas-') && f.endsWith('.log'))
				.map(f => path.join(this.config.logDirectory, f));
		} catch (error) {
			this.error('Logger', 'Failed to get log files', error);
			return [];
		}
	}

	/**
	 * Export logs for customer support
	 * Returns array of log file paths
	 */
	public exportLogs(destinationDir: string): string[] {
		const exportedFiles: string[] = [];

		try {
			// Ensure destination directory exists
			if (!fs.existsSync(destinationDir)) {
				fs.mkdirSync(destinationDir, { recursive: true });
			}

			// Copy all log files
			const logFiles = this.getLogFiles();
			logFiles.forEach(logFile => {
				const fileName = path.basename(logFile);
				const destPath = path.join(destinationDir, fileName);
				fs.copyFileSync(logFile, destPath);
				exportedFiles.push(destPath);
			});

			this.info('Logger', `Exported ${exportedFiles.length} log files to: ${destinationDir}`);
		} catch (error) {
			this.error('Logger', 'Failed to export logs', error);
		}

		return exportedFiles;
	}

	/**
	 * Create a scoped logger for a specific component
	 * Useful for reducing boilerplate
	 */
	public createScoped(component: string) {
		return {
			trace: (message: string, data?: any) => this.trace(component, message, data),
			debug: (message: string, data?: any) => this.debug(component, message, data),
			info: (message: string, data?: any) => this.info(component, message, data),
			warn: (message: string, data?: any) => this.warn(component, message, data),
			error: (message: string, error?: any) => this.error(component, message, error)
		};
	}
}
