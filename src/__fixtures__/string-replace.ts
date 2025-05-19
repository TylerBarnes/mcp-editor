import { readFileSync } from "fs";
import { join } from "path";

type ToolResult = {
  toolResult: {
    type: string;
    toolCallId: string;
    toolName: string;
    args: {
      path: string;
      old_str: string;
      new_str: string;
      start_line: number;
    };
    result: {
      content: {
        type: string;
        text: string;
      }[];
      isError: boolean;
    };
  };
  fileContent: string;
};

export const treeContextFix: ToolResult = {
  toolResult: {
    type: "tool-result",
    toolCallId: "3VUuRYQAxgnd0eZ9",
    toolName: "string_replace",
    args: {
      path: "nodejs/src/treeContext.ts",
      old_str:
        "\\\n        for (const lineNum of this.scopes[index]) {\n            // Find the node that starts at lineNum and has the largest range (represents the widest scope)\n            let widestNode: any | null = null;\n            let widestRange = -1; // Initialize with -1 to ensure any valid range is larger\n\n            if (this.nodes[lineNum]) { // Added check for undefined\n                 for (const node of this.nodes[lineNum]) {\n                     if (node) {\n                         const startLine = node.startPosition.row;\n                         const endLine = node.endPosition.row;\n                         const range = endLine - startLine;\n                         if (startLine === lineNum && range > widestRange) {\n                             widestRange = range;\n                             widestNode = node;\n                         }\n                     }\n                 }\n            }\n\n            if (widestNode) {\n                const headStart = widestNode.startPosition.row;\n                const headEnd = widestNode.endPosition.row;\n\n                // Include lines from the header of the widest scope, up to headerMax\n                const linesToInclude = Math.min(this.headerMax, headEnd - headStart + 1); // Include the end line\n                for (let i = headStart; i < headStart + linesToInclude; i++) { // Changed loop condition\n                     if (i >= 0 && i < this.numLines) { // Add bounds check\n                         this.showLines.add(i);\n                     }\n                }\n            }\n\n            // Removed the recursive call here\n            // if (this.lastLine) {\n            //     const lastLine = this.getLastLineOfScope(lineNum);\n            //     this.addParentScopes(lastLine); // Recursive call\n            // }\n        }",
      new_str:
        "\\\n        for (const lineNum of this.scopes[index]) {\n            if (lineNum >= this.header.length || !this.header[lineNum] || this.header[lineNum].length === 0) {\n                continue;\n            }\n\n            // After arrangeHeaders, this.header[lineNum][0] contains the smallest scope starting at lineNum\n            const headStart = this.header[lineNum][0][1];\n            const headEnd = this.header[lineNum][0][2];\n\n            // Go code includes lines from headStart up to but not including headEnd\n            // Let's replicate that, but also respect headerMax\n            const linesToInclude = Math.min(this.headerMax, headEnd - headStart); // Calculate lines to include based on size, not range+1\n            const actualHeadEnd = headStart + linesToInclude; // Determine the actual end line to include\n\n            if (headStart >= 0 && actualHeadEnd <= this.numLines && (headStart > 0 || this.showTopOfFileParentScope)) {\n                 for (let i = headStart; i < actualHeadEnd; i++) { // Loop up to actualHeadEnd (exclusive)\n                     if (i >= 0 && i < this.numLines) { // Add bounds check\n                         this.showLines.add(i);\n                     }\n                 }\n            }\n\n            // Re-add the recursive call based on this.lastLine, calling GetLastLineOfScope on lineNum\n            if (this.lastLine) {\n                const lastLine = this.getLastLineOfScope(lineNum); // Call on lineNum\n                this.addParentScopes(lastLine); // Recursive call\n            }\n        }",
      start_line: 294,
    },
    result: {
      content: [
        {
          type: "text",
          text: "No replacement was performed. No sufficiently close match for old_str found in nodejs/src/treeContext.ts.\nTry adjusting your input or the file content.",
        },
      ],
      isError: true,
    },
  },
  fileContent: `// src/treeContext.ts

import Parser from 'tree-sitter';
import Go from 'tree-sitter-go';
import Javascript from 'tree-sitter-javascript'; // Assuming we'll add JS/TS support
import Typescript from 'tree-sitter-typescript'; // Assuming we'll add JS/TS support
import { IRepoFileSystem, SimpleFileSystem } from './fileSystem';
import { CloseSmallGapsHelper, min, max } from './helpers'; // Assuming helpers.ts exists

interface Point {
    row: number;
    column: number;
}

interface Node {
    type: string;
    text: string;
    startPosition: Point;
    endPosition: Point;
    children: Node[];
    parent: Node | null;
}

export class TreeContext {
    private filename: string;
    private parentContext: boolean;
    private childContext: boolean;
    private lastLine: boolean;
    private margin: number;
    private markLois: boolean;
    private headerMax: number;
    private showTopOfFileParentScope: boolean;
    private loiPad: number;
    private lois: Set<number>;
    private showLines: Set<number>;
    private numLines: number;
    private lines: string[];
    private lineNumber: boolean;
    private doneParentScopes: Set<number>;
    private nodes: (Node | null)[][];
    private scopes: Set<number>[];
    private header: [number, number, number][][];
    private parser: Parser;
    private language: Language | null;
    private fileSystem: IRepoFileSystem; // Add fileSystem dependency

    constructor(fsFilePath: string, fileSystem: IRepoFileSystem) {
        this.filename = fsFilePath;
        this.parentContext = true;
        this.childContext = false;
        this.lastLine = false;
        this.margin = 0;
        this.markLois = false;
        this.headerMax = 10; // Default header max
        this.showTopOfFileParentScope = false;
        this.loiPad = 0;
        this.lois = new Set<number>();
        this.showLines = new Set<number>();
        this.lines = []; // Initialize as empty, will be populated in init
        this.numLines = 0; // Initialize as 0, will be set in init
        this.lineNumber = false;
        this.doneParentScopes = new Set<number>();

        // Initialize arrays based on numLines (will be resized in init)
        this.nodes = [];
        this.scopes = [];
        this.header = [];

        this.parser = new Parser();
        this.language = null; // Will be set in init
        this.fileSystem = fileSystem; // Initialize fileSystem
    }

public async init(language: Parser.Language): Promise<void> {
    // console.log("[TreeContext.init] Initializing TreeContext");
// Read the file content
    let fileContent = '';
    try {
      const fileContentBuffer = await this.fileSystem.readFile(this.filename);
      fileContent = fileContentBuffer.toString(); // Ensure it's a string
    } catch (error) {
      console.error(\`Error reading file \${this.filename}:\`, error);
      return;
    }

    this.lines = fileContent.toString().split('\n');
    this.numLines = this.lines.length;

    // Initialize data structures based on the number of lines
    this.nodes = Array(this.numLines).fill(0).map(() => []);
    this.scopes = Array(this.numLines).fill(0).map(() => new Set());
    this.header = Array(this.numLines).fill(0).map(() => []);

    if (!language) {
      console.warn(\`Language not provided for \${this.filename}. Skipping tree parsing.\`);
      return;
    }

    // Initialize parser and parse the code
    const parser = new Parser();
    parser.setLanguage(language);
    const tree = parser.parse(fileContent);

    // Walk the tree to populate nodes, scopes, and header
    const cursor = tree.walk();
    this.Walk(cursor);

    // Arrange headers after walking the tree
    this.arrangeHeaders();

    // console.log('TreeContext after Walk and ArrangeHeaders - Nodes size:', this.nodes.length, 'scopes size:', this.scopes.length, 'Header size:', this.header.length);
    }

    // Placeholder walk method
private Walk(cursor: Parser.TreeCursor): void {
    // console.log("[TreeContext.Walk] Starting iterative walk");
    if (!cursor) {
        return;
    }

    let depth = 0;
    let visitedChildren = false;

    while (true) {
        const node = cursor.currentNode;
        if (!node) {
            // Should not happen if cursor is valid
            console.error("[TreeContext.Walk] Current node is null");
            break;
        }

        const startLine = node.startPosition.row;
        const endLine = node.endPosition.row;
        const size = endLine - startLine;

        // Ensure startLine is within bounds
        if (startLine >= 0 && startLine < this.numLines) {
            // Check if this.Nodes[startLine] is initialized
            if (!this.nodes[startLine]) {
                this.nodes[startLine] = [];
            }
            this.nodes[startLine].push(node as any); // Store tree-sitter node

            if (size > 0) {
                 if (!this.header[startLine]) {
                    this.header[startLine] = [];
                }
                this.header[startLine].push([size, startLine, endLine]);
            }

            for (let i = startLine; i <= endLine && i < this.numLines; i++) {
                if (!this.scopes[i]) {
                    this.scopes[i] = new Set();
                }
                this.scopes[i].add(startLine); // Add the start line of the scope to all lines within the scope
            }
        } else {
            // console.warn(\`[TreeContext.Walk] Node startLine \${startLine} out of bounds (0-\${this.numLines -1}). Node type: \${node.type}\`);
        }

        if (!visitedChildren && cursor.gotoFirstChild()) {
            depth++;
            visitedChildren = false;
        } else if (cursor.gotoNextSibling()) {
            visitedChildren = false;
        } else if (cursor.gotoParent()) {
            depth--;
            visitedChildren = true; // Mark children as visited when moving up
            if (depth < 0) {
                break; // Finished traversal
            }
        } else {
            break; // Should not happen in a well-formed tree
        }
    }
    // console.log("[TreeContext.Walk] Finished iterative walk");
}

    // Placeholder arrangeHeaders method
    private arrangeHeaders(): void {
        // console.log("[TreeContext.arrangeHeaders] Arranging headers");
        for (let lineNumber = 0; lineNumber < this.numLines; lineNumber++) {
            if (!this.header[lineNumber] || this.header[lineNumber].length === 0) { // Added check for undefined
                this.header[lineNumber] = [[0, lineNumber, lineNumber + 1]];
                continue;
            }

            this.header[lineNumber].sort((a, b) => a[0] - b[0]);

            let startEnd: [number, number];
            if (this.header[lineNumber].length > 0) { // Changed from > 1 to > 0
                const size = this.header[lineNumber][0][0];
                const start = this.header[lineNumber][0][1];
                const end = this.header[lineNumber][0][2];

                if (size > this.headerMax) {
                    startEnd = [start, start + this.headerMax];
                } else {
                    startEnd = [start, end];
                }
            } else { // This else block might be redundant now with the > 0 check
                startEnd = [lineNumber, lineNumber + 1];
            }

            this.header[lineNumber] = [[0, startEnd[0], startEnd[1]]];
        }
         // console.log("[TreeContext.arrangeHeaders] Finished arranging headers");
    }

    public addLois(lois: number[]): void {
        // console.log("[TreeContext.addLois] Adding LOIs:", lois);
        for (const loi of lois) {
            if (loi >= 0 && loi < this.numLines) {
                this.lois.add(loi);
            } else {
                console.warn(\`Invalid LOI: \${loi}. NumLines: \${this.numLines}\`);
            }
        }
         // console.log("[TreeContext.addLois] Current LOIs:", this.lois);
    }

public addContext(): void {
    // console.log("[TreeContext.addContext] Adding context. Lois count:", this.lois.size);
        if (this.lois.size === 0) {
            return;
        }

        // Copy Lois to ShowLines
        for (const loi of this.lois) {
            this.showLines.add(loi);
        }

        if (this.loiPad > 0) {
            for (const line of Array.from(this.showLines).sort((a, b) => a - b)) {
                const start = Math.max(0, line - this.loiPad);
                const end = Math.min(this.numLines - 1, line + this.loiPad);
                for (let newLine = start; newLine <= end; newLine++) {
                    this.showLines.add(newLine);
                }
            }
        }

        if (this.lastLine && this.numLines > 2) {
            const bottomLine = this.numLines - 2;
            this.showLines.add(bottomLine);
            this.addParentScopes(bottomLine); // Recursive call
        }

        if (this.parentContext) {
            for (const index of this.lois) {
                this.addParentScopes(index); // Recursive call
            }
        }

        if (this.childContext) {
            for (const index of this.lois) {
                this.addChildContext(index); // Recursive call
            }
        }

        if (this.margin > 0) {
            for (let i = 0; i < Math.min(this.margin, this.numLines); i++) {
                this.showLines.add(i);
            }
        }

        this.closeSmallGaps();
         // console.log("[TreeContext.addContext] Finished adding context. ShowLines count:", this.showLines.size);
    }

    private closeSmallGaps(): void {
        // Assuming CloseSmallGapsHelper is implemented in helpers.ts
        const sortedShowLines = Array.from(this.showLines).sort((a, b) => a - b);
        this.showLines = new Set(CloseSmallGapsHelper(new Set(sortedShowLines), this.lines, this.numLines));
    }

private addParentScopes(index: number): void { // Removed recurseDepth parameter
    // console.log("[TreeContext.addParentScopes] Adding parent scopes for index:", index);
        if (index < 0 || index >= this.numLines) {
            return;
        }

        if (this.doneParentScopes.has(index)) {
            return;
        }

        this.doneParentScopes.add(index);

        if (!this.scopes[index]) { // Added check for undefined
             return; // Should not happen with proper initialization
        }

        // Iterate through the scopes that contain the current index
        for (const lineNum of this.scopes[index]) {
            // Find the node that starts at lineNum and has the largest range (represents the widest scope)
            let widestNode: any | null = null;
            let widestRange = -1; // Initialize with -1 to ensure any valid range is larger

            if (this.nodes[lineNum]) { // Added check for undefined
                 for (const node of this.nodes[lineNum]) {
                     if (node) {
                         const startLine = node.startPosition.row;
                         const endLine = node.endPosition.row;
                         const range = endLine - startLine;
                         if (startLine === lineNum && range > widestRange) {
                             widestRange = range;
                             widestNode = node;
                         }
                     }
                 }
            }

            if (widestNode) {
                const headStart = widestNode.startPosition.row;
                const headEnd = widestNode.endPosition.row;

                // Include lines from the header of the widest scope, up to headerMax
                const linesToInclude = Math.min(this.headerMax, headEnd - headStart + 1); // Include the end line
                for (let i = headStart; i < headStart + linesToInclude; i++) { // Changed loop condition
                     if (i >= 0 && i < this.numLines) { // Add bounds check
                         this.showLines.add(i);
                     }
                }
            }

            // Removed the recursive call here
            // if (this.lastLine) {
            //     const lastLine = this.getLastLineOfScope(lineNum);
            //     this.addParentScopes(lastLine); // Recursive call
            // }
        }
         // console.log("[TreeContext.addParentScopes] Finished adding parent scopes for index:", index);
    }

private addChildContext(index: number): void {
    // console.log("[TreeContext.addChildContext] Adding child context for index:", index);
        if (index < 0 || index >= this.numLines || !this.nodes[index] || this.nodes[index].length === 0) { // Added check for undefined
            return;
        }

        const lastLine = this.getLastLineOfScope(index);
        const size = lastLine - index;

        if (size < 5) {
            for (let i = index; i <= lastLine && i < this.numLines; i++) {
                this.showLines.add(i);
            }
            return;
        }

        let children: any[] = []; // Use any for now due to placeholder Node type
        if (this.nodes[index]) { // Added check for undefined
            for (const node of this.nodes[index]) {
                if (node) {
                    children = children.concat(this.findAllChildren(node));
                }
            }
        }

        children.sort((a, b) => {
            if (!a || !b) return 0;
            return (b.endPosition.row - b.startPosition.row) - (a.endPosition.row - a.startPosition.row);
        });

        const currentlyShowing = this.showLines.size;
        const maxToShow = Math.max(Math.min(Math.floor(size * 0.10), 25), 5);

        for (const child of children) {
            if (!child) {
                continue;
            }
            if (this.showLines.size > currentlyShowing + maxToShow) {
                return;
            }
            const childStartLine = child.startPosition.row;
            if (childStartLine >= 0 && childStartLine < this.numLines) {
                this.addParentScopes(childStartLine); // Recursive call
            }
        }
         // console.log("[TreeContext.addChildContext] Finished adding child context for index:", index);
    }

    private findAllChildren(node: any): any[] { // Use any for now
        if (!node) {
            return [];
        }

        const children: any[] = [];
        // Use tree-sitter cursor for iterating children
        const cursor = node.walk();
        if (cursor.gotoFirstChild()) {
            do {
                children.push(cursor.currentNode);
            } while (cursor.gotoNextSibling());
        }
        cursor.delete(); // Release the cursor

        return children;
    }

    private getLastLineOfScope(index: number): number {
        if (index < 0 || index >= this.numLines) {
            return index;
        }

        let lastLine = index;
        // Find the node that starts at this index and has the largest range
        let widestNode: any | null = null;
        let widestRange = -1; // Initialize with -1 to ensure any valid range is larger

        if (this.nodes[index]) { // Added check for undefined
            for (const node of this.nodes[index]) {
                if (node) {
                    const startLine = node.startPosition.row;
                    const endLine = node.endPosition.row;
                    const range = endLine - startLine;
                    if (startLine === index && range > widestRange) {
                        widestRange = range;
                        widestNode = node;
                    }
                }
            }
        }

        if (widestNode) {
             lastLine = widestNode.endPosition.row;
        }

        return Math.min(lastLine, this.numLines - 1);
    }

    public format(): string {
        // console.log("[TreeContext.format] Formatting output. ShowLines count:", this.showLines.size);
        if (this.showLines.size === 0) {
            return '';
        }

        let output = '';
        let dots = false;
        if (!this.showLines.has(0)) {
            dots = true;
        }

        for (let index = 0; index < this.lines.length; index++) {
            if (!this.showLines.has(index)) {
                if (dots) {
                    if (this.lineNumber) {
                        output += '...⋮...\n';
                    } else {
                        output += '⋮...\n';
                    }
                    dots = false;
                }
                continue;
            }

            const spacer = this.lois.has(index) && this.markLois ? '█' : '|';

            if (this.lineNumber) {
                output += \`\${spacer}\${index + 1}: \${this.lines[index]}\n\`;
            } else {
                output += \`\${spacer}\${this.lines[index]}\n\`;
            }
            dots = true;
        }

        // console.log("[TreeContext.format] Finished formatting output. Output length:", output.length);
        return output;
    }
}`,
};

export const treeContext2: ToolResult = {
  toolResult: {
    type: "tool-result",
    toolCallId: "hTXEWfS8blE7E6La",
    toolName: "string_replace",
    args: {
      path: "nodejs/src/treeContext.ts",
      old_str:
        "\\\n        // Include lines from the header of the widest scope, up to headerMax\n        const linesToInclude = Math.min(\nthis.headerMax, \nheadEnd - headStart + 1,\n); // Include the end line\n        for (let i = headStart; i < headStart + linesToInclude; i++) {\n // Changed loop condition\n          if (i >= 0 && i < this.numLines) { // Add bounds check\n            this.showLines.add(i);\n          }\n        }\n      }\n\n      // Removed the recursive call here\n      // if (this.lastLine) {\n      //     const lastLine = this.getLastLineOfScope(lineNum);\n      //     this.addParentScopes(lastLine); // Recursive call\n      // }\n    }",
      new_str:
        "\\\n        // Go code includes lines from headStart up to but not including headEnd\n        // Let's replicate that, but also respect headerMax\n        const linesToInclude = Math.min(this.headerMax, headEnd - headStart); // Calculate lines to include based on size, not range+1\n        const actualHeadEnd = headStart + linesToInclude; // Determine the actual end line to include\n\n        if (\n          headStart >= 0 &&\n          actualHeadEnd <= this.numLines &&\n          (headStart > 0 || this.showTopOfFileParentScope)\n        ) {\n          for (let i = headStart; i < actualHeadEnd; i++) { // Loop up to actualHeadEnd (exclusive)\n            if (i >= 0 && i < this.numLines) { // Add bounds check\n              this.showLines.add(i);\n            }\n          }\n        }\n\n        // Re-add the recursive call based on this.lastLine, calling GetLastLineOfScope on lineNum\n        if (this.lastLine) {\n          const lastLine = this.getLastLineOfScope(lineNum); // Call on lineNum\n          this.addParentScopes(lastLine); // Recursive call\n        }",
      start_line: 350,
    },
    result: {
      content: [
        {
          type: "text",
          text: "No replacement was performed. No sufficiently close match for old_str found in nodejs/src/treeContext.ts.\nTry adjusting your input or the file content.",
        },
      ],
      isError: true,
    },
  },
  fileContent: readFileSync(
    join(import.meta.dirname, "./treeContext-3.ts"),
    "utf-8",
  ),
};

export const treeContext3: ToolResult = {
  toolResult: {
    type: "tool-result",
    toolCallId: "tsTZZcZc4ZQGkTg8",
    toolName: "string_replace",
    args: {
      path: "nodejs/src/treeContext.ts",
      old_str:
        '\\\n        if (this.doneParentScopes.has(index)) {\n            return;\n        }\n\n        this.doneParentScopes.add(index);\n\n        if (!this.scopes[index]) {\n            // Added check for undefined\n            return; // Should not happen with proper initialization\n        }\n\n        // Iterate through the scopes that contain the current index\n        for (const lineNum of this.scopes[index]) {\n            // Find the node that starts at lineNum and has the largest range (represents the widest scope)\n            let widestNode: any | null = null;\n            let widestRange = -1; // Initialize with -1 to ensure any valid range is larger\n\n            if (this.nodes[lineNum]) { // Added check for undefined\n                 for (const node of this.nodes[lineNum]) {\n                     if (node) {\n                         const startLine = node.startPosition.row;\n                         const endLine = node.endPosition.row;\n                         const range = endLine - startLine;\n                         if (startLine === lineNum && range > widestRange) {\n                             widestRange = range;\n                             widestNode = node;\n                         }\n                     }\n                 }\n            }\n\n            if (widestNode) {\n                const headStart = widestNode.startPosition.row;\n                const headEnd = widestNode.endPosition.row;\n\n                // Include lines from the header of the widest scope, up to headerMax\n                const linesToInclude = Math.min(this.headerMax, headEnd - headStart + 1); // Include the end line\n                for (let i = headStart; i < headStart + linesToInclude; i++) { // Changed loop condition\n                     if (i >= 0 && i < this.numLines) { // Add bounds check\n                         this.showLines.add(i);\n                     }\n                }\n            }\n\n            // Removed the recursive call here\n            // if (this.lastLine) {\n            //     const lastLine = this.getLastLineOfScope(lineNum);\n            //     this.addParentScopes(lastLine); // Recursive call\n            // }\n        }\n        console.log("[TreeContext.addParentScopes] Finished adding parent scopes for index:", index);\n    }',
      new_str:
        '\\\n        if (!this.scopes[index]) {\n            // Added check for undefined\n            return; // Should not happen with proper initialization\n        }\n\n        // Iterate through the scopes that contain the current index\n        for (const lineNum of this.scopes[index]) {\n            if (lineNum >= this.header.length || !this.header[lineNum] || this.header[lineNum].length === 0) {\n                continue;\n            }\n\n            // After arrangeHeaders, this.header[lineNum][0] contains the smallest scope starting at lineNum\n            const headStart = this.header[lineNum][0][1];\n            const headEnd = this.header[lineNum][0][2];\n\n            // Go code includes lines from headStart up to but not including headEnd\n            // Let\'s replicate that, but also respect headerMax\n            const linesToInclude = Math.min(this.headerMax, headEnd - headStart); // Calculate lines to include based on size, not range+1\n            const actualHeadEnd = headStart + linesToInclude; // Determine the actual end line to include\n\n            if (headStart >= 0 && actualHeadEnd <= this.numLines && (headStart > 0 || this.showTopOfFileParentScope)) {\n                 for (let i = headStart; i < actualHeadEnd; i++) { // Loop up to actualHeadEnd (exclusive)\n                     if (i >= 0 && i < this.numLines) { // Add bounds check\n                         this.showLines.add(i);\n                     }\n                 }\n            }\n\n            // Re-add the recursive call based on this.lastLine, calling GetLastLineOfScope on lineNum\n            if (this.lastLine) {\n                const lastLine = this.getLastLineOfScope(lineNum); // Call on lineNum\n                this.addParentScopes(lastLine); // Recursive call\n            }\n        }\n        console.log("[TreeContext.addParentScopes] Finished adding parent scopes for index:", index);\n    }',
      start_line: 336,
    },
    result: {
      content: [
        {
          type: "text",
          text: "No replacement was performed. No sufficiently close match for old_str found in nodejs/src/treeContext.ts.\nold_str matching diverged after 17 matching lines.\nExpected line from old_str: `            if (this.nodes[lineNum]) { // Added check for undefined` (line 18 in old_str), found line: `      if (this.nodes[lineNum]) {` (line 353 in file). 34 lines remained to compare but they were not checked due to this line not matching.\n\nHere are the lines that did match up until the old_str diverged:\n\n        if (this.doneParentScopes.has(index)) {\n            return;\n        }\n\n        this.doneParentScopes.add(index);\n\n        if (!this.scopes[index]) {\n            // Added check for undefined\n            return; // Should not happen with proper initialization\n        }\n\n        // Iterate through the scopes that contain the current index\n        for (const lineNum of this.scopes[index]) {\n            // Find the node that starts at lineNum and has the largest range (represents the widest scope)\n            let widestNode: any | null = null;\n            let widestRange = -1; // Initialize with -1 to ensure any valid range is larger\n\n\nHere are the remaining lines you would've had to provide for the old_str to match:\n\n      if (this.nodes[lineNum]) {\n        // Added check for undefined\n        for (const node of this.nodes[lineNum]) {\n          if (node) {\n            const startLine = node.startPosition.row;\n            const endLine = node.endPosition.row;\n            const range = endLine - startLine;\n            if (startLine === lineNum && range > widestRange) {\n              widestRange = range;\n              widestNode = node;\n            }\n          }\n        }\n      }\n\n      if (widestNode) {\n        const headStart = widestNode.startPosition.row;\n        const headEnd = widestNode.endPosition.row;\n\n        // Include lines from the header of the widest scope, up to headerMax\n        const linesToInclude = Math.min(\n          this.headerMax,\n          headEnd - headStart + 1,\n        ); // Include the end line\n        for (let i = headStart; i < headStart + linesToInclude; i++) {\n          // Changed loop condition\n          if (i >= 0 && i < this.numLines) {\n            // Add bounds check\n            this.showLines.add(i);\n          }\n        }\n      }\n\n      // Removed the recursive call here\n      // if (this.lastLine) {Try adjusting your input or the file content.",
        },
      ],
      isError: true,
    },
  },
  fileContent: readFileSync(
    join(import.meta.dirname, "./treeContext-4.ts"),
    "utf-8",
  ),
};

export const fileSystemFix: ToolResult = {
  toolResult: {
    type: "tool-result",
    toolCallId: "zg8hZ6nlcbQrhLn0",
    toolName: "string_replace",
    args: {
      path: "nodejs/src/fileSystem.ts",
      old_str:
        "\\\n    this.repoPath = repoPath;\n    this.ignorePatterns = [];\n    this.loadIgnorePatterns(); // Load patterns asynchronously\n  }\n\n  private async loadIgnorePatterns(): Promise<void> {\n    const gitignorePath = path.join(this.repoPath, '.gitignore');\n    try {\n      const content = await fs.promises.readFile(gitignorePath, 'utf-8');\n      this.ignorePatterns = content\n        .split('\\n')\n        .map((line) => line.trim())\n        .filter((line) => line !== '' && !line.startsWith('#'));\n    } catch (error) {\n      // Ignore error if .gitignore doesn't exist\n      console.warn(`Could not read .gitignore at ${gitignorePath}: ${error}`);\n    }\n  }\n\n  private isIgnored(filePath: string): boolean {\n    const relativePath = path.relative(this.repoPath, filePath);\n    // Simple check for now, can be improved with a proper glob matching library\n    return this.ignorePatterns.some((pattern) =>\n      relativePath.includes(pattern),\n    );\n  }\n\n  /**\n   * Recursively gets all file paths within a directory.\n   * @param dir The directory to traverse.\n   * @returns A promise that resolves with an array of file paths.\n   */\n  async getFiles(dir: string): Promise<string[]> {\n    let files: string[] = [];\n    const entries = await fs.promises.readdir(dir, { withFileTypes: true });\n\n    for (const entry of entries) {\n      const fullPath = path.join(dir, entry.name);\n      // Check if the path is ignored\n      if (this.isIgnored(fullPath)) {\n        continue;\n      }\n      if (entry.isDirectory()) {\n        files = files.concat(await this.getFiles(fullPath));\n      } else {\n        // Normalize path separators for cross-platform consistency\n        files.push(path.normalize(fullPath).replace(/\\\\/g, \"/\"));\n      }\n    }\n\n    return files;\n  }\n\n  /**\n   * Reads the content of a file.\n   * @param filePath The path to the file.\n   * @returns A promise that resolves with the file content as a string.\n   */\n  async readFile(filePath: string): Promise<string> {\n    // Clean and normalize the path\n    const normalizedPath = path.normalize(filePath);\n    const content = await fs.promises.readFile(normalizedPath, {\n      encoding: \"utf-8\",\n    });\n    // Ensure consistent line endings (optional, depending on requirements)\n    return content.replace(/\\r\\n/g, \"\\n\");\n  }\n}",
      new_str:
        "\\\n    this.repoPath = repoPath;\n    this.ignorePatterns = [];\n    this.findGitRootAndLoadIgnorePatterns(repoPath); // Load patterns asynchronously from git root\n  }\n\n  private async findGitRootAndLoadIgnorePatterns(startPath: string): Promise<void> {\n    let currentPath = startPath;\n    let gitRoot = null;\n\n    while (currentPath !== path.parse(currentPath).root) {\n      const gitDir = path.join(currentPath, '.git');\n      try {\n        await fs.promises.access(gitDir);\n        gitRoot = currentPath;\n        break;\n      } catch (error) {\n        // .git directory not found, move up one level\n        currentPath = path.dirname(currentPath);\n      }\n    }\n\n    if (gitRoot) {\n      const gitignorePath = path.join(gitRoot, '.gitignore');\n      try {\n        const content = await fs.promises.readFile(gitignorePath, 'utf-8');\n        this.ignorePatterns = content\n          .split('\\n')\n          .map((line) => line.trim())\n          .filter((line) => line !== '' && !line.startsWith('#'));\n        console.log(`Loaded .gitignore from ${gitignorePath}`);\n      } catch (error) {\n        // Ignore error if .gitignore doesn't exist at the git root\n        console.warn(`Could not read .gitignore at ${gitignorePath}: ${error}`);\n      }\n    } else {\n      console.warn('Could not find git repository root. .gitignore will not be used.');\n    }\n  }\n\n  private isIgnored(filePath: string): boolean {\n    // Ensure repoPath is set before using it in path.relative\n    if (!this.repoPath) {\n      return false;\n    }\n    const relativePath = path.relative(this.repoPath, filePath);\n    // Simple check for now, can be improved with a proper glob matching library\n    return this.ignorePatterns.some((pattern) =>\n      relativePath.includes(pattern),\n    );\n  }\n\n  /**\n   * Recursively gets all file paths within a directory.\n   * @param dir The directory to traverse.\n   * @returns A promise that resolves with an array of file paths.\n   */\n  async getFiles(dir: string): Promise<string[]> {\n    let files: string[] = [];\n    const entries = await fs.promises.readdir(dir, { withFileTypes: true });\n\n    for (const entry of entries) {\n      const fullPath = path.join(dir, entry.name);\n      // Check if the path is ignored\n      if (this.isIgnored(fullPath)) {\n        console.log(`[SimpleFileSystem.getFiles] Skipping ignored path: ${fullPath}`);\n        continue;\n      }\n      if (entry.isDirectory()) {\n        files = files.concat(await this.getFiles(fullPath));\n      } else {\n        // Normalize path separators for cross-platform consistency\n        files.push(path.normalize(fullPath).replace(/\\\\/g, \"/\"));\n      }\n    }\n\n    return files;\n  }\n\n  /**\n   * Reads the content of a file.\n   * @param filePath The path to the file.\n   * @returns A promise that resolves with the file content as a string.\n   */\n  async readFile(filePath: string): Promise<string> {\n    // Clean and normalize the path\n    const normalizedPath = path.normalize(filePath);\n    const content = await fs.promises.readFile(normalizedPath, {\n      encoding: \"utf-8\",\n    });\n    // Ensure consistent line endings (optional, depending on requirements)\n    return content.replace(/\\r\\n/g, \"\\n\");\n  }\n}",
      start_line: 21,
    },
    result: {
      content: [
        {
          type: "text",
          text: 'No replacement was performed. No sufficiently close match for old_str found in nodejs/src/fileSystem.ts.\nold_str matching diverged after 10 matching lines.\nExpected line from old_str: `        .split(\'\\n\')` (line 11 in old_str), found line: `        .split("\\n")` (line 32 in file). 59 lines remained to compare but they were not checked due to this line not matching.\n\nHere are the lines that did match up until the old_str diverged:\n\n    this.repoPath = repoPath;\n    this.ignorePatterns = [];\n    this.loadIgnorePatterns(); // Load patterns asynchronously\n  }\n\n  private async loadIgnorePatterns(): Promise<void> {\n    const gitignorePath = path.join(this.repoPath, \'.gitignore\');\n    try {\n      const content = await fs.promises.readFile(gitignorePath, \'utf-8\');\n      this.ignorePatterns = content\n\nHere are the remaining lines you would\'ve had to provide for the old_str to match:\n\n        .split("\\n")\n        .map((line) => line.trim())\n        .filter((line) => line !== "" && !line.startsWith("#"));\n    } catch (error) {\n      // Ignore error if .gitignore doesn\'t exist\n      console.warn(`Could not read .gitignore at ${gitignorePath}: ${error}`);\n    }\n  }\n\n  private isIgnored(filePath: string): boolean {\n    const relativePath = path.relative(this.repoPath, filePath);\n    // Simple check for now, can be improved with a proper glob matching library\n    return this.ignorePatterns.some((pattern) =>\n      relativePath.includes(pattern),\n    );\n  }\n\n  /**\n   * Recursively gets all file paths within a directory.\n   * @param dir The directory to traverse.\n   * @returns A promise that resolves with an array of file paths.\n   */\n  async getFiles(dir: string): Promise<string[]> {\n    let files: string[] = [];\n    const entries = await fs.promises.readdir(dir, { withFileTypes: true });\n\n    for (const entry of entries) {\n      const fullPath = path.join(dir, entry.name);\n      // Check if the path is ignored\n      if (this.isIgnored(fullPath)) {\n        continue;\n      }\n      if (entry.isDirectory()) {\n        files = files.concat(await this.getFiles(fullPath));\n      } else {\n        // Normalize path separators for cross-platform consistency\n        files.push(path.normalize(fullPath).replace(/\\\\/g, "/"));\n      }\n    }\n\n    return files;\n  }\n\n  /**\n   * Reads the content of a file.\n   * @param filePath The path to the file.\n   * @returns A promise that resolves with the file content as a string.\n   */\n  async readFile(filePath: string): Promise<string> {\n    // Clean and normalize the path\n    const normalizedPath = path.normalize(filePath);\n    const content = await fs.promises.readFile(normalizedPath, {\n      encoding: "utf-8",\n    });\n    // Ensure consistent line endings (optional, depending on requirements)\n    return content.replace(/\\r\\n/g, "\\n");\n  }\n}\nTry adjusting your input or the file content.',
        },
      ],
      isError: true,
    },
  },
  fileContent: readFileSync(
    join(import.meta.dirname, "./fileSystem-1.ts"),
    "utf-8",
  ),
};
