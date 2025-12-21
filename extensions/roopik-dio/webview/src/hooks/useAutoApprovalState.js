import { useMemo } from "react";
export function useAutoApprovalState(toggles, autoApprovalEnabled) {
    const hasEnabledOptions = useMemo(() => {
        return Object.values(toggles).some((value) => !!value);
    }, [toggles]);
    const effectiveAutoApprovalEnabled = useMemo(() => {
        return autoApprovalEnabled ?? false;
    }, [autoApprovalEnabled]);
    return {
        hasEnabledOptions,
        effectiveAutoApprovalEnabled,
    };
}
//# sourceMappingURL=useAutoApprovalState.js.map