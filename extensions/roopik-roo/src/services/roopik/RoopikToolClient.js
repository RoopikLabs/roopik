/**
 * RoopikToolClient
 *
 * Client for calling Roopik IDE tools from roopik-roo extension.
 * Communicates with Roopik core via VSCode commands → IPC channel.
 *
 * Architecture:
 * RoopikToolClient → vscode.commands.executeCommand() → roopikToolsCommands → IPC → RoopikToolsChannel
 *
 * Usage:
 * ```typescript
 * const client = RoopikToolClient.getInstance();
 * const result = await client.screenshot();
 * if (result.success) {
 *   console.log('Screenshot:', result.data.image);
 * }
 * ```
 */
import * as vscode from "vscode";
// ============================================================================
// Client Implementation
// ============================================================================
/**
 * RoopikToolClient - Singleton client for Roopik IDE tools
 */
export class RoopikToolClient {
    static instance = null;
    constructor() { }
    /**
     * Get the singleton instance
     */
    static getInstance() {
        if (!RoopikToolClient.instance) {
            RoopikToolClient.instance = new RoopikToolClient();
        }
        return RoopikToolClient.instance;
    }
    /**
     * Check if Roopik IDE is available
     * Returns true if the roopik.executeTool command is registered
     */
    async isAvailable() {
        const commands = await vscode.commands.getCommands(true);
        return commands.includes("roopik.executeTool");
    }
    // ========================================================================
    // Generic Tool Execution
    // ========================================================================
    /**
     * Execute any Roopik tool by name
     * Use this for dynamic tool calls or tools not yet exposed via typed methods
     */
    async executeTool(tool, args) {
        try {
            const result = await vscode.commands.executeCommand("roopik.executeTool", { tool, args });
            return result || { success: false, error: "No result from command" };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    // ========================================================================
    // Browser Tools
    // ========================================================================
    /**
     * Open the browser preview
     * Optionally navigate to a URL after opening
     */
    async browserOpen(url) {
        return this.executeCommand("roopik.tools.browserOpen", { url });
    }
    /**
     * Take a screenshot of the browser
     * Returns base64-encoded image with viewport metadata for pixel-perfect clicking
     */
    async screenshot() {
        return this.executeCommand("roopik.tools.screenshot");
    }
    /**
     * Close the browser view
     */
    async browserClose() {
        return this.executeCommand("roopik.tools.browserClose");
    }
    /**
     * Perform browser input actions (click, type, press, scroll, hover, drag)
     * Coordinate format: 'x,y@WIDTHxHEIGHT' where WIDTH/HEIGHT are from screenshot viewport
     */
    async browserAction(options) {
        return this.executeCommand("roopik.tools.browserAction", options);
    }
    /**
     * Get browser performance metrics including Web Vitals
     */
    async browserGetPerformance() {
        return this.executeCommand("roopik.tools.browserGetPerformance");
    }
    /**
     * Get browser state information (open/closed, current URL, title)
     */
    async browserGetState() {
        return this.executeCommand("roopik.tools.browserGetState");
    }
    /**
     * Set or clear browser viewport override
     * @param width Viewport width in pixels (omit to clear override)
     * @param height Viewport height in pixels (omit to clear override)
     * @param deviceScaleFactor Device scale factor (default: 1)
     * @param mobile Emulate mobile device (default: false)
     */
    async browserSetViewport(width, height, deviceScaleFactor, mobile) {
        return this.executeCommand("roopik.tools.browserSetViewport", {
            width,
            height,
            deviceScaleFactor,
            mobile,
        });
    }
    /**
     * Get network requests
     * @param options Filter options for network requests
     */
    async browserGetNetworkRequests(options) {
        return this.executeCommand("roopik.tools.browserGetNetworkRequests", options);
    }
    /**
     * Navigate the browser to a URL
     */
    async navigate(url) {
        return this.executeCommand("roopik.tools.navigate", { url });
    }
    /**
     * Reload the current page
     * @param ignoreCache - If true, performs hard reload (clears cache)
     */
    async reload(ignoreCache) {
        return this.executeCommand("roopik.tools.reload", { ignoreCache });
    }
    /**
     * Execute JavaScript in the browser context
     */
    async executeScript(script) {
        return this.executeCommand("roopik.tools.executeScript", { script });
    }
    /**
     * Inspect an element - THE MOAT
     * Returns computed styles, CSS source locations, element tree
     */
    async inspectElement(selector, includeInherited) {
        return this.executeCommand("roopik.tools.inspectElement", {
            selector,
            includeInherited,
        });
    }
    // ========================================================================
    // CDP Tools (Browser Debugging)
    // ========================================================================
    /**
     * Get all errors from the browser (console errors + network failures)
     */
    async getErrors(limit) {
        return this.executeCommand("roopik.tools.getErrors", { limit });
    }
    /**
     * Get console logs from the browser
     */
    async getConsoleLogs(limit, type) {
        return this.executeCommand("roopik.tools.getConsoleLogs", { limit, type });
    }
    // ========================================================================
    // Project Tools
    // ========================================================================
    /**
     * Get information about the currently running project
     */
    async getActiveProject() {
        return this.executeCommand("roopik.tools.getActiveProject");
    }
    /**
     * Start a project (dev server + browser)
     */
    async startProject(projectPath, port) {
        return this.executeCommand("roopik.tools.startProject", {
            projectPath,
            port,
        });
    }
    /**
     * Stop the currently running project
     */
    async stopProject() {
        return this.executeCommand("roopik.tools.stopProject");
    }
    // ========================================================================
    // Canvas Tools
    // ========================================================================
    /**
     * List all canvases
     */
    async listCanvases(options) {
        return this.executeCommand("roopik.tools.listCanvases", options);
    }
    /**
     * Get the currently focused canvas
     */
    async getActiveCanvas() {
        return this.executeCommand("roopik.tools.getActiveCanvas");
    }
    /**
     * Create a new canvas
     */
    async createCanvas(name) {
        return this.executeCommand("roopik.tools.createCanvas", { name });
    }
    /**
     * Open an existing canvas by ID or name
     */
    async openCanvas(canvasId, name) {
        return this.executeCommand("roopik.tools.openCanvas", { canvasId, name });
    }
    // ========================================================================
    // Component Tools
    // ========================================================================
    /**
     * Add a component to a canvas
     */
    async addComponent(options) {
        return this.executeCommand("roopik.tools.addComponent", options);
    }
    /**
     * Add multiple components at once
     */
    async addComponents(components) {
        return this.executeCommand("roopik.tools.addComponents", { components });
    }
    /**
     * Remove a component from its canvas
     * @param componentId The component's unique ID
     * @param deleteSourceCode If true, also delete the source code files from disk (default: false)
     */
    async removeComponent(componentId, deleteSourceCode) {
        return this.executeCommand("roopik.tools.removeComponent", {
            componentId,
            deleteSourceCode,
        });
    }
    /**
     * Get detailed information about a component
     */
    async getComponentInfo(componentId) {
        return this.executeCommand("roopik.tools.getComponentInfo", {
            componentId,
        });
    }
    /**
     * List all components in a canvas
     */
    async listComponents(canvasId) {
        return this.executeCommand("roopik.tools.listComponents", { canvasId });
    }
    /**
     * Trigger a rebuild of a component
     */
    async rebuildComponent(componentId) {
        return this.executeCommand("roopik.tools.rebuildComponent", {
            componentId,
        });
    }
    /**
     * Validate all components in a canvas
     * Returns summary (total, success, failed, building) + detailed errors for failed components
     */
    async validateComponents(canvasId) {
        return this.executeCommand("roopik.tools.validateComponents", {
            canvasId,
        });
    }
    // ========================================================================
    // Internal Helpers
    // ========================================================================
    async executeCommand(command, args) {
        try {
            const result = await vscode.commands.executeCommand(command, args);
            return result || { success: false, error: "No result from command" };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
// Export singleton instance
export const roopikClient = RoopikToolClient.getInstance();
//# sourceMappingURL=RoopikToolClient.js.map