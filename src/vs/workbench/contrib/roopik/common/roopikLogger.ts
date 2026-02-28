/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ILogger, ILoggerService } from '../../../../platform/log/common/log.js';

/**
 * Roopik Logger Helper
 *
 * Creates a logger with automatic context (file/class name).
 * All logs appear in Output Panel > Roopik with source information.
 *
 * Usage:
 * ```typescript
 * export class MyService {
 *   private readonly logger = getRoopikLogger(loggerService, 'MyService');
 *
 *   doSomething() {
 *     this.logger.info('Operation started');
 *     // Output: [MyService] Operation started
 *   }
 * }
 * ```
 */

/**
 * Get a Roopik logger with context
 *
 * @param loggerService - Injected logger service
 * @param context - Class/file name for identifying log source
 */
export function getRoopikLogger(loggerService: ILoggerService, context: string): ILogger {
	const logger = loggerService.createLogger('roopik', { name: 'Roopik' });

	return {
		onDidChangeLogLevel: logger.onDidChangeLogLevel,
		getLevel: () => logger.getLevel(),
		setLevel: (level) => logger.setLevel(level),

		trace: (message: string, ...args: any[]) => {
			logger.trace(`[${context}] ${message}`, ...args);
		},

		debug: (message: string, ...args: any[]) => {
			logger.debug(`[${context}] ${message}`, ...args);
		},

		info: (message: string, ...args: any[]) => {
			logger.info(`[${context}] ${message}`, ...args);
		},

		warn: (message: string, ...args: any[]) => {
			logger.warn(`[${context}] ${message}`, ...args);
		},

		error: (message: string | Error, ...args: any[]) => {
			logger.error(`[${context}] ${message}`, ...args);
		},

		flush: () => logger.flush(),

		dispose: () => {
			// No-op: underlying logger is managed by VS Code
		}
	};
}
