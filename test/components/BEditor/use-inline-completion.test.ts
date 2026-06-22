/**
 * @file use-inline-completion.test.ts
 * @description BEditor 内联补全 hook 测试（合并 pane 编排器与状态机用例）。
 */
import type { AIInvokeResult, AIRequestOptions } from 'types/ai';
import type { ModelServiceType } from 'types/model';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InlineCompletionAdapter, InlineCompletionUserInteraction } from '@/components/BEditor/adapters/inlineCompletionAdapter';
import { useInlineCompletion } from '@/components/BEditor/hooks/useInlineCompletion';
import type { EditorState } from '@/components/BEditor/types';
import type { AvailableServiceModelConfig } from '@/stores/ai/serviceModel';

const hookMocks = vi.hoisted(() => ({
  invokeCalls: [] as AIRequestOptions[],
  serviceTypes: [] as ModelServiceType[],
  config: null as AvailableServiceModelConfig | null,
  result: { text: ' ghost' } as AIInvokeResult,
  invokeError: null as { message: string } | null,
  // 慢响应模式：使用 setTimeout 模拟长耗时 invoke
  slowDelayMs: 0,
  pendingResolvers: [] as Array<() => void>
}));

vi.mock('@/hooks/useChat', () => ({
  useChat: () => ({
    agent: {
      /**
       * 记录 hook 发出的 AI 调用，支持 slowDelayMs 模拟耗时请求。
       * @param payload - AI 请求载荷
       * @returns AI 调用结果
       */
      invoke: async (payload: AIRequestOptions): AsyncResult<AIInvokeResult, { message: string }> => {
        hookMocks.invokeCalls.push(payload);
        if (hookMocks.invokeError) {
          return [hookMocks.invokeError];
        }

        if (hookMocks.slowDelayMs > 0) {
          await new Promise<void>((resolve) => {
            hookMocks.pendingResolvers.push(resolve);
            setTimeout(resolve, hookMocks.slowDelayMs);
          });
        }

        return [undefined, hookMocks.result];
      }
    }
  })
}));

vi.mock('@/stores/ai/serviceModel', () => ({
  useServiceModelStore: () => ({
    /**
     * 记录 hook 查询的服务模型类型。
     * @param serviceType - 服务模型类型
     * @returns 当前测试配置
     */
    getAvailableServiceConfig: async (serviceType: ModelServiceType): Promise<AvailableServiceModelConfig | null> => {
      hookMocks.serviceTypes.push(serviceType);
      return hookMocks.config;
    }
  })
}));

/**
 * 创建可主动发出交互事件的内联补全 adapter 测试替身。
 * @param overrides - 覆盖默认行为
 * @returns adapter 测试替身
 */
function createAdapter(overrides: Partial<InlineCompletionAdapter> = {}): InlineCompletionAdapter & { emit: (type: InlineCompletionUserInteraction) => void } {
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
    acceptGhostText: vi.fn(async (): Promise<void> => undefined),
    onUserInteraction: (handler: (type: InlineCompletionUserInteraction) => void): (() => void) => {
      callback = handler;
      return (): void => {
        callback = null;
      };
    },
    destroy: vi.fn(),
    emit: (type: InlineCompletionUserInteraction): void => callback?.(type),
    ...overrides
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

/**
 * 挂载 hook 并返回 controller。
 * @param adapter - 内联补全 adapter
 * @returns hook controller
 */
function mountCompletion(adapter: InlineCompletionAdapter): ReturnType<typeof useInlineCompletion> {
  const completion = useInlineCompletion();
  completion.mount({ adapter, editorState: createEditorState });
  return completion;
}

/**
 * 推进 fake 计时器并等待 nextTick。
 * @param ms - 等待毫秒
 */
async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await nextTick();
}

/**
 * 立即结算所有 pending 的 invoke 解析。
 */
function flushPendingInvokes(): void {
  const resolvers = hookMocks.pendingResolvers.splice(0);
  resolvers.forEach((resolve) => resolve());
}

describe('useInlineCompletion', (): void => {
  beforeEach((): void => {
    hookMocks.invokeCalls.length = 0;
    hookMocks.serviceTypes.length = 0;
    hookMocks.config = null;
    hookMocks.result = { text: ' ghost' };
    hookMocks.invokeError = null;
    hookMocks.slowDelayMs = 0;
    hookMocks.pendingResolvers.length = 0;
  });

  afterEach((): void => {
    flushPendingInvokes();
    vi.useRealTimers();
  });

  describe('pane 编排器', (): void => {
    it('mounts inline completion state machine with pane adapter and editor state', (): void => {
      const adapter = createAdapter();
      const completion = useInlineCompletion();

      completion.mount({ adapter, editorState: createEditorState });

      expect(completion.instance.value).not.toBeNull();

      completion.destroy();

      expect(adapter.destroy).toHaveBeenCalledTimes(1);
      expect(completion.instance.value).toBeNull();
    });

    it('invokes polish model with generic reasoning disabled and no explicit max token budget', async (): Promise<void> => {
      vi.useFakeTimers();
      hookMocks.config = { providerId: 'provider-1', modelId: 'model-1', updatedAt: 1 };
      const adapter = createAdapter();
      mountCompletion(adapter);

      adapter.emit('input');
      await advance(700);

      expect(hookMocks.serviceTypes).toEqual(['polish']);
      expect(hookMocks.invokeCalls).toEqual([
        {
          providerId: 'provider-1',
          modelId: 'model-1',
          prompt: expect.any(String),
          temperature: 0.2,
          reasoning: { enabled: false }
        }
      ]);
      expect(hookMocks.invokeCalls[0]).not.toHaveProperty('maxOutputTokens');
      expect(adapter.showGhost).toHaveBeenCalledWith(' ghost', expect.objectContaining({ docVersion: 1 }));
    });

    it('returns empty text without invoking AI when polish model is unavailable', async (): Promise<void> => {
      vi.useFakeTimers();
      const adapter = createAdapter();
      mountCompletion(adapter);

      adapter.emit('input');
      await advance(700);

      expect(hookMocks.serviceTypes).toEqual(['polish']);
      expect(hookMocks.invokeCalls).toEqual([]);
      expect(adapter.showGhost).not.toHaveBeenCalled();
    });

    it('cancels AI service errors without rendering ghost text', async (): Promise<void> => {
      vi.useFakeTimers();
      hookMocks.config = { providerId: 'provider-1', modelId: 'model-1', updatedAt: 1 };
      hookMocks.invokeError = { message: 'model failed' };
      const adapter = createAdapter();
      mountCompletion(adapter);

      adapter.emit('input');
      await advance(700);

      expect(hookMocks.invokeCalls).toHaveLength(1);
      expect(adapter.showGhost).not.toHaveBeenCalled();
      expect(adapter.hideGhost).toHaveBeenCalled();
    });
  });

  describe('状态机', (): void => {
    /**
     * 设置 hook 返回的补全文本。
     * @param text - AI 返回文本
     */
    function stubInvokeResult(text: string): void {
      hookMocks.config = { providerId: 'provider-1', modelId: 'model-1', updatedAt: 1 };
      hookMocks.result = { text };
    }

    it('shows ghost text after a valid invoke response', async (): Promise<void> => {
      vi.useFakeTimers();
      stubInvokeResult(' completion');
      const adapter = createAdapter();
      const completion = mountCompletion(adapter);

      adapter.emit('input');
      await advance(700);

      expect(hookMocks.invokeCalls).toHaveLength(1);
      expect(adapter.showGhost).toHaveBeenCalledWith(' completion', expect.objectContaining({ docVersion: 1 }));
      expect(completion.instance.value?.state.value.status).toBe('showing');
    });

    it('requests completion without an explicit output token budget', async (): Promise<void> => {
      vi.useFakeTimers();
      stubInvokeResult(' completion');
      const adapter = createAdapter();
      mountCompletion(adapter);

      adapter.emit('input');
      await advance(700);

      expect(hookMocks.invokeCalls[0]).not.toHaveProperty('maxOutputTokens');
    });

    it('keeps pending completion after unchanged cursor noise', async (): Promise<void> => {
      vi.useFakeTimers();
      stubInvokeResult(' completion');
      const adapter = createAdapter();
      mountCompletion(adapter);

      adapter.emit('input');
      adapter.emit('cursor');
      await advance(700);

      expect(hookMocks.invokeCalls).toHaveLength(1);
    });

    it('cancels pending completion after cursor movement', async (): Promise<void> => {
      vi.useFakeTimers();
      stubInvokeResult(' completion');
      let cursorPosition = 5;
      const adapter = createAdapter({ getCursorPosition: (): { absolutePosition: number } => ({ absolutePosition: cursorPosition }) });
      mountCompletion(adapter);

      adapter.emit('input');
      cursorPosition = 6;
      adapter.emit('cursor');
      await advance(700);

      expect(hookMocks.invokeCalls).toEqual([]);
      expect(adapter.hideGhost).toHaveBeenCalled();
    });

    it('cancels stale results after cursor movement while loading', async (): Promise<void> => {
      vi.useFakeTimers();
      stubInvokeResult(' stale');
      hookMocks.slowDelayMs = 20;
      let cursorPosition = 5;
      const adapter = createAdapter({ getCursorPosition: (): { absolutePosition: number } => ({ absolutePosition: cursorPosition }) });
      mountCompletion(adapter);

      adapter.emit('input');
      await advance(700);
      cursorPosition = 6;
      adapter.emit('cursor');
      await advance(30);

      expect(adapter.showGhost).not.toHaveBeenCalled();
      expect(adapter.hideGhost).toHaveBeenCalled();
    });

    it('keeps newer ghost text when an older request resolves late', async (): Promise<void> => {
      vi.useFakeTimers();
      stubInvokeResult(' current');
      hookMocks.slowDelayMs = 1000;
      const adapter = createAdapter();
      const completion = mountCompletion(adapter);

      adapter.emit('input');
      await advance(700);
      adapter.emit('input');
      await advance(700);

      expect(hookMocks.invokeCalls).toHaveLength(2);
      hookMocks.pendingResolvers[1]?.();
      await advance(0);

      expect(adapter.showGhost).toHaveBeenCalledWith(' current', expect.objectContaining({ docVersion: 1 }));
      expect(completion.instance.value?.state.value.status).toBe('showing');
      expect(adapter.hideGhost).toHaveBeenCalledTimes(1);

      hookMocks.pendingResolvers[0]?.();
      await advance(0);

      expect(completion.instance.value?.state.value.status).toBe('showing');
      expect(adapter.hideGhost).toHaveBeenCalledTimes(1);
    });

    it('accepts visible ghost text with a single adapter call', async (): Promise<void> => {
      vi.useFakeTimers();
      stubInvokeResult(' accepted');
      const adapter = createAdapter();
      const completion = mountCompletion(adapter);

      adapter.emit('input');
      await advance(700);
      await completion.instance.value?.accept();

      expect(adapter.acceptGhostText).toHaveBeenCalledWith(' accepted');
      expect(completion.instance.value?.state.value.status).toBe('idle');
    });

    it('resets to idle when accepting ghost text fails', async (): Promise<void> => {
      vi.useFakeTimers();
      stubInvokeResult(' accepted');
      const adapter = createAdapter({
        acceptGhostText: vi.fn(async (): Promise<void> => {
          throw new Error('accept failed');
        })
      });
      const completion = mountCompletion(adapter);

      adapter.emit('input');
      await advance(700);
      await expect(completion.instance.value?.accept()).resolves.toBeUndefined();

      expect(adapter.acceptGhostText).toHaveBeenCalledWith(' accepted');
      expect(completion.instance.value?.state.value.status).toBe('idle');
    });

    it('does not request again when accepting ghost text emits an input event', async (): Promise<void> => {
      vi.useFakeTimers();
      stubInvokeResult(' accepted');
      const adapter = createAdapter({
        acceptGhostText: vi.fn(async (): Promise<void> => {
          setTimeout((): void => adapter.emit('input'), 0);
        })
      });
      const completion = mountCompletion(adapter);

      adapter.emit('input');
      await advance(700);
      await completion.instance.value?.accept();
      await advance(700);

      // 第一次 input 触发 1 次，accept 后的回声被 suppressProgrammaticInput 抑制
      expect(hookMocks.invokeCalls).toHaveLength(1);
      expect(adapter.acceptGhostText).toHaveBeenCalledWith(' accepted');
    });

    it('does not cancel accepting state when accepting ghost text emits programmatic editor events', async (): Promise<void> => {
      vi.useFakeTimers();
      stubInvokeResult(' accepted');
      const adapter = createAdapter({
        acceptGhostText: vi.fn(async (): Promise<void> => {
          adapter.emit('cursor');
          adapter.emit('documentChange');
          adapter.emit('input');
        })
      });
      const completion = mountCompletion(adapter);

      adapter.emit('input');
      await advance(700);
      await completion.instance.value?.accept();

      expect(adapter.acceptGhostText).toHaveBeenCalledWith(' accepted');
      expect(adapter.hideGhost).toHaveBeenCalledTimes(1);
    });

    it('does not request completion when composition ends without text input', async (): Promise<void> => {
      vi.useFakeTimers();
      stubInvokeResult(' completion');
      const adapter = createAdapter();
      mountCompletion(adapter);

      adapter.emit('compositionStart');
      adapter.emit('compositionEnd');
      await advance(700);

      expect(hookMocks.invokeCalls).toEqual([]);
    });

    it('returns to idle without requesting when prefix has no meaningful text', async (): Promise<void> => {
      vi.useFakeTimers();
      stubInvokeResult(' completion');
      const adapter = createAdapter({
        getDocumentText: (): string => '   ',
        getCursorPosition: (): { absolutePosition: number } => ({ absolutePosition: 3 })
      });
      const completion = mountCompletion(adapter);

      adapter.emit('input');
      await advance(700);

      expect(hookMocks.invokeCalls).toEqual([]);
      expect(completion.instance.value?.state.value.status).toBe('idle');
    });

    it('requests completion after composition input finishes', async (): Promise<void> => {
      vi.useFakeTimers();
      stubInvokeResult(' completion');
      const adapter = createAdapter();
      mountCompletion(adapter);

      adapter.emit('compositionStart');
      adapter.emit('input');
      adapter.emit('compositionEnd');
      await advance(700);

      expect(hookMocks.invokeCalls).toHaveLength(1);
    });

    it('requests completion after composition document change finishes', async (): Promise<void> => {
      vi.useFakeTimers();
      stubInvokeResult(' completion');
      const adapter = createAdapter();
      mountCompletion(adapter);

      adapter.emit('compositionStart');
      adapter.emit('documentChange');
      adapter.emit('compositionEnd');
      await advance(700);

      expect(hookMocks.invokeCalls).toHaveLength(1);
    });
  });
});
