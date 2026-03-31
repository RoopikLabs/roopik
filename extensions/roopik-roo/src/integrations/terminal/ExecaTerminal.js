import { BaseTerminal } from "./BaseTerminal";
import { ExecaTerminalProcess } from "./ExecaTerminalProcess";
import { mergePromise } from "./mergePromise";
export class ExecaTerminal extends BaseTerminal {
    constructor(id, cwd) {
        super("execa", id, cwd);
    }
    /**
     * Unlike the VSCode terminal, this is never closed.
     */
    isClosed() {
        return false;
    }
    runCommand(command, callbacks) {
        this.busy = true;
        const process = new ExecaTerminalProcess(this);
        process.command = command;
        this.process = process;
        process.on("line", (line) => callbacks.onLine(line, process));
        process.once("completed", (output) => callbacks.onCompleted(output, process));
        process.once("shell_execution_started", (pid) => callbacks.onShellExecutionStarted(pid, process));
        process.once("shell_execution_complete", (details) => callbacks.onShellExecutionComplete(details, process));
        const promise = new Promise((resolve, reject) => {
            process.once("continue", () => resolve());
            process.once("error", (error) => reject(error));
            process.run(command);
        });
        return mergePromise(process, promise);
    }
}
//# sourceMappingURL=ExecaTerminal.js.map