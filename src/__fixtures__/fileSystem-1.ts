// @ts-nocheck
// filesystem.ts

import * as fs from "fs";
import * as path from "path";

/**
 * Interface for file system operations.
 */
export interface IRepoFileSystem {
  getFiles(dir: string): Promise<string[]>;
  readFile(filePath: string): Promise<string>;
}

/**
 * Simple implementation of the FileSystem interface.
 */
export class SimpleFileSystem implements IRepoFileSystem {
  private repoPath: string;
  private ignorePatterns: string[];

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.ignorePatterns = [];
    this.loadIgnorePatterns(); // Load patterns asynchronously
  }

  private async loadIgnorePatterns(): Promise<void> {
    const gitignorePath = path.join(this.repoPath, ".gitignore");
    try {
      const content = await fs.promises.readFile(gitignorePath, "utf-8");
      this.ignorePatterns = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith("#"));
    } catch (error) {
      // Ignore error if .gitignore doesn't exist
      console.warn(`Could not read .gitignore at ${gitignorePath}: ${error}`);
    }
  }

  private isIgnored(filePath: string): boolean {
    const relativePath = path.relative(this.repoPath, filePath);
    // Simple check for now, can be improved with a proper glob matching library
    return this.ignorePatterns.some((pattern) =>
      relativePath.includes(pattern),
    );
  }

  /**
   * Recursively gets all file paths within a directory.
   * @param dir The directory to traverse.
   * @returns A promise that resolves with an array of file paths.
   */
  async getFiles(dir: string): Promise<string[]> {
    let files: string[] = [];
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      // Check if the path is ignored
      if (this.isIgnored(fullPath)) {
        continue;
      }
      if (entry.isDirectory()) {
        files = files.concat(await this.getFiles(fullPath));
      } else {
        // Normalize path separators for cross-platform consistency
        files.push(path.normalize(fullPath).replace(/\\/g, "/"));
      }
    }

    return files;
  }

  /**
   * Reads the content of a file.
   * @param filePath The path to the file.
   * @returns A promise that resolves with the file content as a string.
   */
  async readFile(filePath: string): Promise<string> {
    // Clean and normalize the path
    const normalizedPath = path.normalize(filePath);
    const content = await fs.promises.readFile(normalizedPath, {
      encoding: "utf-8",
    });
    // Ensure consistent line endings (optional, depending on requirements)
    return content.replace(/\r\n/g, "\n");
  }
}
