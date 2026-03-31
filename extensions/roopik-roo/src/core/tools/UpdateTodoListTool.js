import { formatResponse } from "../prompts/responses";
import { BaseTool } from "./BaseTool";
import cloneDeep from "clone-deep";
import crypto from "crypto";
import { todoStatusSchema } from "@roo-code/types";
import { getLatestTodo } from "../../shared/todo";
let approvedTodoList = undefined;
export class UpdateTodoListTool extends BaseTool {
    name = "update_todo_list";
    async execute(params, task, callbacks) {
        const { pushToolResult, handleError, askApproval } = callbacks;
        try {
            const todosRaw = params.todos;
            let todos;
            try {
                todos = parseMarkdownChecklist(todosRaw || "");
            }
            catch {
                task.consecutiveMistakeCount++;
                task.recordToolError("update_todo_list");
                task.didToolFailInCurrentTurn = true;
                pushToolResult(formatResponse.toolError("The todos parameter is not valid markdown checklist or JSON"));
                return;
            }
            const { valid, error } = validateTodos(todos);
            if (!valid) {
                task.consecutiveMistakeCount++;
                task.recordToolError("update_todo_list");
                task.didToolFailInCurrentTurn = true;
                pushToolResult(formatResponse.toolError(error || "todos parameter validation failed"));
                return;
            }
            let normalizedTodos = todos.map((t) => ({
                id: t.id,
                content: t.content,
                status: normalizeStatus(t.status),
            }));
            const approvalMsg = JSON.stringify({
                tool: "updateTodoList",
                todos: normalizedTodos,
            });
            approvedTodoList = cloneDeep(normalizedTodos);
            const didApprove = await askApproval("tool", approvalMsg);
            if (!didApprove) {
                pushToolResult("User declined to update the todoList.");
                return;
            }
            const isTodoListChanged = approvedTodoList !== undefined && JSON.stringify(normalizedTodos) !== JSON.stringify(approvedTodoList);
            if (isTodoListChanged) {
                normalizedTodos = approvedTodoList ?? [];
                task.say("user_edit_todos", JSON.stringify({
                    tool: "updateTodoList",
                    todos: normalizedTodos,
                }));
            }
            await setTodoListForTask(task, normalizedTodos);
            if (isTodoListChanged) {
                const md = todoListToMarkdown(normalizedTodos);
                pushToolResult(formatResponse.toolResult("User edits todo:\n\n" + md));
            }
            else {
                pushToolResult(formatResponse.toolResult("Todo list updated successfully."));
            }
        }
        catch (error) {
            await handleError("update todo list", error);
        }
    }
    async handlePartial(task, block) {
        const todosRaw = block.params.todos;
        // Parse the markdown checklist to maintain consistent format with execute()
        let todos;
        try {
            todos = parseMarkdownChecklist(todosRaw || "");
        }
        catch {
            // If parsing fails during partial, send empty array
            todos = [];
        }
        const approvalMsg = JSON.stringify({
            tool: "updateTodoList",
            todos: todos,
        });
        await task.ask("tool", approvalMsg, block.partial).catch(() => { });
    }
}
export function addTodoToTask(cline, content, status = "pending", id) {
    const todo = {
        id: id ?? crypto.randomUUID(),
        content,
        status,
    };
    if (!cline.todoList)
        cline.todoList = [];
    cline.todoList.push(todo);
    return todo;
}
export function updateTodoStatusForTask(cline, id, nextStatus) {
    if (!cline.todoList)
        return false;
    const idx = cline.todoList.findIndex((t) => t.id === id);
    if (idx === -1)
        return false;
    const current = cline.todoList[idx];
    if ((current.status === "pending" && nextStatus === "in_progress") ||
        (current.status === "in_progress" && nextStatus === "completed") ||
        current.status === nextStatus) {
        cline.todoList[idx] = { ...current, status: nextStatus };
        return true;
    }
    return false;
}
export function removeTodoFromTask(cline, id) {
    if (!cline.todoList)
        return false;
    const idx = cline.todoList.findIndex((t) => t.id === id);
    if (idx === -1)
        return false;
    cline.todoList.splice(idx, 1);
    return true;
}
export function getTodoListForTask(cline) {
    return cline.todoList?.slice();
}
export async function setTodoListForTask(cline, todos) {
    if (cline === undefined)
        return;
    cline.todoList = Array.isArray(todos) ? todos : [];
}
export function restoreTodoListForTask(cline, todoList) {
    if (todoList) {
        cline.todoList = Array.isArray(todoList) ? todoList : [];
        return;
    }
    cline.todoList = getLatestTodo(cline.clineMessages);
}
function todoListToMarkdown(todos) {
    return todos
        .map((t) => {
        let box = "[ ]";
        if (t.status === "completed")
            box = "[x]";
        else if (t.status === "in_progress")
            box = "[-]";
        return `${box} ${t.content}`;
    })
        .join("\n");
}
function normalizeStatus(status) {
    if (status === "completed")
        return "completed";
    if (status === "in_progress")
        return "in_progress";
    return "pending";
}
export function parseMarkdownChecklist(md) {
    if (typeof md !== "string")
        return [];
    const lines = md
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    const todos = [];
    for (const line of lines) {
        const match = line.match(/^(?:-\s*)?\[\s*([ xX\-~])\s*\]\s+(.+)$/);
        if (!match)
            continue;
        let status = "pending";
        if (match[1] === "x" || match[1] === "X")
            status = "completed";
        else if (match[1] === "-" || match[1] === "~")
            status = "in_progress";
        const id = crypto
            .createHash("md5")
            .update(match[2] + status)
            .digest("hex");
        todos.push({
            id,
            content: match[2],
            status,
        });
    }
    return todos;
}
export function setPendingTodoList(todos) {
    approvedTodoList = todos;
}
function validateTodos(todos) {
    if (!Array.isArray(todos))
        return { valid: false, error: "todos must be an array" };
    for (const [i, t] of todos.entries()) {
        if (!t || typeof t !== "object")
            return { valid: false, error: `Item ${i + 1} is not an object` };
        if (!t.id || typeof t.id !== "string")
            return { valid: false, error: `Item ${i + 1} is missing id` };
        if (!t.content || typeof t.content !== "string")
            return { valid: false, error: `Item ${i + 1} is missing content` };
        if (t.status && !todoStatusSchema.options.includes(t.status))
            return { valid: false, error: `Item ${i + 1} has invalid status` };
    }
    return { valid: true };
}
export const updateTodoListTool = new UpdateTodoListTool();
//# sourceMappingURL=UpdateTodoListTool.js.map