/**
 * @file useContextUsage.ts
 * @description 上下文窗口用量 hook，混合策略计算当前会话的 Token 占用。
 * 空闲态使用 API 上报值（精确），流式中使用 tokenEstimator 估算（实时）。
 */
import type { TokenEstimator } from '../utils/compression/tokenEstimator';
import type { Message } from '../utils/types';
import type { ComputedRef, Ref } from 'vue';
import { computed, ref, watch } from 'vue';
import { createCharLevelEstimator, createTokenEstimator } from '../utils/compression/tokenEstimator';
import { convert, findLatestCompressionBoundaryIndex } from '../utils/messageHelper';

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
  /** 已使用百分比 (0-100) */
  usagePercent: ComputedRef<number>;
  /** 剩余可用 Token 数 */
  remainingTokens: ComputedRef<number>;
}

/** 字符级降级估算器（单例，无需异步初始化） */
const charLevelEstimator = createCharLevelEstimator();

/**
 * 从消息列表中获取最近一条助手消息的 API 上报 inputTokens。
 * @param messages - 消息列表
 * @returns 最近助手消息的 inputTokens，找不到返回 0
 */
function getApiReportedTokens(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant' && msg.usage) {
      return msg.usage.inputTokens;
    }
  }
  return 0;
}

/**
 * 判断最近一次 API 上报的 usage 是否早于最新压缩边界。
 * @param messages - 消息列表
 * @returns usage 已无法代表当前压缩后上下文时返回 true
 */
function isApiReportedUsageStaleAfterCompression(messages: Message[]): boolean {
  const boundaryIndex = findLatestCompressionBoundaryIndex(messages);
  if (boundaryIndex === -1) {
    return false;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'assistant' && message.usage) {
      return index < boundaryIndex;
    }
  }

  return false;
}

/**
 * 上下文窗口用量 hook。
 * 混合策略：空闲态使用 API 上报值（精确），流式中使用 tokenEstimator 估算（实时）。
 * @param options - 配置项
 * @returns 上下文用量计算结果
 */
export function useContextUsage(options: UseContextUsageOptions): UseContextUsageReturn {
  const { messages, contextWindow, selectedModel, streaming } = options;

  /** 当前模型对应的 token 估算器（异步加载） */
  const estimator = ref<TokenEstimator | null>(null);

  /** 估算器是否正在加载中 */
  const estimatorLoading = ref(false);

  // 模型切换时重新创建估算器
  watch(
    () => selectedModel.value?.modelId,
    async (newModelId) => {
      if (!newModelId) {
        estimator.value = null;
        return;
      }
      estimator.value = null;
      estimatorLoading.value = true;
      const est = await createTokenEstimator(newModelId);
      estimator.value = est ?? null;
      estimatorLoading.value = false;
    },
    { immediate: true }
  );

  /**
   * 使用估算器计算当前消息列表的 Token 数。
   * 估算器可用时使用 tiktoken，否则降级到字符级估算。
   */
  function estimateFromMessages(): number {
    const msgs = messages.value;
    if (msgs.length === 0) return 0;

    const modelMessages = convert.toModelMessages(msgs);
    const activeEstimator = estimator.value ?? charLevelEstimator;
    return activeEstimator.estimate(modelMessages);
  }

  /** 节流后的 token 估算缓存，避免每条 token 都做 JSON.stringify 转换 */
  const cachedEstimate = ref(0);

  /** 上次估算时的消息数量快照 */
  let lastEstimateMsgCount = 0;
  /** 上次估算时末条消息的内容长度 */
  let lastEstimateContentLen = 0;
  /** 节流定时器 */
  let estimateTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 节流更新 token 估算。
   * 流式期间每 300ms 或消息结构变化时更新一次。
   */
  function scheduleEstimate(): void {
    const msgCount = messages.value.length;
    const lastMsg = messages.value[msgCount - 1];
    const contentLen = lastMsg?.content?.length ?? 0;

    // 消息数量变化或内容增长超过 200 字符时立即更新
    if (msgCount !== lastEstimateMsgCount || Math.abs(contentLen - lastEstimateContentLen) > 200) {
      if (estimateTimer) {
        clearTimeout(estimateTimer);
        estimateTimer = null;
      }
      lastEstimateMsgCount = msgCount;
      lastEstimateContentLen = contentLen;
      cachedEstimate.value = estimateFromMessages();
      return;
    }

    // 否则 300ms 后更新
    if (!estimateTimer) {
      estimateTimer = setTimeout(() => {
        estimateTimer = null;
        lastEstimateMsgCount = msgCount;
        lastEstimateContentLen = contentLen;
        cachedEstimate.value = estimateFromMessages();
      }, 300);
    }
  }

  /** 当前上下文已使用的 Token 数 */
  const usedTokens = computed<number>(() => {
    if (!streaming.value && !isApiReportedUsageStaleAfterCompression(messages.value)) {
      return getApiReportedTokens(messages.value);
    }

    // 流式状态：触发节流估算
    scheduleEstimate();
    return cachedEstimate.value;
  });

  /** 已使用百分比 (0-100)，contextWindow 为 0 时返回 0 */
  const usagePercent = computed<number>(() => {
    const window = contextWindow.value;
    if (window <= 0) return 0;
    return Math.min(100, (usedTokens.value / window) * 100);
  });

  /** 剩余可用 Token 数，不会小于 0 */
  const remainingTokens = computed<number>(() => {
    const window = contextWindow.value;
    if (window <= 0) return 0;
    return Math.max(0, window - usedTokens.value);
  });

  return {
    usedTokens,
    usagePercent,
    remainingTokens
  };
}
