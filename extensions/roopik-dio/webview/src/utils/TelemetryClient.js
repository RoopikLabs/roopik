import posthog from "posthog-js";
class TelemetryClient {
    static instance;
    static telemetryEnabled = false;
    updateTelemetryState(telemetrySetting, apiKey, distinctId) {
        posthog.reset();
        if (telemetrySetting !== "disabled" && apiKey && distinctId) {
            TelemetryClient.telemetryEnabled = true;
            posthog.init(apiKey, {
                api_host: "https://ph.roocode.com",
                ui_host: "https://us.posthog.com",
                persistence: "localStorage",
                loaded: () => posthog.identify(distinctId),
                capture_pageview: false,
                capture_pageleave: false,
                autocapture: false,
            });
        }
        else {
            TelemetryClient.telemetryEnabled = false;
        }
    }
    static getInstance() {
        if (!TelemetryClient.instance) {
            TelemetryClient.instance = new TelemetryClient();
        }
        return TelemetryClient.instance;
    }
    capture(eventName, properties) {
        if (TelemetryClient.telemetryEnabled) {
            try {
                posthog.capture(eventName, properties);
            }
            catch (_error) {
                // Silently fail if there's an error capturing an event.
            }
        }
    }
}
export const telemetryClient = TelemetryClient.getInstance();
//# sourceMappingURL=TelemetryClient.js.map