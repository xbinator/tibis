/**
 * @file useCompactContext.ts
 * @description 手动上下文压缩命令 hook，负责 pending 压缩消息的创建、回填、提示反馈以及实际压缩执行。
 */
import type { InteractionAPI } from '../components/InteractionContainer/types';
import type { CompressionRecord } from '../utils/compression/types';
import type { Message } from '../utils/types';
import type { ChatCompressionStatus, ChatMessageToolResultPart } from 'types/chat';
import type { CompressionRecordStatus } from 'types/compression';
import type { Ref } from 'vue';
import { computed, ref } from 'vue';
import { getElectronAPI, unwrap } from '@/shared/platform/electron-api';
import { createCompressionCoordinator } from '../utils/compression/coordinator';
import { CompressionCancelledError, CompressionError, getCompressionErrorMessage } from '../utils/compression/error';
import { createBase, findLatestCompressionBoundaryIndex } from '../utils/messageHelper';

/** 手动压缩后保留的最近原文轮数，用于支持“继续”等依赖尾部上下文的指令。 */
const MANUAL_COMPRESSION_PRESERVED_ROUNDS = 2;
/** 压缩上下文内保留的关键工具结果最大数量。 */
const MAX_KEY_TOOL_RESULT_CONTEXT_COUNT = 5;
/** 对继续任务有高价值的工具结果名称片段。 */
const KEY_TOOL_RESULT_NAME_PATTERNS = ['read', 'write', 'edit', 'file', 'reference', 'ask_user', 'choice', 'settings'];

/** 压缩触发来源。 */
type CompactTriggerSource = 'manual' | 'auto';

/**
 * 手动压缩执行结果。
 */
interface CompressionExecutionResult {
  /** 是否成功完成压缩 */
  success: boolean;
  /** 新生成的压缩记录，供 compression message 回填使用 */
  record?: CompressionRecord;
  /** 错误信息 */
  errorMessage?: string;
  /** 是否为用户主动取消 */
  cancelled?: boolean;
}

/**
 * 压缩边界消息的公共字段
 */
interface CompressionBoundaryMessageBase {
  /** 压缩边界消息内容 */
  boundaryText: string;
  /** 压缩记录 ID */
  recordId?: string;
  /** 覆盖范围结束消息 ID */
  coveredUntilMessageId?: string;
  /** 压缩源消息 ID 列表 */
  sourceMessageIds?: string[];
}

/**
 * 创建压缩成功边界消息的输入参数
 */
interface CreateSuccessfulCompressionBoundaryMessageInput extends CompressionBoundaryMessageBase {
  /** 压缩记录的唯一标识 */
  recordId: string;
}

/**
 * 创建压缩消息的输入参数
 */
interface CreateCompressionMessageInput extends CompressionBoundaryMessageBase {
  /** 压缩状态 */
  status: ChatCompressionStatus;
  /** 压缩失败提示 */
  errorMessage?: string;
}

/**
 * 手动上下文压缩 hook 的依赖项。
 */
interface UseCompactContextOptions {
  /** 当前消息列表 */
  messages: Ref<Message[]>;
  /** 获取活跃会话 ID */
  getSessionId: () => string | undefined;
  /** 启动压缩任务 */
  beginCompactTask: (onAbort?: () => void) => { ok: boolean; signal?: AbortSignal; reason?: 'busy' };
  /** 结束压缩任务 */
  finishCompactTask: () => void;
  /** 持久化新增的压缩消息 */
  persistMessage: (sessionId: string, nextMessage: Message) => Promise<void>;
  /** 持久化当前完整消息列表 */
  persistMessages: (sessionId: string | undefined, nextMessages: Message[]) => Promise<void>;
  /** 将对话滚动到底部 */
  scrollToBottom: () => void;
  /** 显示交互提示 */
  showToast: InteractionAPI['showToast'];
}

/**
 * 兼容测试与调用方的压缩消息创建入口。
 * @param input - 压缩消息数据
 * @returns 压缩消息
 */
export function createCompressionMessage(input: CreateCompressionMessageInput): Message {
  return createBase({
    role: 'compression',
    content: input.boundaryText,
    parts: input.boundaryText ? [{ type: 'text', text: input.boundaryText }] : [],
    compression: {
      status: input.status,
      recordText: input.boundaryText,
      recordId: input.recordId,
      coveredUntilMessageId: input.coveredUntilMessageId,
      sourceMessageIds: input.sourceMessageIds,
      errorMessage: input.errorMessage
    },
    finished: input.status !== 'pending',
    loading: input.status === 'pending'
  });
}

/**
 * 创建待处理中的压缩消息。
 * @returns pending 状态的压缩消息
 */
function createPendingCompressionMessage(triggerSource: CompactTriggerSource = 'manual'): Message {
  return createCompressionMessage({
    boundaryText: triggerSource === 'auto' ? '正在自动压缩上下文…' : '正在压缩上下文…',
    status: 'pending'
  });
}

/**
 * 创建压缩成功消息。
 * @param input - 压缩成功所需的边界信息
 * @returns success 状态的压缩边界消息
 */
function createSuccessfulCompressionMessage(input: CreateSuccessfulCompressionBoundaryMessageInput): Message {
  return createCompressionMessage({
    boundaryText: input.boundaryText,
    status: 'success',
    recordId: input.recordId,
    coveredUntilMessageId: input.coveredUntilMessageId,
    sourceMessageIds: input.sourceMessageIds
  });
}

/**
 * 创建压缩失败消息。
 * @param errorMessage - 失败提示
 * @returns failed 状态的压缩消息
 */
function createFailedCompressionMessage(errorMessage: string): Message {
  return createCompressionMessage({
    boundaryText: '上下文压缩失败',
    status: 'failed',
    errorMessage
  });
}

/**
 * 创建压缩取消消息。
 * @returns cancelled 状态的压缩消息
 */
function createCancelledCompressionMessage(): Message {
  return createCompressionMessage({
    boundaryText: '',
    status: 'cancelled'
  });
}

/**
 * 将字符串数组格式化为摘要字段。
 * @param label - 字段标签
 * @param values - 字段值列表
 * @returns 可注入模型上下文的字段文本
 */
function formatSummaryList(label: string, values: string[]): string | undefined {
  if (!values.length) {
    return undefined;
  }

  return `${label}：${values.join('；')}`;
}

/**
 * 格式化文件上下文，保留文件路径与用户意图，便于后续按需重读文件。
 * @param fileContext - 结构化摘要中的文件上下文
 * @returns 文件上下文字段列表
 */
function formatFileContext(fileContext: CompressionRecord['structuredSummary']['fileContext']): string[] {
  return fileContext.map((item) => {
    const lineRange = item.startLine ? `:${item.startLine}-${item.endLine ?? item.startLine}` : '';
    const reloadHint = item.shouldReloadOnDemand ? '是' : '否';
    return `文件：${item.filePath}${lineRange}；意图：${item.userIntent}；摘要：${item.keySnippetSummary}；需要时重读：${reloadHint}`;
  });
}

/**
 * 将工具结果数据压缩为短文本，避免完整工具载荷撑大上下文。
 * @param data - 工具结果数据
 * @returns 可写入压缩上下文的工具结果摘要
 */
function summarizeToolResultData(data: unknown): string {
  if (typeof data === 'string') {
    return data.slice(0, 400);
  }

  if (!data || typeof data !== 'object') {
    return String(data ?? '');
  }

  const source = data as Record<string, unknown>;
  const preferred = [source.path, source.filePath, source.summary, source.message, source.error, source.status].filter((item): item is string => {
    return typeof item === 'string' && item.trim().length > 0;
  });

  if (preferred.length) {
    return preferred.join('；').slice(0, 400);
  }

  try {
    return JSON.stringify(data).slice(0, 400);
  } catch {
    return '[无法序列化的工具结果]';
  }
}

/**
 * 判断工具结果是否值得作为压缩上下文中的关键事实保留。
 * @param part - 工具结果片段
 * @returns 是否保留该工具结果摘要
 */
function isKeyToolResult(part: ChatMessageToolResultPart): boolean {
  const toolName = part.toolName.toLowerCase();
  return KEY_TOOL_RESULT_NAME_PATTERNS.some((pattern) => toolName.includes(pattern));
}

/**
 * 从被压缩消息中提取关键工具结果摘要。
 * @param sourceMessages - 进入压缩的源消息
 * @returns 工具结果摘要列表
 */
function extractKeyToolResultContext(sourceMessages: Message[]): string[] {
  const results: string[] = [];

  for (const sourceMessage of sourceMessages) {
    for (const part of sourceMessage.parts) {
      if (part.type !== 'tool-result' || !isKeyToolResult(part)) {
        continue;
      }

      results.push(`工具：${part.toolName}；状态：${part.result.status}；结果：${summarizeToolResultData(part.result.data)}`);
      if (results.length >= MAX_KEY_TOOL_RESULT_CONTEXT_COUNT) {
        return results;
      }
    }
  }

  return results;
}

/**
 * 构建注入模型的结构化压缩上下文。
 * @param record - 压缩记录
 * @param sourceMessages - 进入压缩的源消息
 * @returns 更适合后续继续对话的上下文文本
 */
function buildStructuredCompressionContext(record: CompressionRecord, sourceMessages: Message[] = []): string {
  const summary = record.structuredSummary;
  const keyToolResults = extractKeyToolResultContext(sourceMessages);
  const lines = [
    'COMPRESSED_CONTEXT',
    '以下是较早对话的压缩上下文。请把它当作历史事实和任务状态，不要向用户复述这段说明。',
    record.recordText,
    formatSummaryList('目标', [summary.goal].filter(Boolean)),
    formatSummaryList('最近话题', [summary.recentTopic].filter(Boolean)),
    formatSummaryList('用户偏好', summary.userPreferences),
    formatSummaryList('约束', summary.constraints),
    formatSummaryList('已做决策', summary.decisions),
    formatSummaryList('重要事实', summary.importantFacts),
    ...formatFileContext(summary.fileContext),
    keyToolResults.length ? 'KEY_TOOL_RESULTS' : undefined,
    ...keyToolResults,
    formatSummaryList('待解决问题', summary.openQuestions),
    formatSummaryList('待处理操作', summary.pendingActions)
  ].filter((line): line is string => Boolean(line));

  return lines.join('\n');
}

/**
 * 创建手动压缩使用的消息快照。
 * 最近两轮 user/assistant 消息保留为原文，不进入摘要，避免后续“继续”丢失具体上下文。
 * @param sourceMessages - 当前完整消息列表
 * @returns 本次实际进入压缩协调器的消息列表
 */
function createManualCompressionSourceMessages(sourceMessages: Message[]): Message[] {
  const preserveCount = MANUAL_COMPRESSION_PRESERVED_ROUNDS * 2;
  const modelMessages = sourceMessages.filter((item) => item.role === 'user' || item.role === 'assistant');

  if (modelMessages.length <= preserveCount) {
    return [...sourceMessages];
  }

  const preservedIds = new Set(modelMessages.slice(-preserveCount).map((item) => item.id));
  return sourceMessages.filter((item) => !preservedIds.has(item.id));
}

/**
 * 判断最新压缩边界之后是否还有新的模型消息。
 * @param sourceMessages - 当前完整消息列表
 * @returns 没有新增 user/assistant 消息时返回 true
 */
function isAlreadyCompactWithoutNewModelMessages(sourceMessages: Message[]): boolean {
  const boundaryIndex = findLatestCompressionBoundaryIndex(sourceMessages);
  if (boundaryIndex === -1) {
    return false;
  }

  return !sourceMessages.slice(boundaryIndex + 1).some((item) => item.role === 'user' || item.role === 'assistant');
}

/**
 * 手动上下文压缩 hook。
 * @param options - hook 依赖项
 * @returns 手动压缩命令处理函数
 */
export function useCompactContext(options: UseCompactContextOptions) {
  const { messages, getSessionId, beginCompactTask, finishCompactTask, persistMessage, persistMessages, scrollToBottom, showToast } = options;

  /** 压缩状态 */
  const compressing = ref(false);
  /** 压缩错误 */
  const error = ref<string | undefined>();

  /** 基于 electronAPI 的压缩记录存储 adapter */
  const electronAPIAdapter = {
    async getLatestValidRecord(sessionId: string): Promise<CompressionRecord | undefined> {
      const result = await getElectronAPI().chatCompressionGetLatest(sessionId);
      return unwrap(result);
    },
    async createRecord(record: Omit<CompressionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<CompressionRecord> {
      const result = await getElectronAPI().chatCompressionCreate(record);
      return unwrap(result);
    },
    async updateRecordStatus(id: string, status: CompressionRecordStatus, invalidReason?: string): Promise<void> {
      const result = await getElectronAPI().chatCompressionUpdateStatus(id, status, invalidReason);
      unwrap(result);
    },
    async getAllRecords(sessionId: string): Promise<CompressionRecord[]> {
      const result = await getElectronAPI().chatCompressionGetAll(sessionId);
      return unwrap(result);
    }
  };

  /** 压缩协调器（稳定引用，避免重复创建） */
  const coordinator = computed(() => createCompressionCoordinator(electronAPIAdapter));

  /**
   * 统一设置错误信息
   * @param err - 捕获到的异常
   */
  function setError(err: unknown): void {
    if (err instanceof CompressionError) {
      error.value = getCompressionErrorMessage(err.stage);
    } else {
      error.value = err instanceof Error ? err.message : '压缩失败';
    }
  }

  /**
   * 执行会话压缩。
   * @param signal - 压缩过程取消信号
   * @param sourceMessages - 本次压缩使用的消息快照
   * @returns 压缩执行结果
   */
  async function compress(signal?: AbortSignal, sourceMessages: Message[] = messages.value): Promise<CompressionExecutionResult> {
    const sessionId = getSessionId();
    if (!sessionId) {
      error.value = '没有活跃的会话';
      return { success: false, errorMessage: error.value };
    }

    if (sourceMessages.length === 0) {
      error.value = '没有可压缩的消息';
      return { success: false, errorMessage: error.value };
    }

    compressing.value = true;
    error.value = undefined;

    try {
      const result = await coordinator.value.compressSessionManually({ sessionId, messages: sourceMessages, signal });

      if (!result) {
        error.value = '没有可压缩的消息';
        return { success: false, errorMessage: error.value };
      }

      // 如果是因体量过大而降级到增量模式，静默处理而非报错
      if (result.degradeReason === 'degraded_to_incremental') {
        error.value = undefined;
      }
      return { success: true, record: result };
    } catch (err) {
      if (err instanceof CompressionCancelledError) {
        error.value = undefined;
        return { success: false, cancelled: true };
      }
      setError(err);
      return { success: false, errorMessage: error.value };
    } finally {
      compressing.value = false;
    }
  }

  /**
   * 将压缩消息的最新状态同步回消息列表与持久化存储。
   * @param messageId - 目标压缩消息 ID
   * @param nextMessage - 最新压缩消息内容
   */
  async function updateCompressionMessage(messageId: string, nextMessage: Message): Promise<void> {
    const targetMessage = messages.value.find((item) => item.id === messageId);
    if (!targetMessage) {
      return;
    }

    targetMessage.content = nextMessage.content;
    targetMessage.parts = nextMessage.parts;
    targetMessage.loading = nextMessage.loading;
    targetMessage.finished = nextMessage.finished;
    targetMessage.compression = nextMessage.compression;

    await persistMessages(getSessionId(), messages.value);
  }

  /**
   * 根据压缩执行结果构建对应的压缩边界消息。
   * @param result - 压缩执行结果
   * @returns 对应状态的压缩边界消息
   */
  function buildCompressionBoundaryMessage(result: CompressionExecutionResult, sourceMessages: Message[] = []): Message {
    if (result.success && result.record) {
      return createSuccessfulCompressionMessage({
        boundaryText: buildStructuredCompressionContext(result.record, sourceMessages),
        recordId: result.record.id,
        coveredUntilMessageId: result.record.coveredUntilMessageId,
        sourceMessageIds: result.record.sourceMessageIds
      });
    }

    if (result.cancelled) {
      return createCancelledCompressionMessage();
    }

    return createFailedCompressionMessage(result.errorMessage ?? '压缩失败');
  }

  /**
   * 执行一次上下文压缩并回填压缩边界消息。
   * @param triggerSource - 压缩触发来源
   * @returns 是否实际创建并执行了压缩任务
   */
  async function runCompactContext(triggerSource: CompactTriggerSource): Promise<boolean> {
    const sessionId = getSessionId();
    if (!sessionId) {
      showToast({ type: 'error', content: '没有活跃的会话' });
      return false;
    }

    if (messages.value.length === 0) {
      showToast({ type: 'error', content: '没有可压缩的消息' });
      return false;
    }

    if (isAlreadyCompactWithoutNewModelMessages(messages.value)) {
      if (triggerSource === 'manual') {
        showToast({ type: 'info', content: '当前上下文已经压缩过，暂无新增对话需要压缩' });
      }
      return false;
    }

    const compressionSourceMessages = createManualCompressionSourceMessages(messages.value);
    const pendingMessage = createPendingCompressionMessage(triggerSource);
    const task = beginCompactTask(() => {
      updateCompressionMessage(pendingMessage.id, createCancelledCompressionMessage()).catch(() => undefined);
    });
    if (!task.ok) {
      if (triggerSource === 'manual') {
        showToast({ type: 'info', content: '当前有任务正在执行，请先等待完成或停止当前任务' });
      }
      return false;
    }
    try {
      messages.value.push(pendingMessage);
      await persistMessage(sessionId, pendingMessage);
      scrollToBottom();

      const result = await compress(task.signal, compressionSourceMessages);
      await updateCompressionMessage(pendingMessage.id, buildCompressionBoundaryMessage(result, compressionSourceMessages));
      return result.success;
    } finally {
      finishCompactTask();
    }
  }

  /**
   * 处理 slash command 触发的手动上下文压缩。
   */
  async function handleCompactContext(): Promise<void> {
    await runCompactContext('manual');
  }

  /**
   * 处理发送前触发的自动上下文压缩。
   * @returns 是否成功完成自动压缩
   */
  async function handleAutoCompactContext(): Promise<boolean> {
    return runCompactContext('auto');
  }

  return {
    compress,
    compressing,
    error,
    handleAutoCompactContext,
    handleCompactContext
  };
}
