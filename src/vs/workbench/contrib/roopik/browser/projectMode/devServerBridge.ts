/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import type {
	IDevServerService,
	DevServerStartOptions,
	DevServerInfo,
	DevServerStatusEvent,
	DevServerLogEvent,
	FrameworkInfo
} from '../../common/projectMode/devServer.js';

/**
 * DevServer Service Bridge
 *
 * Renderer-side proxy that communicates with main process DevServerService via IPC.
 */
export class DevServerBridge implements IDevServerService {
	readonly _serviceBrand: undefined;

	// ============================================
	// Events
	// ============================================

	readonly onStatusChanged: Event<DevServerStatusEvent>;
	readonly onLog: Event<DevServerLogEvent>;

	constructor(private channel: IChannel) {
		this.onStatusChanged = this.channel.listen<DevServerStatusEvent>('onStatusChanged');
		this.onLog = this.channel.listen<DevServerLogEvent>('onLog');
	}

	// ============================================
	// Server Lifecycle
	// ============================================

	async startServer(options: DevServerStartOptions): Promise<string> {
		return this.channel.call('startServer', options);
	}

	async stopServer(projectRoot: string): Promise<void> {
		return this.channel.call('stopServer', projectRoot);
	}

	async stopAllServers(): Promise<void> {
		return this.channel.call('stopAllServers');
	}

	async getServerInfo(projectRoot: string): Promise<DevServerInfo | undefined> {
		return this.channel.call('getServerInfo', projectRoot);
	}

	async getAllServers(): Promise<DevServerInfo[]> {
		return this.channel.call('getAllServers');
	}

	async getRunningServer(): Promise<DevServerInfo | undefined> {
		return this.channel.call('getRunningServer');
	}

	async isAnyServerRunning(): Promise<boolean> {
		return this.channel.call('isAnyServerRunning');
	}

	// ============================================
	// Framework Detection
	// ============================================

	async detectFramework(projectRoot: string): Promise<FrameworkInfo> {
		return this.channel.call('detectFramework', projectRoot);
	}

	async hasNodeModules(projectRoot: string): Promise<boolean> {
		return this.channel.call('hasNodeModules', projectRoot);
	}

	async installDependencies(projectRoot: string): Promise<void> {
		return this.channel.call('installDependencies', projectRoot);
	}
}
