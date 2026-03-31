import workerpool from "workerpool";
import { tiktoken } from "../utils/tiktoken";
async function countTokens(content) {
    try {
        const count = await tiktoken(content);
        return { success: true, count };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
workerpool.worker({ countTokens });
//# sourceMappingURL=countTokens.js.map