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
