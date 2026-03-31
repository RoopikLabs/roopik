import * as path from "path";
import { ShadowCheckpointService } from "./ShadowCheckpointService";
export class RepoPerTaskCheckpointService extends ShadowCheckpointService {
    static create({ taskId, workspaceDir, shadowDir, log = console.log }) {
        return new RepoPerTaskCheckpointService(taskId, path.join(shadowDir, "tasks", taskId, "checkpoints"), workspaceDir, log);
    }
}
//# sourceMappingURL=RepoPerTaskCheckpointService.js.map