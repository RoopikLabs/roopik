import axios from "axios";
import * as yaml from "yaml";
import { z } from "zod";
import { modeMarketplaceItemSchema, mcpMarketplaceItemSchema, } from "@roo-code/types";
import { getRooCodeApiUrl } from "@roo-code/cloud";
const modeMarketplaceResponse = z.object({
    items: z.array(modeMarketplaceItemSchema),
});
const mcpMarketplaceResponse = z.object({
    items: z.array(mcpMarketplaceItemSchema),
});
export class RemoteConfigLoader {
    apiBaseUrl;
    cache = new Map();
    cacheDuration = 5 * 60 * 1000; // 5 minutes
    constructor() {
        this.apiBaseUrl = getRooCodeApiUrl();
    }
    async loadAllItems(hideMarketplaceMcps = false) {
        const items = [];
        const modesPromise = this.fetchModes();
        const mcpsPromise = hideMarketplaceMcps ? Promise.resolve([]) : this.fetchMcps();
        const [modes, mcps] = await Promise.all([modesPromise, mcpsPromise]);
        items.push(...modes, ...mcps);
        return items;
    }
    async fetchModes() {
        const cacheKey = "modes";
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            return cached;
        }
        const data = await this.fetchWithRetry(`${this.apiBaseUrl}/api/marketplace/modes`);
        const yamlData = yaml.parse(data);
        const validated = modeMarketplaceResponse.parse(yamlData);
        const items = validated.items.map((item) => ({
            type: "mode",
            ...item,
        }));
        this.setCache(cacheKey, items);
        return items;
    }
    async fetchMcps() {
        const cacheKey = "mcps";
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            return cached;
        }
        const data = await this.fetchWithRetry(`${this.apiBaseUrl}/api/marketplace/mcps`);
        const yamlData = yaml.parse(data);
        const validated = mcpMarketplaceResponse.parse(yamlData);
        const items = validated.items.map((item) => ({
            type: "mcp",
            ...item,
        }));
        this.setCache(cacheKey, items);
        return items;
    }
    async fetchWithRetry(url, maxRetries = 3) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await axios.get(url, {
                    timeout: 10000, // 10 second timeout
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                    },
                });
                return response.data;
            }
            catch (error) {
                lastError = error;
                if (i < maxRetries - 1) {
                    // Exponential backoff: 1s, 2s, 4s
                    const delay = Math.pow(2, i) * 1000;
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError;
    }
    async getItem(id, type) {
        const items = await this.loadAllItems();
        return items.find((item) => item.id === id && item.type === type) || null;
    }
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached)
            return null;
        const now = Date.now();
        if (now - cached.timestamp > this.cacheDuration) {
            this.cache.delete(key);
            return null;
        }
        return cached.data;
    }
    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
        });
    }
    clearCache() {
        this.cache.clear();
    }
}
//# sourceMappingURL=RemoteConfigLoader.js.map