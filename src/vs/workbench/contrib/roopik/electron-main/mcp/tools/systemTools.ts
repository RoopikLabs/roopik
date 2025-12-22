/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * System/Utility Tools
 *
 * MCP tools for health checks and system status.
 */

/**
 * Register all system/utility MCP tools
 *
 * @param server - McpServer instance (dynamically imported)
 * @param z - Zod validation library (dynamically imported)
 */
export function registerSystemTools(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	server: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	z: any
): void {

	// --------------------------------------------------------------
	// TOOL: Ping (Health Check)
	// --------------------------------------------------------------
	server.tool(
		'roopik_ping',
		'Health check - verifies MCP server is running and responsive',
		{},
		async () => {
			return {
				content: [{
					type: 'text' as const,
					text: JSON.stringify({
						success: true,
						message: 'Roopik MCP Server is running',
						timestamp: new Date().toISOString(),
						version: '1.0.0'
					})
				}]
			};
		}
	);

	console.log('[MCP] Registered 1 system tool: ping');
}
