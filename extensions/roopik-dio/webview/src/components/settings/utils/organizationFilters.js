export const filterProviders = (providers, organizationAllowList) => {
    if (!organizationAllowList || organizationAllowList.allowAll) {
        return providers;
    }
    return providers.filter((provider) => {
        const providerConfig = organizationAllowList.providers[provider.value];
        if (!providerConfig) {
            return false;
        }
        return providerConfig.allowAll || (providerConfig.models && providerConfig.models.length > 0);
    });
};
export const filterModels = (models, providerId, organizationAllowList) => {
    if (!models || !organizationAllowList || organizationAllowList.allowAll) {
        return models;
    }
    if (!providerId) {
        return {};
    }
    const providerConfig = organizationAllowList.providers[providerId];
    if (!providerConfig) {
        return {};
    }
    if (providerConfig.allowAll) {
        return models;
    }
    const allowedModels = providerConfig.models || [];
    const filteredModels = {};
    for (const modelId of allowedModels) {
        if (models[modelId]) {
            filteredModels[modelId] = models[modelId];
        }
    }
    return filteredModels;
};
//# sourceMappingURL=organizationFilters.js.map