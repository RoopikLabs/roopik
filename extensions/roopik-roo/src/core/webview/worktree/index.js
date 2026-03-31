/**
 * Worktree Module
 *
 * VSCode-specific handlers for git worktree management.
 * Bridges webview messages to the platform-agnostic core services.
 */
export { handleListWorktrees, handleCreateWorktree, handleDeleteWorktree, handleSwitchWorktree, handleGetAvailableBranches, handleGetWorktreeDefaults, handleGetWorktreeIncludeStatus, handleCheckBranchWorktreeInclude, handleCreateWorktreeInclude, handleCheckoutBranch, } from "./handlers";
//# sourceMappingURL=index.js.map