/**
 * @file useCompactContext.test.ts
 * @description 手动上下文压缩命令生命周期测试。
 */
import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from '@/components/BChatSidebar/utils/messageHelper';
import type { Message } from '@/components/BChatSidebar/utils/types';

const { compressSessionManuallyMock, showToastMock } = vi.hoisted(() => ({
  compressSessionManuallyMock: vi.fn(),
  showToastMock: vi.fn()
}));

let assistantMessageIndex = 0;

vi.mock('@/components/BChatSidebar/utils/compression/coordinator', () => ({
  createCompressionCoordinator: () => ({
    compressSessionManually: compressSessionManuallyMock
  })
}));

/**
 * 创建基础压缩记录，满足 hook 回填成功压缩消息所需字段。
 * @returns 压缩记录桩对象。
 */
function createCompressionRecord() {
  return {
    id: 'record-1',
    sessionId: 'session-1',
    buildMode: 'full_rebuild' as const,
    coveredStartMessageId: 'message-1',
    coveredEndMessageId: 'message-2',
    coveredUntilMessageId: 'message-2',
    sourceMessageIds: ['message-1', 'message-2'],
    preservedMessageIds: [],
    recordText: '历史对话摘要',
    structuredSummary: {
      goal: '测试目标',
      recentTopic: '测试话题',
      userPreferences: [],
      constraints: [],
      decisions: [],
      importantFacts: [],
      fileContext: [],
      openQuestions: [],
      pendingActions: []
    },
    triggerReason: 'manual' as const,
    messageCountSnapshot: 1,
    charCountSnapshot: 10,
    schemaVersion: 2,
    status: 'valid' as const,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z'
  };
}

/**
 * 创建包含结构化摘要细节的压缩记录。
 * @returns 压缩记录桩对象。
 */
function createDetailedCompressionRecord(): ReturnType<typeof createCompressionRecord> {
  return {
    ...createCompressionRecord(),
    recordText: '目标：修复压缩后继续对话断片\n话题：上下文压缩策略',
    structuredSummary: {
      goal: '修复压缩后继续对话断片',
      recentTopic: '上下文压缩策略',
      userPreferences: ['希望继续指令能接上最近任务'],
      constraints: ['不要把最近两轮也压进摘要'],
      decisions: ['保留最近两轮原文'],
      importantFacts: ['压缩消息作为后续模型上下文边界'],
      fileContext: [
        {
          filePath: 'src/components/BChatSidebar/hooks/useCompactContext.ts',
          userIntent: '调整压缩输入',
          keySnippetSummary: '手动压缩前创建消息快照',
          shouldReloadOnDemand: true
        }
      ],
      openQuestions: ['是否需要可配置保留轮数'],
      pendingActions: ['补充结构化上下文注入']
    }
  };
}

/**
 * 创建已完成的助手消息。
 * @param content - 助手消息正文。
 * @returns 助手消息。
 */
function createAssistantMessage(content: string): Message {
  assistantMessageIndex += 1;
  return {
    id: `assistant-message-${assistantMessageIndex}`,
    role: 'assistant',
    content,
    parts: [{ type: 'text', text: content }],
    createdAt: '2026-05-16T00:00:00.000Z',
    finished: true,
    loading: false
  };
}

describe('useCompactContext', () => {
  beforeEach(() => {
    assistantMessageIndex = 0;
    compressSessionManuallyMock.mockReset();
    showToastMock.mockReset();
  });

  it('compresses the conversation snapshot without the pending compression status message', async () => {
    const { useCompactContext } = await import('@/components/BChatSidebar/hooks/useCompactContext');
    const sourceMessages: Message[] = [create.userMessage('需要总结的旧问题'), createAssistantMessage('需要总结的旧回答')];
    const receivedRoles: string[][] = [];

    compressSessionManuallyMock.mockImplementation(async (input: { messages: Message[] }) => {
      receivedRoles.push(input.messages.map((message) => message.role));
      return createCompressionRecord();
    });

    const messages = ref<Message[]>([...sourceMessages]);
    const { handleCompactContext } = useCompactContext({
      messages,
      getSessionId: () => 'session-1',
      beginCompactTask: () => ({ ok: true }),
      finishCompactTask: vi.fn(),
      persistMessage: vi.fn(async () => undefined),
      persistMessages: vi.fn(async () => undefined),
      scrollToBottom: vi.fn(),
      showToast: showToastMock
    });

    await handleCompactContext();

    expect(receivedRoles).toEqual([['user', 'assistant']]);
  });

  it('preserves the latest two conversation rounds outside the compression source', async () => {
    const { useCompactContext } = await import('@/components/BChatSidebar/hooks/useCompactContext');
    const sourceMessages: Message[] = [
      create.userMessage('old user 1'),
      createAssistantMessage('old assistant 1'),
      create.userMessage('old user 2'),
      createAssistantMessage('old assistant 2'),
      create.userMessage('recent user 1'),
      createAssistantMessage('recent assistant 1'),
      create.userMessage('recent user 2'),
      createAssistantMessage('recent assistant 2')
    ];
    const receivedContents: string[][] = [];

    compressSessionManuallyMock.mockImplementation(async (input: { messages: Message[] }) => {
      receivedContents.push(input.messages.map((message) => message.content));
      return createCompressionRecord();
    });

    const messages = ref<Message[]>([...sourceMessages]);
    const { handleCompactContext } = useCompactContext({
      messages,
      getSessionId: () => 'session-1',
      beginCompactTask: () => ({ ok: true }),
      finishCompactTask: vi.fn(),
      persistMessage: vi.fn(async () => undefined),
      persistMessages: vi.fn(async () => undefined),
      scrollToBottom: vi.fn(),
      showToast: showToastMock
    });

    await handleCompactContext();

    expect(receivedContents).toEqual([['old user 1', 'old assistant 1', 'old user 2', 'old assistant 2']]);
  });

  it('writes structured compression context into the success boundary message', async () => {
    const { useCompactContext } = await import('@/components/BChatSidebar/hooks/useCompactContext');
    const messages = ref<Message[]>([create.userMessage('old user'), createAssistantMessage('old assistant')]);

    compressSessionManuallyMock.mockResolvedValue(createDetailedCompressionRecord());

    const { handleCompactContext } = useCompactContext({
      messages,
      getSessionId: () => 'session-1',
      beginCompactTask: () => ({ ok: true }),
      finishCompactTask: vi.fn(),
      persistMessage: vi.fn(async () => undefined),
      persistMessages: vi.fn(async () => undefined),
      scrollToBottom: vi.fn(),
      showToast: showToastMock
    });

    await handleCompactContext();

    const compressionMessage = messages.value.find((message) => message.role === 'compression');
    expect(compressionMessage?.compression?.recordText).toContain('COMPRESSED_CONTEXT');
    expect(compressionMessage?.compression?.recordText).toContain('目标：修复压缩后继续对话断片');
    expect(compressionMessage?.compression?.recordText).toContain('约束：不要把最近两轮也压进摘要');
    expect(compressionMessage?.compression?.recordText).toContain('待处理操作：补充结构化上下文注入');
    expect(compressionMessage?.compression?.recordText).toContain('文件：src/components/BChatSidebar/hooks/useCompactContext.ts');
  });

  it('keeps key tool results in the structured compression context', async () => {
    const { useCompactContext } = await import('@/components/BChatSidebar/hooks/useCompactContext');
    const toolMessage: Message = {
      id: 'tool-message-1',
      role: 'assistant',
      content: '',
      parts: [
        {
          type: 'tool-result',
          toolCallId: 'tool-call-1',
          toolName: 'read_file',
          result: {
            toolName: 'read_file',
            status: 'success',
            data: {
              path: 'src/components/BEditor/components/Toc.vue',
              summary: '读取了 Toc 组件内容'
            }
          }
        }
      ],
      createdAt: '2026-05-16T00:00:00.000Z',
      finished: true,
      loading: false
    };
    const messages = ref<Message[]>([create.userMessage('old user'), toolMessage]);

    compressSessionManuallyMock.mockResolvedValue(createDetailedCompressionRecord());

    const { handleCompactContext } = useCompactContext({
      messages,
      getSessionId: () => 'session-1',
      beginCompactTask: () => ({ ok: true }),
      finishCompactTask: vi.fn(),
      persistMessage: vi.fn(async () => undefined),
      persistMessages: vi.fn(async () => undefined),
      scrollToBottom: vi.fn(),
      showToast: showToastMock
    });

    await handleCompactContext();

    const compressionMessage = messages.value.find((message) => message.role === 'compression');
    expect(compressionMessage?.compression?.recordText).toContain('KEY_TOOL_RESULTS');
    expect(compressionMessage?.compression?.recordText).toContain('read_file');
    expect(compressionMessage?.compression?.recordText).toContain('src/components/BEditor/components/Toc.vue');
  });

  it('skips repeated compression when no new model messages were added after the latest boundary', async () => {
    const { createCompressionMessage, useCompactContext } = await import('@/components/BChatSidebar/hooks/useCompactContext');
    const oldUser = { ...create.userMessage('old user'), id: 'old-user' };
    const oldAssistant = { ...createAssistantMessage('old assistant'), id: 'old-assistant' };
    const existingCompression = createCompressionMessage({
      boundaryText: 'COMPRESSED_CONTEXT\n历史对话摘要',
      status: 'success',
      recordId: 'record-1',
      coveredUntilMessageId: 'old-assistant',
      sourceMessageIds: ['old-user', 'old-assistant']
    });
    const persistMessage = vi.fn(async () => undefined);
    const beginCompactTask = vi.fn(() => ({ ok: true }));
    const messages = ref<Message[]>([oldUser, oldAssistant, existingCompression]);

    const { handleCompactContext } = useCompactContext({
      messages,
      getSessionId: () => 'session-1',
      beginCompactTask,
      finishCompactTask: vi.fn(),
      persistMessage,
      persistMessages: vi.fn(async () => undefined),
      scrollToBottom: vi.fn(),
      showToast: showToastMock
    });

    await handleCompactContext();

    expect(compressSessionManuallyMock).not.toHaveBeenCalled();
    expect(beginCompactTask).not.toHaveBeenCalled();
    expect(persistMessage).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith({ type: 'info', content: '当前上下文已经压缩过，暂无新增对话需要压缩' });
    expect(messages.value).toHaveLength(3);
  });

  it('allows compression again when new model messages exist after the latest boundary', async () => {
    const { createCompressionMessage, useCompactContext } = await import('@/components/BChatSidebar/hooks/useCompactContext');
    const oldUser = { ...create.userMessage('old user'), id: 'old-user' };
    const oldAssistant = { ...createAssistantMessage('old assistant'), id: 'old-assistant' };
    const existingCompression = createCompressionMessage({
      boundaryText: 'COMPRESSED_CONTEXT\n历史对话摘要',
      status: 'success',
      recordId: 'record-1',
      coveredUntilMessageId: 'old-assistant',
      sourceMessageIds: ['old-user', 'old-assistant']
    });
    const messages = ref<Message[]>([oldUser, oldAssistant, existingCompression, create.userMessage('new follow-up')]);

    compressSessionManuallyMock.mockResolvedValue(createCompressionRecord());

    const { handleCompactContext } = useCompactContext({
      messages,
      getSessionId: () => 'session-1',
      beginCompactTask: () => ({ ok: true }),
      finishCompactTask: vi.fn(),
      persistMessage: vi.fn(async () => undefined),
      persistMessages: vi.fn(async () => undefined),
      scrollToBottom: vi.fn(),
      showToast: showToastMock
    });

    await handleCompactContext();

    expect(compressSessionManuallyMock).toHaveBeenCalledTimes(1);
  });

  it('creates an automatic compression boundary with an automatic pending message', async () => {
    const { useCompactContext } = await import('@/components/BChatSidebar/hooks/useCompactContext');
    const messages = ref<Message[]>([create.userMessage('old user'), createAssistantMessage('old assistant')]);

    compressSessionManuallyMock.mockResolvedValue(createCompressionRecord());

    const { handleAutoCompactContext } = useCompactContext({
      messages,
      getSessionId: () => 'session-1',
      beginCompactTask: () => ({ ok: true }),
      finishCompactTask: vi.fn(),
      persistMessage: vi.fn(async () => undefined),
      persistMessages: vi.fn(async () => undefined),
      scrollToBottom: vi.fn(),
      showToast: showToastMock
    });

    const compacted = await handleAutoCompactContext();

    expect(compacted).toBe(true);
    expect(messages.value.at(-1)?.role).toBe('compression');
    expect(messages.value.at(-1)?.content).toContain('COMPRESSED_CONTEXT');
    expect(compressSessionManuallyMock).toHaveBeenCalledTimes(1);
  });
});
