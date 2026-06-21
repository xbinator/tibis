/**
 * @file use-pane-inline-completion.test.ts
 * @description BEditor pane 级内联补全 hook 测试。
 */
import type { AIInvokeResult, AIRequestOptions } from 'types/ai';
import type { ModelServiceType } from 'types/model';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InlineCompletionAdapter, InlineCompletionUserInteraction } from '@/components/BEditor/adapters/inlineCompletionAdapter';
import { usePaneInlineCompletion } from '@/components/BEditor/hooks/useInlineCompletion';
import type { EditorState } from '@/components/BEditor/types';
import type { AvailableServiceModelConfig } from '@/stores/ai/serviceModel';

const paneHookMocks = vi.hoisted(() => ({
  invokeCalls: [] as AIRequestOptions[],
  serviceTypes: [] as ModelServiceType[],
  config: null as AvailableServiceModelConfig | null,
  result: { text: ' ghost' } as AIInvokeResult,
  invokeError: null as { message: string } | null
}));

vi.mock('@/hooks/useChat', () => ({
  useChat: () => ({
    agent: {
      /**
       * 记录 pane hook 发出的 AI 调用。
       * @param payload - AI 请求载荷
       * @returns AI 调用结果
       */
      invoke: async (payload: AIRequestOptions): AsyncResult<AIInvokeResult, { message: string }> => {
        paneHookMocks.invokeCalls.push(payload);
        if (paneHookMocks.invokeError) {
          return [paneHookMocks.invokeError];
        }

        return [undefined, paneHookMocks.result];
      }
    }
  })
}));

vi.mock('@/stores/ai/serviceModel', () => ({
  useServiceModelStore: () => ({
    /**
     * 记录 pane hook 查询的服务模型类型。
     * @param serviceType - 服务模型类型
     * @returns 当前测试配置
     */
    getAvailableServiceConfig: async (serviceType: ModelServiceType): Promise<AvailableServiceModelConfig | null> => {
      paneHookMocks.serviceTypes.push(serviceType);
      return paneHookMocks.config;
    }
  })
}));

/**
 * 创建可主动发出交互事件的 pane 适配器测试替身。
 * @returns pane 适配器测试替身
 */
function createAdapter(): InlineCompletionAdapter & { emit: (type: InlineCompletionUserInteraction) => void } {
  let callback: ((type: InlineCompletionUserInteraction) => void) | null = null;
  return {
    pane: 'rich',
    isEditable: (): boolean => true,
    canTriggerInlineCompletion: (): boolean => true,
    getCursorPosition: () => ({ absolutePosition: 5 }),
    getDocVersion: (): number => 1,
    getDocumentText: (): string => 'hello world',
    showGhost: vi.fn(),
    hideGhost: vi.fn(),
    acceptGhostText: async (): Promise<void> => undefined,
    onUserInteraction: (handler: (type: InlineCompletionUserInteraction) => void): (() => void) => {
      callback = handler;
      return (): void => {
        callback = null;
      };
    },
    destroy: vi.fn(),
    emit: (type: InlineCompletionUserInteraction): void => callback?.(type)
  };
}

/**
 * 创建编辑器状态测试替身。
 * @returns 编辑器状态
 */
function createEditorState(): EditorState {
  return {
    content: 'hello world',
    name: 'note.md',
    path: null,
    id: 'editor-1',
    ext: 'md'
  };
}

describe('usePaneInlineCompletion', (): void => {
  beforeEach((): void => {
    paneHookMocks.invokeCalls.length = 0;
    paneHookMocks.serviceTypes.length = 0;
    paneHookMocks.config = null;
    paneHookMocks.result = { text: ' ghost' };
    paneHookMocks.invokeError = null;
  });

  afterEach((): void => {
    vi.useRealTimers();
  });

  it('mounts inline completion state machine with pane adapter and editor state', (): void => {
    const adapter = createAdapter();
    const paneInlineCompletion = usePaneInlineCompletion();

    paneInlineCompletion.mount({ adapter, editorState: createEditorState });

    expect(paneInlineCompletion.instance.value).not.toBeNull();

    paneInlineCompletion.destroy();

    expect(adapter.destroy).toHaveBeenCalledTimes(1);
    expect(paneInlineCompletion.instance.value).toBeNull();
  });

  it('invokes polish model with generic reasoning disabled and no explicit max token budget', async (): Promise<void> => {
    vi.useFakeTimers();
    paneHookMocks.config = { providerId: 'provider-1', modelId: 'model-1', updatedAt: 1 };
    const adapter = createAdapter();
    const paneInlineCompletion = usePaneInlineCompletion();

    paneInlineCompletion.mount({ adapter, editorState: createEditorState });
    adapter.emit('input');
    await vi.advanceTimersByTimeAsync(700);
    await nextTick();

    expect(paneHookMocks.serviceTypes).toEqual(['polish']);
    expect(paneHookMocks.invokeCalls).toEqual([
      {
        providerId: 'provider-1',
        modelId: 'model-1',
        prompt: expect.any(String),
        temperature: 0.2,
        reasoning: { enabled: false }
      }
    ]);
    expect(paneHookMocks.invokeCalls[0]).not.toHaveProperty('maxOutputTokens');
    expect(adapter.showGhost).toHaveBeenCalledWith(' ghost', expect.objectContaining({ docVersion: 1 }));
  });

  it('returns empty text without invoking AI when polish model is unavailable', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    const paneInlineCompletion = usePaneInlineCompletion();

    paneInlineCompletion.mount({ adapter, editorState: createEditorState });
    adapter.emit('input');
    await vi.advanceTimersByTimeAsync(700);
    await nextTick();

    expect(paneHookMocks.serviceTypes).toEqual(['polish']);
    expect(paneHookMocks.invokeCalls).toEqual([]);
    expect(adapter.showGhost).not.toHaveBeenCalled();
  });

  it('cancels AI service errors without rendering ghost text', async (): Promise<void> => {
    vi.useFakeTimers();
    paneHookMocks.config = { providerId: 'provider-1', modelId: 'model-1', updatedAt: 1 };
    paneHookMocks.invokeError = { message: 'model failed' };
    const adapter = createAdapter();
    const paneInlineCompletion = usePaneInlineCompletion();

    paneInlineCompletion.mount({ adapter, editorState: createEditorState });
    adapter.emit('input');
    await vi.advanceTimersByTimeAsync(700);
    await nextTick();

    expect(paneHookMocks.invokeCalls).toHaveLength(1);
    expect(adapter.showGhost).not.toHaveBeenCalled();
    expect(adapter.hideGhost).toHaveBeenCalled();
  });
});
