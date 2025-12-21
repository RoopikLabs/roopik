import { Package } from "@roo/package";
export function getCallbackUrl(provider, uriScheme) {
    return encodeURIComponent(`${uriScheme || "vscode"}://${Package.publisher}.${Package.name}/${provider}`);
}
export function getOpenRouterAuthUrl(uriScheme) {
    return `https://openrouter.ai/auth?callback_url=${getCallbackUrl("openrouter", uriScheme)}`;
}
export function getRequestyAuthUrl(uriScheme) {
    return `https://app.requesty.ai/oauth/authorize?callback_url=${getCallbackUrl("requesty", uriScheme)}`;
}
//# sourceMappingURL=urls.js.map