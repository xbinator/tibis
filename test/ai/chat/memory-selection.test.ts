/**
 * @file memory-selection.test.ts
 * @description 聊天 Memory 选择与工具过滤纯策略测试。
 */
import type { AIToolExecutor } from 'types/ai';
import { describe, expect, it } from 'vitest';
import { createMemorySelection, filterMemoryTools, findLastUserMessage } from '@/ai/chat/policies/memorySelection';
import type { Message } from '@/components/BChat/utils/types';

/**
 * 创建测试工具。
 * @param name - 工具名称
 * @returns 最小工具执行器
 */
function createTool(name: string): AIToolExecutor {
  return {
    definition: {
      name,
      description: name,
      source: 'builtin',
      riskLevel: 'read',
      parameters: { type: 'object', properties: {} }
    },
    execute: async () => ({ toolName: name, status: 'success', data: null })
  };
}

/**
 * 创建最小聊天消息。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 消息文本
 * @returns 聊天消息
 */
function createMessage(id: string, role: Message['role'], content: string): Message {
  return {
    id,
    role,
    content,
    parts: [],
    createdAt: `2026-07-11T00:00:0${id.length}.000Z`
  };
}

describe('chat memory selection policy', (): void => {
  it('selects full memory for explicit edit intent and de-duplicates references', (): void => {
    const selection = createMemorySelection({
      content: '请记住这个约定',
      messageReferences: ['/notes/a.md'],
      filePartReferences: ['/notes/b.md', '/notes/a.md'],
      workspaceRoot: '/workspace'
    });

    expect(selection).toEqual({
      userMessage: '请记住这个约定',
      references: ['/notes/a.md', '/notes/b.md'],
      workspaceRoot: '/workspace',
      mode: 'full'
    });
  });

  it('uses relevant memory for ordinary discussion and hides edit_memory', (): void => {
    const selection = createMemorySelection({
      content: '记忆系统是怎么工作的？',
      messageReferences: [],
      filePartReferences: []
    });
    const tools = [createTool('edit_memory'), createTool('read_file')];

    expect(selection.mode).toBe('relevant');
    expect(filterMemoryTools(tools, selection.mode).map((tool) => tool.definition.name)).toEqual(['read_file']);
    expect(filterMemoryTools(tools, 'full')).toEqual(tools);
  });

  it('finds the final user message without mutating source messages', (): void => {
    const messages = [createMessage('user-1', 'user', 'first'), createMessage('assistant-1', 'assistant', 'answer'), createMessage('user-2', 'user', 'last')];

    expect(findLastUserMessage(messages)?.id).toBe('user-2');
    expect(messages.map((message) => message.id)).toEqual(['user-1', 'assistant-1', 'user-2']);
  });
});
