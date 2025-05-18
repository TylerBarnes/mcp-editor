import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

// Mock fs
vi.mock('fs', async () => {
  const actualFs = await vi.importActual('fs');
  return {
    ...actualFs,
    promises: {
      ...(actualFs.promises as any),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      stat: vi.fn(),
    },
  };
});

const execAsyncMock = vi.fn();
vi.doMock('./editor.js', async (importOriginal) => {
  const originalModule = await importOriginal();
  return {
    ...(originalModule as any),
    execAsync: execAsyncMock, // This is not working as execAsync is not exported
  };
});


import { promises as fs } from 'fs'; // fs will be the mocked version here
import { ToolError } from './types.js';
import { FileEditor } from './editor.js';

// Actual test suite starts here
describe('FileEditor', () => {
  let editor: FileEditor;

  beforeEach(async () => {
    const { FileEditor } = await import('./editor.js');
    editor = new FileEditor();
    // Reset mocks before each test
    vi.resetAllMocks();
    execAsyncMock.mockReset(); // Also reset our execAsyncMock
  });

  describe('strReplace', () => {
    it('should replace string with different indentation using fuzzy matching', async () => {
      const filePath = '/test/file.txt';
      const oldStr = '  Hello World\n     Another line.'; // Has leading/trailing spaces
      const newStr = 'Hello Vitest\nAnother line.';
      const fileContent = 'This is a test.\nHello World\n\t\tAnother line.'; // No leading/trailing spaces

      (fs.readFile as Mock).mockResolvedValue(fileContent);
      (fs.writeFile as Mock).mockResolvedValue(undefined);
      (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

      const result = await editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr });

      const expectedNewContent = 'This is a test.\nHello Vitest\nAnother line.';
      expect(fs.writeFile).toHaveBeenCalledWith(filePath, expectedNewContent, 'utf8');
      expect(result).toEqual(`The file /test/file.txt has been edited. Here's the result of running \`cat -n\` on a snippet of /test/file.txt:
     1\tThis is a test.
     2\tHello Vitest
     3\tAnother line.
Review the changes and make sure they are as expected. Edit the file again if necessary.`)
    });

    it('should replace partial single line matches', async () => {
      const filePath = '/test/file.txt';
      const oldStr = 'this.tagIndex.Definitions.keys()'; 
      const newStr = 'this.tagIndex.definitions.keys()';

      const fileContent = `for (const def of sortedDefinitions) {
            const node = def.Key;
            if (node >= this.tagGraph.GetGraph().Nodes.length) {
                continue;
            }

            const nodePath = this.tagGraph.GetGraph().Nodes[node];

            // Collect all definitions for this file
            const fileTags: Tag[] = [];
            // Iterate through all definitions to find tags for the current file
            for (const definitionKey of this.tagIndex.Definitions.keys()) {
                 const definitionTags = this.tagIndex.Definitions.get(definitionKey);
                 if (definitionTags) {
                     for (const tag of definitionTags) {
                         if (tag.RelFname === nodePath) {
                             fileTags.push(tag);
                         }
}

                 }
            }

            // Add sorted by line number
            fileTags.sort((a, b) => a.Line - b.Line);
            tags.push(...fileTags);
        }`;

      (fs.readFile as Mock).mockResolvedValue(fileContent);
      (fs.writeFile as Mock).mockResolvedValue(undefined);
      (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

      const result = await editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr });

      expect(fs.writeFile).toHaveBeenCalledWith(filePath, expect.stringContaining(newStr), 'utf8');
      expect(result).toContain(`The file /test/file.txt has been edited.`)
      expect(result).toContain(newStr)
      expect(result).not.toContain(oldStr)
    })

    it('should replace partial single line matches', async () => {
      const fileContent = `
describe('TagIndex', () => {
  Existing test for language loading
  it('should load supported languages', () => {
    const tagIndex = new TagIndex('./testdata/repo'); // Pass a dummy path
    const loadedLanguages = tagIndex.getLoadedLanguages();
`;
      const oldStr = 'it(\'should load supported languages\', () => {'; 
      const newStr = 'it(\'should load supported languages\', async () => {';

      (fs.readFile as Mock).mockResolvedValue(fileContent);
      (fs.writeFile as Mock).mockResolvedValue(undefined);
      (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

      const filePath = '/test/file.txt';

      const result = await editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr });

      expect(fs.writeFile).toHaveBeenCalledWith(filePath, expect.stringContaining(newStr), 'utf8');
      expect(result).toContain(`The file /test/file.txt has been edited.`)
      expect(result).toContain(newStr)
      expect(result).not.toContain(oldStr)
    })

    it('should replace single line matches where the new string has multiple lines', async () => {
      const filePath = '/test/file.txt';
      const oldStr = '  public getLoadedLanguages(): Record<string, Parser.Language> {'; 
      const newStr = '  public async init(): Promise<void> {\n    await this.loadLanguages();\n  }\n\n  public getLoadedLanguages(): Record<string, Parser.Language> {';

      const fileContent = `
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
`;

      (fs.readFile as Mock).mockResolvedValue(fileContent);
      (fs.writeFile as Mock).mockResolvedValue(undefined);
      (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

      const result = await editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr });

      expect(fs.writeFile).toHaveBeenCalledWith(filePath, expect.stringContaining(newStr), 'utf8');
      expect(result).toContain(`The file /test/file.txt has been edited.`)
      for (const line of newStr.split(`\n`)) {
        expect(result).toContain(line)
      }
    })

    describe('escaping (gemini loves to switch back and forth with double escaping)', () => {
      it('double escaped', async () => {
        const filePath = '/test/file.txt';
        const oldStr = '\\nHello World\\nAnother line.';
        const newStr = 'Hello Vitest\\n';
        const fileContent = 'This is a test.\nHello World\nAnother line.';

        (fs.readFile as Mock).mockResolvedValue(fileContent);
        (fs.writeFile as Mock).mockResolvedValue(undefined);
        (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

        const result = await editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr });

        const expectedNewContent = 'This is a test.\nHello Vitest\n';
        expect(fs.writeFile).toHaveBeenCalledWith(filePath, expectedNewContent, 'utf8');
        expect(result).toContain('The file /test/file.txt has been edited');

      })

      it('regular escaped old, double escaped new', async () => {
        const filePath = '/test/file.txt';
        const oldStr = '\nHello World\nAnother line.';
        const newStr = 'Hello Vitest\\n';
        const fileContent = 'This is a test.\nHello World\nAnother line.';

        (fs.readFile as Mock).mockResolvedValue(fileContent);
        (fs.writeFile as Mock).mockResolvedValue(undefined);
        (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

        const result = await editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr });

        const expectedNewContent = 'This is a test.\nHello Vitest\n';
        expect(fs.writeFile).toHaveBeenCalledWith(filePath, expectedNewContent, 'utf8');
        expect(result).toContain('The file /test/file.txt has been edited');

      })

      it('double escaped old, regular escaped new', async () => {
        const filePath = '/test/file.txt';
        const oldStr = '\\nHello World\\nAnother line.';
        const newStr = 'Hello Vitest\n';
        const fileContent = 'This is a test.\nHello World\nAnother line.';

        (fs.readFile as Mock).mockResolvedValue(fileContent);
        (fs.writeFile as Mock).mockResolvedValue(undefined);
        (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

        const result = await editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr });

        const expectedNewContent = 'This is a test.\nHello Vitest\n';
        expect(fs.writeFile).toHaveBeenCalledWith(filePath, expectedNewContent, 'utf8');
        expect(result).toContain('The file /test/file.txt has been edited');

      })

      it('mixed double escaping', async () => {
        const filePath = '/test/file.txt';
        // TODO: because we split on newlines and compare one line at a time, replacing whitespace at the start/end of the string doesn't actually work. in our editor tool we need to check for this and join the split array items into a single line for this to work
        const oldStr = '\t\\nHello World\nAnother line.';
        const newStr = 'Hello Vitest\\nwhat up\n';
        const fileContent = 'This is a test.\t\nHello World\nAnother line.';

        (fs.readFile as Mock).mockResolvedValue(fileContent);
        (fs.writeFile as Mock).mockResolvedValue(undefined);
        (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

        const result = await editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr });

        const expectedNewContent = 'This is a test.\t\nHello Vitest\nwhat up\n';
        expect(fs.writeFile).toHaveBeenCalledWith(filePath, expectedNewContent, 'utf8');
        expect(result).toContain('The file /test/file.txt has been edited');
      })

      it('nested escaping', async () => {
        const filePath = '/test/file.txt';
        const oldStr = '\\nHello World\n"a string \\n that should be double escaped"\nAnother line.';
        const newStr = 'Hello Vitest\\n"a string \\n that is double escaped"\n';
        const fileContent = 'This is a test.\nHello World\n"a string \\n that should be double escaped"\nAnother line.\n`a string\\ninside backticks`\n\'a string\\n inside single quotes\'';

        (fs.readFile as Mock).mockResolvedValue(fileContent);
        (fs.writeFile as Mock).mockResolvedValue(undefined);
        (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

        const result = await editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr });

        // test escaped chars in double quotes
        // TODO: we shouldn't have a double newline after the first string here, right?
        const expectedNewContent = 'This is a test.\nHello Vitest\n"a string \\n that is double escaped"\n\n`a string\\ninside backticks`\n\'a string\\n inside single quotes\'';
        expect(fs.writeFile).toHaveBeenCalledWith(filePath, expectedNewContent, 'utf8');
        expect(result).toContain('The file /test/file.txt has been edited');

        // and in backticks
        (fs.readFile as Mock).mockResolvedValue(expectedNewContent);
        (fs.writeFile as Mock).mockResolvedValue(undefined);
        const result2 = await editor.strReplace({ path: filePath, old_str: '\nHello Vitest\n"a string \\n that is double escaped"\n\n`a string\\ninside backticks`', new_str: '\nGoodbye Vitest\n"a string \\n that is definitely double escaped"\n\n`a string\\ninside backticks that still has the right escaping`'});
        const expectedNewContent2 = 'This is a test.\n\nGoodbye Vitest\n"a string \\n that is definitely double escaped"\n\n`a string\\ninside backticks that still has the right escaping`\n\'a string\\n inside single quotes\''
                expect(fs.writeFile).toHaveBeenCalledWith(filePath, expectedNewContent2, 'utf8');
        expect(result2).toContain('The file /test/file.txt has been edited');
      })
    })
  });

  describe(`insert`, async () => {
    it('backticks in function call strings are unescaped', async () => {
        const filePath = '/test/file.txt';
        const fileContent = 'This is a test.\t\nHello World\nAnother line.';

        (fs.readFile as Mock).mockResolvedValue(fileContent);
        (fs.writeFile as Mock).mockResolvedValue(undefined);
        (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

        const result = await editor.insert({
          path: filePath,
          new_str: "console.log(\\`Processing file: ${relPath}\\`);",
          insert_line: 3        
        })
        expect(result).toContain('console.log(`Processing file: ${relPath}`);\n');
        expect(result).not.toContain('console.log(\\`Processing file: ${relPath}\\`);\n');
      })
  })

  it('should throw ToolError if no sufficiently close match is found', async () => {
    const filePath = '/test/file.txt';
    const oldStr = 'NonExistentString';
    const newStr = 'ThisShouldNotReplace';
    const fileContent = 'This is a test.\nHello World\nAnother line.';

    (fs.readFile as Mock).mockResolvedValue(fileContent);
    (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

    await expect(editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr }))
      .rejects.toThrow(ToolError);
    await expect(editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr }))
      .rejects.toThrow(/No replacement was performed/);
  });

  it('should throw ToolError with divergence message if matching lines were found for multiple lines before diverging', async () => {
    const filePath = '/test/file.txt';
    const oldStr = 'This is a test.\nHello World\n  Another line.. so close\nAnd another.';
    const newStr = 'ThisShouldNotReplace';
    const fileContent = 'This is a test.\nHello World\n\tAnother line.\nAnd another.\nAnd one more..';

    (fs.readFile as Mock).mockResolvedValue(fileContent);
    (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

    await expect(editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr }))
      .rejects.toThrow(ToolError);
    await expect(editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr }))
      .rejects.toThrow(`No replacement was performed. No sufficiently close match for old_str found in /test/file.txt.\nold_str matching diverged after 2 matching lines.\nExpected line from old_str: \`  Another line.. so close\` (line 3 in old_str), found line: \`\tAnother line.\` (line 3 in file). 1 lines remained to compare but they were not checked due to this line not matching.\nTry adjusting your input or the file content.`);
  })


  it('should perform multi-line replacement with fuzzy matching and different indentation', async () => {
    const filePath = '/test/multiline.txt';
    const oldStr = '  First line\n    Second line with extra space\n  Third line';
    const newStr = 'New first line\nNew second line\nNew third line';
    const fileContent = 'Some text before\nFirst line\n Second line with extra space\nThird line\nSome text after'; // Note the slightly different indentation

    (fs.readFile as Mock).mockResolvedValue(fileContent);
    (fs.writeFile as Mock).mockResolvedValue(undefined);
    (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

    const result = await editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr });

    const expectedNewContent = 'Some text before\nNew first line\nNew second line\nNew third line\nSome text after';
    expect(fs.writeFile).toHaveBeenCalledWith(filePath, expectedNewContent, 'utf8');
    expect(result).toEqual(`The file /test/multiline.txt has been edited. Here's the result of running \`cat -n\` on a snippet of /test/multiline.txt:
     1\tSome text before
     2\tNew first line
     3\tNew second line
     4\tNew third line
     5\tSome text after
Review the changes and make sure they are as expected. Edit the file again if necessary.`)
    expect(result).toContain('has been edited');
  });

  it('should not replace if old_str is very different (high Levenshtein distance)', async () => {
    const filePath = '/test/file.txt';
    const oldStr = 'Completely unrelated string';
    const newStr = 'Should not appear';
    const fileContent = 'Line one\nLine two\nLine three';

    (fs.readFile as Mock).mockResolvedValue(fileContent);
    (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

    await expect(editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr }))
      .rejects.toThrow(/No replacement was performed/);
  });

  it('should replace even if old_str uses tabs and file uses spaces (and vice versa)', async () => {
    const filePath = '/test/tabs-vs-spaces.txt';
    const oldStr = '\tTabbed line one\n\tTabbed line two'; // uses tabs
    const newStr = 'Replaced line one\nReplaced line two';
    const fileContent = '    Tabbed line one\n    Tabbed line two'; // uses spaces

    (fs.readFile as Mock).mockResolvedValue(fileContent);
    (fs.writeFile as Mock).mockResolvedValue(undefined);
    (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

    const result = await editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr });

    const expectedNewContent = 'Replaced line one\nReplaced line two';
    expect(fs.writeFile).toHaveBeenCalledWith(filePath, expectedNewContent, 'utf8');
    expect(result).toBe(`The file /test/tabs-vs-spaces.txt has been edited. Here's the result of running \`cat -n\` on a snippet of /test/tabs-vs-spaces.txt:
     1\tReplaced line one
     2\tReplaced line two
Review the changes and make sure they are as expected. Edit the file again if necessary.`)
  });

  it('should delete the matched block if new_str is empty', async () => {
    const filePath = '/test/delete-block.txt';
    const oldStr = 'Delete me!\nAnd me too!';
    const newStr = '';
    const fileContent = 'Keep this\nDelete me!\nAnd me too!\nAnd this too';

    (fs.readFile as Mock).mockResolvedValue(fileContent);
    (fs.writeFile as Mock).mockResolvedValue(undefined);
    (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

    const result = await editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr });

    const expectedNewContent = 'Keep this\nAnd this too'; // Allow blank lines if present, just check block is gone
    expect(fs.writeFile).toHaveBeenCalledWith(filePath, expectedNewContent, 'utf8');
    expect(result).toContain('has been edited');
  });


  describe('undoEdit', () => {
    it('should undo the last edit to a file', async () => {
      const filePath = '/test/undoable.txt';
      const initialContent = 'Line 1\nLine 2\nLine 3';
      const changedContent = 'Line 1\nCHANGED Line 2\nLine 3';

      // Mock initial read for strReplace
      (fs.readFile as Mock).mockResolvedValueOnce(initialContent);
      // Mock stat for strReplace
      (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });
      // Mock writeFile for strReplace
      (fs.writeFile as Mock).mockResolvedValueOnce(undefined);

      // Perform an edit
      await editor.strReplace({
        path: filePath,
        old_str: 'Line 2',
        new_str: 'CHANGED Line 2',
      });

      // Mock writeFile for undoEdit (this is the one we'll check for old content)
      (fs.writeFile as Mock).mockResolvedValueOnce(undefined);
      // Mock stat for undoEdit
      (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

      const result = await editor.undoEdit({ path: filePath });

      // Check that writeFile was called with the initial content during undo
      expect(fs.writeFile).toHaveBeenCalledWith(filePath, initialContent, 'utf8');
      expect(result).toContain(`Last edit to ${filePath} undone successfully`);
      expect(result).toContain('1\tLine 1'); // Check for a line from makeOutput
    });

    it('should throw ToolError if no edit history is found for the file', async () => {
      const filePath = '/test/no-history.txt';
      (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false }); // For validatePath

      await expect(editor.undoEdit({ path: filePath }))
        .rejects.toThrow(ToolError);
      await expect(editor.undoEdit({ path: filePath }))
        .rejects.toThrow(`No edit history found for ${filePath}`);
    });

    describe('view', () => {
      it('should view the content of a file', async () => {
        const filePath = '/test/viewfile.txt';
        const fileContent = 'Line 1\nLine 2\nLine 3';
        (fs.readFile as Mock).mockResolvedValue(fileContent);
        (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

        const result = await editor.view({ path: filePath });

        expect(result).toContain(`Here's the result of running \`cat -n\` on ${filePath}`);
        expect(result).toContain('1\tLine 1');
        expect(result).toContain('2\tLine 2');
        expect(result).toContain('3\tLine 3');
      });

      it('should throw if the file does not exist', async () => {
        const filePath = '/test/missing.txt';
        (fs.readFile as Mock).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        (fs.stat as Mock).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

        await expect(editor.view({ path: filePath }))
          .rejects.toThrow(/does not exist/);

        const fileContent = 'Line 1\nLine 2\nLine 3';
        (fs.readFile as Mock).mockResolvedValue(fileContent);
      });

      it('should handle if view_range is out of bounds', async () => {
        const filePath = '/test/viewrange-outofbounds.txt';
        const fileContent = 'Line 1\nLine 2\nLine 3';
        (fs.readFile as Mock).mockResolvedValue(fileContent);
        (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

        // Start line < 1
        // TODO: this is dumb, just change 0 to 1 so the tool works
        await expect(editor.view({ path: filePath, view_range: [0, 2] }))
          .rejects.toThrow(/Invalid `view_range`/);

        // Start line > number of lines
        await expect(editor.view({ path: filePath, view_range: [10, 12] }))
          .rejects.toThrow(/Invalid `view_range`/);

        // End line < start line
        await expect(editor.view({ path: filePath, view_range: [2, 1] }))
          .rejects.toThrow(/Invalid `view_range`/);

        // End line > number of lines, we just make end range last line instead of throwing
        await expect(editor.view({ path: filePath, view_range: [2, 10] }))
          .resolves.not.toThrow(/Invalid `view_range`/);

        (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

        const result = await editor.view({ path: filePath });

        expect(result).toContain(`Here's the result of running \`cat -n\` on ${filePath}`);
        expect(result).toContain('1\tLine 1');
        expect(result).toContain('2\tLine 2');
        expect(result).toContain('3\tLine 3');
      });
      it('should throw if view_range is used on a directory', async () => {
        const dirPath = '/test/dir';
        (fs.stat as Mock).mockResolvedValue({ isFile: () => false, isDirectory: () => true });
        // @ts-expect-error accessing private property
        editor.execAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
        await expect(editor.view({ path: dirPath, view_range: [1, 2] }))
          .rejects.toThrow(/view_range.*not allowed.*directory/);
      });

      it('should handle empty files', async () => {
        const filePath = '/test/empty.txt';
        const fileContent = '';
        (fs.readFile as Mock).mockResolvedValue(fileContent);
        (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });
        const result = await editor.view({ path: filePath });
        expect(result).toContain('cat -n');
      });

      it('should handle files with only one line', async () => {
        const filePath = '/test/one-line.txt';
        const fileContent = 'Just one line';
        (fs.readFile as Mock).mockResolvedValue(fileContent);
        (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });
        const result = await editor.view({ path: filePath });
        expect(result).toContain('1\tJust one line');
      });

      it('should handle view_range: [1, -1] (show all lines)', async () => {
        const filePath = '/test/all-lines.txt';
        const fileContent = 'A\nB\nC';
        (fs.readFile as Mock).mockResolvedValue(fileContent);
        (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });
        const result = await editor.view({ path: filePath, view_range: [1, -1] });
        expect(result).toContain('1\tA');
        expect(result).toContain('2\tB');
        expect(result).toContain('3\tC');
      });
    });

    it('should view a specific range of lines in a file', async () => {
      const filePath = '/test/viewrange.txt';
      const fileContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
      (fs.readFile as Mock).mockResolvedValue(fileContent);
      (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });

      const result = await editor.view({ path: filePath, view_range: [2, 4] });

      expect(result).toContain(`Here's the result of running \`cat -n\` on ${filePath}`);
      expect(result).not.toContain('1\tLine 1');
      expect(result).toContain('2\tLine 2');
      expect(result).toContain('3\tLine 3');
      expect(result).toContain('4\tLine 4');
      expect(result).not.toContain('5\tLine 5');
    });


    it('should view a directory listing', async () => {
      const dirPath = '/test/dir';
      const dirListing = 'file1.txt\ndir1\n  file2.txt';
      (fs.stat as Mock).mockResolvedValue({ isFile: () => false, isDirectory: () => true });

      // Set the execAsync mock for this instance
      // @ts-expect-error accessing private property
      editor.execAsync = vi.fn().mockResolvedValue({ stdout: dirListing, stderr: '' });

      const result = await editor.view({ path: dirPath });

      expect(result).toContain(`Here's the files and directories up to 2 levels deep in ${dirPath}`);
      expect(result).toContain(dirListing);
    });

  // TODO: Add more tests:
  // - Multi-line replacements with fuzzy matching
  // - Cases where old_str is not found at all (very high distance)
  // - Cases with tabs vs spaces
  // - Replacement with an empty new_str (deletion)
  // - File history and undo (though undo might need its own describe block)
  });
});
