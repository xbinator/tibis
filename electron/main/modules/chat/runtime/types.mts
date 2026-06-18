/**
 * @file types.mts
 * @description ChatRuntime 主进程内部类型。
 */
import type { RuntimeCompactionService } from './compaction.mjs';
import type {
  AICreateOptions,
  AIInvokeResult,
  AIMCPRequestConfig,
  AIRequestOptions,
  AIServiceError,
  AITavilyRuntimeConfig,
  AIToolExecutionResult,
  AITransportTool,
  AIUsage
} from 'types/ai';
import type { ChatMessageRecord } from 'types/chat';
import type { ChatRuntimeEventMap } from 'types/chat-runtime';

/** Runtime 生命周期状态。 */
export type ChatRuntimeStatus = 'running' | 'aborting' | 'completed';

/** 活跃 runtime 状态。 */
export interface ActiveChatRuntime {
  /** Runtime id。 */
  runtimeId: string;
  /** Session id。 */
  sessionId: string;
  /** Renderer client id。 */
  clientId: string;
  /** Agent id。 */
  agentId: string;
  /** 父 runtime id。 */
  parentRuntimeId?: string;
  /** 当前模型上下文窗口。 */
  contextWindow?: number;
  /** 系统提示上下文。 */
  system?: string;
  /** 传输工具 schema。 */
  tools?: AITransportTool[];
  /** Tavily 运行时配置。 */
  tavily?: AITavilyRuntimeConfig;
  /** MCP 运行时配置。 */
  mcp?: AIMCPRequestConfig;
  /** 当前生命周期状态。 */
  status: ChatRuntimeStatus;
  /** 后续模型流和工具执行共用的中止控制器。 */
  abortController: AbortController;
  /** 创建时间戳。 */
  createdAt: number;
}

/** Runtime 事件发送函数。 */
export type ChatRuntimeEventEmitter = <TName extends keyof ChatRuntimeEventMap>(name: TName, payload: ChatRuntimeEventMap[TName]) => void;

/** Runtime 创建消息类型。 */
export type ChatRuntimeMessageKind = 'user' | 'assistant' | 'interrupt';

/** Runtime 消息写入器。 */
export interface ChatRuntimeMessageWriter {
  /**
   * 新增聊天消息。
   * @param message - 聊天消息
   */
  addMessage(message: ChatMessageRecord): Promise<void> | void;
  /**
   * 更新聊天消息。
   * @param message - 聊天消息
   */
  updateMessage(message: ChatMessageRecord): Promise<void> | void;
  /**
   * 删除聊天消息。
   * @param sessionId - 会话 ID
   * @param messageId - 消息 ID
   */
  deleteMessage?(sessionId: string, messageId: string): Promise<void> | void;
}

/** Runtime 消息读取器。 */
export interface ChatRuntimeMessageReader {
  /**
   * 读取会话消息。
   * @param sessionId - 会话 ID
   * @returns 会话消息
   */
  getMessages(sessionId: string): Promise<ChatMessageRecord[]> | ChatMessageRecord[];
}

/** Runtime 流式执行输入。 */
export interface ChatRuntimeStreamExecutorInput {
  /** runtime 状态。 */
  runtime: ActiveChatRuntime;
  /** 当前 runtime 可用的源消息上下文。 */
  sourceMessages?: ChatMessageRecord[];
  /** 用户消息。 */
  userMessage: ChatMessageRecord;
  /** assistant 草稿消息。 */
  assistantMessage: ChatMessageRecord;
}

/** Runtime 流式执行结果。 */
export interface ChatRuntimeStreamExecutorResult {
  /** Provider 返回的 usage。 */
  usage?: AIUsage;
  /** 是否应带当前 assistant 工具结果继续同一轮模型调用。 */
  shouldContinue?: boolean;
}

/** Renderer 工具执行输入。 */
export interface ChatRuntimeRendererToolExecutionInput {
  /** runtime 状态。 */
  runtime: ActiveChatRuntime;
  /** 工具调用 ID。 */
  toolCallId: string;
  /** 工具名称。 */
  toolName: string;
  /** 工具输入。 */
  input: unknown;
}

/** Renderer 工具执行函数。 */
export type ChatRuntimeRendererToolExecutor = (input: ChatRuntimeRendererToolExecutionInput) => Promise<AIToolExecutionResult>;

/** Runtime assistant 草稿更新函数。 */
export type ChatRuntimeAssistantUpdater = (message: ChatMessageRecord) => Promise<void>;

/** Runtime 流式执行器。 */
export type ChatRuntimeStreamExecutor = (
  input: ChatRuntimeStreamExecutorInput,
  updateAssistant: ChatRuntimeAssistantUpdater
) => Promise<ChatRuntimeStreamExecutorResult>;

/** Runtime 流式中止函数。 */
export type ChatRuntimeStreamAborter = (runtimeId: string) => Promise<void> | void;

/** Runtime 自动命名模型解析结果。 */
export interface ChatRuntimeAutoNameModelResolution {
  /** AI 服务创建参数。 */
  createOptions: AICreateOptions;
  /** 模型 ID。 */
  modelId: string;
}

/** Runtime 自动命名模型解析函数。 */
export type ChatRuntimeAutoNameModelResolver = () => Promise<ChatRuntimeAutoNameModelResolution | null>;

/** Runtime 自动命名文本生成函数。 */
export type ChatRuntimeAutoNameGenerator = (
  createOptions: AICreateOptions,
  request: AIRequestOptions
) => Promise<[AIServiceError] | [undefined, AIInvokeResult]>;

/** Runtime 服务依赖项。 */
export interface ChatRuntimeServiceDependencies {
  /** 向 renderer 发送 runtime 事件。 */
  emit: ChatRuntimeEventEmitter;
  /** 上下文压缩服务。 */
  compactionService: RuntimeCompactionService;
  /** runtime 消息写入器。 */
  messageWriter: ChatRuntimeMessageWriter;
  /** runtime 消息读取器。 */
  messageReader: ChatRuntimeMessageReader;
  /** runtime 流式执行器。 */
  streamExecutor: ChatRuntimeStreamExecutor;
  /** runtime 流式中止函数。 */
  streamAbort: ChatRuntimeStreamAborter;
  /** 创建 runtime 消息 ID。 */
  createMessageId: (kind: ChatRuntimeMessageKind) => string;
  /** 获取当前 ISO 时间。 */
  now: () => string;
  /** 自动命名模型解析函数。 */
  autoNameResolveModel: ChatRuntimeAutoNameModelResolver;
  /** 自动命名文本生成函数。 */
  autoNameGenerateText: ChatRuntimeAutoNameGenerator;
  /** 自动命名标题持久化函数。 */
  autoNameUpdateSessionTitle: (sessionId: string, title: string) => Promise<void> | void;
  /** 测试专用：保持 runtime 打开以验证写入锁。 */
  keepRuntimeOpenForTest?: boolean;
}
