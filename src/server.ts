import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FileEditor } from "./editor.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
    CreateArgs,
    isCreateArgs,
    // isInsertArgs,
    isStrReplaceArgs,
    isUndoEditArgs,
    isViewArgs,
    ToolError,
    ViewArgs
} from "./types.js";

class EditorServer {
    private server: Server;
    private editor: FileEditor;

    constructor() {
        this.server = new Server({
            name: "mcp-editor",
            version: "1.0.0"
        }, {
            capabilities: {
                tools: {}
            }
        });

        this.editor = new FileEditor();
        this.setupTools();
    }

    private setupTools(): void {
        // Set up all our editing tools to match the original EditTool's functionality
        this.server.setRequestHandler(
            ListToolsRequestSchema,
            async () => ({
                tools: [
                    {
                        name: "view",
                        description: "View file contents or directory listing",
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: "Absolute path to the file or directory"
                                },
                                view_range: {
                                    type: "array",
                                    items: {
                                        type: "number"
                                    },
                                    minItems: 2,
                                    maxItems: 2,
                                    description: "Optional range of lines to view [start, end]"
                                }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "create",
                        description: "Create a new file with specified content",
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: "Absolute path where file should be created"
                                },
                                file_text: {
                                    type: "string",
                                    description: "Content to write to the file"
                                }
                            },
                            required: ["path", "file_text"]
                        }
                    },
                    {
                        name: "string_replace",
                        description: "Replace a string in a file with a new string",
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: "Absolute path to the file"
                                },
                                old_str: {
                                    type: "string",
                                    description: "String to replace"
                                },
                                new_str: {
                                    type: "string",
                                    description: "Replacement string (empty string if omitted)"
                                }
                            },
                            required: ["path", "old_str"]
                        }
                    },
                    // {
                    //     name: "insert",
                    //     description: "Insert text at a specific line in the file",
                    //     inputSchema: {
                    //         type: "object",
                    //         properties: {
                    //             path: {
                    //                 type: "string",
                    //                 description: "Absolute path to the file"
                    //             },
                    //             insert_line: {
                    //                 type: "number",
                    //                 description: "Line number where text should be inserted"
                    //             },
                    //             new_str: {
                    //                 type: "string",
                    //                 description: "Text to insert"
                    //             }
                    //         },
                    //         required: ["path", "insert_line", "new_str"]
                    //     }
                    // },
                    {
                        name: "undo_edit",
                        description: "Undo the last edit to a file",
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: "Absolute path to the file"
                                }
                            },
                            required: ["path"]
                        }
                    }
                ]
            })
        );

        this.server.setRequestHandler(
            CallToolRequestSchema,
            async (request) => {
                try {
                    let result: string;

                    switch (request.params.name) {
                        case "view":
                            if (!request.params.arguments || !isViewArgs(request.params.arguments)) {
                                throw new ToolError("Invalid arguments for view command");  // At least this one was right lol
                            }
                            result = await this.editor.view(request.params.arguments);
                            break;
                        case "create":
                            if (!request.params.arguments || !isCreateArgs(request.params.arguments)) {
                                throw new ToolError("Invalid arguments for create command");  // Fixed
                            }
                            result = await this.editor.create(request.params.arguments);
                            break;
                        case "string_replace":
                            if (!request.params.arguments || !isStrReplaceArgs(request.params.arguments)) {
                                throw new ToolError("Invalid arguments for string_replace command");  // Fixed
                            }
                            if (request.params.arguments.old_str === "") {
                                throw new ToolError("old_str cannot be an empty string. That's too generic and will result in replacing a random empty string in the file.")
                            }
                            result = await this.editor.strReplace(request.params.arguments);
                            break;
                        // case "insert":
                        //     if (!request.params.arguments || !isInsertArgs(request.params.arguments)) {
                        //         throw new ToolError("Invalid arguments for insert command");  // Fixed
                        //     }
                        //     result = await this.editor.insert(request.params.arguments);
                        //     break;
                        case "undo_edit":
                            if (!request.params.arguments || !isUndoEditArgs(request.params.arguments)) {
                                throw new ToolError("Invalid arguments for undo_edit command");  // Fixed
                            }
                            result = await this.editor.undoEdit(request.params.arguments);
                            break;
                        default:
                            throw new ToolError(`Unknown tool: ${request.params.name}`);  // This should be ToolError too
                    }

                    return {
                        content: [{
                            type: "text",
                            text: result
                        }]
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    return {
                        content: [{
                            type: "text",
                            text: errorMessage
                        }],
                        isError: true
                    };
                }
            }
        );
    }

    async run(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Editor MCP server running on stdio");
    }
}

// Start the server
const server = new EditorServer();
server.run().catch(console.error);
