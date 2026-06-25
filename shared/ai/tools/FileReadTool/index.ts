/**
 * @file index.ts
 * @description 文件读取相关 ChatRuntime 工具定义。
 */
import type { ToolRegistryEntry } from '../types.js';

/** 读取文件工具名称。 */
export const READ_FILE_TOOL_NAME = 'read_file';

/** 读取目录工具名称。 */
export const READ_DIRECTORY_TOOL_NAME = 'read_directory';

/** 读取文件工具 registry 条目。 */
export const readFileToolRegistryEntry = {
  runtime: 'main',
  group: 'file',
  exposure: 'default-readonly',
  definition: {
    name: READ_FILE_TOOL_NAME,
    description: '读取指定本地文本文件内容，可通过 offset 和 limit 滚动读取。相对路径需要工作区根目录，绝对路径需要用户确认（最近文件列表中的路径除外）。',
    source: 'builtin',
    riskLevel: 'read',
    requiresActiveDocument: false,
    permissionCategory: 'system',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径，支持相对工作区路径或绝对路径。' },
        offset: { type: 'number', description: '起始行号，默认 1。' },
        limit: { type: 'number', description: '读取行数；不传时读取到文件末尾。' }
      },
      additionalProperties: false
    }
  }
} satisfies ToolRegistryEntry;

/** 读取目录工具 registry 条目。 */
export const readDirectoryToolRegistryEntry = {
  runtime: 'main',
  group: 'file',
  exposure: 'conditional-readonly',
  definition: {
    name: READ_DIRECTORY_TOOL_NAME,
    description:
      '读取指定目录下的直接子项列表，仅返回当前目录中的文件和子目录，不递归展开。相对路径需要工作区根目录，绝对路径需要用户确认（最近文件列表中的路径除外）。',
    source: 'builtin',
    riskLevel: 'read',
    requiresActiveDocument: false,
    permissionCategory: 'system',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径，支持相对工作区路径或绝对路径。' }
      },
      required: ['path'],
      additionalProperties: false
    }
  }
} satisfies ToolRegistryEntry;
