// @ts-nocheck
// src/treeContext.ts

import Parser from "tree-sitter";
import Go from "tree-sitter-go";
import Javascript from "tree-sitter-javascript"; // Assuming we'll add JS/TS support
import Typescript from "tree-sitter-typescript"; // Assuming we'll add JS/TS support
import { IRepoFileSystem, SimpleFileSystem } from "./fileSystem";
import { CloseSmallGapsHelper, min, max } from "./helpers"; // Assuming helpers.ts exists

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
    console.log("[TreeContext.init] Initializing TreeContext");
    // Read the file content
    let fileContent = "";
    try {
      const fileContentBuffer = await this.fileSystem.readFile(this.filename);
      fileContent = fileContentBuffer.toString(); // Ensure it's a string
    } catch (error) {
      console.error(`Error reading file ${this.filename}:`, error);
      return;
    }

    this.lines = fileContent.toString().split("\n");
    this.numLines = this.lines.length;

    // Initialize data structures based on the number of lines
    this.nodes = Array(this.numLines)
      .fill(0)
      .map(() => []);
    this.scopes = Array(this.numLines)
      .fill(0)
      .map(() => new Set());
    this.header = Array(this.numLines)
      .fill(0)
      .map(() => []);

    // Determine language based on filename extension
    const ext = this.filename.split(".").pop()?.toLowerCase() || "";
    undefined;
    switch (ext) {
      case "go":
        language = require("tree-sitter-go");
        break;
      case "js":
      case "jsx":
        language = require("tree-sitter-javascript");
        break;
      case "ts":
      case "tsx":
        language = require("tree-sitter-typescript").typescript;
        break;
      // Add other languages as needed
      default:
        console.warn(
          `No language found for extension ${ext}. Skipping tree parsing.`,
        );
        return;
    }

    if (!language) {
      console.warn(
        `Language not provided for ${this.filename}. Skipping tree parsing.`,
      );
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

    console.log(
      "TreeContext after Walk and ArrangeHeaders - Nodes size:",
      this.nodes.length,
      "scopes size:",
      this.scopes.length,
      "Header size:",
      this.header.length,
    );
  }

  // Placeholder walk method
  private Walk(cursor: Parser.TreeCursor): void {
    console.log("[TreeContext.Walk] Starting iterative walk");
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
        // console.warn(`[TreeContext.Walk] Node startLine ${startLine} out of bounds (0-${this.numLines -1}). Node type: ${node.type}`);
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
    console.log("[TreeContext.Walk] Finished iterative walk");
  }

  // Placeholder arrangeHeaders method
  private arrangeHeaders(): void {
    console.log("[TreeContext.arrangeHeaders] Arranging headers");
    for (let lineNumber = 0; lineNumber < this.numLines; lineNumber++) {
      if (!this.header[lineNumber] || this.header[lineNumber].length === 0) {
        // Added check for undefined
        this.header[lineNumber] = [[0, lineNumber, lineNumber + 1]];
        continue;
      }

      this.header[lineNumber].sort((a, b) => a[0] - b[0]);

      let startEnd: [number, number];
      if (this.header[lineNumber].length > 0) {
        // Changed from > 1 to > 0
        const size = this.header[lineNumber][0][0];
        const start = this.header[lineNumber][0][1];
        const end = this.header[lineNumber][0][2];

        if (size > this.headerMax) {
          startEnd = [start, start + this.headerMax];
        } else {
          startEnd = [start, end];
        }
      } else {
        // This else block might be redundant now with the > 0 check
        startEnd = [lineNumber, lineNumber + 1];
      }

      this.header[lineNumber] = [[0, startEnd[0], startEnd[1]]];
    }
    console.log("[TreeContext.arrangeHeaders] Finished arranging headers");
  }

  public addLois(lois: number[]): void {
    console.log("[TreeContext.addLois] Adding LOIs:", lois);
    for (const loi of lois) {
      if (loi >= 0 && loi < this.numLines) {
        this.lois.add(loi);
      } else {
        console.warn(`Invalid LOI: ${loi}. NumLines: ${this.numLines}`);
      }
    }
    console.log("[TreeContext.addLois] Current LOIs:", this.lois);
  }

  public addContext(): void {
    console.log(
      "[TreeContext.addContext] Adding context. Lois count:",
      this.lois.size,
    );
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
    console.log(
      "[TreeContext.addContext] Finished adding context. ShowLines count:",
      this.showLines.size,
    );
  }

  private closeSmallGaps(): void {
    // Assuming CloseSmallGapsHelper is implemented in helpers.ts
    const sortedShowLines = Array.from(this.showLines).sort((a, b) => a - b);
    this.showLines = new Set(
      CloseSmallGapsHelper(new Set(sortedShowLines), this.lines, this.numLines),
    );
  }

  private addParentScopes(index: number): void {
    // Removed recurseDepth parameter
    console.log(
      "[TreeContext.addParentScopes] Adding parent scopes for index:",
      index,
    );
    if (index < 0 || index >= this.numLines) {
      return;
    }

    if (this.doneParentScopes.has(index)) {
      return;
    }

    this.doneParentScopes.add(index);

    if (!this.scopes[index]) {
      // Added check for undefined
      return; // Should not happen with proper initialization
    }

    // Iterate through the scopes that contain the current index
    for (const lineNum of this.scopes[index]) {
      // Find the node that starts at lineNum and has the largest range (represents the widest scope)
      let widestNode: any | null = null;
      let widestRange = -1; // Initialize with -1 to ensure any valid range is larger

      if (this.nodes[lineNum]) {
        // Added check for undefined
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
        const linesToInclude = Math.min(
          this.headerMax,
          headEnd - headStart + 1,
        ); // Include the end line
        for (let i = headStart; i < headStart + linesToInclude; i++) {
          // Changed loop condition
          if (i >= 0 && i < this.numLines) {
            // Add bounds check
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
    console.log(
      "[TreeContext.addParentScopes] Finished adding parent scopes for index:",
      index,
    );
  }

  private addChildContext(index: number): void {
    console.log(
      "[TreeContext.addChildContext] Adding child context for index:",
      index,
    );
    if (
      index < 0 ||
      index >= this.numLines ||
      !this.nodes[index] ||
      this.nodes[index].length === 0
    ) {
      // Added check for undefined
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
    if (this.nodes[index]) {
      // Added check for undefined
      for (const node of this.nodes[index]) {
        if (node) {
          children = children.concat(this.findAllChildren(node));
        }
      }
    }

    children.sort((a, b) => {
      if (!a || !b) return 0;
      return (
        b.endPosition.row -
        b.startPosition.row -
        (a.endPosition.row - a.startPosition.row)
      );
    });

    const currentlyShowing = this.showLines.size;
    const maxToShow = Math.max(Math.min(Math.floor(size * 0.1), 25), 5);

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
    console.log(
      "[TreeContext.addChildContext] Finished adding child context for index:",
      index,
    );
  }

  private findAllChildren(node: any): any[] {
    // Use any for now
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

    if (this.nodes[index]) {
      // Added check for undefined
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
    console.log(
      "[TreeContext.format] Formatting output. ShowLines count:",
      this.showLines.size,
    );
    if (this.showLines.size === 0) {
      return "";
    }

    let output = "";
    let dots = false;
    if (!this.showLines.has(0)) {
      dots = true;
    }

    for (let index = 0; index < this.lines.length; index++) {
      if (!this.showLines.has(index)) {
        if (dots) {
          if (this.lineNumber) {
            output += "...⋮...\n";
          } else {
            output += "⋮...\n";
          }
          dots = false;
        }
        continue;
      }

      const spacer = this.lois.has(index) && this.markLois ? "█" : "|";

      if (this.lineNumber) {
        output += `${spacer}${index + 1}: ${this.lines[index]}\n`;
      } else {
        output += `${spacer}${this.lines[index]}\n`;
      }
      dots = true;
    }

    console.log(
      "[TreeContext.format] Finished formatting output. Output length:",
      output.length,
    );
    return output;
  }
}
