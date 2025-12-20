/**
 * Stub CloudService - Roo's cloud features removed
 * This stub exists for compatibility with code that imports CloudService
 * All methods are no-ops
 */

import { ORGANIZATION_ALLOW_ALL, type OrganizationAllowList } from "@roo-code/types"

export interface CloudUserInfo {
	id: string
	email: string
}

export interface CloudOrganizationMembership {
	organizationId: string
	role: string
}

export interface OrganizationSettings {
	mcps?: any[]
	hiddenMcps?: string[]
	hideMarketplaceMcps?: boolean
}

export class CloudService {
	private static _instance: CloudService | null = null

	static hasInstance(): boolean {
		return false // No cloud service
	}

	static get instance(): CloudService {
		if (!this._instance) {
			this._instance = new CloudService()
		}
		return this._instance
	}

	static createInstance(): CloudService {
		// Return singleton instance
		return CloudService.instance
	}

	static isEnabled(): boolean {
		return false // Cloud features disabled
	}

	isAuthenticated(): boolean {
		return false // Never authenticated
	}

	getOrganizationSettings(): OrganizationSettings | undefined {
		return undefined // No org settings
	}

	getUserInfo(): CloudUserInfo | undefined {
		return undefined
	}

	async login(): Promise<void> {
		// No-op
	}

	async logout(): Promise<void> {
		// No-op
	}

	// Task sharing methods (all disabled)
	getAllowList(): OrganizationAllowList {
		return ORGANIZATION_ALLOW_ALL // Return default allow-all list
	}

	canShareTask(): boolean {
		return false // Sharing disabled
	}

	canSharePublicly(): boolean {
		return false // Public sharing disabled
	}

	isTaskSyncEnabled(): boolean {
		return false // Task sync disabled
	}

	getUserSettings(): any {
		return {} // No user settings
	}

	// Remote control
	isRemoteControlEnabled(): boolean {
		return false // Remote control disabled
	}
}

export class BridgeOrchestrator {
	private static _instance: BridgeOrchestrator | null = null

	// Stub for compatibility - all methods disabled
	constructor(...args: any[]) { }

	static getInstance(): BridgeOrchestrator | null {
		if (!this._instance) {
			this._instance = new BridgeOrchestrator()
		}
		return this._instance
	}

	static isEnabled(userInfo?: any, enabled?: boolean): boolean {
		return false // Bridge always disabled
	}

	static async connectOrDisconnect(...args: any[]): Promise<void> {
		// No-op
	}

	static async disconnect(): Promise<void> {
		// No-op
	}

	static async subscribeToTask(task: any): Promise<void> {
		// No-op
	}

	async unsubscribeFromTask(taskId: string): Promise<void> {
		// No-op
	}

	async sendMessage(...args: any[]): Promise<void> {
		// No-op
	}
}

export function getRooCodeApiUrl(): string {
	// Return public API URL for marketplace
	return "https://api.roocode.com"
}

export function getClerkBaseUrl(): string {
	return "" // No Clerk auth needed
}

export const PRODUCTION_CLERK_BASE_URL = ""
