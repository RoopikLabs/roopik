/**
 * Common character mappings for normalization
 */
export const NORMALIZATION_MAPS = {
    // Smart quotes to regular quotes
    SMART_QUOTES: {
        "\u201C": '"', // Left double quote (U+201C)
        "\u201D": '"', // Right double quote (U+201D)
        "\u2018": "'", // Left single quote (U+2018)
        "\u2019": "'", // Right single quote (U+2019)
    },
    // Other typographic characters
    TYPOGRAPHIC: {
        "\u2026": "...", // Ellipsis
        "\u2014": "-", // Em dash
        "\u2013": "-", // En dash
        "\u00A0": " ", // Non-breaking space
    },
};
/**
 * Default options for normalization
 */
const DEFAULT_OPTIONS = {
    smartQuotes: true,
    typographicChars: true,
    extraWhitespace: true,
    trim: true,
};
/**
 * Normalizes a string based on the specified options
 *
 * @param str The string to normalize
 * @param options Normalization options
 * @returns The normalized string
 */
export function normalizeString(str, options = DEFAULT_OPTIONS) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let normalized = str;
    // Replace smart quotes
    if (opts.smartQuotes) {
        for (const [smart, regular] of Object.entries(NORMALIZATION_MAPS.SMART_QUOTES)) {
            normalized = normalized.replace(new RegExp(smart, "g"), regular);
        }
    }
    // Replace typographic characters
    if (opts.typographicChars) {
        for (const [typographic, regular] of Object.entries(NORMALIZATION_MAPS.TYPOGRAPHIC)) {
            normalized = normalized.replace(new RegExp(typographic, "g"), regular);
        }
    }
    // Normalize whitespace
    if (opts.extraWhitespace) {
        normalized = normalized.replace(/\s+/g, " ");
    }
    // Trim whitespace
    if (opts.trim) {
        normalized = normalized.trim();
    }
    return normalized;
}
/**
 * Unescapes common HTML entities in a string
 *
 * @param text The string containing HTML entities to unescape
 * @returns The unescaped string with HTML entities converted to their literal characters
 */
export function unescapeHtmlEntities(text) {
    if (!text)
        return text;
    return text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#91;/g, "[")
        .replace(/&#93;/g, "]")
        .replace(/&lsqb;/g, "[")
        .replace(/&rsqb;/g, "]")
        .replace(/&amp;/g, "&");
}
//# sourceMappingURL=text-normalization.js.map