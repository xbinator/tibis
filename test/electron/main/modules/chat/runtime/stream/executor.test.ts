/**
 * @file stream/executor.test.ts
 * @description ChatRuntime 主进程流式执行器测试。
 */
import type { ActiveChatRuntime } from '../../../../../../../electron/main/modules/chat/runtime/types.mjs';
import type { ChatMessageRecord } from 'types/chat';
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeStreamExecutor } from '../../../../../../../electron/main/modules/chat/runtime/stream/index.mjs';

/** 测试 runtime 状态。 */
const runtime: ActiveChatRuntime = {
  runtimeId: 'runtime-1',
  sessionId: 'session-1',
  clientId: 'client-1',
  agentId: 'agent-1',
  status: 'running',
  phase: 'streaming',
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
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'renderer_echo', input: { value: 'ping' } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 } };
}

/**
 * 创建主进程 read_file 工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainReadFileToolCallStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'read_file', input: { path: 'secret.md' } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 } };
}

/**
 * 创建同一模型流内包含两个工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createTwoMainToolCallStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'read_file', input: { path: 'secret.md' } };
  yield { type: 'tool-call', toolCallId: 'tool-call-2', toolName: 'run_shell_command', input: { command: 'echo should-not-run' } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 12, outputTokens: 6, totalTokens: 18 } };
}

/**
 * 创建主进程 bridge 工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainBridgeToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'read_current_document', input: {} };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 6, outputTokens: 4, totalTokens: 10 } };
}

/**
 * 创建主进程画板读取工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainDrawingToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'read_current_drawing', input: {} };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 7, outputTokens: 4, totalTokens: 11 } };
}

/**
 * 创建主进程网页读取工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainWebpageToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'read_current_webpage', input: {} };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 9, outputTokens: 4, totalTokens: 13 } };
}

/**
 * 创建主进程当前时间工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainTimeToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'get_current_time', input: {} };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 5, outputTokens: 4, totalTokens: 9 } };
}

/**
 * 创建主进程日志查询工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainQueryLogsToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'query_logs', input: { level: 'ERROR', limit: 5 } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 11, outputTokens: 4, totalTokens: 15 } };
}

/**
 * 创建主进程文件读取工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainReadFileToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'read_file', input: { path: 'src/index.ts', offset: 1, limit: 2 } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 } };
}

/**
 * 创建主进程目录读取工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainReadDirectoryToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'read_directory', input: { path: 'src' } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } };
}

/**
 * 创建主进程设置读取工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainGetSettingsToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'get_settings', input: { keys: ['theme'] } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 6, outputTokens: 4, totalTokens: 10 } };
}

/**
 * 创建主进程 MCP 设置读取工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainGetMcpSettingsToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'get_mcp_settings', input: {} };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 7, outputTokens: 4, totalTokens: 11 } };
}

/**
 * 创建主进程新增 MCP server 工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainAddMcpServerToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'add_mcp_server', input: { name: 'Local MCP', command: 'npx', args: ['server'] } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 } };
}

/**
 * 创建主进程更新 MCP server 工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainUpdateMcpServerToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'update_mcp_server', input: { serverId: 'mcp-1', patch: { enabled: false } } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 9, outputTokens: 4, totalTokens: 13 } };
}

/**
 * 创建主进程删除 MCP server 工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainRemoveMcpServerToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'remove_mcp_server', input: { serverId: 'mcp-1' } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 } };
}

/**
 * 创建主进程刷新 MCP discovery 工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainRefreshMcpDiscoveryToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'refresh_mcp_discovery', input: { serverId: 'mcp-1' } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } };
}

/**
 * 创建主进程打开资源工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainOpenResourceToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'open_resource', input: { path: 'https://example.com' } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 } };
}

/**
 * 创建主进程设置修改工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainUpdateSettingsToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'update_settings', input: { key: 'theme', value: 'dark' } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 7, outputTokens: 4, totalTokens: 11 } };
}

/**
 * 创建主进程文档创建工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainCreateDocumentToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'create_document', input: { title: 'Notes', content: '# Notes', ext: 'md' } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 9, outputTokens: 4, totalTokens: 13 } };
}

/**
 * 创建主进程画板创建工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainCreateDrawingToolStream(): AsyncGenerator<unknown> {
  yield {
    type: 'tool-call',
    toolCallId: 'tool-call-1',
    toolName: 'create_drawing',
    input: { title: '流程图', operations: [{ type: 'add_shape', shape: 'rect', text: '开始', position: { x: 20, y: 30 } }] }
  };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } };
}

/**
 * 创建主进程画板操作工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainApplyDrawingOperationsToolStream(): AsyncGenerator<unknown> {
  yield {
    type: 'tool-call',
    toolCallId: 'tool-call-1',
    toolName: 'apply_drawing_operations',
    input: { operations: [{ type: 'update_shape_text', id: 'node-1', text: '开始' }] }
  };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 } };
}

/**
 * 创建主进程文件写入工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainWriteFileToolStream(): AsyncGenerator<unknown> {
  yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'write_file', input: { path: 'docs/report.md', content: '# Report' } };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } };
}

/**
 * 创建主进程文件编辑工具调用的测试流。
 * @returns AI stream chunk 序列
 */
async function* createMainEditFileToolStream(): AsyncGenerator<unknown> {
  yield {
    type: 'tool-call',
    toolCallId: 'tool-call-1',
    toolName: 'edit_file',
    input: { path: 'docs/report.md', oldString: 'old', newString: 'new' }
  };
  yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 11, outputTokens: 4, totalTokens: 15 } };
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
      toolName: 'renderer_echo',
      status: 'success',
      data: { value: 'pong' }
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
          tools: [{ name: 'renderer_echo', description: 'Renderer echo', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeRendererTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1', tools: expect.arrayContaining([expect.objectContaining({ name: 'renderer_echo' })]) }),
      toolCallId: 'tool-call-1',
      toolName: 'renderer_echo',
      input: { value: 'ping' }
    });
    expect(result).toEqual({ usage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      finished: false,
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'renderer_echo',
          status: 'done',
          input: { value: 'ping' },
          result: { toolName: 'renderer_echo', status: 'success', data: { value: 'pong' } }
        }
      ]
    });
  });

  it('executes read_current_document through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'read_current_document',
      status: 'success',
      data: { id: 'doc-1', title: 'index.md', path: '/tmp/index.md', content: '# Hello' }
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'read_current_document',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainBridgeToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'read_current_document', description: 'Read current document', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1', tools: expect.arrayContaining([expect.objectContaining({ name: 'read_current_document' })]) }),
      toolCallId: 'tool-call-1',
      toolName: 'read_current_document',
      input: {}
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 6, outputTokens: 4, totalTokens: 10 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'read_current_document',
          status: 'done',
          input: {},
          result: {
            toolName: 'read_current_document',
            status: 'success',
            data: { id: 'doc-1', title: 'index.md', path: '/tmp/index.md', content: '# Hello' }
          }
        }
      ]
    });
  });

  it('does not continue tool rounds after a main-process tool is cancelled', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'read_file',
      status: 'cancelled',
      error: { code: 'USER_CANCELLED', message: '用户取消了工具调用' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainReadFileToolCallStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeMainTool });

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

    expect(result).toEqual({});
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'read_file',
          status: 'done',
          result: {
            toolName: 'read_file',
            status: 'cancelled',
            error: { code: 'USER_CANCELLED', message: '用户取消了工具调用' }
          }
        }
      ]
    });
  });

  it('stops consuming same-stream tool calls after a main-process tool is cancelled', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'read_file',
      status: 'cancelled',
      error: { code: 'USER_CANCELLED', message: '用户取消了工具调用' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createTwoMainToolCallStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [
            { name: 'read_file', description: 'Read file', parameters: { type: 'object', properties: {} } },
            { name: 'run_shell_command', description: 'Run shell command', parameters: { type: 'object', properties: {} } }
          ]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(result).toEqual({});
    expect(executeMainTool).toHaveBeenCalledTimes(1);
    expect(executeMainTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCallId: 'tool-call-1',
        toolName: 'read_file'
      })
    );
    expect(updates.at(-1)?.parts).toHaveLength(1);
    expect(updates.at(-1)?.parts[0]).toMatchObject({
      type: 'tool',
      toolCallId: 'tool-call-1',
      toolName: 'read_file',
      result: {
        toolName: 'read_file',
        status: 'cancelled',
        error: { code: 'USER_CANCELLED', message: '用户取消了工具调用' }
      }
    });
  });

  it('executes read_current_drawing through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const drawingData = { elements: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'read_current_drawing',
      status: 'success',
      data: { id: 'drawing-1', title: 'Flow', path: '/tmp/flow.tibis', data: drawingData }
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'read_current_drawing',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainDrawingToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'read_current_drawing', description: 'Read current drawing', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1', tools: expect.arrayContaining([expect.objectContaining({ name: 'read_current_drawing' })]) }),
      toolCallId: 'tool-call-1',
      toolName: 'read_current_drawing',
      input: {}
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 7, outputTokens: 4, totalTokens: 11 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'read_current_drawing',
          status: 'done',
          input: {},
          result: {
            toolName: 'read_current_drawing',
            status: 'success',
            data: { id: 'drawing-1', title: 'Flow', path: '/tmp/flow.tibis', data: drawingData }
          }
        }
      ]
    });
  });

  it('executes read_current_webpage through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const webpageSnapshot = {
      url: 'https://example.com',
      title: 'Example',
      text: 'Example Domain',
      selectedText: '',
      headings: [],
      links: [],
      capturedAt: 1,
      truncated: { text: false, headings: false, links: false, selectedText: false }
    };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'read_current_webpage',
      status: 'success',
      data: webpageSnapshot
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'read_current_webpage',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainWebpageToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'read_current_webpage', description: 'Read current webpage', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1', tools: expect.arrayContaining([expect.objectContaining({ name: 'read_current_webpage' })]) }),
      toolCallId: 'tool-call-1',
      toolName: 'read_current_webpage',
      input: {}
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 9, outputTokens: 4, totalTokens: 13 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'read_current_webpage',
          status: 'done',
          input: {},
          result: {
            toolName: 'read_current_webpage',
            status: 'success',
            data: webpageSnapshot
          }
        }
      ]
    });
  });

  it('executes get_current_time through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'get_current_time',
      status: 'success',
      data: { iso: '2026-06-19T00:00:00.000Z', timestamp: 1781827200000, locale: '2026-06-19 08:00:00' }
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'get_current_time',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainTimeToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'get_current_time', description: 'Get current time', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1', tools: expect.arrayContaining([expect.objectContaining({ name: 'get_current_time' })]) }),
      toolCallId: 'tool-call-1',
      toolName: 'get_current_time',
      input: {}
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 5, outputTokens: 4, totalTokens: 9 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'get_current_time',
          status: 'done',
          input: {},
          result: {
            toolName: 'get_current_time',
            status: 'success',
            data: { iso: '2026-06-19T00:00:00.000Z', timestamp: 1781827200000, locale: '2026-06-19 08:00:00' }
          }
        }
      ]
    });
  });

  it('executes query_logs through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const queryLogsResult = {
      items: [{ level: 'ERROR', scope: 'main', message: 'boom', timestamp: '2026-06-19 00:00:00.000' }],
      returnedCount: 1,
      appliedFilters: { level: 'ERROR', limit: 5, offset: 0, usedDefaultDate: true }
    };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'query_logs',
      status: 'success',
      data: queryLogsResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'query_logs',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainQueryLogsToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'query_logs', description: 'Query logs', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1', tools: expect.arrayContaining([expect.objectContaining({ name: 'query_logs' })]) }),
      toolCallId: 'tool-call-1',
      toolName: 'query_logs',
      input: { level: 'ERROR', limit: 5 }
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 11, outputTokens: 4, totalTokens: 15 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'query_logs',
          status: 'done',
          input: { level: 'ERROR', limit: 5 },
          result: {
            toolName: 'query_logs',
            status: 'success',
            data: queryLogsResult
          }
        }
      ]
    });
  });

  it('executes read_file through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const readFileResult = {
      path: '/workspace/src/index.ts',
      content: 'line 1\nline 2',
      totalLines: 3,
      readLines: 2,
      hasMore: true,
      nextOffset: 3
    };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'read_file',
      status: 'success',
      data: readFileResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'read_file',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainReadFileToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          workspaceRoot: '/workspace',
          tools: [{ name: 'read_file', description: 'Read file', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1', workspaceRoot: '/workspace' }),
      toolCallId: 'tool-call-1',
      toolName: 'read_file',
      input: { path: 'src/index.ts', offset: 1, limit: 2 }
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'read_file',
          status: 'done',
          input: { path: 'src/index.ts', offset: 1, limit: 2 },
          result: {
            toolName: 'read_file',
            status: 'success',
            data: readFileResult
          }
        }
      ]
    });
  });

  it('executes read_directory through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const readDirectoryResult = {
      path: '/workspace/src',
      entries: [{ name: 'index.ts', path: '/workspace/src/index.ts', type: 'file' }]
    };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'read_directory',
      status: 'success',
      data: readDirectoryResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'read_directory',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainReadDirectoryToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          workspaceRoot: '/workspace',
          tools: [{ name: 'read_directory', description: 'Read directory', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1', workspaceRoot: '/workspace' }),
      toolCallId: 'tool-call-1',
      toolName: 'read_directory',
      input: { path: 'src' }
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'read_directory',
          status: 'done',
          input: { path: 'src' },
          result: {
            toolName: 'read_directory',
            status: 'success',
            data: readDirectoryResult
          }
        }
      ]
    });
  });

  it('executes get_settings through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const settingsResult = { settings: { theme: 'dark' } };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'get_settings',
      status: 'success',
      data: settingsResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'get_settings',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainGetSettingsToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'get_settings', description: 'Get settings', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1' }),
      toolCallId: 'tool-call-1',
      toolName: 'get_settings',
      input: { keys: ['theme'] }
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 6, outputTokens: 4, totalTokens: 10 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'get_settings',
          status: 'done',
          input: { keys: ['theme'] },
          result: {
            toolName: 'get_settings',
            status: 'success',
            data: settingsResult
          }
        }
      ]
    });
  });

  it('executes get_mcp_settings through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const mcpSettingsResult = {
      settings: {
        servers: [
          {
            id: 'mcp-1',
            name: 'Local MCP',
            enabled: true,
            transport: 'stdio',
            command: 'npx',
            args: ['server'],
            env: {},
            headers: {},
            toolAllowlist: [],
            connectTimeoutMs: 20000,
            toolCallTimeoutMs: 30000
          }
        ]
      }
    };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'get_mcp_settings',
      status: 'success',
      data: mcpSettingsResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'get_mcp_settings',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainGetMcpSettingsToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'get_mcp_settings', description: 'Get MCP settings', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1' }),
      toolCallId: 'tool-call-1',
      toolName: 'get_mcp_settings',
      input: {}
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 7, outputTokens: 4, totalTokens: 11 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'get_mcp_settings',
          status: 'done',
          input: {},
          result: {
            toolName: 'get_mcp_settings',
            status: 'success',
            data: mcpSettingsResult
          }
        }
      ]
    });
  });

  it('executes add_mcp_server through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const addMcpServerResult = {
      applied: true,
      server: {
        id: 'mcp-1',
        name: 'Local MCP',
        enabled: true,
        transport: 'stdio',
        command: 'npx',
        args: ['server'],
        env: {},
        headers: {},
        toolAllowlist: [],
        connectTimeoutMs: 20000,
        toolCallTimeoutMs: 30000
      }
    };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'add_mcp_server',
      status: 'success',
      data: addMcpServerResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'add_mcp_server',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainAddMcpServerToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'add_mcp_server', description: 'Add MCP server', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1' }),
      toolCallId: 'tool-call-1',
      toolName: 'add_mcp_server',
      input: { name: 'Local MCP', command: 'npx', args: ['server'] }
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'add_mcp_server',
          status: 'done',
          input: { name: 'Local MCP', command: 'npx', args: ['server'] },
          result: {
            toolName: 'add_mcp_server',
            status: 'success',
            data: addMcpServerResult
          }
        }
      ]
    });
  });

  it('executes update_mcp_server through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const updateMcpServerResult = {
      applied: true,
      previousServer: { id: 'mcp-1', name: 'Local MCP', enabled: true },
      currentServer: { id: 'mcp-1', name: 'Local MCP', enabled: false }
    };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'update_mcp_server',
      status: 'success',
      data: updateMcpServerResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'update_mcp_server',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainUpdateMcpServerToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'update_mcp_server', description: 'Update MCP server', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1' }),
      toolCallId: 'tool-call-1',
      toolName: 'update_mcp_server',
      input: { serverId: 'mcp-1', patch: { enabled: false } }
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 9, outputTokens: 4, totalTokens: 13 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'update_mcp_server',
          status: 'done',
          input: { serverId: 'mcp-1', patch: { enabled: false } },
          result: {
            toolName: 'update_mcp_server',
            status: 'success',
            data: updateMcpServerResult
          }
        }
      ]
    });
  });

  it('executes remove_mcp_server through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const removeMcpServerResult = {
      applied: true,
      removedServer: { id: 'mcp-1', name: 'Local MCP', enabled: true }
    };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'remove_mcp_server',
      status: 'success',
      data: removeMcpServerResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'remove_mcp_server',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainRemoveMcpServerToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'remove_mcp_server', description: 'Remove MCP server', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1' }),
      toolCallId: 'tool-call-1',
      toolName: 'remove_mcp_server',
      input: { serverId: 'mcp-1' }
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'remove_mcp_server',
          status: 'done',
          input: { serverId: 'mcp-1' },
          result: {
            toolName: 'remove_mcp_server',
            status: 'success',
            data: removeMcpServerResult
          }
        }
      ]
    });
  });

  it('executes refresh_mcp_discovery through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const refreshMcpDiscoveryResult = {
      refreshed: true,
      result: { ok: true, serverId: 'mcp-1', tools: [], discoveredAt: 1781827200000 }
    };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'refresh_mcp_discovery',
      status: 'success',
      data: refreshMcpDiscoveryResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'refresh_mcp_discovery',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainRefreshMcpDiscoveryToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'refresh_mcp_discovery', description: 'Refresh MCP discovery', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1' }),
      toolCallId: 'tool-call-1',
      toolName: 'refresh_mcp_discovery',
      input: { serverId: 'mcp-1' }
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'refresh_mcp_discovery',
          status: 'done',
          input: { serverId: 'mcp-1' },
          result: {
            toolName: 'refresh_mcp_discovery',
            status: 'success',
            data: refreshMcpDiscoveryResult
          }
        }
      ]
    });
  });

  it('executes open_resource through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const openResourceResult = { path: 'https://example.com', resourceType: 'webview', opened: true };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'open_resource',
      status: 'success',
      data: openResourceResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'open_resource',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainOpenResourceToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'open_resource', description: 'Open resource', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1' }),
      toolCallId: 'tool-call-1',
      toolName: 'open_resource',
      input: { path: 'https://example.com' }
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'open_resource',
          status: 'done',
          input: { path: 'https://example.com' },
          result: {
            toolName: 'open_resource',
            status: 'success',
            data: openResourceResult
          }
        }
      ]
    });
  });

  it('executes update_settings through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const updateSettingsResult = { applied: true, key: 'theme', previousValue: 'light', currentValue: 'dark' };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'update_settings',
      status: 'success',
      data: updateSettingsResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'update_settings',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainUpdateSettingsToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'update_settings', description: 'Update settings', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1' }),
      toolCallId: 'tool-call-1',
      toolName: 'update_settings',
      input: { key: 'theme', value: 'dark' }
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 7, outputTokens: 4, totalTokens: 11 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'update_settings',
          status: 'done',
          input: { key: 'theme', value: 'dark' },
          result: {
            toolName: 'update_settings',
            status: 'success',
            data: updateSettingsResult
          }
        }
      ]
    });
  });

  it('executes create_document through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const createDocumentResult = { id: 'draft-1', title: 'Notes', path: 'unsaved://draft-1/Notes.md', content: '# Notes' };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'create_document',
      status: 'success',
      data: createDocumentResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'create_document',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainCreateDocumentToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'create_document', description: 'Create document', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1' }),
      toolCallId: 'tool-call-1',
      toolName: 'create_document',
      input: { title: 'Notes', content: '# Notes', ext: 'md' }
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 9, outputTokens: 4, totalTokens: 13 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'create_document',
          status: 'done',
          input: { title: 'Notes', content: '# Notes', ext: 'md' },
          result: {
            toolName: 'create_document',
            status: 'success',
            data: createDocumentResult
          }
        }
      ]
    });
  });

  it('executes create_drawing through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const createDrawingResult = {
      id: 'drawing-1',
      title: '流程图',
      path: 'unsaved://drawing-1/flow.tibis',
      data: { elements: [], edges: [], viewport: { center: { x: 0, y: 0 }, zoom: 1 } }
    };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'create_drawing',
      status: 'success',
      data: createDrawingResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'create_drawing',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainCreateDrawingToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'create_drawing', description: 'Create drawing', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1' }),
      toolCallId: 'tool-call-1',
      toolName: 'create_drawing',
      input: { title: '流程图', operations: [{ type: 'add_shape', shape: 'rect', text: '开始', position: { x: 20, y: 30 } }] }
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'create_drawing',
          status: 'done',
          result: {
            toolName: 'create_drawing',
            status: 'success',
            data: createDrawingResult
          }
        }
      ]
    });
  });

  it('executes apply_drawing_operations through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const applyDrawingResult = {
      id: 'drawing-1',
      title: '流程图.tibis',
      path: null,
      data: { elements: [], edges: [], viewport: { center: { x: 0, y: 0 }, zoom: 1 } },
      appliedOperations: 1
    };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'apply_drawing_operations',
      status: 'success',
      data: applyDrawingResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'apply_drawing_operations',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainApplyDrawingOperationsToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'apply_drawing_operations', description: 'Apply drawing operations', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1' }),
      toolCallId: 'tool-call-1',
      toolName: 'apply_drawing_operations',
      input: { operations: [{ type: 'update_shape_text', id: 'node-1', text: '开始' }] }
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'apply_drawing_operations',
          status: 'done',
          result: {
            toolName: 'apply_drawing_operations',
            status: 'success',
            data: applyDrawingResult
          }
        }
      ]
    });
  });

  it('executes write_file through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const writeFileResult = { path: '/workspace/docs/report.md', content: '# Report', created: true };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'write_file',
      status: 'success',
      data: writeFileResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'write_file',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainWriteFileToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          workspaceRoot: '/workspace',
          tools: [{ name: 'write_file', description: 'Write file', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1', workspaceRoot: '/workspace' }),
      toolCallId: 'tool-call-1',
      toolName: 'write_file',
      input: { path: 'docs/report.md', content: '# Report' }
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'write_file',
          status: 'done',
          input: { path: 'docs/report.md', content: '# Report' },
          result: {
            toolName: 'write_file',
            status: 'success',
            data: writeFileResult
          }
        }
      ]
    });
  });

  it('executes edit_file through the main-process tool executor', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const editFileResult = { path: '/workspace/docs/report.md', content: 'new', replacedCount: 1 };
    const executeMainTool = vi.fn().mockResolvedValue({
      toolName: 'edit_file',
      status: 'success',
      data: editFileResult
    });
    const executeRendererTool = vi.fn().mockResolvedValue({
      toolName: 'edit_file',
      status: 'failure',
      error: { code: 'EXECUTION_FAILED', message: 'renderer should not run' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMainEditFileToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          workspaceRoot: '/workspace',
          tools: [{ name: 'edit_file', description: 'Edit file', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledWith({
      runtime: expect.objectContaining({ runtimeId: 'runtime-1', workspaceRoot: '/workspace' }),
      toolCallId: 'tool-call-1',
      toolName: 'edit_file',
      input: { path: 'docs/report.md', oldString: 'old', newString: 'new' }
    });
    expect(executeRendererTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { inputTokens: 11, outputTokens: 4, totalTokens: 15 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'edit_file',
          status: 'done',
          input: { path: 'docs/report.md', oldString: 'old', newString: 'new' },
          result: {
            toolName: 'edit_file',
            status: 'success',
            data: editFileResult
          }
        }
      ]
    });
  });

  it('records renderer-managed tool failures and asks runtime to continue', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const executeRendererTool = vi.fn().mockRejectedValue(new Error('Renderer bridge unavailable'));
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
          tools: [{ name: 'renderer_echo', description: 'Renderer echo', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(result).toEqual({ usage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 }, shouldContinue: true });
    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'renderer_echo',
          status: 'done',
          result: {
            toolName: 'renderer_echo',
            status: 'failure',
            error: { code: 'EXECUTION_FAILED', message: 'Renderer bridge unavailable' }
          }
        }
      ]
    });
  });

  it('preserves stable renderer-managed tool error codes', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];
    const timeoutError = Object.assign(new Error('Renderer tool renderer_echo timed out after 5ms'), { code: 'TOOL_TIMEOUT' });
    const executeRendererTool = vi.fn().mockRejectedValue(timeoutError);
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

    await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'renderer_echo', description: 'Renderer echo', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(updates.at(-1)).toMatchObject({
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'renderer_echo',
          status: 'done',
          result: {
            toolName: 'renderer_echo',
            status: 'failure',
            error: { code: 'TOOL_TIMEOUT', message: 'Renderer tool renderer_echo timed out after 5ms' }
          }
        }
      ]
    });
  });

  it('times out renderer-managed tool calls and records a tool timeout result', async (): Promise<void> => {
    vi.useFakeTimers();
    try {
      const assistantMessage = createAssistantMessage();
      const updates: ChatMessageRecord[] = [];
      const executeRendererTool = vi.fn(
        () =>
          new Promise<never>(() => {
            // 保持 pending，用于验证 renderer 工具超时兜底。
          })
      );
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
      const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeRendererTool, rendererToolTimeoutMs: 5 });

      const task = executor(
        {
          runtime: {
            ...runtime,
            tools: [{ name: 'renderer_echo', description: 'Renderer echo', parameters: { type: 'object', properties: {} } }]
          },
          userMessage,
          assistantMessage
        },
        async (message) => {
          updates.push({ ...message, parts: [...message.parts] });
        }
      );

      let settled = false;
      task
        .then(() => {
          settled = true;
        })
        .catch(() => undefined);
      await vi.advanceTimersByTimeAsync(5);
      await Promise.resolve();

      expect(settled).toBe(true);
      await expect(task).resolves.toEqual({
        usage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 },
        shouldContinue: true
      });
      expect(updates.at(-1)).toMatchObject({
        parts: [
          {
            type: 'tool',
            toolCallId: 'tool-call-1',
            toolName: 'renderer_echo',
            status: 'done',
            result: {
              toolName: 'renderer_echo',
              status: 'failure',
              error: { code: 'TOOL_TIMEOUT', message: 'Renderer 工具 renderer_echo 执行超时，已等待 5ms' }
            }
          }
        ]
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns TOOL_NOT_FOUND failure for unregistered tool calls', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];

    async function* createUnknownToolStream(): AsyncGenerator<unknown> {
      yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'unknown_tool', input: {} };
      yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } };
    }

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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createUnknownToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText });

    const result = await executor({ runtime, userMessage, assistantMessage }, async (message) => {
      updates.push({ ...message, parts: [...message.parts] });
    });

    expect(result).toEqual({
      usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
      shouldContinue: true
    });
    expect(updates.at(-1)?.parts[0]).toMatchObject({
      type: 'tool',
      toolCallId: 'tool-call-1',
      toolName: 'unknown_tool',
      status: 'done',
      result: {
        toolName: 'unknown_tool',
        status: 'failure',
        error: {
          code: 'TOOL_NOT_FOUND',
          message: expect.stringContaining('unknown_tool')
        }
      }
    });
  });

  it('stops stream when earlier tool call is cancelled, even if later ones succeed', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];

    async function* createMixedToolStream(): AsyncGenerator<unknown> {
      yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'read_file', input: { path: 'a.md' } };
      yield { type: 'tool-call', toolCallId: 'tool-call-2', toolName: 'read_file', input: { path: 'b.md' } };
      yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } };
    }

    const executeMainTool = vi
      .fn()
      .mockResolvedValueOnce({
        toolName: 'read_file',
        status: 'cancelled',
        error: { code: 'USER_CANCELLED', message: 'cancelled' }
      })
      .mockResolvedValueOnce({
        toolName: 'read_file',
        status: 'success',
        data: { content: 'b' }
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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMixedToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeMainTool });

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

    expect(executeMainTool).toHaveBeenCalledTimes(1);
    expect(result).toEqual({});
    expect(updates.at(-1)?.parts).toHaveLength(1);
  });

  it('does not reset parsed tool input to null on invalid JSON delta', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];

    async function* createFlickerToolStream(): AsyncGenerator<unknown> {
      yield { type: 'tool-input-start', id: 'tool-call-1', toolName: 'read_file' };
      yield { type: 'tool-input-delta', id: 'tool-call-1', delta: '{"path":"src/index.ts"}' };
      yield { type: 'tool-input-delta', id: 'tool-call-1', delta: ',' };
      yield { type: 'tool-input-end', id: 'tool-call-1' };
      yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'read_file', input: { path: 'src/index.ts' } };
      yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 } };
    }

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
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createFlickerToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText });

    await executor({ runtime, userMessage, assistantMessage }, async (message) => {
      updates.push({ ...message, parts: [...message.parts] });
    });

    const afterInvalidDelta = updates.find((message) => {
      const part = message.parts[0];
      return part?.type === 'tool' && part.inputText === '{"path":"src/index.ts"},';
    });
    expect(afterInvalidDelta).toBeDefined();
    expect(afterInvalidDelta?.parts[0]).toMatchObject({
      type: 'tool',
      input: { path: 'src/index.ts' }
    });
  });

  it('includes image files in model request when sourceMessages are empty', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const imageUserMessage: ChatMessageRecord = {
      ...userMessage,
      content: 'describe this image',
      parts: [{ type: 'text', text: 'describe this image' }],
      files: [
        {
          id: 'file-1',
          type: 'image',
          name: 'test.png',
          url: 'https://example.com/test.png',
          mimeType: 'image/png'
        }
      ]
    };

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

    await executor({ runtime, userMessage: imageUserMessage, assistantMessage }, async () => undefined);

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'openai' }),
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'describe this image' },
              { type: 'image', image: 'https://example.com/test.png', mediaType: 'image/png' }
            ]
          }
        ]
      })
    );
  });
});
