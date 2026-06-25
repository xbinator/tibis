/**
 * @file index.ts
 * @description 文件写入相关 ChatRuntime 工具定义。
 */
import type { ToolRegistryEntry } from '../types.js';

/** 写入文件工具名称。 */
export const WRITE_FILE_TOOL_NAME = 'write_file';

/** 写入文件工具 registry 条目。 */
export const writeFileToolRegistryEntry = {
  runtime: 'main',
  group: 'file',
  exposure: 'default-writable',
  definition: {
    name: WRITE_FILE_TOOL_NAME,
    description: '创建或覆盖本地文本文件或未保存草稿。执行前会向用户展示确认信息。',
    source: 'builtin',
    riskLevel: 'write',
    requiresActiveDocument: false,
    permissionCategory: 'system',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径，支持相对工作区路径、绝对路径或未保存草稿虚拟路径。' },
        content: { type: 'string', description: '新的完整文件内容。' }
      },
      required: ['path', 'content'],
      additionalProperties: false
    }
  }
} satisfies ToolRegistryEntry;
