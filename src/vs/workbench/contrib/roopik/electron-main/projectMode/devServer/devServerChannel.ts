/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { IServerChannel } from '../../../../../../base/parts/ipc/common/ipc.js';
import type { IDevServerService } from '../../../common/projectMode/devServer.js';

/**
 * IPC Channel for DevServer
 *
 * Routes calls from renderer process to main process DevServerService.
 */
export class DevServerChannel implements IServerChannel {
	constructor(private service: IDevServerService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onStatusChanged':
				return this.service.onStatusChanged;
			case 'onLog':
				return this.service.onLog;
			default:
				throw new Error(`[DevServerChannel] Unknown event: ${event}`);
		}
	}

	call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			// Server Lifecycle
			case 'startServer':
				return this.service.startServer(arg);
			case 'stopServer':
				return this.service.stopServer(arg);
			case 'stopAllServers':
				return this.service.stopAllServers();
			case 'getServerInfo':
				return this.service.getServerInfo(arg);
			case 'getAllServers':
				return this.service.getAllServers();
			case 'getRunningServer':
				return this.service.getRunningServer();
			case 'isAnyServerRunning':
				return this.service.isAnyServerRunning();

			// Framework Detection
			case 'detectFramework':
				return this.service.detectFramework(arg);
			case 'hasNodeModules':
				return this.service.hasNodeModules(arg);
			case 'installDependencies':
				return this.service.installDependencies(arg);

			default:
				throw new Error(`[DevServerChannel] Unknown command: ${command}`);
		}
	}
}
