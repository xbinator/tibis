/**
 * @file recovery-requests.test.ts
 * @description ChatRuntime 待处理 renderer 请求恢复投影测试。
 */
import type { ActiveChatRuntime } from '../../../../../../electron/main/modules/chat/runtime/types.mjs';
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeBridgeRequests } from '../../../../../../electron/main/modules/chat/runtime/controllers/bridge.mjs';
import { createRuntimeConfirmationRequests } from '../../../../../../electron/main/modules/chat/runtime/controllers/confirmation.mjs';
import { createRuntimeRendererToolRequests } from '../../../../../../electron/main/modules/chat/runtime/controllers/renderer-tool.mjs';

/** 创建活跃 Runtime 测试夹具。 */
function createRuntime(): ActiveChatRuntime {
  return {
    runtimeId: 'runtime-1',
    sessionId: 'session-1',
    clientId: 'bchat',
    agentId: 'primary',
    status: 'running',
    phase: 'streaming',
    abortController: new AbortController(),
    createdAt: 1
  };
}

describe('chat runtime recovery request projections', (): void => {
  it('lists and removes pending confirmation events', async (): Promise<void> => {
    const runtime = createRuntime();
    const requests = createRuntimeConfirmationRequests({ emit: vi.fn(), getRuntime: () => runtime });
    const decision = requests.request({
      runtimeId: runtime.runtimeId,
      confirmationId: 'confirmation-1',
      request: { toolName: 'write_file', title: '写入文件', description: '是否写入？', riskLevel: 'write' }
    });

    expect(requests.listPending(runtime.runtimeId)).toEqual([
      expect.objectContaining({ type: 'confirmation', event: expect.objectContaining({ confirmationId: 'confirmation-1' }) })
    ]);
    requests.submit({ runtimeId: runtime.runtimeId, confirmationId: 'confirmation-1', decision: { approved: false } });
    await decision;
    expect(requests.listPending(runtime.runtimeId)).toEqual([]);
  });

  it('lists and removes pending renderer tool events', async (): Promise<void> => {
    const runtime = createRuntime();
    const requests = createRuntimeRendererToolRequests({ emit: vi.fn(), getRuntime: () => runtime, timeoutMs: 30_000 });
    const result = requests.request({ runtime, toolCallId: 'tool-call-1', toolName: 'read_current_document', input: {} });

    expect(requests.listPending(runtime.runtimeId)).toEqual([
      expect.objectContaining({ type: 'tool', event: expect.objectContaining({ toolCallId: 'tool-call-1' }) })
    ]);
    requests.submit({
      runtimeId: runtime.runtimeId,
      toolCallId: 'tool-call-1',
      result: { toolName: 'read_current_document', status: 'success', data: { content: 'hello' } }
    });
    await result;
    expect(requests.listPending(runtime.runtimeId)).toEqual([]);
  });

  it('lists and removes pending bridge events', async (): Promise<void> => {
    const runtime = createRuntime();
    const requests = createRuntimeBridgeRequests({ emit: vi.fn(), getRuntime: () => runtime, timeoutMs: 30_000 });
    const result = requests.request({ runtimeId: runtime.runtimeId, requestId: 'bridge-1', kind: 'document-snapshot' });

    expect(requests.listPending(runtime.runtimeId)).toEqual([
      expect.objectContaining({ type: 'bridge', event: expect.objectContaining({ requestId: 'bridge-1' }) })
    ]);
    requests.submit({ runtimeId: runtime.runtimeId, requestId: 'bridge-1', result: { status: 'success', data: { content: 'hello' } } });
    await result;
    expect(requests.listPending(runtime.runtimeId)).toEqual([]);
  });
});
