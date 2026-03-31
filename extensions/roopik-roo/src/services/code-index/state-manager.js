import * as vscode from "vscode";
export class CodeIndexStateManager {
    _systemStatus = "Standby";
    _statusMessage = "";
    _processedItems = 0;
    _totalItems = 0;
    _currentItemUnit = "blocks";
    _progressEmitter = new vscode.EventEmitter();
    // --- Public API ---
    onProgressUpdate = this._progressEmitter.event;
    get state() {
        return this._systemStatus;
    }
    getCurrentStatus() {
        return {
            systemStatus: this._systemStatus,
            message: this._statusMessage,
            processedItems: this._processedItems,
            totalItems: this._totalItems,
            currentItemUnit: this._currentItemUnit,
        };
    }
    // --- State Management ---
    setSystemState(newState, message) {
        const stateChanged = newState !== this._systemStatus || (message !== undefined && message !== this._statusMessage);
        if (stateChanged) {
            this._systemStatus = newState;
            if (message !== undefined) {
                this._statusMessage = message;
            }
            // Reset progress counters if moving to a non-indexing state or starting fresh
            if (newState !== "Indexing") {
                this._processedItems = 0;
                this._totalItems = 0;
                this._currentItemUnit = "blocks"; // Reset to default unit
                // Optionally clear the message or set a default for non-indexing states
                if (newState === "Standby" && message === undefined)
                    this._statusMessage = "Ready.";
                if (newState === "Indexed" && message === undefined)
                    this._statusMessage = "Index up-to-date.";
                if (newState === "Error" && message === undefined)
                    this._statusMessage = "An error occurred.";
            }
            this._progressEmitter.fire(this.getCurrentStatus());
        }
    }
    reportBlockIndexingProgress(processedItems, totalItems) {
        const progressChanged = processedItems !== this._processedItems || totalItems !== this._totalItems;
        // Don't override Stopping state with progress updates
        if (this._systemStatus === "Stopping")
            return;
        // Update if progress changes OR if the system wasn't already in 'Indexing' state
        if (progressChanged || this._systemStatus !== "Indexing") {
            this._processedItems = processedItems;
            this._totalItems = totalItems;
            this._currentItemUnit = "blocks";
            const message = `Indexed ${this._processedItems} / ${this._totalItems} ${this._currentItemUnit} found`;
            const oldStatus = this._systemStatus;
            const oldMessage = this._statusMessage;
            this._systemStatus = "Indexing"; // Ensure state is Indexing
            this._statusMessage = message;
            // Only fire update if status, message or progress actually changed
            if (oldStatus !== this._systemStatus || oldMessage !== this._statusMessage || progressChanged) {
                this._progressEmitter.fire(this.getCurrentStatus());
            }
        }
    }
    reportFileQueueProgress(processedFiles, totalFiles, currentFileBasename) {
        const progressChanged = processedFiles !== this._processedItems || totalFiles !== this._totalItems;
        // Don't override Stopping state with progress updates
        if (this._systemStatus === "Stopping")
            return;
        if (progressChanged || this._systemStatus !== "Indexing") {
            this._processedItems = processedFiles;
            this._totalItems = totalFiles;
            this._currentItemUnit = "files";
            this._systemStatus = "Indexing";
            let message;
            if (totalFiles > 0 && processedFiles < totalFiles) {
                message = `Processing ${processedFiles} / ${totalFiles} ${this._currentItemUnit}. Current: ${currentFileBasename || "..."}`;
            }
            else if (totalFiles > 0 && processedFiles === totalFiles) {
                message = `Finished processing ${totalFiles} ${this._currentItemUnit} from queue.`;
            }
            else {
                message = `File queue processed.`;
            }
            const oldStatus = this._systemStatus;
            const oldMessage = this._statusMessage;
            this._statusMessage = message;
            if (oldStatus !== this._systemStatus || oldMessage !== this._statusMessage || progressChanged) {
                this._progressEmitter.fire(this.getCurrentStatus());
            }
        }
    }
    dispose() {
        this._progressEmitter.dispose();
    }
}
//# sourceMappingURL=state-manager.js.map