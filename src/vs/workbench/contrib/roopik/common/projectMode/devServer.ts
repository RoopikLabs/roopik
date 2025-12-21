/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const IDevServerService = createDecorator<IDevServerService>('devServerService');

/**
 * IPC Channel name for DevServer
 */
export const DEV_SERVER_CHANNEL = 'roopikDevServer';

/**
 * Framework types supported by DevServer
 */
export type Framework =
	| 'react-vite'
	| 'vue-vite'
	| 'svelte-vite'
	| 'solid-vite'
	| 'plain-html-vite'
	| 'nextjs'
	| 'nuxt'
	| 'sveltekit'
	| 'react-cra'
	| 'react-webpack'
	| 'vue-webpack'
	| 'unknown';

/**
 * Server state
 */
export type DevServerState = 'stopped' | 'starting' | 'running' | 'error';

/**
 * Server status event
 */
export interface DevServerStatusEvent {
	projectRoot: string;
	state: DevServerState;
	url?: string;
	port?: number;
	framework?: Framework;
	error?: string;
}

/**
 * Server log event
 */
export interface DevServerLogEvent {
	projectRoot: string;
	level: 'info' | 'warn' | 'error';
	message: string;
}

/**
 * Start server options
 */
export interface DevServerStartOptions {
	projectRoot: string;
	port?: number;
	forceRegexMode?: boolean;
	verboseLogging?: boolean;
}

/**
 * Server info result
 */
export interface DevServerInfo {
	projectRoot: string;
	state: DevServerState;
	url?: string;
	port?: number;
	pid?: number; // Process ID for orphaned process cleanup
	framework?: Framework;
	frameworkDisplayName?: string;
	supportsClickToSource?: boolean;
}

/**
 * Framework detection result
 */
export interface FrameworkInfo {
	framework: Framework;
	displayName: string;
	supported: boolean;
	supportsClickToSource: boolean;
}

/**
 * DevServer Service Interface
 *
 * Manages development server lifecycle for project preview.
 * Each project can have one server running.
 */
export interface IDevServerService {
	readonly _serviceBrand: undefined;

	// ============================================
	// Events
	// ============================================

	/**
	 * Fired when server status changes (starting, running, stopped, error)
	 */
	readonly onStatusChanged: Event<DevServerStatusEvent>;

	/**
	 * Fired when server logs a message
	 */
	readonly onLog: Event<DevServerLogEvent>;

	// ============================================
	// Server Lifecycle
	// ============================================

	/**
	 * Start dev server for a project
	 * @param options - Start options
	 * @returns Server URL when ready
	 */
	startServer(options: DevServerStartOptions): Promise<string>;

	/**
	 * Stop dev server for a project
	 * @param projectRoot - Project root path
	 */
	stopServer(projectRoot: string): Promise<void>;

	/**
	 * Stop all running servers
	 */
	stopAllServers(): Promise<void>;

	/**
	 * Get server info for a project
	 * @param projectRoot - Project root path
	 */
	getServerInfo(projectRoot: string): Promise<DevServerInfo | undefined>;

	/**
	 * Get all running servers
	 */
	getAllServers(): Promise<DevServerInfo[]>;

	/**
	 * Check if any dev server is currently running
	 * @returns Info about the running server, or undefined if none
	 */
	getRunningServer(): Promise<DevServerInfo | undefined>;

	/**
	 * Check if any dev server is running (quick boolean check)
	 */
	isAnyServerRunning(): Promise<boolean>;

	// ============================================
	// Framework Detection
	// ============================================

	/**
	 * Detect framework for a project
	 * @param projectRoot - Project root path
	 */
	detectFramework(projectRoot: string): Promise<FrameworkInfo>;

	/**
	 * Check if project has node_modules installed
	 * @param projectRoot - Project root path
	 */
	hasNodeModules(projectRoot: string): Promise<boolean>;

	/**
	 * Install dependencies for a project
	 * @param projectRoot - Project root path
	 */
	installDependencies(projectRoot: string): Promise<void>;
}
