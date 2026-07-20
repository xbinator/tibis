/**
 * @file auto-default-controller.mts
 * @description 管理 prompt 稳定时间、checkpoint 历史、回答上限和停止意图。
 */
import type { PromptDecision } from './prompt-detector.mjs';

/** 单次稳定交互 checkpoint。 */
export interface InteractionCheckpoint {
  /** 规范化提示区域哈希。 */
  screenHash: string;
  /** 当前轮次是否已回答。 */
  answered: boolean;
}

/** checkpoint 历史条目。 */
export interface InteractionHistoryEntry {
  /** 当前 checkpoint。 */
  checkpoint: InteractionCheckpoint;
  /** 交互轮次序号。 */
  generation: number;
  /** 是否已通过转换屏障。 */
  closed: boolean;
}

/** checkpoint 历史。 */
export interface InteractionHistory {
  /** 保留的历史条目。 */
  entries: InteractionHistoryEntry[];
  /** 当前条目索引，无当前项时为 -1。 */
  currentIndex: number;
}

/** AutoDefaultController 固定安全策略。 */
export interface AutoDefaultOptions {
  /** 自动回答最低置信度。 */
  minConfidence: number;
  /** 最大自动回答次数。 */
  maxAnswers: number;
  /** 未决交互超时。 */
  interactionTimeoutMs: number;
  /** prompt 稳定时间。 */
  promptSettleMs: number;
  /** 交互转换屏障稳定时间。 */
  transitionSettleMs: number;
  /** 活动输出反向信号窗口。 */
  activeOutputWindowMs: number;
}

/** Controller 单次观察值。 */
export interface AutoDefaultObservation {
  /** 可选稳定屏幕哈希。 */
  screenHash?: string;
  /** detector 决策。 */
  decision: PromptDecision;
  /** 单调时间。 */
  now: number;
  /** 最近一次收到 PTY 字节的单调时间。 */
  lastOutputAt: number;
}

/** Controller 发给 runner 的内部意图。 */
export type AutoDefaultIntent = { type: 'submit_enter' } | { type: 'request_stop'; reason: 'interaction_timeout' | 'answer_limit' | 'unsupported_prompt' };

/** AutoDefaultController 对外端口。 */
export interface AutoDefaultController {
  /** 消费一次稳定观察。 */
  observe(observation: AutoDefaultObservation): AutoDefaultIntent | null;
  /** 读取累计回答次数。 */
  answerCount(): number;
  /** 读取 checkpoint 历史快照。 */
  history(): InteractionHistory;
  /** 冻结并释放内部状态。 */
  dispose(): void;
}

/** 第一版固定策略。 */
export const DEFAULT_AUTO_OPTIONS: AutoDefaultOptions = {
  minConfidence: 0.85,
  maxAnswers: 20,
  interactionTimeoutMs: 8_000,
  promptSettleMs: 400,
  transitionSettleMs: 250,
  activeOutputWindowMs: 1_000
};

/**
 * 创建自动默认交互控制器。
 * @param overrides - 测试或宿主覆盖的局部策略
 * @returns PTY 无关控制器
 */
export function createAutoDefaultController(overrides: Partial<AutoDefaultOptions> = {}): AutoDefaultController {
  const options = { ...DEFAULT_AUTO_OPTIONS, ...overrides };
  const history: InteractionHistory = { entries: [], currentIndex: -1 };
  let candidateHash: string | null = null;
  let candidateSince = 0;
  let transitionKey: string | null = null;
  let transitionSince: number | null = null;
  let unknownSince: number | null = null;
  let answers = 0;
  let generation = 0;
  let disposed = false;

  /** 限制历史长度且不淘汰当前条目。 */
  function trimHistory(): void {
    while (history.entries.length > 40) {
      const removable = history.entries.findIndex((entry: InteractionHistoryEntry, index: number): boolean => entry.closed && index !== history.currentIndex);
      if (removable < 0) return;
      history.entries.splice(removable, 1);
      if (removable < history.currentIndex) history.currentIndex -= 1;
    }
  }

  /** 关闭当前 checkpoint 并开始下一轮。 */
  function closeCurrent(): void {
    const current = history.entries[history.currentIndex];
    if (current) current.closed = true;
    history.currentIndex = -1;
    candidateHash = null;
    transitionKey = null;
    transitionSince = null;
  }

  /**
   * 判断同一种转换证据是否已连续稳定到指定时长。
   * @param key - 转换证据身份
   * @param now - 单调时间
   * @param settleMs - 所需稳定时间
   * @returns 是否达到转换屏障
   */
  function isTransitionSettled(key: string, now: number, settleMs: number): boolean {
    if (transitionKey !== key) {
      transitionKey = key;
      transitionSince = now;
      return false;
    }
    return transitionSince !== null && now - transitionSince >= settleMs;
  }

  /** 清除尚未完成的转换证据。 */
  function resetTransition(): void {
    transitionKey = null;
    transitionSince = null;
  }

  /**
   * 获取或创建已稳定的当前 checkpoint。
   * @param screenHash - 当前屏幕哈希
   * @param now - 单调时间
   * @returns 当前条目，仍未稳定时返回 null
   */
  function settleCheckpoint(screenHash: string, now: number): InteractionHistoryEntry | null {
    const current = history.entries[history.currentIndex];
    if (current?.checkpoint.screenHash === screenHash) return current;
    if (current && !current.checkpoint.answered) closeCurrent();
    if (candidateHash !== screenHash) {
      candidateHash = screenHash;
      candidateSince = now;
      return null;
    }
    if (now - candidateSince < options.promptSettleMs) return null;
    generation += 1;
    const entry: InteractionHistoryEntry = { checkpoint: { screenHash, answered: false }, generation, closed: false };
    history.entries.push(entry);
    history.currentIndex = history.entries.length - 1;
    trimHistory();
    return entry;
  }

  return {
    observe(observation: AutoDefaultObservation): AutoDefaultIntent | null {
      if (disposed) return null;
      if (observation.decision.type === 'unsupported_input') return { type: 'request_stop', reason: 'unsupported_prompt' };

      const current = history.entries[history.currentIndex];
      const outputActive = observation.now - observation.lastOutputAt < options.activeOutputWindowMs;

      // 已回答轮次只接受明确、持续的活动输出或新的稳定 prompt 作为转换证据。
      if (current?.checkpoint.answered) {
        if (observation.decision.type === 'active_output') {
          if (isTransitionSettled('active_output', observation.now, options.transitionSettleMs)) closeCurrent();
          return null;
        }
        if (outputActive) {
          resetTransition();
          return null;
        }
        if (observation.screenHash && observation.screenHash !== current.checkpoint.screenHash) {
          if (isTransitionSettled(`prompt:${observation.screenHash}`, observation.now, options.promptSettleMs)) closeCurrent();
        } else {
          resetTransition();
        }
        return null;
      }

      if (outputActive || observation.decision.type === 'active_output') {
        unknownSince = null;
        candidateHash = null;
        if (current && !current.checkpoint.answered) closeCurrent();
        return null;
      }

      if (observation.decision.type === 'unknown') {
        if (!observation.screenHash) return null;
        unknownSince ??= observation.now;
        if (observation.now - unknownSince >= options.interactionTimeoutMs) return { type: 'request_stop', reason: 'interaction_timeout' };
        return null;
      }

      unknownSince = null;
      if (!observation.screenHash) return null;
      const checkpoint = settleCheckpoint(observation.screenHash, observation.now);
      if (!checkpoint || observation.decision.confidence < options.minConfidence) return null;
      if (answers >= options.maxAnswers) return { type: 'request_stop', reason: 'answer_limit' };
      checkpoint.checkpoint.answered = true;
      answers += 1;
      return { type: 'submit_enter' };
    },
    answerCount(): number {
      return answers;
    },
    history(): InteractionHistory {
      return {
        entries: history.entries.map(
          (entry: InteractionHistoryEntry): InteractionHistoryEntry => ({
            checkpoint: { ...entry.checkpoint },
            generation: entry.generation,
            closed: entry.closed
          })
        ),
        currentIndex: history.currentIndex
      };
    },
    dispose(): void {
      disposed = true;
      history.entries.splice(0);
      history.currentIndex = -1;
      candidateHash = null;
      transitionKey = null;
      transitionSince = null;
      unknownSince = null;
    }
  };
}
