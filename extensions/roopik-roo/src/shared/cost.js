function calculateApiCostInternal(modelInfo, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens, totalInputTokens, totalOutputTokens) {
    const cacheWritesCost = ((modelInfo.cacheWritesPrice || 0) / 1_000_000) * cacheCreationInputTokens;
    const cacheReadsCost = ((modelInfo.cacheReadsPrice || 0) / 1_000_000) * cacheReadInputTokens;
    const baseInputCost = ((modelInfo.inputPrice || 0) / 1_000_000) * inputTokens;
    const outputCost = ((modelInfo.outputPrice || 0) / 1_000_000) * outputTokens;
    const totalCost = cacheWritesCost + cacheReadsCost + baseInputCost + outputCost;
    return {
        totalInputTokens,
        totalOutputTokens,
        totalCost,
    };
}
// For Anthropic compliant usage, the input tokens count does NOT include the
// cached tokens.
export function calculateApiCostAnthropic(modelInfo, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens) {
    const cacheCreation = cacheCreationInputTokens || 0;
    const cacheRead = cacheReadInputTokens || 0;
    // For Anthropic: inputTokens does NOT include cached tokens
    // Total input = base input + cache creation + cache reads
    const totalInputTokens = inputTokens + cacheCreation + cacheRead;
    return calculateApiCostInternal(modelInfo, inputTokens, outputTokens, cacheCreation, cacheRead, totalInputTokens, outputTokens);
}
// For OpenAI compliant usage, the input tokens count INCLUDES the cached tokens.
export function calculateApiCostOpenAI(modelInfo, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens) {
    const cacheCreationInputTokensNum = cacheCreationInputTokens || 0;
    const cacheReadInputTokensNum = cacheReadInputTokens || 0;
    const nonCachedInputTokens = Math.max(0, inputTokens - cacheCreationInputTokensNum - cacheReadInputTokensNum);
    // For OpenAI: inputTokens ALREADY includes all tokens (cached + non-cached)
    // So we pass the original inputTokens as the total
    return calculateApiCostInternal(modelInfo, nonCachedInputTokens, outputTokens, cacheCreationInputTokensNum, cacheReadInputTokensNum, inputTokens, outputTokens);
}
export const parseApiPrice = (price) => (price ? parseFloat(price) * 1_000_000 : undefined);
//# sourceMappingURL=cost.js.map