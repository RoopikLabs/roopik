/**
 * Stub CloudService - Roo's cloud features removed
 * This stub exists for compatibility with code that imports CloudService
 * All methods are no-ops
 */

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
}

export class BridgeOrchestrator {
	// Stub for compatibility
	constructor(...args: any[]) {}
}

export function getRooCodeApiUrl(): string {
	// Return public API URL for marketplace
	return "https://api.roocode.com"
}
