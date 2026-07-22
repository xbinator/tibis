/**
 * @file factory.test.ts
 * @description ChatRuntime 工厂冻结请求模型测试。
 */
import type { ChatRuntimeCompactInput, ChatRuntimeContinueInput, ChatRuntimeSendInput, ChatRuntimeSubmitUserChoiceInput } from 'types/chat-runtime';
import { describe, expect, it } from 'vitest';
import {
  createCompactRuntime,
  createContinuationRuntime,
  createSendRuntime,
  createUserChoiceRuntime
} from '../../../../../../electron/main/modules/chat/runtime/runners/factory.mjs';

/** Runtime 工厂测试模型。 */
const model = { providerId: 'provider-1', modelId: 'model-2' };
/** Runtime 工厂共享输入。 */
const base = { clientId: 'client-1', agentId: 'primary', model };

describe('runtime factories', (): void => {
  it('copies the requested model into every active runtime', (): void => {
    const send = createSendRuntime({ ...base, runtimeId: 'send', content: 'hello' } satisfies ChatRuntimeSendInput, 'send', 'session-1');
    const continuation = createContinuationRuntime(
      { ...base, runtimeId: 'continue', sessionId: 'session-1', messages: [] } satisfies ChatRuntimeContinueInput,
      'continue'
    );
    const compact = createCompactRuntime({ ...base, runtimeId: 'compact', sessionId: 'session-1' } satisfies ChatRuntimeCompactInput, 'compact');
    const choice = createUserChoiceRuntime(
      {
        ...base,
        runtimeId: 'choice',
        sessionId: 'session-1',
        answer: { questionId: 'question-1', toolCallId: 'tool-1', answers: ['yes'] }
      } satisfies ChatRuntimeSubmitUserChoiceInput,
      'choice'
    );

    expect([send.model, continuation.model, compact.model, choice.model]).toEqual([model, model, model, model]);
  });
});
