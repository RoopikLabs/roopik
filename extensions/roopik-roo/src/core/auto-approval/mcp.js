export function isMcpToolAlwaysAllowed(mcpServerUse, mcpServers) {
    if (mcpServerUse.type === "use_mcp_tool" && mcpServerUse.toolName) {
        const server = mcpServers?.find((s) => s.name === mcpServerUse.serverName);
        const tool = server?.tools?.find((t) => t.name === mcpServerUse.toolName);
        return tool?.alwaysAllow || false;
    }
    return false;
}
//# sourceMappingURL=mcp.js.map