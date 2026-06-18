/**
 * @file useContextUsage.ts
 * @description 上下文窗口用量 hook，混合策略计算当前会话的 Token 占用。
 * 始终基于当前将发送给模型的消息切片估算，避免把历史 API usage 当作当前窗口用量。
 */
import type { TokenEstimator } from '../utils/compression/tokenEstimator';
import type { ContextUsageBudgetSnapshot } from '../utils/contextUsageBudget';
import type { Message } from '../utils/types';
import type { ComputedRef, Ref } from 'vue';
import { computed, ref, watch } from 'vue';
import { createCharLevelEstimator, createTokenEstimator } from '../utils/compression/tokenEstimator';
import { createContextUsageBudgetSnapshot } from '../utils/contextUsageBudget';
import { convert } from '../utils/messageHelper';

/**
 * useContextUsage 配置项
 */
interface UseContextUsageOptions {
  /** 消息列表（响应式） */
  messages: Ref<Message[]>;
  /** 模型上下文窗口上限 */
  contextWindow: ComputedRef<number>;
  /** 当前选中的模型标识 */
  selectedModel: ComputedRef<{ providerId: string; modelId: string } | undefined>;
  /** 是否正在流式传输中 */
  streaming: ComputedRef<boolean>;
}

/**
 * useContextUsage 返回值
 */
interface UseContextUsageReturn {
  /** 当前上下文已使用的 Token 数 */
  usedTokens: ComputedRef<number>;
  /** 当前上下文可用输入预算快照 */
  snapshot: ComputedRef<ContextUsageBudgetSnapshot>;
  /** 已使用百分比 (0-100) */
  usagePercent: ComputedRef<number>;
  /** 剩余可用 Token 数 */
  remainingTokens: ComputedRef<number>;
}

/** 字符级降级估算器（单例，无需异步初始化） */
const charLevelEstimator = createCharLevelEstimator();

/**
 * 安全估算可序列化内容长度。
 * @param value - 待序列化值
 * @returns JSON 字符长度，序列化失败时返回 0
 */
function estimateJsonLength(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

/**
 * 构建消息估算签名，用于判断非流式状态下是否需要同步刷新估算值。
 * @param messages - 当前消息列表
 * @returns 轻量签名文本
 */
function buildEstimateSignature(messages: Message[]): string {
  return messages
    .map((message) =>
      [
        message.id,
        message.role,
        message.content.length,
        estimateJsonLength(message.parts),
        message.files?.length ?? 0,
        message.compression?.status ?? '',
        message.compression?.recordId ?? '',
        message.compression?.recordText.length ?? 0
      ].join(':')
    )
    .join('|');
}

/**
 * 上下文窗口用量 hook。
 * 非流式状态同步估算，流式状态节流估算。
 * @param options - 配置项
 * @returns 上下文用量计算结果
 */
export function useContextUsage(options: UseContextUsageOptions): UseContextUsageReturn {
  const { messages, contextWindow, selectedModel, streaming } = options;

  /** 当前模型对应的 token 估算器 */
  const estimator = ref<TokenEstimator | null>(null);

  // 模型切换时重新创建估算器
  watch(
    () => selectedModel.value?.modelId,
    async (newModelId) => {
      if (!newModelId) {
        estimator.value = null;
        return;
      }
      estimator.value = null;
      const est = await createTokenEstimator(newModelId);
      estimator.value = est;
    },
    { immediate: true }
  );

  /**
   * 获取当前可用估算器。
   * @returns token 估算器
   */
  function getActiveEstimator(): TokenEstimator {
    return estimator.value ?? charLevelEstimator;
  }

  /**
   * 使用估算器计算当前消息列表的 Token 数。
   * 当前使用本地字符启发式估算，保证上下文面板不依赖 tokenizer 包。
   * @param activeEstimator - 本次估算使用的估算器
   * @returns 当前模型上下文估算 token 数
   */
  function estimateFromMessages(activeEstimator: TokenEstimator): number {
    const msgs = messages.value;
    if (msgs.length === 0) return 0;

    const modelMessages = convert.toModelMessages(msgs);
    return activeEstimator.estimate(modelMessages);
  }

  /** 节流后的 token 估算缓存，避免每条 token 都做 JSON.stringify 转换 */
  const cachedEstimate = ref(0);

  /** 上次估算时的消息数量快照 */
  let lastEstimateMsgCount = 0;
  /** 上次估算时末条消息的内容长度 */
  let lastEstimateContentLen = 0;
  /** 上次估算时的消息签名 */
  let lastEstimateSignature = '';
  /** 上次估算使用的估算器 */
  let lastEstimator: TokenEstimator | null = null;
  /** 节流定时器 */
  let estimateTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 立即刷新估算缓存。
   * @param activeEstimator - 本次估算使用的估算器
   * @param signature - 当前消息签名
   * @param msgCount - 当前消息数量
   * @param contentLen - 当前末条消息内容长度
   */
  function refreshEstimate(activeEstimator: TokenEstimator, signature: string, msgCount: number, contentLen: number): void {
    lastEstimateMsgCount = msgCount;
    lastEstimateContentLen = contentLen;
    lastEstimateSignature = signature;
    lastEstimator = activeEstimator;
    cachedEstimate.value = estimateFromMessages(activeEstimator);
  }

  /**
   * 节流更新 token 估算。
   * 流式期间每 300ms 或消息结构变化时更新一次。
   */
  function scheduleEstimate(): void {
    const activeEstimator = getActiveEstimator();
    const msgCount = messages.value.length;
    const lastMsg = messages.value[msgCount - 1];
    const contentLen = lastMsg?.content?.length ?? 0;
    const signature = buildEstimateSignature(messages.value);

    if (!streaming.value) {
      if (estimateTimer) {
        clearTimeout(estimateTimer);
        estimateTimer = null;
      }

      if (signature !== lastEstimateSignature || activeEstimator !== lastEstimator) {
        refreshEstimate(activeEstimator, signature, msgCount, contentLen);
      }
      return;
    }

    // 消息数量变化或内容增长超过 200 字符时立即更新
    if (msgCount !== lastEstimateMsgCount || Math.abs(contentLen - lastEstimateContentLen) > 200 || activeEstimator !== lastEstimator) {
      if (estimateTimer) {
        clearTimeout(estimateTimer);
        estimateTimer = null;
      }
      refreshEstimate(activeEstimator, signature, msgCount, contentLen);
      return;
    }

    // 否则 300ms 后更新
    if (!estimateTimer) {
      estimateTimer = setTimeout(() => {
        estimateTimer = null;
        refreshEstimate(activeEstimator, signature, msgCount, contentLen);
      }, 300);
    }
  }

  /** 当前上下文已使用的 Token 数 */
  const usedTokens = computed<number>(() => {
    scheduleEstimate();
    return cachedEstimate.value;
  });

  /** 当前上下文可用输入预算快照 */
  const snapshot = computed<ContextUsageBudgetSnapshot>(() => createContextUsageBudgetSnapshot(usedTokens.value, contextWindow.value));

  /** 已使用百分比 (0-100)，按可用输入预算计算 */
  const usagePercent = computed<number>(() => snapshot.value.usagePercent);

  /** 剩余可用输入 Token 数，不会小于 0 */
  const remainingTokens = computed<number>(() => snapshot.value.remainingInputTokens);

  return {
    usedTokens,
    snapshot,
    usagePercent,
    remainingTokens
  };
}
