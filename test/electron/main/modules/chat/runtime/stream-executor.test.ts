/**
 * @file stream-executor.test.ts
 * @description ChatRuntime 主进程流式执行器测试。
 */
import type { ActiveChatRuntime } from '../../../../../../electron/main/modules/chat/runtime/types.mjs';
import type { ChatMessageRecord } from 'types/chat';
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeStreamExecutor } from '../../../../../../electron/main/modules/chat/runtime/stream-executor.mjs';

/** 测试 runtime 状态。 */
const runtime: ActiveChatRuntime = {
  runtimeId: 'runtime-1',
  sessionId: 'session-1',
  clientId: 'client-1',
  agentId: 'agent-1',
  status: 'running',
  abortController: new AbortController(),
  createdAt: 0
};

/** 测试 user 消息。 */
const userMessage: ChatMessageRecord = {
  id: 'user-1',
  sessionId: 'session-1',
  role: 'user',
  content: 'hello',
  parts: [{ type: 'text', text: 'hello' }],
  createdAt: '2026-06-19T00:00:00.000Z',
  finished: true
};

/**
 * 创建 assistant 草稿消息。
 * @returns assistant 草稿消息
 */
function createAssistantMessage(): ChatMessageRecord {
  return {
    id: 'assistant-1',
    sessionId: 'session-1',
    role: 'assistant',
    content: '',
    parts: [],
    createdAt: '2026-06-19T00:00:00.000Z',
    loading: true,
    finished: false
  };
}

/**
 * 创建测试流。
 * @returns AI stream chunk 序列
 */
async function* createTextStream(): AsyncGenerator<unknown> {
  yield { type: 'reasoning-delta', text: 'thinking' };
  yield { type: 'text-delta', text: 'Hello ' };
  yield { type: 'text-delta', text: 'runtime' };
  yield {
    type: 'finish',
    finishReason: 'stop',
    totalUsage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 }
  };
}

/**
 * 创建含工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-input-start', id: 'tool-call-1', toolName: 'read_file' };
  yield { type: 'tool-input-delta', id: 'tool-call-1', delta: '{"path":"' };
  yield { type: 'tool-input-delta', id: 'tool-call-1', delta: 'src/index.ts"}' };
  yield { type: 'tool-input-end', id: 'tool-call-1' };
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'read_file', input: { path: 'src/index.ts' } };
  yield { type: 'tool-result', toolCallId: 'tool-call-1', toolName: 'read_file', output: { content: 'export const ok = true;' } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 } };
}

/**
 * 创建需要 renderer 执行本地工具的测试流。
 * @returns AI stream chunk 序列
 */
async function* createRendererToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'read_file', input: { path: 'src/index.ts' } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 } };
}

describe('runtime stream executor', (): void => {
  it('streams model chunks into the assistant message and returns usage', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const resolve = vi.fn().mockResolvedValue({
      createOptions: {
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1'
      },
      modelId: 'gpt-test'
    });
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createTextStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText });

    const result = await executor({ runtime, userMessage, assistantMessage }, async (message) => {
      updates.push({ ...message, parts: [...message.parts] });
    });

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'openai' }),
      expect.objectContaining({
        requestId: 'runtime-1',
        modelId: 'gpt-test',
        messages: [{ role: 'user', content: 'hello' }]
      })
    );
    expect(result).toEqual({ usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 } });
    expect(updates.at(-1)).toMatchObject({
      content: 'Hello runtime',
      parts: [
        { type: 'thinking', thinking: 'thinking' },
        { type: 'text', text: 'Hello runtime' }
      ],
      loading: false,
      finished: true,
      usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 }
    });
  });

  it('uses provided source messages as the model context', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const resolve = vi.fn().mockResolvedValue({
      createOptions: {
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1'
      },
      modelId: 'gpt-test'
    });
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createTextStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText });

    await executor(
      {
        runtime,
        userMessage,
        assistantMessage,
        sourceMessages: [
          {
            ...userMessage,
            id: 'prior-user',
            content: 'prior question',
            parts: [{ type: 'text', text: 'prior question' }]
          },
          {
            ...assistantMessage,
            id: 'prior-assistant',
            content: 'prior answer',
            parts: [{ type: 'text', text: 'prior answer' }],
            loading: false,
            finished: true
          },
          userMessage,
          assistantMessage
        ]
      },
      async () => undefined
    );

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'openai' }),
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'prior question' },
          { role: 'assistant', content: [{ type: 'text', text: 'prior answer' }] },
          { role: 'user', content: 'hello' }
        ]
      })
    );
  });

  it('streams tool chunks into assistant tool parts', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const resolve = vi.fn().mockResolvedValue({
      createOptions: {
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1'
      },
      modelId: 'gpt-test'
    });
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText });

    const result = await executor({ runtime, userMessage, assistantMessage }, async (message) => {
      updates.push({ ...message, parts: [...message.parts] });
    });

    expect(result).toEqual({ usage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 } });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'read_file',
          status: 'done',
          inputText: '{"path":"src/index.ts"}',
          input: { path: 'src/index.ts' },
          result: { toolName: 'read_file', status: 'success', data: { content: 'export const ok = true;' } }
        }
      ],
      loading: false,
      finished: true,
      usage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 }
    });
  });

  it('passes runtime tool and context request options to streamText', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const resolve = vi.fn().mockResolvedValue({
      createOptions: {
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1'
      },
      modelId: 'gpt-test'
    });
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createTextStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText });

    await executor(
      {
        runtime: {
          ...runtime,
          system: 'Remember project preferences.',
          tavily: { enabled: true, apiKey: 'tvly-test' },
          mcp: {
            servers: [],
            enabledServerIds: [],
            enabledTools: [],
            toolInstructions: 'Use MCP tools carefully.'
          },
          tools: [{ name: 'read_file', description: 'Read file', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async () => undefined
    );

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'openai' }),
      expect.objectContaining({
        system: 'Remember project preferences.',
        tavily: { enabled: true, apiKey: 'tvly-test' },
        mcp: {
          servers: [],
          enabledServerIds: [],
          enabledTools: [],
          toolInstructions: 'Use MCP tools carefully.'
        },
        tools: [{ name: 'read_file', description: 'Read file', parameters: { type: 'object', properties: {} } }]
      })
    );
  });

  it('executes renderer-managed tool calls and asks runtime to continue', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'read_file',
      status: 'success',
      data: { content: 'export const ok = true;' }
    });
    const resolve = vi.fn().mockResolvedValue({
      createOptions: {
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1'
      },
      modelId: 'gpt-test'
    });
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createRendererToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'read_file', description: 'Read file', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeRendererTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1', tools: expect.arrayContaining([expect.objectContaining({ name: 'read_file' })]) }),
      toolCallId: 'tool-call-1',
      toolName: 'read_file',
      input: { path: 'src/index.ts' }
    });
    expect(result).toEqual({ usage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'read_file',
          status: 'done',
          input: { path: 'src/index.ts' },
          result: { toolName: 'read_file', status: 'success', data: { content: 'export const ok = true;' } }
        }
      ]
    });
  });
});
