/**
 * @file quality-regression.test.ts
 * @description 长会话滚动压缩的结构化信息保真、预算、原文保护和脱敏日志质量回归。
 */
import type { SummaryGenerationResult } from '../../../../../../../electron/main/modules/chat/runtime/compaction/summary-generator.mjs';
import type { ChatMessageCompactionPart, ChatMessagePart, ChatMessageRecord, StructuredContextSummary } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { createCompactionExecutor, type CompactionDiagnosticLog } from '../../../../../../../electron/main/modules/chat/runtime/compaction/executor.mjs';
import { projectContext } from '../../../../../../../electron/main/modules/chat/runtime/compaction/projector.mjs';
import {
  createLongContextFixture,
  LONG_CURRENT_USER_TASK,
  LONG_TOOL_SECRET,
  QUALITY_MODEL_SNAPSHOT
} from '../../../../../../fixtures/chat/long-context-compaction';

/**
 * 收集结构化摘要中的全部证据 Part ID。
 * @param summary - 最终结构化摘要
 * @returns 去重证据 ID
 */
function collectSummarySources(summary: StructuredContextSummary): string[] {
  return [
    ...summary.objectives,
    ...summary.facts,
    ...summary.artifacts,
    ...summary.completedActions,
    ...summary.pendingActions,
    ...summary.openQuestions,
    ...summary.failures
  ].flatMap((item): string[] => item.sourcePartIds);
}

describe('long context compaction quality regression', (): void => {
  it('preserves structured state and current task while meeting the target budget without leaking diagnostics', async (): Promise<void> => {
    const fixture = createLongContextFixture();
    const messages = structuredClone(fixture.messages);
    const diagnostics: CompactionDiagnosticLog[] = [];
    let timestamp = 1_000;
    const executor = createCompactionExecutor({
      readMessages: async (): Promise<ChatMessageRecord[]> => structuredClone(messages),
      writeMessage: async (message: ChatMessageRecord): Promise<void> => {
        const index = messages.findIndex((candidate: ChatMessageRecord): boolean => candidate.id === message.id);
        if (index >= 0) messages[index] = structuredClone(message);
        else messages.push(structuredClone(message));
      },
      generateSummary: async (): Promise<SummaryGenerationResult> => ({
        status: 'success',
        summary: structuredClone(fixture.finalSummary),
        modelSnapshot: structuredClone(QUALITY_MODEL_SNAPSHOT)
      }),
      hasLease: (): boolean => true,
      createPartId: (): string => 'checkpoint-quality-final',
      now: (): number => {
        timestamp += 25;
        return timestamp;
      },
      diagnosticLog: (entry: CompactionDiagnosticLog): void => {
        diagnostics.push(structuredClone(entry));
      }
    });

    const result = await executor.execute({
      runtimeId: 'runtime-quality',
      sessionId: 'session-quality',
      trigger: 'automatic',
      assistantMessage: fixture.assistantMessage,
      currentUserMessageId: fixture.currentUserMessageId,
      contextWindow: QUALITY_MODEL_SNAPSHOT.contextWindow as number,
      maxOutputTokens: QUALITY_MODEL_SNAPSHOT.maxOutputTokens,
      modelSnapshot: structuredClone(QUALITY_MODEL_SNAPSHOT)
    });

    expect(result.status).toBe('success');
    const checkpoint = fixture.assistantMessage.parts.at(-1) as ChatMessageCompactionPart & { status: 'success' };
    expect(checkpoint.modelSnapshot).toEqual(QUALITY_MODEL_SNAPSHOT);
    expect(checkpoint.sourceFingerprint).not.toBe('sha256:model-a-failed-fingerprint');
    expect(checkpoint.summary?.activeObjectiveId).toBe('objective-new');
    expect(checkpoint.summary?.objectives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'objective-old', status: 'superseded', supersededById: 'objective-new' }),
        expect.objectContaining({ id: 'objective-new', status: 'active', successCriteria: ['保持当前任务原文', '稳定关联移动后的 artifact'] })
      ])
    );
    expect(checkpoint.summary?.pendingActions[0]).toMatchObject({ id: 'action-assistant', owner: { type: 'assistant', id: 'primary' } });
    expect(checkpoint.summary?.openQuestions[0]).toMatchObject({ id: 'question-user', owner: { type: 'user' } });
    expect(checkpoint.summary?.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'artifact-a', path: 'src/utils/a.ts', status: 'modified' }),
        expect.objectContaining({ id: 'artifact-deleted', path: 'src/obsolete.ts', status: 'deleted' })
      ])
    );

    const allPartIds = new Set(messages.flatMap((message: ChatMessageRecord): string[] => message.parts.map((part: ChatMessagePart): string => part.id)));
    expect(collectSummarySources(checkpoint.summary as StructuredContextSummary).every((partId: string): boolean => allPartIds.has(partId))).toBe(true);
    const projection = projectContext({ messages });
    expect(projection.estimatedTokens).toBeLessThanOrEqual(checkpoint.budgetSnapshot?.targetTokens as number);
    expect(JSON.stringify(projection.messages)).toContain(LONG_CURRENT_USER_TASK);
    expect(JSON.stringify(messages)).toContain(LONG_TOOL_SECRET);

    expect(diagnostics).toHaveLength(1);
    const diagnosticText = JSON.stringify(diagnostics);
    expect(diagnostics[0]).toMatchObject({
      runtimeId: 'runtime-quality',
      sessionId: 'session-quality',
      checkpointId: 'checkpoint-quality-final',
      trigger: 'automatic',
      status: 'success',
      projectedTokens: projection.estimatedTokens,
      modelSnapshot: QUALITY_MODEL_SNAPSHOT
    });
    expect(diagnosticText).not.toContain(LONG_TOOL_SECRET);
    expect(diagnosticText).not.toContain(LONG_CURRENT_USER_TASK);
    expect(diagnosticText).not.toContain(checkpoint.sourceFingerprint as string);
    expect(String(diagnostics[0].fingerprintPrefix).length).toBeLessThan((checkpoint.sourceFingerprint as string).length);
  });
});
