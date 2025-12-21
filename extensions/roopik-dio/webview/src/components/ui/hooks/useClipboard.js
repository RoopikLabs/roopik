import { useState } from "react";
export function useClipboard({ timeout = 2000 } = {}) {
    const [isCopied, setIsCopied] = useState(false);
    const copy = (value) => {
        if (typeof window === "undefined" || !navigator.clipboard?.writeText || !value) {
            return;
        }
        navigator.clipboard.writeText(value).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), timeout);
        });
    };
    return { isCopied, copy };
}
//# sourceMappingURL=useClipboard.js.map