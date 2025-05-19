// @ts-nocheck
// src/tagIndex.ts

import Parser from "tree-sitter";
import Go from "tree-sitter-go";
import Javascript from "tree-sitter-javascript"; // Assuming we'll add JS/TS support
import Typescript from "tree-sitter-typescript"; // Assuming we'll add JS/TS support
import { IRepoFileSystem, SimpleFileSystem } from "./fileSystem";
import * as path from "path";

// Define the TagKind enum
export enum TagKind {
  Reference,
}

export interface Tag {
  relFname: string;
  fname: string;
  line: number;
  name: string;
  kind: TagKind;
}

// Tree-sitter queries for different languages
const goQuery = `
(import_declaration (string_literal) @import.path)
(function_declaration name: (identifier) @def.function)
(method_declaration name: (field_identifier) @def.method)
(type_declaration name: (type_identifier) @def.type)
(identifier) @ref.ident
(field_identifier) @ref.field
`;

const jsQuery = `
(import_declaration (string_literal) @import.path)
  (function_declaration
    name: (identifier) @def.function)
  (method_definition
    name: (property_identifier) @def.method)
  (class_declaration
    name: (identifier) @def.class)
  (identifier) @ref.ident
  (identifier) @ref.ident (member_expression)
  (property_identifier) @ref.prop (member_expression)
`;

const tsQuery = `
(import_declaration (string_literal) @import.path)
(function_declaration
  name: (identifier) @def.function)
(method_definition
  name: (property_identifier) @def.method)
(interface_declaration
  name: (type_identifier) @def.interface)
(variable_declarator
  name: (identifier) @def.variable)

(call_expression
  function: (identifier) @ref.function)
(new_expression
  constructor: (identifier) @ref.class)
`;

// This file will contain the NodeJS implementation of the TagIndex.
// It will be responsible for parsing files and extracting tags.

export class TagIndex {
  private parser: Parser;
  private languages: Record<string, Parser.Language>;
  public fs: IRepoFileSystem; // Make filesystem public
  private repoPath: string;

  // Data structures to store tags, similar to the Go implementation
  public defines: Map<string, Set<string>>; // tagName -> Set<filePath>
  public references: Map<string, string[]>; // tagName -> filePath[]
  public definitions: Map<string, Tag[]>; // filePath/tagName -> Tag[]
  public definitionsByFilePath: Map<string, Tag[]>; // file path -> list of Tags
  public commonTags: Set<string>; // tagName
  public fileToTags: Map<string, Set<string>>; // filePath -> Set<tagName>
  public importsByFilePath: Map<string, string[]>; // filePath -> imported paths/modules

  constructor(repoPath: string, fs?: IRepoFileSystem) {
    this.repoPath = repoPath;
    if (!fs) {
      this.fs = new SimpleFileSystem(this.repoPath);
    } else {
      this.fs = fs;
    }

    this.parser = new Parser();
    this.languages = {};
    this.defines = new Map();
    this.references = new Map();
    this.definitions = new Map();
    this.definitionsByFilePath = new Map();
    this.commonTags = new Set();
    this.fileToTags = new Map();
  }

  public async loadLanguages() {
    // Initialize tree-sitter and load supported languages
    const Go = require("tree-sitter-go");
    const Javascript = require("tree-sitter-javascript");
    const Typescript = require("tree-sitter-typescript");

    this.languages["go"] = Go;
    this.languages["javascript"] = Javascript;
    this.languages["typescript"] = Typescript.typescript;
    // TODO: Add other languages as needed
  }

  public getLanguageForFile(filePath: string): Parser.Language | undefined {
    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    // Map common extensions to language names used in this.languages
    const extMap: Record<string, string> = {
      go: "go",
      js: "javascript",
      ts: "typescript",
      jsx: "javascript",
      tsx: "typescript",
      // TODO: Add more mappings
    };
    const langName = extMap[ext];
    return langName ? this.languages[langName] : undefined;
  }

  private getQueryForLanguage(language: Parser.Language): string | undefined {
    // Map language objects to query strings
    const languageQueryMap: Map<Parser.Language, string> = new Map([
      [require("tree-sitter-go"), goQuery],
      [require("tree-sitter-javascript"), jsQuery],
      [require("tree-sitter-typescript").typescript, tsQuery],
      // TODO: Add more language-to-query mappings
    ]);
    return languageQueryMap.get(language);
  }

  public async init(): Promise<void> {
    await this.fs.isInitialized(); // Wait for the file system to be initialized
    await this.loadLanguages();

    const files = await this.fs.getFiles(this.repoPath);

    let tree: Parser.Tree | null;

    for (const filePath of files) {
      tree = null;
      const language = this.getLanguageForFile(filePath);
      if (!language) {
        continue; // Skip files for which we don't have a valid parser
      }

      const queryStr = this.getQueryForLanguage(language);
      if (!queryStr) {
        continue; // Skip languages for which we don't have queries
      }

      // console.log('Language object before setLanguage:', language);
      // console.log('Language object type:', typeof language);
      // console.log('Language object version:', language ? language.version : 'N/A');
      // console.log('Language object before setLanguage:', language);
      // console.log('Language object type:', typeof language);
      // console.log('Language object version:', language ? language.version : 'N/A');
      this.parser.setLanguage(language);
      const fileContent = await this.fs.readFile(filePath);
      try {
        tree = this.parser.parse(fileContent.toString());
      } catch (e) {
        // document likely includes no info we're querying for
        console.log(e, filePath);
        return;
      }

      console.log(language.name, filePath);
      const query = new Parser.Query(language, queryStr);
      const captures = query.captures(tree.rootNode);

      const relPath = path.relative(this.repoPath, filePath);
      // console.log(Processing file: ${relPath});

      for (const capture of captures) {
        const node = capture.node;
        const patternName = capture.name;
        const parts = patternName.split(".");
        if (parts.length !== 2) {
          continue; // Skip captures that don't follow the 'kind.name' pattern
        }

        const kind = parts[0];
        const name = node.text;

        // Skip empty names and special characters (basic check)
        if (!name || name.trim() === "" || /[()[]{}]/.test(name)) {
          continue;
        }

        const tagKind = kind === "def" ? TagKind.Definition : TagKind.Reference;

        const tag: Tag = {
          relFname: relPath,
          fname: filePath,
          line: node.startPosition.row + 1, // Convert to 1-based line numbers
          name: name,
          kind: tagKind,
        };
        // console.log(  Found capture: ${name} (${kind}) in ${relPath} at line ${tag.line});

        this.addTag(tag, relPath);

        if (kind === "import") {
          const importedPath = name.replace(/["']+/g, ""); // Clean up quotes
          if (!this.importsByFilePath.has(relPath)) {
            this.importsByFilePath.set(relPath, []);
          }
          this.importsByFilePath.get(relPath)!.push(importedPath);
        }
      }

      // Explicitly release memory
      tree = null;
    }

    this.postProcessTags();
  }

  public async generateTags(): Promise<void> {
    await this.init(); // Call the new async init method
  }

  private addTag(tag: Tag, relPath: string) {
    // Add tag to defines, references, definitions, and fileToTags maps
    if (tag.kind === TagKind.Definition) {
      if (!this.defines.has(tag.name)) {
        this.defines.set(tag.name, new Set());
      }
      this.defines.get(tag.name)!.add(relPath);

      const definitionKey = path.join(relPath, tag.name);
      if (!this.definitions.has(definitionKey)) {
        this.definitions.set(definitionKey, []);
      }
      this.definitions.get(definitionKey)!.push(tag);

      if (!this.definitionsByFilePath.has(relPath)) {
        this.definitionsByFilePath.set(relPath, []);
      }
      this.definitionsByFilePath.get(relPath)!.push(tag);

      if (!this.fileToTags.has(relPath)) {
        this.fileToTags.set(relPath, new Set());
      }
      this.fileToTags.get(relPath)!.add(tag.name);
    } else if (tag.kind === TagKind.Reference) {
      if (!this.references.has(tag.name)) {
        this.references.set(tag.name, []);
      }
      this.references.get(tag.name)!.push(relPath);

      if (!this.fileToTags.has(relPath)) {
        this.fileToTags.set(relPath, new Set());
      }
      this.fileToTags.get(relPath)!.add(tag.name);
    }
  }

  private postProcessTags() {
    // Process empty references
    if (this.references.size === 0) {
      for (const tagName of this.defines.keys()) {
        this.references.set(
          tagName,
          Array.from(this.defines.get(tagName) || []),
        );
      }
    }

    // Identify common tags
    for (const tagName of this.defines.keys()) {
      if (this.references.has(tagName)) {
        this.commonTags.add(tagName);
      }
    }
  }

  // Public getters for testing and further processing
  public getDefines(): Map<string, Set<string>> {
    return this.defines;
  }

  public getReferences(): Map<string, string[]> {
    return this.references;
  }

  public getDefinitions(): Map<string, Tag[]> {
    return this.definitions;
  }

  public getCommonTags(): Set<string> {
    return this.commonTags;
  }

  public getFileToTags(): Map<string, Set<string>> {
    return this.fileToTags;
  }

  public getLoadedLanguages(): Record<string, Parser.Language> {
    return this.languages;
  }
}
