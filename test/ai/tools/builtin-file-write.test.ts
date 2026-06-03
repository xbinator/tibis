/**
 * @file builtin-file-write.test.ts
 * @description 内置 write_file 工具测试。
 */
import type { AIToolContext } from 'types/ai';
import { describe, expect, it, vi } from 'vitest';
import { createBuiltinWriteFileTool } from '@/ai/tools/builtin/FileWriteTool';
import type { OpenDraftInput, OpenDraftResult } from '@/ai/tools/shared/types';
import type { StoredFile } from '@/shared/storage/files/types';

/**
 * 创建测试用工具上下文。
 * @param path - 当前激活文档路径
 * @param locator - 当前激活文档定位符
 * @returns 工具执行上下文
 */
function createToolContext(path: string | null, locator?: string): AIToolContext {
  return {
    document: {
      id: 'doc-1',
      title: 'Example',
      path,
      locator,
      getContent: () => 'const value = 1;\n'
    },
    editor: {
      getSelection: () => null,
      insertAtCursor: async () => undefined,
      replaceSelection: async () => undefined,
      replaceDocument: async () => undefined
    }
  };
}

/**
 * 创建测试用未保存草稿。
 * @param overrides - 覆盖字段
 * @returns 草稿记录
 */
function createUnsavedDraft(overrides: Partial<StoredFile> = {}): StoredFile {
  return {
    type: 'file' as const,
    id: 'ytjdxrm4',
    path: null,
    content: '# Draft\n',
    savedContent: '# Draft\n',
    name: 'Untitled',
    ext: 'md',
    ...overrides
  };
}

describe('createBuiltinWriteFileTool', () => {
  it('allows creating a new file without a prior read', async () => {
    const writeFile = vi.fn(async () => undefined);
    const tool = createBuiltinWriteFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
      readWorkspaceFile: async () => {
        const error = new Error('missing') as Error & { code: string };
        error.code = 'FILE_NOT_FOUND';
        throw error;
      },
      writeFile
    });

    const result = await tool.execute({
      path: 'src/new-file.ts',
      content: 'export const value = 1;\n'
    });

    expect(result.status).toBe('success');
    expect(result.data).toEqual({
      path: '/workspace/src/new-file.ts',
      content: 'export const value = 1;\n',
      created: true
    });
    expect(writeFile).toHaveBeenCalledWith('/workspace/src/new-file.ts', 'export const value = 1;\n');
  });

  it('allows overwriting an existing file even when it was never read', async () => {
    const writeFile = vi.fn(async () => undefined);
    const tool = createBuiltinWriteFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
      readWorkspaceFile: async () => ({
        path: '/workspace/src/example.ts',
        content: 'const value = 1;\n',
        totalLines: 1,
        readLines: 1,
        hasMore: false,
        nextOffset: null
      }),
      writeFile
    });

    const result = await tool.execute({
      path: 'src/example.ts',
      content: 'const value = 2;\n'
    });

    expect(result.status).toBe('success');
    expect(result.data).toEqual({
      path: '/workspace/src/example.ts',
      content: 'const value = 2;\n',
      created: false
    });
    expect(writeFile).toHaveBeenCalledWith('/workspace/src/example.ts', 'const value = 2;\n');
  });

  it('allows overwriting when the file content changed before confirmation', async () => {
    const writeFile = vi.fn(async () => undefined);
    const tool = createBuiltinWriteFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
      readWorkspaceFile: async () => ({
        path: '/workspace/src/example.ts',
        content: 'const value = 3;\n',
        totalLines: 1,
        readLines: 1,
        hasMore: false,
        nextOffset: null
      }),
      writeFile
    });

    const result = await tool.execute({
      path: 'src/example.ts',
      content: 'const value = 2;\n'
    });

    expect(result.status).toBe('success');
    expect(writeFile).toHaveBeenCalledWith('/workspace/src/example.ts', 'const value = 2;\n');
  });

  it('writes an existing file after confirmation', async () => {
    const writeFile = vi.fn(async () => undefined);
    const tool = createBuiltinWriteFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
      readWorkspaceFile: async () => ({
        path: '/workspace/src/example.ts',
        content: 'const value = 1;\n',
        totalLines: 1,
        readLines: 1,
        hasMore: false,
        nextOffset: null
      }),
      writeFile
    });

    const result = await tool.execute({
      path: 'src/example.ts',
      content: 'const value = 2;\n'
    });

    expect(result.status).toBe('success');
    expect(result.data).toEqual({
      path: '/workspace/src/example.ts',
      content: 'const value = 2;\n',
      created: false
    });
    expect(writeFile).toHaveBeenCalledWith('/workspace/src/example.ts', 'const value = 2;\n');
  });

  it('writes to the active editor document when the target path matches it', async () => {
    const writeFile = vi.fn(async () => undefined);
    const replaceDocument = vi.fn(async () => undefined);
    const tool = createBuiltinWriteFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
      readWorkspaceFile: async () => ({
        path: '/workspace/src/example.ts',
        content: 'const value = 1;\n',
        totalLines: 1,
        readLines: 1,
        hasMore: false,
        nextOffset: null
      }),
      writeFile
    });
    const context = createToolContext('/workspace/src/example.ts');
    context.editor.replaceDocument = replaceDocument;

    const result = await tool.execute(
      {
        path: 'src/example.ts',
        content: 'const value = 2;\n'
      },
      context
    );

    expect(result.status).toBe('success');
    expect(replaceDocument).toHaveBeenCalledWith('const value = 2;\n');
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('writes to the active unsaved document when the target locator matches it', async () => {
    const writeFile = vi.fn(async () => undefined);
    const replaceDocument = vi.fn(async () => undefined);
    const tool = createBuiltinWriteFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
      readWorkspaceFile: async () => {
        throw new Error('should not read workspace file');
      },
      writeFile
    });
    const unsavedPath = 'unsaved://ytjdxrm4/Untitled.md';
    const context = createToolContext(null, unsavedPath);
    context.editor.replaceDocument = replaceDocument;

    const result = await tool.execute(
      {
        path: unsavedPath,
        content: '# Updated Draft\n'
      },
      context
    );

    expect(result.status).toBe('success');
    expect(result.data).toEqual({
      path: unsavedPath,
      content: '# Updated Draft\n',
      created: false
    });
    expect(replaceDocument).toHaveBeenCalledWith('# Updated Draft\n');
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('writes to a stored unsaved draft when the target locator is not active', async () => {
    const writeFile = vi.fn(async () => undefined);
    const updateUnsavedDraft = vi.fn(async (_fileId: string, updates: Partial<StoredFile>) => {
      return createUnsavedDraft(updates);
    });
    const tool = createBuiltinWriteFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
      getUnsavedDraft: async () => createUnsavedDraft(),
      updateUnsavedDraft,
      readWorkspaceFile: async () => {
        throw new Error('should not read workspace file');
      },
      writeFile
    });
    const unsavedPath = 'unsaved://ytjdxrm4/Untitled.md';

    const result = await tool.execute(
      {
        path: unsavedPath,
        content: '# Updated Draft\n'
      },
      createToolContext('/workspace/src/example.ts')
    );

    expect(result.status).toBe('success');
    expect(result.data).toEqual({
      path: unsavedPath,
      content: '# Updated Draft\n',
      created: false
    });
    expect(updateUnsavedDraft).toHaveBeenCalledWith('ytjdxrm4', {
      content: '# Updated Draft\n',
      modifiedAt: expect.any(Number)
    });
    expect(writeFile).not.toHaveBeenCalled();
  });

  describe('draft fallback (no workspace + relative path)', () => {
    it('enters draft branch when no workspace and relative path', async () => {
      const openDraft = vi.fn(async (input: OpenDraftInput): Promise<OpenDraftResult> => {
        return {
          file: createUnsavedDraft({ id: 'abc123', name: 'idea', ext: 'md', content: input.content }),
          unsavedPath: 'unsaved://abc123/idea.md'
        };
      });
      const tool = createBuiltinWriteFileTool({
        confirm: { confirm: async () => true },
        getWorkspaceRoot: () => null,
        openDraft
      });

      const result = await tool.execute({
        path: 'notes/idea',
        content: '# My Idea\n'
      });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.path).toBe('unsaved://abc123/idea.md');
        expect(result.data.content).toBe('# My Idea\n');
        expect(result.data.created).toBe(true);
      }
      expect(openDraft).toHaveBeenCalledWith({ originalPath: 'notes/idea', content: '# My Idea\n' });
    });

    it('requests user confirmation before creating draft', async () => {
      const confirmFn = vi.fn(async () => ({ approved: true }));
      const openDraft = vi.fn(async (input: OpenDraftInput): Promise<OpenDraftResult> => {
        return {
          file: createUnsavedDraft({ id: 'abc123', content: input.content }),
          unsavedPath: 'unsaved://abc123/idea.md'
        };
      });
      const tool = createBuiltinWriteFileTool({
        confirm: { confirm: confirmFn },
        getWorkspaceRoot: () => null,
        openDraft
      });

      await tool.execute({
        path: 'notes/idea',
        content: '# My Idea\n'
      });

      expect(confirmFn).toHaveBeenCalledTimes(1);
      const request = confirmFn.mock.calls[0][0];
      expect(request.title).toBe('AI 想要创建未保存草稿');
      expect(request.riskLevel).toBe('write');
    });

    it('returns cancelled when user rejects draft creation', async () => {
      const openDraft = vi.fn(async (input: OpenDraftInput): Promise<OpenDraftResult> => {
        return {
          file: createUnsavedDraft({ id: 'abc123', content: input.content }),
          unsavedPath: 'unsaved://abc123/idea.md'
        };
      });
      const tool = createBuiltinWriteFileTool({
        confirm: { confirm: async () => ({ approved: false }) },
        getWorkspaceRoot: () => null,
        openDraft
      });

      const result = await tool.execute({
        path: 'notes/idea',
        content: '# My Idea\n'
      });

      expect(result.status).toBe('cancelled');
      expect(openDraft).not.toHaveBeenCalled();
    });

    it('returns failure when openDraft is not injected', async () => {
      const tool = createBuiltinWriteFileTool({
        confirm: { confirm: async () => true },
        getWorkspaceRoot: () => null
      });

      const result = await tool.execute({
        path: 'notes/idea',
        content: '# My Idea\n'
      });

      expect(result.status).toBe('failure');
    });

    it('returns failure when openDraft throws', async () => {
      const openDraft = vi.fn(async (): Promise<OpenDraftResult> => {
        throw new Error('存储失败');
      });
      const tool = createBuiltinWriteFileTool({
        confirm: { confirm: async () => true },
        getWorkspaceRoot: () => null,
        openDraft
      });

      const result = await tool.execute({
        path: 'notes/idea',
        content: '# My Idea\n'
      });

      expect(result.status).toBe('failure');
    });

    it('preserves original behavior for no workspace + absolute path', async () => {
      const writeFile = vi.fn(async () => undefined);
      const openDraft = vi.fn();
      const tool = createBuiltinWriteFileTool({
        confirm: { confirm: async () => true },
        getWorkspaceRoot: () => null,
        readWorkspaceFile: async () => {
          const error = new Error('missing') as Error & { code: string };
          error.code = 'FILE_NOT_FOUND';
          throw error;
        },
        writeFile,
        openDraft
      });

      const result = await tool.execute({
        path: '/absolute/path/file.txt',
        content: 'content'
      });

      expect(result.status).toBe('success');
      expect(openDraft).not.toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalledWith('/absolute/path/file.txt', 'content');
    });

    it('preserves original behavior for workspace + relative path', async () => {
      const writeFile = vi.fn(async () => undefined);
      const openDraft = vi.fn();
      const tool = createBuiltinWriteFileTool({
        confirm: { confirm: async () => true },
        getWorkspaceRoot: () => '/workspace',
        readWorkspaceFile: async () => {
          const error = new Error('missing') as Error & { code: string };
          error.code = 'FILE_NOT_FOUND';
          throw error;
        },
        writeFile,
        openDraft
      });

      const result = await tool.execute({
        path: 'src/new-file.ts',
        content: 'export const value = 1;\n'
      });

      expect(result.status).toBe('success');
      expect(openDraft).not.toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalledWith('/workspace/src/new-file.ts', 'export const value = 1;\n');
    });
  });
});
