import { useState, useCallback, useEffect, useRef } from "react";
/**
 * Copy text to clipboard with error handling
 */
export const copyToClipboard = async (text, options) => {
    try {
        await navigator.clipboard.writeText(text);
        options?.onSuccess?.();
        return true;
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error("Failed to copy to clipboard");
        options?.onError?.(err);
        console.error("Failed to copy to clipboard:", err);
        return false;
    }
};
/**
 * React hook for managing clipboard copy state with feedback
 */
export const useCopyToClipboard = (feedbackDuration = 2000) => {
    const [showCopyFeedback, setShowCopyFeedback] = useState(false);
    const timeoutRef = useRef(null);
    const copyWithFeedback = useCallback(async (text, e) => {
        e?.stopPropagation();
        // Clear any existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        const success = await copyToClipboard(text, {
            onSuccess: () => {
                setShowCopyFeedback(true);
                timeoutRef.current = setTimeout(() => {
                    setShowCopyFeedback(false);
                    timeoutRef.current = null;
                }, feedbackDuration);
            },
        });
        return success;
    }, [feedbackDuration]);
    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);
    return {
        showCopyFeedback,
        copyWithFeedback,
    };
};
//# sourceMappingURL=clipboard.js.map