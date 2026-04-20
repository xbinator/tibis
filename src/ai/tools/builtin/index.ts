/**
 * @file builtin/index.ts
 * @description 内置工具工厂函数
 */
import type { AIToolConfirmationAdapter } from '../confirmation';
import type { AIToolExecutor } from 'types/ai';
import { createBuiltinReadTools } from './read';
import { createBuiltinWriteTools } from './write';

/**
 * 创建内置工具的选项
 */
interface CreateBuiltinToolsOptions {
  /** 确认适配器，用于写操作的用户确认 */
  confirm?: AIToolConfirmationAdapter;
  /** 是否包含选区替换工具 */
  includeSelectionReplace?: boolean;
  /** 是否包含危险操作工具（如替换整个文档） */
  includeDangerous?: boolean;
}

/**
 * 创建内置工具列表
 * @param options - 创建选项
 * @returns 工具执行器列表
 */
export function createBuiltinTools(options: CreateBuiltinToolsOptions = {}): AIToolExecutor[] {
  // 创建只读工具
  const readTools = createBuiltinReadTools();
  const tools: AIToolExecutor[] = [readTools.readCurrentDocument, readTools.getCurrentSelection, readTools.searchCurrentDocument];

  // 没有确认适配器时只返回只读工具
  if (!options.confirm) {
    return tools;
  }

  // 创建写入工具
  const writeTools = createBuiltinWriteTools(options.confirm);
  tools.push(writeTools.insertAtCursor);

  // 聊天侧默认只放开低风险写工具，替换类操作需要显式开启
  if (options.includeSelectionReplace) {
    tools.push(writeTools.replaceSelection);
  }

  // 危险操作需要显式开启
  if (options.includeDangerous) {
    tools.push(writeTools.replaceDocument);
  }

  return tools;
}
