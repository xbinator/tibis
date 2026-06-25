/**
 * @file index.ts
 * @description 文件编辑相关 ChatRuntime 工具定义。
 */
import type { ToolRegistryEntry } from '../types.js';

/** 编辑文件工具名称。 */
export const EDIT_FILE_TOOL_NAME = 'edit_file';

/** 编辑文件工具 registry 条目。 */
export const editFileToolRegistryEntry = {
  runtime: 'main',
  group: 'file',
  exposure: 'default-writable',
  definition: {
    name: EDIT_FILE_TOOL_NAME,
    description: '按精确字符串匹配修改本地文本文件或未保存草稿。执行前会向用户展示确认信息。',
    source: 'builtin',
    riskLevel: 'write',
    requiresActiveDocument: false,
    permissionCategory: 'system',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径，支持相对工作区路径、绝对路径或未保存草稿虚拟路径。' },
        oldString: { type: 'string', description: '待替换的原始文本。' },
        newString: { type: 'string', description: '替换后的文本。' },
        replaceAll: { type: 'boolean', description: '是否替换全部匹配项，默认 false。' }
      },
      required: ['path', 'oldString', 'newString'],
      additionalProperties: false
    }
  }
} satisfies ToolRegistryEntry;
