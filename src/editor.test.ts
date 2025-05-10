import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { FileEditor } from './editor.js';
import { promises as fs } from 'fs';
import { ToolError } from './types.js';

// Mock the fs module
vi.mock('fs', async () => {
  const actualFs = await vi.importActual('fs');
  return {
    ...actualFs,
    promises: {
      ...(actualFs.promises as any),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      stat: vi.fn(),
    },
  };
});

describe('FileEditor', () => {
  let editor: FileEditor;

  beforeEach(() => {
    editor = new FileEditor();
    // Reset mocks before each test
    vi.resetAllMocks();
  });

  describe('strReplace', () => {
    it('should replace string with different indentation using fuzzy matching', async () => {
      const filePath = '/test/file.txt';
      const oldStr = '  Hello World  '; // Has leading/trailing spaces
      const newStr = 'Hello Vitest';
      const fileContent = 'This is a test.\nHello World\nAnother line.'; // No leading/trailing spaces

      (fs.readFile as Mock).mockResolvedValue(fileContent);
      (fs.writeFile as Mock).mockResolvedValue(undefined);
      (fs.stat as Mock).mockResolvedValue({ isFile: () => true, isDirectory: () => false });


      const result = await editor.strReplace({ path: filePath, old_str: oldStr, new_str: newStr });

      const expectedNewContent = 'This is a test.\nHello Vitest\nAnother line.';
      expect(fs.writeFile).toHaveBeenCalledWith(filePath, expectedNewContent, 'utf8');
      expect(result).toContain('Levenshtein average distance for match');
      expect(result).toContain('has been edited');
    });

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
      expect(result).toContain('Levenshtein average distance for match');
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
      expect(result).toContain('Levenshtein average distance for match');
      expect(result).toContain('has been edited');
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
  });

    // TODO: Add more tests:
    // - Multi-line replacements with fuzzy matching
    // - Cases where old_str is not found at all (very high distance)
    // - Cases with tabs vs spaces
    // - Replacement with an empty new_str (deletion)
    // - File history and undo (though undo might need its own describe block)
  });
});
