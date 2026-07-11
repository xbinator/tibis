/**
 * @file memorySelection.ts
 * @description ChatRuntime Memory 选择和工具过滤纯策略。
 */
import type { ChatPolicyMessage } from '../types';
import type { AIToolExecutor } from 'types/ai';
import { uniq } from 'lodash-es';
import type { MemoryInjectionMode, MemorySelectionContext } from '@/ai/memory/types';
import { EDIT_MEMORY_TOOL_NAME } from '@/ai/tools/builtin';

/** 明确要求编辑长期记忆的匹配规则。 */
const MEMORY_EDIT_INTENT_PATTERNS: RegExp[] = [
  /(?:记住|记一下|记下来|帮我记|请记|记录一下|保存一下|存一下)/u,
  /(?:整理|更新|修改|编辑|删除|移除|清理|清空).{0,12}(?:记忆|memory)/iu,
  /(?:记忆|memory).{0,12}(?:整理|更新|修改|编辑|删除|移除|清理|清空|保存|写入)/iu,
  /(?:忘记|忘掉)/u,
  /\b(?:remember|forget)\b/iu,
  /\b(?:update|edit|delete|remove|save|clean up|cleanup).{0,20}memory\b/iu,
  /\bmemory.{0,20}(?:update|edit|delete|remove|save|clean up|cleanup)\b/iu
];

/**
 * Memory 选择策略输入。
 */
export interface MemorySelectionInput {
  /** 用户消息文本 */
  content: string;
  /** 消息显式引用路径 */
  messageReferences: string[];
  /** Runtime 文件片段路径 */
  filePartReferences: string[];
  /** 当前工作区根目录 */
  workspaceRoot?: string;
}

/**
 * 判断用户是否明确要求编辑长期记忆。
 * @param content - 用户消息文本
 * @returns 是否使用完整 Memory 并允许编辑
 */
export function hasMemoryEditIntent(content: string): boolean {
  return MEMORY_EDIT_INTENT_PATTERNS.some((pattern: RegExp): boolean => pattern.test(content));
}

/**
 * 构建当前请求的 Memory 选择上下文。
 * @param input - 用户文本和引用路径
 * @returns Memory 选择上下文
 */
export function createMemorySelection(input: MemorySelectionInput): MemorySelectionContext {
  const references = uniq([...input.messageReferences, ...input.filePartReferences]).filter((path: string): boolean => path.trim().length > 0);

  return {
    userMessage: input.content,
    references,
    workspaceRoot: input.workspaceRoot || undefined,
    mode: hasMemoryEditIntent(input.content) ? 'full' : 'relevant'
  };
}

/**
 * 按 Memory 注入模式过滤本轮工具。
 * @param tools - 候选工具
 * @param mode - Memory 注入模式
 * @returns 模型本轮可见工具
 */
export function filterMemoryTools(tools: AIToolExecutor[], mode: MemoryInjectionMode | undefined): AIToolExecutor[] {
  if (mode !== 'relevant') {
    return tools;
  }

  return tools.filter((tool: AIToolExecutor): boolean => tool.definition.name !== EDIT_MEMORY_TOOL_NAME);
}

/**
 * 查找消息列表中最后一条用户消息。
 * @param messages - 消息列表
 * @returns 最后一条用户消息，不存在时返回 null
 */
export function findLastUserMessage<T extends ChatPolicyMessage>(messages: readonly T[]): T | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user') {
      return message;
    }
  }

  return null;
}
