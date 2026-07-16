/**
 * @file planner.test.ts
 * @description 上下文压缩纯规划器测试。
 */
import type { AITransportTool } from 'types/ai';
import type { ChatMessagePart, ChatMessageRecord, CompactionModelSnapshot } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { createCompactionPlan, type CompactionPlanInput } from '../../../../../../../electron/main/modules/chat/runtime/compaction/planner.mjs';

/**
 * 创建测试模型快照。
 * @param contextWindow - 上下文窗口
 * @returns 模型快照
 */
function createModel(contextWindow = 12_000): CompactionModelSnapshot {
  return {
    providerType: 'openai',
    providerId: 'provider-1',
    modelId: 'model-1',
    contextWindow,
    maxOutputTokens: 2_000
  };
}

/**
 * 创建已完成消息。
 * @param id - 消息标识
 * @param role - 消息角色
 * @param parts - 消息 Part
 * @returns 聊天消息
 */
function createMessage(id: string, role: 'user' | 'assistant', parts: ChatMessagePart[]): ChatMessageRecord {
  return {
    id,
    sessionId: 'session-1',
    role,
    content: '',
    parts,
    createdAt: `2026-07-16T00:00:0${id.length}.000Z`,
    loading: false,
    finished: true
  };
}

/**
 * 创建规划器输入。
 * @param sourceText - 可压缩旧消息
 * @param trigger - 触发方式
 * @returns 规划器输入
 */
function createInput(sourceText: string, trigger: 'automatic' | 'manual' = 'automatic'): CompactionPlanInput {
  return {
    trigger,
    messages: [
      createMessage('old-assistant', 'assistant', [{ id: 'source-1', type: 'text', text: sourceText }]),
      createMessage('current-user', 'user', [{ id: 'current-user-part', type: 'text', text: '请继续当前任务' }])
    ],
    currentUserMessageId: 'current-user',
    modelSnapshot: createModel(),
    contextWindow: 12_000
  };
}

describe('compaction planner', (): void => {
  it('自动模式低于 80% 阈值时跳过，手动模式可强制规划', (): void => {
    const automatic = createCompactionPlan(createInput('简短历史'));
    const manual = createCompactionPlan(createInput('简短历史', 'manual'));

    expect(automatic).toEqual({ status: 'skipped', reason: 'BELOW_THRESHOLD' });
    expect(manual.status).toBe('ready');
  });

  it('达到阈值时冻结 boundary 前源并把当前用户任务留在 raw tail', (): void => {
    const result = createCompactionPlan(createInput('x'.repeat(13_000)));

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.plan.boundaryPartId).toBe('source-1');
    expect(result.plan.sourceSnapshot.sourceParts.map((source) => source.part.id)).toEqual(['source-1']);
    expect(result.plan.rawTailMessages.flatMap((message) => message.parts).map((part) => part.id)).toContain('current-user-part');
    expect(result.plan.noncompressibleTokens).toBeGreaterThan(0);
  });

  it('没有当前用户消息之前的安全内容时返回无需压缩', (): void => {
    const input = createInput('历史');
    input.messages = [createMessage('current-user', 'user', [{ id: 'current-user-part', type: 'text', text: '唯一消息' }])];

    expect(createCompactionPlan(input)).toEqual({ status: 'skipped', reason: 'NO_SAFE_BOUNDARY' });
  });

  it('active tool 阻止插入 pending checkpoint', (): void => {
    const input = createInput('x'.repeat(25_000));
    input.messages[0].parts.push({
      id: 'active-tool',
      type: 'tool',
      toolCallId: 'tool-call-active',
      toolName: 'read_file',
      status: 'executing',
      input: { path: 'src/a.ts' }
    });

    expect(createCompactionPlan(input)).toEqual({ status: 'skipped', reason: 'NO_SAFE_BOUNDARY' });
  });

  it('不可压缩 system、tools 和当前任务挤占摘要预算时阻止压缩', (): void => {
    const input = createInput('x'.repeat(25_000), 'manual');
    input.contextWindow = 8_000;
    input.modelSnapshot = createModel(8_000);
    input.system = 's'.repeat(12_000);
    input.tools = [
      {
        name: 'large_tool',
        description: 'd'.repeat(6_000),
        parameters: { type: 'object', properties: {} }
      } as AITransportTool
    ];

    expect(createCompactionPlan(input)).toEqual({ status: 'blocked', errorCode: 'NONCOMPRESSIBLE_CONTEXT_TOO_LARGE' });
  });

  it('摘要请求超窗时先软剪枝旧大型 tool result', (): void => {
    const input = createInput('', 'manual');
    input.messages[0] = createMessage('old-assistant', 'assistant', [
      {
        id: 'source-tool',
        type: 'tool',
        toolCallId: 'tool-call-source',
        toolName: 'read_file',
        status: 'done',
        input: { path: 'src/large.ts' },
        result: {
          toolName: 'read_file',
          status: 'success',
          data: { artifactId: 'artifact-1', path: 'src/large.ts', content: 'x'.repeat(40_000) }
        }
      }
    ]);

    const result = createCompactionPlan(input);

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.plan.sourceSnapshot.sourceParts[0].part).toMatchObject({
      type: 'tool',
      result: { data: { artifactId: 'artifact-1', path: 'src/large.ts', pruned: true } }
    });
    expect(JSON.stringify(result.plan.fingerprintSources[0])).toContain('x'.repeat(40_000));
  });

  it('确定性裁剪后摘要请求仍超窗时阻止模型调用', (): void => {
    const result = createCompactionPlan(createInput('x'.repeat(100_000), 'manual'));

    expect(result).toEqual({ status: 'blocked', errorCode: 'SUMMARY_REQUEST_TOO_LARGE' });
  });

  it('按真实序列化 prompt 计算大量小 Part 的摘要输入预算', (): void => {
    const input = createInput('', 'manual');
    input.messages[0] = createMessage(
      'old-assistant',
      'assistant',
      Array.from({ length: 400 }, (_unused: unknown, index: number): ChatMessagePart => ({ id: `source-small-${index}`, type: 'text', text: '' }))
    );

    expect(createCompactionPlan(input)).toEqual({ status: 'blocked', errorCode: 'SUMMARY_REQUEST_TOO_LARGE' });
  });

  it('自动模式不重试相同 failed fingerprint，手动模式仍可重试', (): void => {
    const first = createCompactionPlan(createInput('x'.repeat(13_000)));
    expect(first.status).toBe('ready');
    if (first.status !== 'ready') return;
    const automaticInput = createInput('x'.repeat(13_000));
    automaticInput.messages.push(
      createMessage('failed-checkpoint', 'assistant', [
        {
          id: 'checkpoint-failed',
          type: 'compaction',
          status: 'failed',
          trigger: 'automatic',
          boundaryPartId: first.plan.boundaryPartId,
          sourceFingerprint: first.plan.sourceSnapshot.sourceFingerprint,
          errorCode: 'MODEL_CALL_FAILED',
          createdAt: 1,
          completedAt: 2
        }
      ])
    );
    const manualInput = { ...automaticInput, trigger: 'manual' as const };

    expect(createCompactionPlan(automaticInput)).toEqual({ status: 'skipped', reason: 'REPEATED_FAILURE' });
    expect(createCompactionPlan(manualInput).status).toBe('ready');
  });
});
