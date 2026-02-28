/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Webview Logger
 *
 * Provides structured logging for webview components.
 * Logs appear in browser DevTools console.
 */

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Webview Logger
 * Structured logging for React components in webview
 */
class WebviewLogger {
	/**
	 * Log message with context
	 */
	private log(level: LogLevel, component: string, message: string, data?: any): void {
		const prefix = `[${component}]`;
		const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';

		if (data !== undefined) {
			console[consoleMethod](prefix, message, data);
		} else {
			console[consoleMethod](prefix, message);
		}
	}

	/**
	 * Log trace message (most verbose)
	 */
	trace(component: string, message: string, data?: any): void {
		this.log('trace', component, message, data);
	}

	/**
	 * Log debug message
	 */
	debug(component: string, message: string, data?: any): void {
		this.log('debug', component, message, data);
	}

	/**
	 * Log info message
	 */
	info(component: string, message: string, data?: any): void {
		this.log('info', component, message, data);
	}

	/**
	 * Log warning message
	 */
	warn(component: string, message: string, data?: any): void {
		this.log('warn', component, message, data);
	}

	/**
	 * Log error message
	 */
	error(component: string, message: string, error?: any): void {
		this.log('error', component, message, error);
	}

	/**
	 * Create a scoped logger for a component
	 * Reduces boilerplate
	 */
	createScoped(component: string) {
		return {
			trace: (message: string, data?: any) => this.trace(component, message, data),
			debug: (message: string, data?: any) => this.debug(component, message, data),
			info: (message: string, data?: any) => this.info(component, message, data),
			warn: (message: string, data?: any) => this.warn(component, message, data),
			error: (message: string, error?: any) => this.error(component, message, error)
		};
	}
}

// Export singleton instance
export const logger = new WebviewLogger();

// Export scoped logger creator
export const createLogger = (component: string) => logger.createScoped(component);
