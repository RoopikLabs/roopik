/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ILogger, ILoggerService } from '../../../../platform/log/common/log.js';

/**
 * Roopik Logger Service
 *
 * Enterprise-grade logging following VSCode's ILoggerService pattern:
 * - Automatic dual output: Developer Console + Output Panel
 * - VSCode manages channel registration, timestamps, formatting
 * - Simpler code: No manual channel management
 * - Consistent with VSCode contrib services (Tasks, MCP, etc.)
 *
 * Usage:
 * ```typescript
 * const logger = RoopikLogger.create(loggerService);
 * logger.info('[Roopik] Feature activated');
 * logger.warn('[Roopik] Deprecation notice');
 * logger.error('[Roopik] Operation failed', error);
 * ```
 */
export class RoopikLogger {
	static readonly LOGGER_ID = 'roopik';
	static readonly LOGGER_NAME = 'Roopik';

	/**
	 * Create a Roopik logger
	 * Automatically logs to both Developer Console and Output Panel
	 */
	static create(loggerService: ILoggerService): ILogger {
		return loggerService.createLogger(RoopikLogger.LOGGER_ID, {
			name: RoopikLogger.LOGGER_NAME
		});
	}
}
