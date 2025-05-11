import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { distance } from 'fastest-levenshtein';

function normalizeWhitespace(str: string): string {
    return str.replace(/\t/g, '    ') // tabs to spaces
        .replace(/ +/g, ' ')           // collapse multiple spaces
        .replace(/^ +| +$/gm, '')      // trim each line
        .replace(/\r?\n/g, '\n');   // normalize newlines
}

import {
    FileHistory,
    ToolError,
    ViewArgs,
    CreateArgs,
    StringReplaceArgs,
    InsertArgs,
    UndoEditArgs
} from './types.js';
import {
    SNIPPET_LINES,
    readFile,
    writeFile,
    makeOutput,
    validatePath,
    // truncateText
} from './utils.js';

const realExecAsync = promisify(exec);

export class FileEditor {
    protected execAsync = realExecAsync;

    private fileHistory: FileHistory = {};

    async view(args: ViewArgs): Promise<string> {
        await validatePath('view', args.path);

        if (await this.isDirectory(args.path)) {
            if (args.view_range) {
                throw new ToolError(
                    'The `view_range` parameter is not allowed when `path` points to a directory.'
                );
            }

            const { stdout, stderr } = await this.execAsync(
                `find "${args.path}" -maxdepth 2 -not -path '*/\\.*'`
            );

            if (stderr) throw new ToolError(stderr);

            return `Here's the files and directories up to 2 levels deep in ${args.path}, excluding hidden items:\n${stdout}\n`;
        }

        const fileContent = await readFile(args.path);
        let initLine = 1;

        if (args.view_range) {
            const fileLines = fileContent.split('\n');
            const nLinesFile = fileLines.length;
            const [start, end] = args.view_range;

            if (start < 1 || start > nLinesFile) {
                throw new ToolError(
                    `Invalid \`view_range\`: ${args.view_range}. Its first element \`${start}\` should be within the range of lines of the file: [1, ${nLinesFile}]`
                );
            }

            if (end !== -1) {
                if (end > nLinesFile) {
                    throw new ToolError(
                        `Invalid \`view_range\`: ${args.view_range}. Its second element \`${end}\` should be smaller than the number of lines in the file: \`${nLinesFile}\``
                    );
                }
                if (end < start) {
                    throw new ToolError(
                        `Invalid \`view_range\`: ${args.view_range}. Its second element \`${end}\` should be larger or equal than its first \`${start}\``
                    );
                }
            }

            const selectedLines = end === -1
                ? fileLines.slice(start - 1)
                : fileLines.slice(start - 1, end);

            return makeOutput(selectedLines.join('\n'), String(args.path), start);
        }

        return makeOutput(fileContent, String(args.path));
    }

    async create(args: CreateArgs): Promise<string> {
        await validatePath('create', args.path);
        await writeFile(args.path, args.file_text);

        if (!this.fileHistory[args.path]) {
            this.fileHistory[args.path] = [];
        }
        this.fileHistory[args.path].push(args.file_text);

        return `File created successfully at: ${args.path}`;
    }

    async strReplace(args: StringReplaceArgs): Promise<string> {
        await validatePath('string_replace', args.path);

        const fileContent = await readFile(args.path);
        const oldStr = args.old_str.replace(/\t/g, '    ');
        const newStr = args.new_str?.replace(/\t/g, '    ') ?? '';

        // Split and normalize
        const oldLines = oldStr.split('\n').map(normalizeWhitespace);
        const fileLines = fileContent.split('\n');
        const normFileLines = fileLines.map(normalizeWhitespace);
        const threshold = Math.max(2, Math.floor(oldStr.length * 0.1));

        let bestMatch = { start: -1, avgDist: Infinity };

        for (let i = 0; i <= normFileLines.length - oldLines.length; i++) {
            let totalDist = 0;
            for (let j = 0; j < oldLines.length; j++) {
                totalDist += distance(normFileLines[i + j], oldLines[j]);
            }
            const avgDist = totalDist / oldLines.length;
            if (avgDist < bestMatch.avgDist) {
                bestMatch = { start: i, avgDist };
            }
        }

        if (bestMatch.avgDist > threshold || bestMatch.start === -1) {
            throw new ToolError(
                `No replacement was performed. No sufficiently close match for old_str \`${args.old_str}\` found in ${args.path}. Fuzziness threshold: ${threshold}, closest average distance: ${bestMatch.avgDist}. Try adjusting your input or the file content.`
            );
        }

        // Replace the original lines in fileLines from bestMatch.start to bestMatch.start + oldLines.length
        const newFileLines = [
            ...fileLines.slice(0, bestMatch.start),
            ...(newStr ? newStr.split('\n') : []),
            ...fileLines.slice(bestMatch.start + oldLines.length)
        ];
        const newFileContent = newFileLines.join('\n');
        await writeFile(args.path, newFileContent);


        if (!this.fileHistory[args.path]) {
            this.fileHistory[args.path] = [];
        }
        this.fileHistory[args.path].push(fileContent);

        // Find the line number for the snippet
        const replacementLine = bestMatch.start + 1;
        const startLine = Math.max(0, replacementLine - SNIPPET_LINES);
        const endLine = replacementLine + SNIPPET_LINES + newStr.split('\n').length;
        const snippet = newFileContent.split('\n').slice(startLine, endLine + 1).join('\n');

        let successMsg = `The file ${args.path} has been edited. `;
        successMsg += makeOutput(snippet, `a snippet of ${args.path}`, startLine + 1);
        successMsg += 'Review the changes and make sure they are as expected. Edit the file again if necessary.';
        successMsg += `\nLevenshtein average distance for match: ${bestMatch.avgDist.toFixed(2)} (threshold: ${threshold})\n`;


        return successMsg;
    }


    async insert(args: InsertArgs): Promise<string> {
        await validatePath('insert', args.path);

        const fileContent = await readFile(args.path);
        const newStr = args.new_str.replace(/\t/g, '    ').replace(/\\t/g, `    `);
        const fileLines = fileContent.split('\n');
        const nLinesFile = fileLines.length;

        if (args.insert_line < 0 || args.insert_line > nLinesFile) {
            throw new ToolError(
                `Invalid \`insert_line\` parameter: ${args.insert_line}. It should be within the range of lines of the file: [0, ${nLinesFile}]`
            );
        }

        const newStrLines = newStr.split('\n');
        const newFileLines = [
            ...fileLines.slice(0, args.insert_line),
            ...newStrLines,
            ...fileLines.slice(args.insert_line)
        ];

        const snippetLines = [
            ...fileLines.slice(Math.max(0, args.insert_line - SNIPPET_LINES), args.insert_line),
            ...newStrLines,
            ...fileLines.slice(args.insert_line, args.insert_line + SNIPPET_LINES)
        ];

        const newFileContent = newFileLines.join('\n');
        const snippet = snippetLines.join('\n');

        await writeFile(args.path, newFileContent);

        if (!this.fileHistory[args.path]) {
            this.fileHistory[args.path] = [];
        }
        this.fileHistory[args.path].push(fileContent);

        let successMsg = `The file ${args.path} has been edited. `;
        successMsg += makeOutput(
            snippet,
            'a snippet of the edited file',
            Math.max(1, args.insert_line - SNIPPET_LINES + 1)
        );
        successMsg += 'Review the changes and make sure they are as expected (correct indentation, no duplicate lines, etc). Edit the file again if necessary.';

        return successMsg;
    }

    async undoEdit(args: UndoEditArgs): Promise<string> {
        await validatePath('undo_edit', args.path);

        if (!this.fileHistory[args.path] || this.fileHistory[args.path].length === 0) {
            throw new ToolError(`No edit history found for ${args.path}.`);
        }

        const oldText = this.fileHistory[args.path].pop()!;
        await writeFile(args.path, oldText);

        return `Last edit to ${args.path} undone successfully. ${makeOutput(oldText, String(args.path))}`;
    }

    private async isDirectory(filePath: string): Promise<boolean> {
        try {
            const stats = await fs.stat(filePath);
            return stats.isDirectory();
        } catch (error) {
            return false;
        }
    }
}
