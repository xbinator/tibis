/**
 * @file main-tools.test.ts
 * @description ChatRuntime 主进程工具入口测试。
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { MainToolBridgeRequest, MainToolsDependencies } from '../../../../../../electron/main/modules/chat/runtime/tools/types.mjs';
import type { ActiveChatRuntime } from '../../../../../../electron/main/modules/chat/runtime/types.mjs';
import { describe, expect, it, vi } from 'vitest';
import { createMainToolExecutor } from '../../../../../../electron/main/modules/chat/runtime/tools/index.mjs';

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

/**
 * 创建主进程工具测试依赖。
 * @param bridgeRequests - 收集 bridge 请求的数组
 * @returns 主进程工具依赖
 */
function createMainToolDependencies(bridgeRequests: MainToolBridgeRequest[]): MainToolsDependencies {
  return {
    now: () => '2026-06-19T00:00:00.000Z',
    async requestBridge(input: MainToolBridgeRequest) {
      bridgeRequests.push(input);
      return {
        status: 'success',
        data: {
          id: 'doc-1',
          title: 'Notes',
          path: null,
          content: 'hello'
        }
      };
    },
    async requestConfirmation() {
      return { approved: true };
    }
  };
}

describe('createMainToolExecutor', (): void => {
  it('routes local read tools without renderer bridge', async (): Promise<void> => {
    const bridgeRequests: MainToolBridgeRequest[] = [];
    const executeMainTool = createMainToolExecutor(createMainToolDependencies(bridgeRequests));

    const result = await executeMainTool({
      runtime,
      toolCallId: 'tool-call-1',
      toolName: 'get_current_time',
      input: {}
    });

    expect(result.status).toBe('success');
    expect(result.toolName).toBe('get_current_time');
    expect(result.data).toMatchObject({ iso: '2026-06-19T00:00:00.000Z' });
    expect(bridgeRequests).toEqual([]);
  });

  it('routes bridge-backed read tools through shared dependencies', async (): Promise<void> => {
    const bridgeRequests: MainToolBridgeRequest[] = [];
    const executeMainTool = createMainToolExecutor(createMainToolDependencies(bridgeRequests));

    const result = await executeMainTool({
      runtime,
      toolCallId: 'tool-call-2',
      toolName: 'read_current_document',
      input: { includeSelection: true }
    });

    expect(result.status).toBe('success');
    expect(result.toolName).toBe('read_current_document');
    expect(result.data).toMatchObject({ id: 'doc-1', title: 'Notes', content: 'hello' });
    expect(bridgeRequests).toEqual([
      {
        runtimeId: 'runtime-1',
        toolCallId: 'tool-call-2',
        kind: 'document-snapshot',
        payload: { includeSelection: true }
      }
    ]);
  });

  it('routes read_current_webpage through WebviewTool bridge', async (): Promise<void> => {
    const bridgeRequests: MainToolBridgeRequest[] = [];
    const executeMainTool = createMainToolExecutor({
      ...createMainToolDependencies(bridgeRequests),
      async requestBridge(input: MainToolBridgeRequest) {
        bridgeRequests.push(input);
        return {
          status: 'success',
          data: {
            url: 'https://example.com',
            title: 'Example',
            header: 'Page info: 800x600px [Start of page]',
            content: '[1]<button>Search</button>',
            footer: '[End of page]',
            text: 'Hello',
            selectedText: '',
            headings: [],
            links: [],
            capturedAt: 1,
            truncated: { content: false },
            snapshotId: 'snap-1',
            loading: false,
            scroll: {
              x: 0,
              y: 0,
              viewportWidth: 800,
              viewportHeight: 600,
              scrollWidth: 800,
              scrollHeight: 1200,
              atTop: true,
              atBottom: false
            },
            elements: []
          }
        };
      }
    });

    const result = await executeMainTool({
      runtime,
      toolCallId: 'tool-call-web-1',
      toolName: 'read_current_webpage',
      input: {}
    });

    expect(result.status).toBe('success');
    expect(result.toolName).toBe('read_current_webpage');
    expect(result.data).toMatchObject({ snapshotId: 'snap-1', title: 'Example', content: '[1]<button>Search</button>' });
    expect(bridgeRequests).toEqual([
      {
        runtimeId: 'runtime-1',
        toolCallId: 'tool-call-web-1',
        kind: 'webview-snapshot',
        payload: {}
      }
    ]);
  });

  it('rejects read_current_webpage payloads without simplified DOM content', async (): Promise<void> => {
    const bridgeRequests: MainToolBridgeRequest[] = [];
    const executeMainTool = createMainToolExecutor({
      ...createMainToolDependencies(bridgeRequests),
      async requestBridge(input: MainToolBridgeRequest) {
        bridgeRequests.push(input);
        return {
          status: 'success',
          data: {
            url: 'https://example.com',
            title: 'Example',
            text: 'Hello',
            selectedText: '',
            headings: [],
            links: [],
            capturedAt: 1,
            truncated: {}
          }
        };
      }
    });

    const result = await executeMainTool({
      runtime,
      toolCallId: 'tool-call-web-missing-content-1',
      toolName: 'read_current_webpage',
      input: {}
    });

    expect(result).toMatchObject({
      toolName: 'read_current_webpage',
      status: 'failure',
      error: { code: 'INVALID_INPUT', message: '当前网页快照格式无效' }
    });
  });

  it('rejects invalid read_current_webpage bridge payloads', async (): Promise<void> => {
    const bridgeRequests: MainToolBridgeRequest[] = [];
    const executeMainTool = createMainToolExecutor({
      ...createMainToolDependencies(bridgeRequests),
      async requestBridge(input: MainToolBridgeRequest) {
        bridgeRequests.push(input);
        return {
          status: 'success',
          data: { title: 'Missing required webpage fields' }
        };
      }
    });

    const result = await executeMainTool({
      runtime,
      toolCallId: 'tool-call-web-invalid-1',
      toolName: 'read_current_webpage',
      input: {}
    });

    expect(result).toMatchObject({
      toolName: 'read_current_webpage',
      status: 'failure',
      error: { code: 'INVALID_INPUT', message: '当前网页快照格式无效' }
    });
  });

  it('confirms operate_webpage before requesting renderer operation', async (): Promise<void> => {
    const bridgeRequests: MainToolBridgeRequest[] = [];
    const requestConfirmation = vi.fn(async () => ({ approved: true }));
    const executeMainTool = createMainToolExecutor({
      now: () => '2026-06-22T00:00:00.000Z',
      requestConfirmation,
      async requestBridge(input: MainToolBridgeRequest) {
        bridgeRequests.push(input);
        return {
          status: 'success',
          data: {
            ok: true,
            action: 'click',
            target: { index: 2, label: 'Search', tagName: 'BUTTON' },
            message: '已点击 Search',
            navigationStarted: false,
            pageChanged: true,
            shouldReadAgain: true
          }
        };
      }
    });
    const toolInput = { snapshotId: 'snap-1', action: { type: 'click', index: 2 } };

    const result = await executeMainTool({
      runtime,
      toolCallId: 'tool-call-web-2',
      toolName: 'operate_webpage',
      input: toolInput
    });

    expect(result.status).toBe('success');
    expect(result.toolName).toBe('operate_webpage');
    expect(requestConfirmation).toHaveBeenCalledTimes(1);
    expect(requestConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          toolName: 'operate_webpage',
          allowRemember: true,
          rememberScopes: ['session', 'always']
        })
      })
    );
    expect(bridgeRequests).toEqual([
      {
        runtimeId: 'runtime-1',
        toolCallId: 'tool-call-web-2',
        kind: 'webview-operate',
        payload: toolInput
      }
    ]);
  });

  it('rejects invalid operate_webpage bridge payloads', async (): Promise<void> => {
    const bridgeRequests: MainToolBridgeRequest[] = [];
    const executeMainTool = createMainToolExecutor({
      now: () => '2026-06-22T00:00:00.000Z',
      async requestConfirmation() {
        return { approved: true };
      },
      async requestBridge(input: MainToolBridgeRequest) {
        bridgeRequests.push(input);
        return {
          status: 'success',
          data: { ok: true, action: 'click' }
        };
      }
    });

    const result = await executeMainTool({
      runtime,
      toolCallId: 'tool-call-web-invalid-2',
      toolName: 'operate_webpage',
      input: { snapshotId: 'snap-1', action: { type: 'click', index: 2 } }
    });

    expect(result).toMatchObject({
      toolName: 'operate_webpage',
      status: 'failure',
      error: { code: 'INVALID_INPUT', message: '网页操作结果格式无效' }
    });
    expect(bridgeRequests).toHaveLength(1);
  });

  it('returns a stable failure for unknown main tools', async (): Promise<void> => {
    const executeMainTool = createMainToolExecutor(createMainToolDependencies([]));

    const result = await executeMainTool({
      runtime,
      toolCallId: 'tool-call-3',
      toolName: 'unknown_tool',
      input: {}
    });

    expect(result).toMatchObject({
      toolName: 'unknown_tool',
      status: 'failure',
      error: { code: 'TOOL_NOT_FOUND' }
    });
  });

  it('blocks read_file relative paths that escape the workspace', async (): Promise<void> => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tibis-runtime-tools-'));
    try {
      const workspaceRoot = path.join(tempRoot, 'workspace');
      await fs.mkdir(workspaceRoot);
      await fs.writeFile(path.join(tempRoot, 'outside.txt'), 'secret', 'utf8');
      const requestConfirmation = vi.fn(async () => ({ approved: true }));
      const executeMainTool = createMainToolExecutor({
        now: () => '2026-06-19T00:00:00.000Z',
        async requestBridge() {
          return { status: 'failure', error: { code: 'EDITOR_UNAVAILABLE', message: 'no editor' } };
        },
        requestConfirmation
      });

      const result = await executeMainTool({
        runtime: { ...runtime, workspaceRoot },
        toolCallId: 'tool-call-4',
        toolName: 'read_file',
        input: { path: '../outside.txt' }
      });

      expect(result).toMatchObject({
        toolName: 'read_file',
        status: 'failure',
        error: { code: 'PERMISSION_DENIED' }
      });
      expect(requestConfirmation).not.toHaveBeenCalled();
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('confirms read_file absolute paths that normalize outside the workspace', async (): Promise<void> => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tibis-runtime-tools-'));
    try {
      const workspaceRoot = path.join(tempRoot, 'workspace');
      await fs.mkdir(workspaceRoot);
      await fs.writeFile(path.join(tempRoot, 'outside.txt'), 'secret', 'utf8');
      const requestConfirmation = vi.fn(async () => ({ approved: true }));
      const executeMainTool = createMainToolExecutor({
        now: () => '2026-06-19T00:00:00.000Z',
        async requestBridge() {
          return { status: 'failure', error: { code: 'EDITOR_UNAVAILABLE', message: 'no editor' } };
        },
        requestConfirmation
      });

      const result = await executeMainTool({
        runtime: { ...runtime, workspaceRoot },
        toolCallId: 'tool-call-7',
        toolName: 'read_file',
        input: { path: `${workspaceRoot}${path.sep}..${path.sep}outside.txt` }
      });

      expect(result).toMatchObject({
        toolName: 'read_file',
        status: 'success',
        data: { content: 'secret' }
      });
      expect(requestConfirmation).toHaveBeenCalledTimes(1);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks read_directory relative paths that escape the workspace', async (): Promise<void> => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tibis-runtime-tools-'));
    try {
      const workspaceRoot = path.join(tempRoot, 'workspace');
      await fs.mkdir(workspaceRoot);
      await fs.mkdir(path.join(tempRoot, 'outside'));
      const requestConfirmation = vi.fn(async () => ({ approved: true }));
      const executeMainTool = createMainToolExecutor({
        now: () => '2026-06-19T00:00:00.000Z',
        async requestBridge() {
          return { status: 'failure', error: { code: 'EDITOR_UNAVAILABLE', message: 'no editor' } };
        },
        requestConfirmation
      });

      const result = await executeMainTool({
        runtime: { ...runtime, workspaceRoot },
        toolCallId: 'tool-call-5',
        toolName: 'read_directory',
        input: { path: '../outside' }
      });

      expect(result).toMatchObject({
        toolName: 'read_directory',
        status: 'failure',
        error: { code: 'PERMISSION_DENIED' }
      });
      expect(requestConfirmation).not.toHaveBeenCalled();
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks open_resource relative file paths that escape the workspace before bridge dispatch', async (): Promise<void> => {
    const bridgeRequests: MainToolBridgeRequest[] = [];
    const requestConfirmation = vi.fn(async () => ({ approved: true }));
    const executeMainTool = createMainToolExecutor({
      now: () => '2026-06-19T00:00:00.000Z',
      async requestBridge(input: MainToolBridgeRequest) {
        bridgeRequests.push(input);
        return { status: 'success', data: { path: input.payload, resourceType: 'file', opened: true } };
      },
      requestConfirmation
    });

    const result = await executeMainTool({
      runtime: { ...runtime, workspaceRoot: '/workspace' },
      toolCallId: 'tool-call-6',
      toolName: 'open_resource',
      input: { path: '../outside.txt' }
    });

    expect(result).toMatchObject({
      toolName: 'open_resource',
      status: 'failure',
      error: { code: 'PERMISSION_DENIED' }
    });
    expect(bridgeRequests).toEqual([]);
    expect(requestConfirmation).not.toHaveBeenCalled();
  });
});
