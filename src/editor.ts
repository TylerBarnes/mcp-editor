import { promises as fs } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { distance } from "fastest-levenshtein";

function removeWhitespace(str: string): string {
  return (
    str
      .replace(/\t/g, "") // tabs to spaces
      .replace(/ +/g, "") // collapse multiple spaces
      .replace(/^ +| +$/gm, "") // trim each line
      .replace(/\r?\n/g, "\n")
      .replace(/\s/g, "")
      // @ts-ignore
      .replaceAll(`\\n`, `\n`)
  ); // normalize newlines
}

import {
  FileHistory,
  ToolError,
  ViewArgs,
  CreateArgs,
  StringReplaceArgs,
  InsertArgs,
  UndoEditArgs,
} from "./types.js";
import {
  SNIPPET_LINES,
  readFile,
  writeFile,
  makeOutput,
  validatePath,
  // truncateText
} from "./utils.js";

const realExecAsync = promisify(exec);

export class FileEditor {
  protected execAsync = realExecAsync;

  private fileHistory: FileHistory = {};

  async view(args: ViewArgs): Promise<string> {
    await validatePath("view", args.path);

    if (await this.isDirectory(args.path)) {
      if (args.view_range) {
        throw new ToolError(
          "The `view_range` parameter is not allowed when `path` points to a directory.",
        );
      }

      const { stdout, stderr } = await this.execAsync(
        `find "${args.path}" -maxdepth 2 -not -path '*/\\.*'`,
      );

      if (stderr) throw new ToolError(stderr);

      return `Here's the files and directories up to 2 levels deep in ${args.path}, excluding hidden items:\n${stdout}\n`;
    }

    const fileContent = await readFile(args.path);
    let initLine = 1;

    if (args.view_range) {
      const fileLines = fileContent.split("\n");
      const nLinesFile = fileLines.length;
      let [start, end] = args.view_range;

      if (start < 1 || start > nLinesFile) {
        throw new ToolError(
          `Invalid \`view_range\`: ${args.view_range}. Its first element \`${start}\` should be within the range of lines of the file: [1, ${nLinesFile}]`,
        );
      }

      if (end !== -1) {
        if (end > nLinesFile) {
          end = nLinesFile;
          // throw new ToolError(
          //     `Invalid \`view_range\`: ${args.view_range}. Its second element \`${end}\` should be smaller than the number of lines in the file: \`${nLinesFile}\``
          // );
        }
        if (end < start) {
          throw new ToolError(
            `Invalid \`view_range\`: ${args.view_range}. Its second element \`${end}\` should be larger or equal than its first \`${start}\``,
          );
        }
      }

      const selectedLines =
        end === -1
          ? fileLines.slice(start - 1)
          : fileLines.slice(start - 1, end);

      return makeOutput(selectedLines.join("\n"), String(args.path), start);
    }

    return makeOutput(fileContent, String(args.path));
  }

  async create(args: CreateArgs): Promise<string> {
    await validatePath("create", args.path);
    await writeFile(args.path, args.file_text);

    if (!this.fileHistory[args.path]) {
      this.fileHistory[args.path] = [];
    }
    this.fileHistory[args.path].push(args.file_text);

    return `File created successfully at: ${args.path}`;
  }

  private undoubleEscape(input: string) {
    return input.replace(
      /("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`)|\\n|\\r|\\t|\\"|\\'|\\`/g,
      (match) => {
        if (
          match.startsWith('"') ||
          match.startsWith("'") ||
          match.startsWith("`")
        ) {
          return match; // skip unescaping inside quoted or backticked strings
        }
        // outside of quotes/backticks: unescape
        return match
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\`/g, "`");
      },
    );
  }

  async strReplace(args: StringReplaceArgs): Promise<string> {
    await validatePath("string_replace", args.path);

    const fileContent = await readFile(args.path);
    let oldStr = this.undoubleEscape(args.old_str);
    let newStr = this.undoubleEscape(args.new_str || "");

    if (oldStr.startsWith(`\\\n`)) {
      oldStr = oldStr.substring(`\\\n`.length);
    }
    if (newStr.startsWith(`\\\n`)) {
      newStr = newStr.substring(`\\\n`.length);
    }
    const startLineArg =
      typeof args.start_line === `number`
        ? Math.max(args.start_line - 1, 0)
        : undefined;

    // Split and normalize
    const oldLinesSplit = oldStr.split("\n");
    const oldLinesOriginal = oldLinesSplit.filter((l, i) => {
      if (i === 0) return removeWhitespace(l) !== ``;
      if (i + 1 !== oldLinesSplit.length) return true;
      // only keep last item if it's not an empty string
      return removeWhitespace(l) !== ``;
    });
    const oldLines = oldLinesOriginal.map(removeWhitespace);
    const fileLines = fileContent.split("\n");
    const normFileLines = fileLines.map(removeWhitespace);
    // const threshold = Math.max(2, Math.floor(oldStr.length * 0.1));

    let bestMatch: {
      start: number;
      avgDist: number;
      type: "replace-lines" | "replace-in-line";
    } = { start: -1, avgDist: Infinity, type: "replace-lines" };

    const isSingleLineReplacement = oldLines.length === 1;

    const matchLineNumbers = normFileLines
      .map((l, index) => (l === oldLines[0] ? index + 1 : null))
      .filter(Boolean);
    if (
      isSingleLineReplacement &&
      matchLineNumbers.length > 1 &&
      !startLineArg
    ) {
      throw new ToolError(
        `Single line search string "${oldLines[0]}" has too many matches. This will result in innacurate replacements. Found ${matchLineNumbers.length} matches. Pass start_line to choose one. Found on lines ${matchLineNumbers.join(`, `)}`,
      );
    }

    const escapeCountOld = oldStr.split(`\n`).join(``).match(/\\\\/g);

    if ((escapeCountOld?.length || 0) > 40) {
      throw new ToolError(
        `Found more than 40 backslash characters in the old_str. This indicates the input string has been escaped instead of passed in directly.`,
      );
    }

    const escapeCountNew = newStr.split(`\n`).join(``).match(/\\/g);

    if ((escapeCountNew?.length || 0) > 40) {
      throw new ToolError(
        `Found more than 40 backslash characters in the new_str. This indicates the input string has been escaped instead of passed in directly.`,
      );
    }

    let divergedMessage: string | undefined;
    let divergenceAfterX = 0;

    console.error(normFileLines);

    for (const [index, normLine] of normFileLines.entries()) {
      if (typeof startLineArg !== `undefined` && index + 1 < startLineArg)
        continue;
      // this line is equal to the first line in our from replacement. Lets check each following line to see if we match
      const firstDistance = distance(oldLines[0], normLine);
      const firstPercentDiff = (firstDistance / normLine.length) * 100;
      if (firstPercentDiff < 10 && firstPercentDiff > 0) {
        console.error({
          firstPercentDiff,
          firstDistance,
          lineLength: normLine.length,
        });
      }
      if (
        isSingleLineReplacement &&
        (normLine === oldLines[0] || normLine.includes(oldLines[0]))
      ) {
        bestMatch.start = index;
        bestMatch.type = "replace-in-line";
        continue;
      }
      if (oldLines[0] === normLine || firstPercentDiff < 5) {
        let isMatching = true;
        let matchingLineCount = 0;
        for (const [matchIndex, oldLine] of oldLines.entries()) {
          const innerNormLine = normFileLines[index + matchIndex];
          const innerDistance = distance(
            oldLine,
            normFileLines[index + matchIndex],
          );
          const innerPercentDiff = (innerDistance / innerNormLine.length) * 100;
          if (innerPercentDiff < 10 && innerPercentDiff > 0) {
            console.error({
              innerPercentDiff,
              innerDistance,
              lineLength: innerNormLine.length,
            });
          }
          const remainingLines = oldLines.length - matchingLineCount;
          const percentLinesRemaining =
            (remainingLines / oldLines.length) * 100;
          const isMatch = oldLine === innerNormLine || innerPercentDiff < 5;
          const fewLinesAreLeft =
            oldLines.length >= 30 && percentLinesRemaining < 1;
          if (!isMatch && fewLinesAreLeft) {
            console.error(
              `It's mostly a match! lets say it is anyway. Expected line: ${oldLine}, found line: ${innerNormLine}. ${remainingLines} lines were remaining`,
            );
          }
          if (isMatch || fewLinesAreLeft) {
            matchingLineCount++;
            // all good! we're matching
            console.error(`matching ${index + matchIndex}`);
          } else {
            const message = `old_str matching diverged after ${matchingLineCount} matching lines.\nExpected line from old_str: \`${oldLinesOriginal[matchIndex]}\` (line ${matchIndex + 1} in old_str), found line: \`${fileLines[matchIndex]}\` (line ${index + 1 + matchIndex} in file). ${remainingLines - 1} lines remained to compare but they were not checked due to this line not matching.\n`;
            console.error(message);
            // tell the llm about the longest matching string so it can adjust the next input
            if (matchingLineCount > divergenceAfterX) {
              divergenceAfterX = matchingLineCount;
              divergedMessage = message;
            }
            // we could also do levenstein here
            isMatching = false;
            // we diverged
            break;
          }
        }
        if (isMatching) {
          bestMatch.start = index;
          console.error(`matched! ${index}`);
          break;
        }
      }
    }
    // for (let i = 0; i <= normFileLines.length - oldLines.length; i++) {
    //     let totalDist = 0;
    //     for (let j = 0; j < oldLines.length; j++) {
    //         totalDist += distance(normFileLines[i + j], oldLines[j]);
    //     }
    //     const avgDist = totalDist / oldLines.length;
    //     if (avgDist < bestMatch.avgDist) {
    //         bestMatch = { start: i, avgDist };
    //     }
    // }

    let newFileContent = ``;
    if (bestMatch.start === -1) {
      // if (bestMatch.avgDist > threshold || bestMatch.start === -1) {
      throw new ToolError(
        `No replacement was performed. No sufficiently close match for old_str found in ${args.path}.
${divergedMessage ? divergedMessage : ``}Try adjusting your input or the file content.`,
      );
    }

    if (bestMatch.type === `replace-lines`) {
      // Replace the original lines in fileLines from bestMatch.start to bestMatch.start + oldLines.length
      const newFileLines = [
        ...fileLines.slice(0, bestMatch.start),
        ...(newStr ? newStr.split("\n") : []),
        ...fileLines.slice(bestMatch.start + oldLines.length),
      ];
      newFileContent = newFileLines.join("\n");
      await writeFile(args.path, newFileContent);
    } else if (bestMatch.type === `replace-in-line`) {
      const [firstNew, ...restNew] = newStr ? newStr.split("\n") : [];
      const newFileLines = [
        ...fileLines.slice(0, bestMatch.start),
        ...(restNew.length
          ? [firstNew, ...restNew]
          : [
              fileLines
                .at(bestMatch.start)!
                .replace(oldLinesOriginal[0], firstNew),
            ]),
        ...fileLines.slice(bestMatch.start + 1),
      ];
      newFileContent = newFileLines.join("\n");
      await writeFile(args.path, newFileContent);
    }

    if (!this.fileHistory[args.path]) {
      this.fileHistory[args.path] = [];
    }
    this.fileHistory[args.path].push(fileContent);

    // Find the line number for the snippet
    const replacementLine = bestMatch.start + 1;
    const startLine = Math.max(0, replacementLine - SNIPPET_LINES);
    const endLine = replacementLine + SNIPPET_LINES + newStr.split("\n").length;
    const snippet = newFileContent
      .split("\n")
      .slice(startLine, endLine + 1)
      .join("\n");

    let successMsg = `The file ${args.path} has been edited. `;
    successMsg += makeOutput(
      snippet,
      `a snippet of ${args.path}`,
      startLine + 1,
    );
    successMsg +=
      "Review the changes and make sure they are as expected. Edit the file again if necessary.";
    // successMsg += `\nLevenshtein average distance for match: ${bestMatch.avgDist.toFixed(2)} (threshold: ${threshold})\n`;

    return successMsg;
  }

  async insert(args: InsertArgs): Promise<string> {
    await validatePath("insert", args.path);

    const fileContent = await readFile(args.path);
    const newStr = this.undoubleEscape(args.new_str);
    const fileLines = fileContent.split("\n");
    const nLinesFile = fileLines.length;

    if (args.insert_line < 0 || args.insert_line > nLinesFile) {
      throw new ToolError(
        `Invalid \`insert_line\` parameter: ${args.insert_line}. It should be within the range of lines of the file: [0, ${nLinesFile}]`,
      );
    }

    const newStrLines = newStr.split("\n");
    const newFileLines = [
      ...fileLines.slice(0, args.insert_line + 1),
      ...newStrLines,
      ...fileLines.slice(args.insert_line + 1),
    ];

    const snippetLines = [
      ...fileLines.slice(
        Math.max(0, args.insert_line - SNIPPET_LINES),
        args.insert_line + 1,
      ),
      ...newStrLines,
      ...fileLines.slice(
        args.insert_line + 1,
        args.insert_line + SNIPPET_LINES,
      ),
    ];

    const newFileContent = newFileLines.join("\n");
    const snippet = snippetLines.join("\n");

    await writeFile(args.path, newFileContent);

    if (!this.fileHistory[args.path]) {
      this.fileHistory[args.path] = [];
    }
    this.fileHistory[args.path].push(fileContent);

    let successMsg = `The file ${args.path} has been edited. `;
    successMsg += makeOutput(
      snippet,
      "a snippet of the edited file",
      Math.max(1, args.insert_line - SNIPPET_LINES + 1),
    );
    successMsg +=
      "Review the changes and make sure they are as expected (correct indentation, no duplicate lines, etc). Edit the file again if necessary.";

    return successMsg;
  }

  async undoEdit(args: UndoEditArgs): Promise<string> {
    await validatePath("undo_edit", args.path);

    if (
      !this.fileHistory[args.path] ||
      this.fileHistory[args.path].length === 0
    ) {
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
