import { parsePatch } from "diff";
/**
 * Parse a unified diff string into a flat list of renderable lines with
 * line numbers, addition/deletion/context flags, and compact "gap" separators
 * between hunks.
 */
export function parseUnifiedDiff(source, filePath) {
    if (!source)
        return [];
    try {
        const patches = parsePatch(source);
        if (!patches || patches.length === 0)
            return [];
        const patch = filePath
            ? (patches.find((p) => [p.newFileName, p.oldFileName].some((n) => typeof n === "string" && (n === filePath || n.endsWith("/" + filePath)))) ?? patches[0])
            : patches[0];
        if (!patch)
            return [];
        const lines = [];
        let prevHunk = null;
        for (const hunk of patch.hunks || []) {
            // Insert a compact "hidden lines" separator between hunks
            if (prevHunk) {
                const gapNew = hunk.newStart - (prevHunk.newStart + prevHunk.newLines);
                const gapOld = hunk.oldStart - (prevHunk.oldStart + prevHunk.oldLines);
                const hidden = Math.max(gapNew, gapOld);
                if (hidden > 0) {
                    lines.push({
                        oldLineNum: null,
                        newLineNum: null,
                        type: "gap",
                        content: "",
                        hiddenCount: hidden,
                    });
                }
            }
            let oldLine = hunk.oldStart;
            let newLine = hunk.newStart;
            for (const raw of hunk.lines || []) {
                const firstChar = raw[0];
                const content = raw.slice(1);
                if (firstChar === "-") {
                    lines.push({
                        oldLineNum: oldLine,
                        newLineNum: null,
                        type: "deletion",
                        content,
                    });
                    oldLine++;
                }
                else if (firstChar === "+") {
                    lines.push({
                        oldLineNum: null,
                        newLineNum: newLine,
                        type: "addition",
                        content,
                    });
                    newLine++;
                }
                else {
                    // Context line
                    lines.push({
                        oldLineNum: oldLine,
                        newLineNum: newLine,
                        type: "context",
                        content,
                    });
                    oldLine++;
                    newLine++;
                }
            }
            prevHunk = hunk;
        }
        return lines;
    }
    catch {
        // swallow parse errors and render nothing rather than breaking the UI
        return [];
    }
}
//# sourceMappingURL=parseUnifiedDiff.js.map