/**
 * @file builtin-read-directory.test.ts
 * @description 内置 read_directory 工具测试。
 */
import { describe, expect, it } from 'vitest';
import { createBuiltinReadDirectoryTool, READ_DIRECTORY_TOOL_NAME } from '@/ai/tools/builtin/read-file';
import type { ReadWorkspaceDirectoryOptions, ReadWorkspaceDirectoryResult } from '@/shared/platform/native/types';

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

describe('read_directory tool', () => {
  it('exports the shared tool name', () => {
    expect(READ_DIRECTORY_TOOL_NAME).toBe('read_directory');
  });

  it('rejects empty directory path input', async () => {
    const tool = createBuiltinReadDirectoryTool({
      getWorkspaceRoot: () => 'G:\\workspace',
      readWorkspaceDirectory: async () => ({ path: '', entries: [] })
    });

    const result = await tool.execute({ path: '   ' });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('lists direct children inside the workspace', async () => {
    let capturedOptions: ReadWorkspaceDirectoryOptions | null = null;
    const expectedResult: ReadWorkspaceDirectoryResult = {
      path: 'G:\\workspace\\src',
      entries: [
        { name: 'ai', path: 'G:\\workspace\\src\\ai', type: 'directory' },
        { name: 'main.ts', path: 'G:\\workspace\\src\\main.ts', type: 'file' }
      ]
    };
    const tool = createBuiltinReadDirectoryTool({
      getWorkspaceRoot: () => 'G:\\workspace',
      readWorkspaceDirectory: async (options: ReadWorkspaceDirectoryOptions) => {
        capturedOptions = options;
        return expectedResult;
      }
    });

    const result = await tool.execute({ path: 'src' });

    expect(capturedOptions).toEqual({
      directoryPath: 'src',
      workspaceRoot: 'G:\\workspace'
    });
    expect(result).toEqual({
      toolName: READ_DIRECTORY_TOOL_NAME,
      status: 'success',
      data: expectedResult
    });
  });

  it('maps workspace permission errors to tool permission failures', async () => {
    const tool = createBuiltinReadDirectoryTool({
      getWorkspaceRoot: () => 'G:\\workspace',
      readWorkspaceDirectory: async () => {
        throw createCodedError('PATH_BLACKLISTED');
      }
    });

    const result = await tool.execute({ path: '.git' });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('maps unsupported platform errors to unsupported provider failures', async () => {
    const tool = createBuiltinReadDirectoryTool({
      getWorkspaceRoot: () => 'G:\\workspace',
      readWorkspaceDirectory: async () => {
        throw createCodedError('UNSUPPORTED_PROVIDER');
      }
    });

    const result = await tool.execute({ path: 'src' });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('UNSUPPORTED_PROVIDER');
  });
});
