/**
 * Formats tool invocation parameters for display.
 */
export function formatToolInvocation(toolName, params) {
    // Native-only: readable format
    const paramsList = Object.entries(params)
        .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
        .join(", ");
    return `Called ${toolName}${paramsList ? ` with ${paramsList}` : ""}`;
}
//# sourceMappingURL=toolResultFormatting.js.map