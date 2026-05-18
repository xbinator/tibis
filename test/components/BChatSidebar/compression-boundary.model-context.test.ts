/**
 * @file compression-boundary.model-context.test.ts
 * @description 压缩消息上下文边界测试。
 */
import { describe, expect, test } from 'vitest';
import { createCompressionMessage } from '@/components/BChatSidebar/hooks/useCompactContext';
import { convert, create, sliceMessagesFromCompressionBoundary } from '@/components/BChatSidebar/utils/messageHelper';
import type { Message } from '@/components/BChatSidebar/utils/types';

describe('compression boundary model context', () => {
  test('uses the latest successful compression message as the new context start', () => {
    const sourceMessages: Message[] = [
      create.userMessage('old user'),
      {
        id: 'old-assistant',
        role: 'assistant',
        content: 'old assistant',
        parts: [{ type: 'text', text: 'old assistant' }],
        createdAt: '2026-05-07T00:00:00.000Z',
        finished: true
      },
      createCompressionMessage({
        boundaryText: '历史对话摘要',
        status: 'success',
        recordId: 'record-1',
        coveredUntilMessageId: 'old-assistant',
        sourceMessageIds: ['old-user', 'old-assistant']
      }),
      create.userMessage('new question')
    ];

    const slicedMessages = sliceMessagesFromCompressionBoundary(sourceMessages);
    const modelMessages = convert.toModelMessages(sourceMessages);

    expect(slicedMessages).toHaveLength(2);
    expect(modelMessages).toEqual([
      { role: 'assistant', content: '历史对话摘要' },
      { role: 'user', content: 'new question' }
    ]);
  });

  test('keeps preserved recent messages after the compression boundary for continuation prompts', () => {
    const recentUser = create.userMessage('继续前的具体要求：保留最后一段代码');
    const recentAssistant: Message = {
      id: 'recent-assistant',
      role: 'assistant',
      content: '我已经写到步骤 3，下一步要补测试。',
      parts: [{ type: 'text', text: '我已经写到步骤 3，下一步要补测试。' }],
      createdAt: '2026-05-16T00:00:00.000Z',
      finished: true
    };
    const compressionMessage = createCompressionMessage({
      boundaryText: '旧历史摘要：用户在实现聊天压缩。',
      status: 'success',
      recordId: 'record-1',
      coveredUntilMessageId: 'old-assistant',
      sourceMessageIds: ['old-user', 'old-assistant']
    });
    const sourceMessages: Message[] = [
      create.userMessage('old user'),
      {
        id: 'old-assistant',
        role: 'assistant',
        content: 'old assistant',
        parts: [{ type: 'text', text: 'old assistant' }],
        createdAt: '2026-05-15T00:00:00.000Z',
        finished: true
      },
      recentUser,
      recentAssistant,
      compressionMessage,
      create.userMessage('继续')
    ];

    const slicedMessages = sliceMessagesFromCompressionBoundary(sourceMessages);
    const modelMessages = convert.toModelMessages(sourceMessages);

    expect(slicedMessages.map((message) => message.content)).toEqual([
      '旧历史摘要：用户在实现聊天压缩。',
      '继续前的具体要求：保留最后一段代码',
      '我已经写到步骤 3，下一步要补测试。',
      '继续'
    ]);
    expect(modelMessages).toEqual([
      { role: 'assistant', content: '旧历史摘要：用户在实现聊天压缩。' },
      { role: 'user', content: '继续前的具体要求：保留最后一段代码' },
      { role: 'assistant', content: [{ type: 'text', text: '我已经写到步骤 3，下一步要补测试。' }] },
      { role: 'user', content: '继续' }
    ]);
  });

  test('recalls relevant older compression memories by file keyword before the latest boundary', () => {
    const tocMemory = createCompressionMessage({
      boundaryText: 'COMPRESSED_CONTEXT\n文件：src/components/BEditor/components/Toc.vue；待处理操作：继续修复 Toc 高亮',
      status: 'success',
      recordId: 'record-toc',
      coveredUntilMessageId: 'toc-old',
      sourceMessageIds: ['toc-old']
    });
    const unrelatedMemory = createCompressionMessage({
      boundaryText: 'COMPRESSED_CONTEXT\n话题：语音输入设置',
      status: 'success',
      recordId: 'record-speech',
      coveredUntilMessageId: 'speech-old',
      sourceMessageIds: ['speech-old']
    });
    const latestBoundary = createCompressionMessage({
      boundaryText: 'COMPRESSED_CONTEXT\n话题：聊天压缩',
      status: 'success',
      recordId: 'record-latest',
      coveredUntilMessageId: 'latest-old',
      sourceMessageIds: ['latest-old']
    });
    const sourceMessages: Message[] = [
      { ...create.userMessage('old Toc work'), id: 'toc-old' },
      tocMemory,
      { ...create.userMessage('old speech work'), id: 'speech-old' },
      unrelatedMemory,
      { ...create.userMessage('latest old work'), id: 'latest-old' },
      latestBoundary,
      create.userMessage('继续 Toc.vue 的改动')
    ];

    const slicedMessages = sliceMessagesFromCompressionBoundary(sourceMessages);
    const modelMessages = convert.toModelMessages(sourceMessages);

    expect(slicedMessages[0]?.compression?.recordId).toBe('record-toc');
    expect(slicedMessages.some((message) => message.compression?.recordId === 'record-speech')).toBe(false);
    expect(modelMessages).toEqual([
      {
        role: 'assistant',
        content: 'COMPRESSED_CONTEXT\n文件：src/components/BEditor/components/Toc.vue；待处理操作：继续修复 Toc 高亮'
      },
      { role: 'assistant', content: 'COMPRESSED_CONTEXT\n话题：聊天压缩' },
      { role: 'user', content: '继续 Toc.vue 的改动' }
    ]);
  });

  test('ignores cancelled compression messages when slicing model context from the latest boundary', () => {
    const sourceMessages: Message[] = [
      create.userMessage('old user'),
      createCompressionMessage({
        boundaryText: 'success boundary',
        status: 'success',
        coveredUntilMessageId: 'old-user',
        sourceMessageIds: ['old-user']
      }),
      create.userMessage('after boundary'),
      createCompressionMessage({
        boundaryText: '',
        status: 'cancelled',
        errorMessage: '用户已取消'
      }),
      create.userMessage('latest user')
    ];

    const slicedMessages = sliceMessagesFromCompressionBoundary(sourceMessages);

    expect(slicedMessages[0]?.role).toBe('compression');
    expect(slicedMessages[0]?.compression?.status).toBe('success');
    expect(slicedMessages.at(-1)?.content).toBe('latest user');
  });
});
