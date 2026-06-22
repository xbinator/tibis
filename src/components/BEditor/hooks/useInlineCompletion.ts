/**
 * @file useInlineCompletion.ts
 * @description BEditor 内联补全共享状态机，统一编排触发、请求、展示、接受与取消。
 */
import type {
  InlineCompletionAdapter,
  InlineCompletionDocumentContext,
  InlineCompletionRequestToken,
  InlineCompletionStatus,
  InlineCompletionUserInteraction
} from '../adapters/inlineCompletionAdapter';
import type { EditorState } from '../types';
import { readonly, ref, shallowRef, type DeepReadonly, type Ref, type ShallowRef } from 'vue';
import { useChat } from '@/hooks/useChat';
import { useServiceModelStore } from '@/stores/ai/serviceModel';
import logger from '@/utils/logger';
import {
  buildInlineCompletionPrompt,
  extractInlineCompletionContext,
  normalizeInlineCompletionText,
  resolveInlineCompletionHeadingPath,
  shouldDisplayInlineCompletion,
  truncateInlineCompletionText
} from '../utils/inlineCompletionContext';

const DEFAULT_DEBOUNCE_MS = 700;
const DEFAULT_TIMEOUT_MS = 8000;
const ACCEPT_INPUT_SUPPRESSION_MS = 100;

/**
 * 内联补全状态快照。
 */
export interface InlineCompletionState {
  /** 当前状态机状态 */
  status: InlineCompletionStatus;
  /** 当前显示的 ghost text */
  ghostText: string;
  /** 当前请求令牌 */
  requestToken: InlineCompletionRequestToken | null;
}

/**
 * 内联补全状态机返回值。
 */
interface InlineCompletionStateMachine {
  /** 只读状态 */
  state: DeepReadonly<Ref<InlineCompletionState>>;
  /** 接受当前 ghost text */
  accept: () => Promise<void>;
  /** 取消当前补全 */
  cancel: (reason?: InlineCompletionUserInteraction | 'timeout' | 'stale' | 'error') => void;
  /** 销毁状态机与 adapter */
  destroy: () => void;
}

/**
 * 内联补全状态机入参。
 */
interface InlineCompletionStateMachineOptions {
  /** pane 级适配器 */
  adapter: InlineCompletionAdapter;
  /** 当前编辑器元数据 getter */
  editorState: () => EditorState;
  /** AI 补全请求函数 */
  invokeCompletion: (prompt: string) => Promise<string>;
  /** 输入停顿触发延迟 */
  debounceMs?: number;
  /** 请求超时时间 */
  timeoutMs?: number;
}

/**
 * 内联补全挂载参数。
 */
export interface InlineCompletionMountOptions {
  /** 当前 pane 的内联补全适配器。 */
  adapter: InlineCompletionAdapter;
  /** 当前编辑器状态 getter。 */
  editorState: () => EditorState;
}

/**
 * 内联补全 hook 返回值。
 */
export interface UseInlineCompletionResult {
  /** 当前状态机实例。 */
  instance: ShallowRef<InlineCompletionStateMachine | null>;
  /** 挂载新的内联补全状态机。 */
  mount: (options: InlineCompletionMountOptions) => void;
  /** 销毁当前内联补全状态机。 */
  destroy: () => void;
}

/**
 * 内联补全日志载荷。
 */
interface InlineCompletionLogPayload {
  /** 追踪 ID */
  traceId: string;
  /** pane 类型 */
  pane: string;
  /** 其他调试字段 */
  [key: string]: string | number | boolean | null;
}

/**
 * 写入内联补全调试日志。
 * @param eventName - 事件名
 * @param payload - 事件载荷
 */
function logInlineCompletionEvent(eventName: string, payload: InlineCompletionLogPayload): void {
  logger.debug(`[${eventName}]`, JSON.stringify(payload));
}

/**
 * 使用超时包装 Promise。
 * @param promise - 原始 Promise
 * @param timeoutMs - 超时时间
 * @returns 带超时的 Promise
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject): void => {
    const timer = setTimeout((): void => reject(new Error('INLINE_COMPLETION_TIMEOUT')), timeoutMs);
    promise
      .then((value: T): void => resolve(value))
      .catch((error: unknown): void => reject(error))
      .finally((): void => clearTimeout(timer));
  });
}

/**
 * 创建空状态。
 * @returns 初始状态
 */
function createInitialState(): InlineCompletionState {
  return {
    status: 'idle',
    ghostText: '',
    requestToken: null
  };
}

/**
 * 创建请求令牌。
 * @param adapter - 当前 pane 适配器
 * @returns 请求令牌；无法读取光标时返回 null
 */
function createRequestToken(adapter: InlineCompletionAdapter): InlineCompletionRequestToken | null {
  const cursorPosition = adapter.getCursorPosition();
  if (!cursorPosition) {
    return null;
  }

  return {
    requestId: crypto.randomUUID(),
    docVersion: adapter.getDocVersion(),
    cursorPosition
  };
}

/**
 * 校验请求令牌是否仍然匹配当前编辑器状态。
 * @param adapter - 当前 pane 适配器
 * @param token - 请求令牌
 * @returns 是否有效
 */
function isRequestTokenCurrent(adapter: InlineCompletionAdapter, token: InlineCompletionRequestToken): boolean {
  const cursorPosition = adapter.getCursorPosition();
  return cursorPosition !== null && adapter.getDocVersion() === token.docVersion && cursorPosition.absolutePosition === token.cursorPosition.absolutePosition;
}

/**
 * 判断请求令牌是否仍是当前状态机的活跃请求。
 * @param latestRequestId - 最近一次请求 ID
 * @param token - 待校验请求令牌
 * @returns 请求仍活跃时返回 true
 */
function isRequestStillActive(latestRequestId: string, token: InlineCompletionRequestToken): boolean {
  return latestRequestId === token.requestId;
}

/**
 * 读取用于 prompt 的文档上下文。
 * @param adapter - 当前 pane 适配器
 * @param requestToken - 请求令牌
 * @returns prompt 文档上下文
 */
function getCompletionContext(adapter: InlineCompletionAdapter, requestToken: InlineCompletionRequestToken): InlineCompletionDocumentContext {
  return (
    adapter.getCompletionContext?.(requestToken) ?? {
      documentText: adapter.getDocumentText(),
      cursorPosition: requestToken.cursorPosition.absolutePosition
    }
  );
}

/**
 * 创建 BEditor 内联补全共享状态机。
 * @param options - 状态机入参
 * @returns 内联补全状态与操作
 */
function createInlineCompletionStateMachine(options: InlineCompletionStateMachineOptions): InlineCompletionStateMachine {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const state = ref<InlineCompletionState>(createInitialState());
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let latestRequestId = '';
  let isComposing = false;
  let hasInputDuringComposition = false;
  let activeTraceId = '';
  let pendingTriggerToken: InlineCompletionRequestToken | null = null;
  let suppressInputUntil = 0;
  let suppressInputTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 清理触发计时器。
   */
  function clearDebounceTimer(): void {
    if (!debounceTimer) {
      pendingTriggerToken = null;
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = null;
    pendingTriggerToken = null;
  }

  /**
   * 清理程序化 input 屏蔽计时器。
   */
  function clearSuppressInputTimer(): void {
    if (!suppressInputTimer) {
      return;
    }

    clearTimeout(suppressInputTimer);
    suppressInputTimer = null;
  }

  /**
   * 接受补全后短暂忽略编辑器 update 转换出的 input 事件。
   */
  function suppressProgrammaticInput(): void {
    suppressInputUntil = Date.now() + ACCEPT_INPUT_SUPPRESSION_MS;
    clearSuppressInputTimer();
    suppressInputTimer = setTimeout((): void => {
      suppressInputUntil = 0;
      suppressInputTimer = null;
    }, ACCEPT_INPUT_SUPPRESSION_MS);
  }

  /**
   * 判断当前 input 是否应被视为程序化插入造成的回声事件。
   * @returns 是否忽略当前 input
   */
  function shouldSuppressInput(): boolean {
    if (suppressInputUntil <= 0) {
      return false;
    }

    if (Date.now() <= suppressInputUntil) {
      return true;
    }

    suppressInputUntil = 0;
    clearSuppressInputTimer();
    return false;
  }

  /**
   * 重置到 idle 状态。
   */
  function resetToIdle(): void {
    state.value = createInitialState();
  }

  /**
   * 取消当前补全。
   */
  function cancel(reason: InlineCompletionUserInteraction | 'timeout' | 'stale' | 'error' = 'stale'): void {
    clearDebounceTimer();
    if (activeTraceId && state.value.status !== 'idle') {
      logInlineCompletionEvent('inline_completion.rejected', {
        traceId: activeTraceId,
        pane: options.adapter.pane,
        reason,
        status: state.value.status
      });
    }
    latestRequestId = '';
    activeTraceId = '';
    state.value.status = 'cancelling';
    options.adapter.hideGhost();
    resetToIdle();
  }

  /**
   * 判断当前是否可以触发补全。
   * @returns 是否允许触发
   */
  function canTrigger(): boolean {
    return (
      !isComposing &&
      options.adapter.isEditable() &&
      options.adapter.canTriggerInlineCompletion() &&
      state.value.status !== 'loading' &&
      state.value.status !== 'accepting'
    );
  }

  /**
   * 执行一次补全请求。
   * @param requestToken - 请求令牌
   * @returns 是否已进入真实请求流程
   */
  async function trigger(requestToken: InlineCompletionRequestToken): Promise<boolean> {
    if (!canTrigger()) {
      return false;
    }

    if (!isRequestTokenCurrent(options.adapter, requestToken)) {
      return false;
    }

    const completionContext = getCompletionContext(options.adapter, requestToken);
    const { prefix, suffix } = extractInlineCompletionContext(completionContext.documentText, completionContext.cursorPosition);
    if (!prefix.trim()) {
      return false;
    }

    const editorState = options.editorState();
    const prompt = buildInlineCompletionPrompt({
      filename: editorState.name,
      fileType: editorState.ext,
      writingMode: options.adapter.pane,
      headingPath: completionContext.headingPath ?? resolveInlineCompletionHeadingPath(prefix),
      prefix,
      suffix
    });

    latestRequestId = requestToken.requestId;
    const requestTraceId = crypto.randomUUID();
    activeTraceId = requestTraceId;
    const requestStartedAt = Date.now();
    state.value = {
      status: 'loading',
      ghostText: '',
      requestToken
    };
    logInlineCompletionEvent('inline_completion.triggered', {
      traceId: requestTraceId,
      pane: options.adapter.pane,
      docVersion: requestToken.docVersion,
      cursor: requestToken.cursorPosition.absolutePosition,
      contextLength: prefix.length + suffix.length
    });
    logInlineCompletionEvent('inline_completion.requested', {
      traceId: requestTraceId,
      pane: options.adapter.pane
    });

    try {
      const rawText = await withTimeout<string>(options.invokeCompletion(prompt), timeoutMs);
      if (!isRequestStillActive(latestRequestId, requestToken)) {
        return true;
      }

      if (state.value.status !== 'loading' || !isRequestTokenCurrent(options.adapter, requestToken)) {
        cancel('stale');
        return true;
      }

      const normalizedText = truncateInlineCompletionText(normalizeInlineCompletionText(rawText));
      if (!shouldDisplayInlineCompletion(normalizedText, suffix)) {
        cancel('stale');
        return true;
      }

      state.value = {
        status: 'showing',
        ghostText: normalizedText,
        requestToken
      };
      options.adapter.showGhost(normalizedText, requestToken);
      logInlineCompletionEvent('inline_completion.received', {
        traceId: requestTraceId,
        pane: options.adapter.pane,
        latencyMs: Date.now() - requestStartedAt,
        outputLength: normalizedText.length
      });
      return true;
    } catch (error) {
      if (!isRequestStillActive(latestRequestId, requestToken)) {
        return true;
      }

      state.value.status = 'error';
      logInlineCompletionEvent('inline_completion.error', {
        traceId: requestTraceId,
        pane: options.adapter.pane,
        message: error instanceof Error ? error.message : String(error)
      });
      cancel(error instanceof Error && error.message === 'INLINE_COMPLETION_TIMEOUT' ? 'timeout' : 'error');
      return true;
    }
  }

  /**
   * 安排一次 debounce 触发。
   */
  function scheduleTrigger(): void {
    if (!canTrigger()) {
      return;
    }

    clearDebounceTimer();
    const requestToken = createRequestToken(options.adapter);
    if (!requestToken) {
      return;
    }

    pendingTriggerToken = requestToken;
    debounceTimer = setTimeout((): void => {
      const triggerToken = pendingTriggerToken;
      debounceTimer = null;
      pendingTriggerToken = null;
      if (!triggerToken || !isRequestTokenCurrent(options.adapter, triggerToken)) {
        return;
      }

      state.value.status = 'triggering';
      trigger(triggerToken)
        .then((didRequest: boolean): void => {
          if (!didRequest && state.value.status === 'triggering') {
            resetToIdle();
          }
        })
        .catch((): void => {
          if (state.value.status === 'triggering') {
            resetToIdle();
          }
        });
    }, debounceMs);
  }

  /**
   * 判断未变化的光标事件是否可以忽略。
   * @returns 光标位置与文档版本未变化时返回 true
   */
  function shouldIgnoreUnchangedCursor(): boolean {
    if (debounceTimer && pendingTriggerToken) {
      return isRequestTokenCurrent(options.adapter, pendingTriggerToken);
    }

    if ((state.value.status === 'loading' || state.value.status === 'showing') && state.value.requestToken) {
      return isRequestTokenCurrent(options.adapter, state.value.requestToken);
    }

    return state.value.status === 'idle';
  }

  /**
   * 接受当前 ghost text。
   */
  async function accept(): Promise<void> {
    if (state.value.status !== 'showing' || !state.value.ghostText) {
      return;
    }

    const { ghostText } = state.value;
    state.value.status = 'accepting';
    suppressProgrammaticInput();
    options.adapter.hideGhost();
    try {
      await options.adapter.acceptGhostText(ghostText);
      if (activeTraceId) {
        logInlineCompletionEvent('inline_completion.accepted', {
          traceId: activeTraceId,
          pane: options.adapter.pane,
          length: ghostText.length
        });
      }
    } catch (error) {
      logInlineCompletionEvent('inline_completion.error', {
        traceId: activeTraceId || crypto.randomUUID(),
        pane: options.adapter.pane,
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      latestRequestId = '';
      activeTraceId = '';
      resetToIdle();
    }
  }

  /**
   * 处理 adapter 上报的用户交互。
   * @param type - 交互类型
   */
  function handleUserInteraction(type: InlineCompletionUserInteraction): void {
    if (state.value.status === 'accepting' && (type === 'input' || type === 'documentChange' || type === 'cursor')) {
      return;
    }

    if (type === 'compositionStart') {
      isComposing = true;
      hasInputDuringComposition = false;
      cancel(type);
      return;
    }

    if (type === 'compositionEnd') {
      isComposing = false;
      if (hasInputDuringComposition) {
        scheduleTrigger();
      }
      hasInputDuringComposition = false;
      return;
    }

    if (type === 'input') {
      if (isComposing) {
        hasInputDuringComposition = true;
      }

      if (shouldSuppressInput()) {
        return;
      }

      if (state.value.status === 'showing' || state.value.status === 'loading') {
        cancel(type);
      }
      scheduleTrigger();
      return;
    }

    if (type === 'documentChange') {
      if (isComposing) {
        hasInputDuringComposition = true;
        return;
      }

      cancel(type);
      return;
    }

    if (type === 'cursor') {
      if (isComposing || shouldIgnoreUnchangedCursor()) {
        return;
      }

      cancel(type);
      return;
    }

    if (type === 'accept') {
      accept().catch((): undefined => undefined);
      return;
    }

    if (type === 'escape') {
      cancel(type);
      return;
    }

    cancel(type);
  }

  const cleanupInteraction = options.adapter.onUserInteraction(handleUserInteraction);

  /**
   * 销毁状态机与 adapter。
   */
  function destroy(): void {
    cancel();
    clearSuppressInputTimer();
    suppressInputUntil = 0;
    cleanupInteraction();
    options.adapter.destroy();
  }

  return {
    state: readonly(state),
    accept,
    cancel,
    destroy
  };
}

/**
 * 创建 pane 级内联补全编排器。
 * @returns pane 内联补全生命周期控制器
 */
export function useInlineCompletion(): UseInlineCompletionResult {
  const serviceModelStore = useServiceModelStore();
  const { agent } = useChat({ ignoreEnabled: false });
  const instance = shallowRef<InlineCompletionStateMachine | null>(null);

  /**
   * 销毁当前内联补全状态机。
   */
  function destroy(): void {
    instance.value?.destroy();
    instance.value = null;
  }

  /**
   * 调用 pane 内联补全模型。
   * @param prompt - 内联补全 prompt
   * @returns 模型返回文本；服务不可用时返回空字符串
   */
  async function invokeCompletion(prompt: string): Promise<string> {
    const config = await serviceModelStore.getAvailableServiceConfig('polish');
    if (!config?.providerId || !config.modelId) {
      return '';
    }

    const [error, result] = await agent.invoke({
      providerId: config.providerId,
      modelId: config.modelId,
      prompt,
      temperature: 0.2,
      reasoning: { enabled: false }
    });

    if (error) {
      throw new Error(error.message);
    }

    return result.text;
  }

  /**
   * 挂载新的内联补全状态机。
   * @param options - 挂载参数
   */
  function mount(options: InlineCompletionMountOptions): void {
    destroy();
    instance.value = createInlineCompletionStateMachine({
      adapter: options.adapter,
      editorState: options.editorState,
      invokeCompletion
    });
  }

  return {
    instance,
    mount,
    destroy
  };
}
