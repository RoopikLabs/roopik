/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Logger Module
 *
 * Structured logging for dev server worker process.
 * Outputs formatted messages with timestamps and levels.
 */

// ============================================
// Log Levels
// ============================================

export const LogLevel = {
	DEBUG: 'debug',
	INFO: 'info',
	WARN: 'warn',
	ERROR: 'error',
	SUCCESS: 'success'
};

// ============================================
// Formatting
// ============================================

/**
 * Get current timestamp in HH:MM:SS format
 */
function getTimestamp() {
	return new Date().toISOString().split('T')[1].slice(0, 8);
}

/**
 * Get icon for log level
 */
function getIcon(level) {
	switch (level) {
		case LogLevel.DEBUG: return '🔍';
		case LogLevel.INFO: return '📋';
		case LogLevel.WARN: return '⚠️';
		case LogLevel.ERROR: return '❌';
		case LogLevel.SUCCESS: return '✅';
		default: return '•';
	}
}

// ============================================
// Logger Class
// ============================================

export class Logger {
	constructor(prefix = 'Worker') {
		this.prefix = prefix;
		this.debugEnabled = process.env.ROOPIK_DEBUG === '1';
	}

	/**
	 * Log a message
	 */
	log(level, message, ...args) {
		const timestamp = getTimestamp();
		const icon = getIcon(level);
		const formatted = `[${timestamp}] ${icon} [${this.prefix}] ${message}`;

		switch (level) {
			case LogLevel.ERROR:
				console.error(formatted, ...args);
				break;
			case LogLevel.WARN:
				console.warn(formatted, ...args);
				break;
			case LogLevel.DEBUG:
				if (this.debugEnabled) {
					console.log(formatted, ...args);
				}
				break;
			default:
				console.log(formatted, ...args);
		}
	}

	debug(message, ...args) {
		this.log(LogLevel.DEBUG, message, ...args);
	}

	info(message, ...args) {
		this.log(LogLevel.INFO, message, ...args);
	}

	warn(message, ...args) {
		this.log(LogLevel.WARN, message, ...args);
	}

	error(message, ...args) {
		this.log(LogLevel.ERROR, message, ...args);
	}

	success(message, ...args) {
		this.log(LogLevel.SUCCESS, message, ...args);
	}

	/**
	 * Log a section header
	 */
	section(title) {
		console.log('');
		console.log('═'.repeat(50));
		console.log(`  ${title}`);
		console.log('═'.repeat(50));
	}

	/**
	 * Log a step in a pipeline
	 */
	step(number, message, passed = null) {
		const status = passed === null ? '' : passed ? '✓' : '✗';
		console.log(`  Step ${number}: ${message} ${status}`);
	}

	/**
	 * Log pipeline result
	 */
	result(success, message) {
		console.log('');
		if (success) {
			console.log('═'.repeat(50));
			console.log(`  ✅ ${message}`);
			console.log('═'.repeat(50));
		} else {
			console.log('─'.repeat(50));
			console.log(`  ❌ ${message}`);
			console.log('─'.repeat(50));
		}
		console.log('');
	}
}

// Default logger instance
export const logger = new Logger('Roopik');
