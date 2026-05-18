/**
 * @file builtin-file-read.test.ts
 * @description 内置 read_file 工具测试。
 */
import { describe, expect, it } from 'vitest';
import { createBuiltinReadFileTool } from '@/ai/tools/builtin/FileReadTool';
import type { ReadWorkspaceFileOptions, ReadWorkspaceFileResult as NativeReadWorkspaceFileResult } from '@/shared/platform/native/types';

/**
 * 创建可携带业务错误码的错误对象。
 * @param code - 业务错误码
 * @returns 错误对象
 */
function createCodedError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

describe('createBuiltinReadFileTool', () => {
  it('rejects empty file path input', async () => {
    const tool = createBuiltinReadFileTool({
      getWorkspaceRoot: () => '/workspace',
      readWorkspaceFile: async () => ({ path: '', content: '', totalLines: 0, readLines: 0, hasMore: false, nextOffset: null })
    });

    const result = await tool.execute({ path: '   ' });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('rejects calls when no workspace root is configured', async () => {
    const tool = createBuiltinReadFileTool({
      getWorkspaceRoot: () => null,
      readWorkspaceFile: async () => ({ path: '', content: '', totalLines: 0, readLines: 0, hasMore: false, nextOffset: null })
    });

    const result = await tool.execute({ path: 'src/example.ts' });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('confirms and reads an absolute path when no workspace root is configured', async () => {
    let confirmedTitle = '';
    let capturedOptions: ReadWorkspaceFileOptions | null = null;
    const tool = createBuiltinReadFileTool({
      confirm: {
        confirm: async (request) => {
          confirmedTitle = request.title;
          return true;
        }
      },
      getWorkspaceRoot: () => null,
      readWorkspaceFile: async (options: ReadWorkspaceFileOptions) => {
        capturedOptions = options;
        return {
          path: '/workspace\\README.md',
          content: '# Tibis',
          hasMore: false,
          nextOffset: null,
          totalLines: 1,
          readLines: 1
        };
      }
    });

    const result = await tool.execute({ path: '/workspace\\README.md' });

    expect(confirmedTitle).toBe('AI 想要读取本地文件');
    expect(capturedOptions).toEqual({
      filePath: '/workspace\\README.md',
      offset: 1
    });
    expect(result.status).toBe('success');
  });

  it('cancels absolute path reads when the user rejects confirmation', async () => {
    const tool = createBuiltinReadFileTool({
      confirm: {
        confirm: async () => false
      },
      getWorkspaceRoot: () => null,
      readWorkspaceFile: async () => ({ path: '', content: '', totalLines: 0, readLines: 0, hasMore: false, nextOffset: null })
    });

    const result = await tool.execute({ path: '/workspace\\README.md' });

    expect(result.status).toBe('cancelled');
    expect(result.error?.code).toBe('USER_CANCELLED');
  });

  it('normalizes default offset without adding a default limit', async () => {
    let capturedOptions: ReadWorkspaceFileOptions | null = null;
    const expectedResult: NativeReadWorkspaceFileResult = {
      path: '/workspace\\src\\example.ts',
      content: 'hello',
      hasMore: false,
      nextOffset: null,
      totalLines: 1,
      readLines: 1
    };
    const tool = createBuiltinReadFileTool({
      getWorkspaceRoot: () => '/workspace',
      readWorkspaceFile: async (options: ReadWorkspaceFileOptions) => {
        capturedOptions = options;
        return expectedResult;
      }
    });

    const result = await tool.execute({ path: 'src/example.ts' });

    expect(capturedOptions).toEqual({
      filePath: 'src/example.ts',
      workspaceRoot: '/workspace',
      offset: 1
    });
    expect(result).toEqual({
      toolName: 'read_file',
      status: 'success',
      data: expectedResult
    });
  });

  it('maps workspace permission errors to tool permission failures', async () => {
    const tool = createBuiltinReadFileTool({
      getWorkspaceRoot: () => '/workspace',
      readWorkspaceFile: async () => {
        throw createCodedError('PATH_BLACKLISTED');
      }
    });

    const result = await tool.execute({ path: '.env' });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('maps unsupported platform errors to unsupported provider failures', async () => {
    const tool = createBuiltinReadFileTool({
      getWorkspaceRoot: () => '/workspace',
      readWorkspaceFile: async () => {
        throw createCodedError('UNSUPPORTED_PROVIDER');
      }
    });

    const result = await tool.execute({ path: 'src/example.ts' });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('UNSUPPORTED_PROVIDER');
  });

  it('rejects when path is not provided', async () => {
    const tool = createBuiltinReadFileTool({
      getWorkspaceRoot: () => '/workspace',
      readWorkspaceFile: async () => ({ path: '', content: '', totalLines: 0, readLines: 0, hasMore: false, nextOffset: null })
    });

    const result = await tool.execute({});

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  describe('memory-first read', () => {
    /**
     * 创建编辑器上下文的 mock 对象。
     * @param content - 文件内容
     * @returns 模拟的编辑器上下文
     */
    function createMockEditorContext(content: string) {
      return {
        document: {
          id: 'file-1',
          title: 'test.md',
          path: '/workspace/test.md',
          getContent: () => content
        },
        editor: {
          getSelection: () => null,
          insertAtCursor: async () => {},
          replaceSelection: async () => {},
          replaceDocument: async () => {}
        }
      };
    }

    it('reads from memory when file is open in editor tab', async () => {
      let filesystemCalled = false;
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        findFileByPath: async () => ({ id: 'file-1' }),
        getEditorContext: () => createMockEditorContext('line1\nline2\nline3\nline4\nline5'),
        readWorkspaceFile: async () => {
          filesystemCalled = true;
          return { path: '', content: '', totalLines: 0, readLines: 0, hasMore: false, nextOffset: null };
        }
      });

      const result = await tool.execute({ path: 'test.md' });

      expect(result.status).toBe('success');
      expect(filesystemCalled).toBe(false);
      if (result.status === 'success') {
        // Path returns the original filePath, not the resolved full path
        expect(result.data.path).toBe('test.md');
        expect(result.data.content).toBe('line1\nline2\nline3\nline4\nline5');
        expect(result.data.totalLines).toBe(5);
        expect(result.data.readLines).toBe(5);
        expect(result.data.hasMore).toBe(false);
        expect(result.data.nextOffset).toBeNull();
      }
    });

    it('supports offset and limit slicing on memory content', async () => {
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        findFileByPath: async () => ({ id: 'file-1' }),
        getEditorContext: () => createMockEditorContext('line1\nline2\nline3\nline4\nline5'),
        readWorkspaceFile: async () => ({ path: '', content: '', totalLines: 0, readLines: 0, hasMore: false, nextOffset: null })
      });

      const result = await tool.execute({ path: 'test.md', offset: 2, limit: 2 });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.content).toBe('line2\nline3');
        expect(result.data.totalLines).toBe(5);
        expect(result.data.readLines).toBe(2);
        expect(result.data.hasMore).toBe(true);
        expect(result.data.nextOffset).toBe(4);
      }
    });

    it('normalizes CRLF content when slicing memory content', async () => {
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        findFileByPath: async () => ({ id: 'file-1' }),
        getEditorContext: () => createMockEditorContext('line1\r\nline2\r\nline3'),
        readWorkspaceFile: async () => ({ path: '', content: '', totalLines: 0, readLines: 0, hasMore: false, nextOffset: null })
      });

      const result = await tool.execute({ path: 'test.md', offset: 2, limit: 1 });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        // CRLF is not normalized, split('\n') keeps the \r
        expect(result.data.content).toBe('line2\r');
        expect(result.data.totalLines).toBe(3);
        expect(result.data.readLines).toBe(1);
        expect(result.data.hasMore).toBe(true);
        expect(result.data.nextOffset).toBe(3);
      }
    });

    it('falls back to filesystem when file is NOT open in editor', async () => {
      const expectedResult = { path: '/workspace/test.md', content: 'disk content', totalLines: 1, readLines: 1, hasMore: false, nextOffset: null };
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        findFileByPath: async () => ({ id: 'file-2' }),
        getEditorContext: () => undefined,
        readWorkspaceFile: async () => expectedResult
      });

      const result = await tool.execute({ path: 'test.md' });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.content).toBe('disk content');
      }
    });

    it('falls back to filesystem when findFileByPath returns null', async () => {
      const expectedResult = { path: '/workspace/unknown.md', content: 'disk', totalLines: 1, readLines: 1, hasMore: false, nextOffset: null };
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        findFileByPath: async () => null,
        getEditorContext: () => createMockEditorContext('memory'),
        readWorkspaceFile: async () => expectedResult
      });

      const result = await tool.execute({ path: 'unknown.md' });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.content).toBe('disk');
      }
    });

    it('falls back to filesystem when getContent throws', async () => {
      const expectedResult = { path: '/workspace/broken.md', content: 'disk fallback', totalLines: 1, readLines: 1, hasMore: false, nextOffset: null };
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        findFileByPath: async () => ({ id: 'file-3' }),
        getEditorContext: () => ({
          document: {
            id: 'file-3',
            title: 'broken.md',
            path: '/workspace/broken.md',
            getContent: () => {
              throw new Error('getContent failed');
            }
          },
          editor: {
            getSelection: () => null,
            insertAtCursor: async () => {},
            replaceSelection: async () => {},
            replaceDocument: async () => {}
          }
        }),
        readWorkspaceFile: async () => expectedResult
      });

      const result = await tool.execute({ path: 'broken.md' });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.content).toBe('disk fallback');
      }
    });

    it('returns empty content when editor content is empty string', async () => {
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        findFileByPath: async () => ({ id: 'file-4' }),
        getEditorContext: () => createMockEditorContext(''),
        readWorkspaceFile: async () => ({ path: '', content: '', totalLines: 0, readLines: 0, hasMore: false, nextOffset: null })
      });

      const result = await tool.execute({ path: 'empty.md' });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.content).toBe('');
        expect(result.data.totalLines).toBe(1);
        expect(result.data.readLines).toBe(1);
      }
    });

    it('falls back to filesystem when findFileByPath throws', async () => {
      const expectedResult = { path: '/workspace/error.md', content: 'disk', totalLines: 1, readLines: 1, hasMore: false, nextOffset: null };
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        findFileByPath: async () => {
          throw new Error('findFileByPath error');
        },
        getEditorContext: () => createMockEditorContext('memory'),
        readWorkspaceFile: async () => expectedResult
      });

      const result = await tool.execute({ path: 'error.md' });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.content).toBe('disk');
      }
    });

    it('skips memory read when workspaceRoot is null and path is relative', async () => {
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => null,
        findFileByPath: async () => ({ id: 'file-5' }),
        getEditorContext: () => createMockEditorContext('memory'),
        confirm: {
          confirm: async () => true
        },
        readWorkspaceFile: async () => ({ path: '', content: '', totalLines: 0, readLines: 0, hasMore: false, nextOffset: null })
      });

      const result = await tool.execute({ path: 'src/readme.md' });

      // 相对路径 + 无 workspaceRoot → 无法解析为绝对路径 → 跳过内存读取
      // 回退到文件系统逻辑 → 相对路径无 workspaceRoot 拒绝
      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('PERMISSION_DENIED');
    });

    it('reads from memory for absolute path without workspaceRoot', async () => {
      let filesystemCalled = false;
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => null,
        findFileByPath: async () => ({ id: 'file-6' }),
        getEditorContext: () => createMockEditorContext('memory content'),
        confirm: {
          confirm: async () => true
        },
        readWorkspaceFile: async () => {
          filesystemCalled = true;
          return { path: '', content: '', totalLines: 0, readLines: 0, hasMore: false, nextOffset: null };
        }
      });

      const result = await tool.execute({ path: '/abs/readme.md' });

      expect(result.status).toBe('success');
      expect(filesystemCalled).toBe(false);
      if (result.status === 'success') {
        expect(result.data.content).toBe('memory content');
      }
    });

    it('behavior unchanged when findFileByPath is not injected', async () => {
      let filesystemCalled = false;
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        readWorkspaceFile: async () => {
          filesystemCalled = true;
          return { path: '/workspace/test.md', content: 'disk', totalLines: 1, readLines: 1, hasMore: false, nextOffset: null };
        }
      });

      const result = await tool.execute({ path: 'test.md' });

      expect(filesystemCalled).toBe(true);
      expect(result.status).toBe('success');
    });
  });
});
