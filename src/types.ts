export type Command = "view" | "create" | "string_replace" | "insert" | "undo_edit";

export interface FileHistory {
    [path: string]: string[];
}

export class ToolError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ToolError";
    }
}

export interface ViewArgs extends Record<string, unknown> {
    path: string;
    view_range?: [number, number];
}

export interface CreateArgs extends Record<string, unknown> {
    path: string;
    file_text: string;
}

export interface StringReplaceArgs extends Record<string, unknown> {
    path: string;
    old_str: string;
    new_str?: string;
    start_line?: number;
}

export interface InsertArgs extends Record<string, unknown> {
    path: string;
    insert_line: number;
    new_str: string;
}

export interface UndoEditArgs extends Record<string, unknown> {
    path: string;
}

export function isViewArgs(args: Record<string, unknown>): args is ViewArgs {
    return typeof args.path === "string" &&
        (args.view_range === undefined ||
            (Array.isArray(args.view_range) &&
                args.view_range.length === 2 &&
                args.view_range.every(n => typeof n === "number")));
}

export function isCreateArgs(args: Record<string, unknown>): args is CreateArgs {
    return typeof args.path === "string" && typeof args.file_text === "string";
}

export function isStrReplaceArgs(args: Record<string, unknown>): args is StringReplaceArgs {
    return typeof args.path === "string" &&
        typeof args.old_str === "string" &&
        (args.new_str === undefined || typeof args.new_str === "string");
}

export function isInsertArgs(args: Record<string, unknown>): args is InsertArgs {
    return typeof args.path === "string" &&
        typeof args.insert_line === "number" &&
        typeof args.new_str === "string";
}

export function isUndoEditArgs(args: Record<string, unknown>): args is UndoEditArgs {
    return typeof args.path === "string";
}
