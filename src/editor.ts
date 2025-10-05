import { promises as fs } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { distance } from "fastest-levenshtein";

export function removeWhitespace(str: string): string {
  return str
    .replace(/\t/g, "") // tabs to spaces
    .replace(/ +/g, "") // collapse multiple spaces
    .replace(/^ +| +$/gm, "") // trim each line
    .replace(/\r?\n/g, "\n")
    .replace(/\s/g, "")
    .replaceAll(`\\n`, `\n`); // normalize newlines
}

export function removeVaryingChars(str: string): string {
  return (
    removeWhitespace(str)
      .replaceAll(`\n`, ``)
      .replaceAll(`'`, ``)
      .replaceAll(`"`, ``)
      .replaceAll("`", ``)
      // .replaceAll(`;`, ``) // this sometimes causes an extra ; to be printed! TODO: should it be fixed another way? there's a test for this that will fail if this is uncommented
      .replaceAll(`\\r`, ``)
  );
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
import { match } from "assert";

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
      /("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`|\/([^\/\\\n]|\\.)+\/[gimsuy]*)|\\n|\\r|\\t|\\"|\\'|\\`/g,
      (match) => {
        if (
          match.startsWith('"') ||
          match.startsWith("'") ||
          match.startsWith("`") ||
          match.startsWith("/")
        ) {
          return match; // skip unescaping inside strings, backticks, or regex literals
        }
        // outside of those: unescape
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

    if (args.old_str === args.new_str) {
      throw new ToolError(`Received the same string for old_str and new_str`);
    }
    const fileContent = await readFile(args.path);

    // First, try exact match with the raw string (no processing)
    // This handles cases where the search/replace should work exactly as provided
    if (fileContent.includes(args.old_str)) {
      // Exact match found! Use simple string replacement
      // But still process the new string with undoubleEscape to handle escaping correctly
      const processedNewStr = this.undoubleEscape(args.new_str || "");
      const newFileContent = fileContent
        .split(args.old_str)
        .join(processedNewStr);

      // Save the file
      await writeFile(args.path, newFileContent);

      // Store in history
      if (!this.fileHistory[args.path]) {
        this.fileHistory[args.path] = [];
      }
      this.fileHistory[args.path].push(fileContent);

      // Find the line number for the snippet
      const fileLines = newFileContent.split("\n");
      const replacementLineIndex =
        fileContent.substring(0, fileContent.indexOf(args.old_str)).split("\n")
          .length - 1;
      const startLine = Math.max(0, replacementLineIndex - SNIPPET_LINES);
      const endLine = Math.min(
        fileLines.length,
        replacementLineIndex +
          SNIPPET_LINES +
          (args.new_str || "").split("\n").length,
      );
      const snippet = fileLines.slice(startLine, endLine).join("\n");

      let successMsg = `The file ${args.path} has been edited. `;
      successMsg += makeOutput(
        snippet,
        `a snippet of ${args.path}`,
        startLine + 1,
      );
      successMsg +=
        "Review the changes and make sure they are as expected. Edit the file again if necessary.";

      return successMsg;
    }

    // If exact match fails, proceed with fuzzy whitespace-agnostic matching
    // First apply undoubleEscape for the fuzzy matching
    const processedOldStr = this.undoubleEscape(args.old_str);
    const processedNewStr = this.undoubleEscape(args.new_str || "");

    // Remove leading line numbers and whitespace from each line
    // const removeLeadingLineNumbers = (str: string): string => {
    //   return str
    //     .split("\n")
    //     .map((line) => line.replace(/^\s*\d+\s*/, ""))
    //     .join("\n");
    // };

    let oldStr = processedOldStr;
    let newStr = processedNewStr;

    if (oldStr.startsWith(`\\\n`)) {
      oldStr = oldStr.substring(`\\\n`.length);
    }
    if (newStr.startsWith(`\\\n`)) {
      newStr = newStr.substring(`\\\n`.length);
    }
    const startLineArg =
      typeof args.start_line === `number`
        ? Math.max(args.start_line - 5, 0) // - 3 cause llms are not precise
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
    const split = (str: string): string[] => {
      return str
        .replaceAll("\\n", "\n")
        .split("\n")
        .map((l) => l.replaceAll(`\n`, `\\n`));
    };
    const fileLines = split(fileContent);
    const normFileLines = fileLines.map(removeWhitespace);
    // const threshold = Math.max(2, Math.floor(oldStr.length * 0.1));

    let bestMatch: {
      start: number;
      end?: number;
      avgDist: number;
      type: "replace-lines" | "replace-in-line" | "delete-line";
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

    // const escapeCountOld = oldStr.split(`\n`).join(``).match(/\\\\/g);
    //
    // if ((escapeCountOld?.length || 0) > 40) {
    //   throw new ToolError(
    //     `Found more than 40 backslash characters in the old_str. This indicates the input string has been escaped instead of passed in directly.`,
    //   );
    // }
    //
    // const escapeCountNew = newStr.split(`\n`).join(``).match(/\\/g);
    //
    // if ((escapeCountNew?.length || 0) > 40) {
    //   throw new ToolError(
    //     `Found more than 40 backslash characters in the new_str. This indicates the input string has been escaped instead of passed in directly.`,
    //   );
    // }

    let divergedMessage: string | undefined;
    let divergenceAfterX = 0;

    const fileNoSpace = removeVaryingChars(fileContent);
    const oldStringNoSpace = removeVaryingChars(oldStr);
    console.log(
      { fileNoSpace, oldStringNoSpace },
      fileNoSpace.includes(oldStringNoSpace),
      fileNoSpace.includes(oldStringNoSpace.substring(0, -1)),
    );
    if (fileNoSpace.includes(oldStringNoSpace.substring(0, -1))) {
      console.log(`yes!!`);
      // console.log(`yes!!`, fileNoSpace, oldStringNoSpace);

      let oldStringNoSpaceBuffer = oldStringNoSpace;
      let startIndex: null | number = null;
      let endIndex: null | number = null;
      for (const [index, line] of split(fileContent).entries()) {
        if (
          startIndex === null &&
          typeof startLineArg !== `undefined` &&
          index + 1 > startLineArg + 50 // allow for llm to be off by 50 lines lmao
        ) {
          continue;
        }
        if (typeof startLineArg !== `undefined` && index < startLineArg) {
          continue;
        }

        const lineNoSpace = removeVaryingChars(line);
        if (lineNoSpace === `` && !startIndex) continue;
        const startsWith = oldStringNoSpaceBuffer.startsWith(lineNoSpace);
        const startsWithNoDanglingCommaTho =
          !startsWith &&
          lineNoSpace.endsWith(`,`) &&
          oldStringNoSpaceBuffer
            .substring(lineNoSpace.length - 1)
            .startsWith(`)`) &&
          oldStringNoSpaceBuffer.startsWith(
            lineNoSpace.substring(0, lineNoSpace.length - 1),
          );
        if (
          startsWith ||
          // allow for missing dangling comma
          // TODO: this should only apply to JS/TS files
          startsWithNoDanglingCommaTho
        ) {
          console.log({
            line,
            lineNoSpace,
            startOld: oldStringNoSpaceBuffer.substring(0, 5),
            startIndex,
            index,
          });

          if (startIndex === null) {
            startIndex = index;
            console.log(`starting match on line ${index} ${line}`);
          }
          oldStringNoSpaceBuffer = oldStringNoSpaceBuffer.substring(
            startsWithNoDanglingCommaTho
              ? lineNoSpace.length - 1 // remove the comma
              : lineNoSpace.length,
          );
          if (oldStringNoSpaceBuffer.length === 0 && startIndex !== null) {
            endIndex = index;
            console.log(`ending match on line ${index} ${line}`);
            break;
          }
        } else if (startIndex !== null) {
          console.log(`diverged`, { oldStringNoSpaceBuffer, lineNoSpace });
          // diverged from a partial match. reset
          startIndex = null;
          oldStringNoSpaceBuffer = oldStringNoSpace;
        }
      }
      if (startIndex !== null && endIndex !== null) {
        bestMatch.start = startIndex;
        bestMatch.end = endIndex;
        console.info(
          `Using whitespace collapsed old_str as as start/end index`,
        );
      }
      // console.log({ startIndex, endIndex });
    }
    // console.error(normFileLines);

    // console.log({ isSingleLineReplacement });
    for (const [index, normLine] of normFileLines.entries()) {
      if (!normLine) continue;
      // we already matched above!
      if (bestMatch.end) break;
      if (typeof startLineArg !== `undefined` && index + 1 < startLineArg)
        continue;
      // if there's a start line it must match within the next 50 lines
      if (typeof startLineArg !== `undefined` && index + 1 > startLineArg + 50)
        continue;

      if (
        typeof startLineArg !== `undefined` &&
        index + 1 > startLineArg + 5 &&
        isSingleLineReplacement
      ) {
        // only break early for single line replacements.. if the llm added a line number to start from + multiple lines to match, often it gets confused about the line numbers, so keep going until the end.
        break;
      }
      // console.log(index, normLine, oldLines[0]);
      // this line is equal to the first line in our from replacement. Lets check each following line to see if we match
      const firstDistance = distance(oldLines[0] || "", normLine || "");
      const firstPercentDiff = (firstDistance / (normLine?.length || 0)) * 100;
      if (firstPercentDiff < 10 && firstPercentDiff > 0) {
        console.error({
          firstPercentDiff,
          firstDistance,
          lineLength: normLine?.length || 0,
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
          const nextInnerNormLine = normFileLines[index + matchIndex + 1];
          const nextOldLine = oldLines[matchIndex + 1];
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
            console.error(
              `matching ${index + matchIndex}`,
              oldLinesOriginal[matchIndex],
            );
          } else {
            const message = `old_str matching diverged after ${matchingLineCount} matching lines.\nExpected line from old_str: \`${oldLinesOriginal[matchIndex]}\` (line ${matchIndex + 1} in old_str), found line: \`${fileLines[index + matchIndex]}\` (line ${index + 1 + matchIndex} in file). ${remainingLines - 1} lines remained to compare but they were not checked due to this line not matching.\n\nHere are the lines that did match up until the old_str diverged:\n\n${oldLinesOriginal.slice(0, matchIndex).join(`\n`)}\n\nHere are the remaining lines you would've had to provide for the old_str to match:\n\n${fileLines
              .slice(index + matchIndex, index + matchIndex + remainingLines)
              .join(`\n`)}`;
            console.error(message);
            console.error(
              `---->>>>Next line matches? `,
              nextInnerNormLine === nextOldLine,
            );
            console.error(
              `Remaining actual lines that would've matched:`,
              fileLines.slice(
                index + matchIndex,
                index + matchIndex + remainingLines,
              ),
            );
            console.error(
              `Remaining old_string lines that didn't match:`,
              oldLinesOriginal.slice(matchIndex),
            );

            // tell the llm about the longest matching string so it can adjust the next input
            if (matchingLineCount > divergenceAfterX) {
              divergenceAfterX = matchingLineCount;
              divergedMessage = message;
            }
            // we could also do levenstein here
            isMatching = false;
            // we diverged
            // continue;
            break;
          }
        }
        if (isMatching) {
          bestMatch.start = index;
          console.error(`matched! ${index}`);
          break;
        }
      } else {
        // console.log(normLine);
      }
    }

    console.log({
      bestMatch,
      isSingleLineReplacement,
      newStr,
      startLineArg,
      oldStr,
    });

    if (
      bestMatch.start === -1 &&
      (isSingleLineReplacement || oldStr === `\n`) &&
      newStr === `` &&
      typeof startLineArg === `number`
    ) {
      // we're just deleting a line
      bestMatch.start = startLineArg;
      bestMatch.type = "delete-line";
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
        ...fileLines.slice(
          bestMatch.end ? bestMatch.end + 1 : bestMatch.start + oldLines.length,
        ),
      ];
      // console.log({ newFileLines });
      newFileContent = newFileLines.join("\n");
      await writeFile(args.path, newFileContent);
    } else if (bestMatch.type === `replace-in-line`) {
      const [firstNew, ...restNew] = newStr ? newStr.split("\n") : [];
      const newFileLines = [
        ...fileLines.slice(0, bestMatch.start),
        ...(restNew?.length
          ? [firstNew, ...restNew]
          : [
              fileLines
                .at(bestMatch.start)!
                .replace(oldLinesOriginal[0], firstNew || ""),
            ]),
        ...fileLines.slice(bestMatch.start + 1),
      ];
      newFileContent = newFileLines.join("\n");
      await writeFile(args.path, newFileContent);
    } else if (bestMatch.type === `delete-line`) {
      const newFileLines = [
        ...fileLines.slice(0, bestMatch.start),
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
