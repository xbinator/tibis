/**
 * @file chat.d.ts
 * @description 聊天会话、消息与附件类型定义
 */
import type { AIToolExecutionResult, AIUsage } from './ai';
import type { ChatMessageCompactionPart, ChatMessageRuntimeMeta } from './chat-runtime';
import type { WidgetData, WidgetRenderContext } from '@/components/BWidget/types';

/**
 * 聊天会话类型
 */
export type ChatSessionType = 'assistant';

/**
 * 聊天消息角色
 */
export type ChatMessageRole = 'user' | 'system' | 'assistant' | 'error' | 'compression' | 'interrupt';

/**
 * 压缩消息状态
 */
export type ChatCompressionStatus = 'pending' | 'success' | 'failed' | 'cancelled' | 'skipped';

/**
 * 压缩消息元数据
 */
export interface ChatCompressionMeta {
  /** 压缩状态 */
  status: ChatCompressionStatus;
  /** 压缩边界文本，同时用于成功态的显示与后续模型上下文注入 */
  recordText: string;
  /** 关联的压缩记录 ID */
  recordId?: string;
  /** 覆盖到的最后一条原始消息 ID */
  coveredUntilMessageId?: string;
  /** 本次压缩覆盖的源消息 ID 列表 */
  sourceMessageIds?: string[];
  /** 压缩失败时的错误信息 */
  errorMessage?: string;
}

/**
 * 聊天消息附件类型
 */
export type ChatMessageFileType = 'image' | 'document' | 'audio' | 'video' | 'binary';

/**
 * 聊天消息文件引用
 */
export interface ChatMessageFileReference {
  /** 引用唯一标识 */
  id: string;
  /** 引用 token */
  token: string;
  /** 引用对应的文档 ID */
  documentId: string;
  /** 文件名 */
  fileName: string;
  /** 行范围，使用字符串保留原始输入 */
  line: string;
  /** 本地路径，不存在时为 null */
  path: string | null;
  /** 引用快照 ID */
  snapshotId: string;
  /** 引用摘录 */
  excerpt?: string;
}

/**
 * 聊天消息附件
 */
export interface ChatMessageFile {
  /** 文件唯一标识 */
  id: string;
  /** 文件名 */
  name: string;
  /** 文件类型 */
  type: ChatMessageFileType;
  /** MIME 类型 */
  mimeType?: string;
  /** 文件大小（字节） */
  size?: number;
  /** 文件扩展名 */
  extension?: string;
  /** 本地路径 */
  path?: string;
  /** 远程地址 */
  url?: string;
  /** 内容哈希 */
  contentHash?: string;
  /** 图片宽度 */
  width?: number;
  /** 图片高度 */
  height?: number;
}

/**
 * 聊天消息文件输入片段。
 * Renderer 发送前使用该形态，不包含 snapshot。
 */
export interface ChatMessageFilePartInput {
  /** 片段类型 */
  type: 'file';
  /** 文件 part 唯一标识 */
  id: string;
  /** 展示文件名 */
  filename: string;
  /** MIME 类型 */
  mime: string;
  /** 规范化资源 URL */
  url: string;
  /** 用户输入来源路径 */
  path: string;
  /** 用户原始输入中的引用文本及位置 */
  sourceText: {
    /** token 起始 offset */
    start: number;
    /** token 结束 offset */
    end: number;
    /** 原始 token 文本 */
    value: string;
  };
}

/**
 * 聊天消息文件内容快照。
 */
export interface ChatMessageFilePartSnapshot {
  /** 固化后的文件内容 */
  content: string;
  /** 快照起始行号 */
  startLine: number;
  /** 快照结束行号 */
  endLine: number;
  /** 文件总行数 */
  totalLines: number;
  /** 快照内容哈希 */
  contentHash: string;
  /** 快照创建时间 */
  capturedAt: string;
  /** 是否被截断 */
  truncated?: boolean;
}

/**
 * 聊天消息文件片段。
 * 进入聊天历史前必须包含 snapshot。
 */
export interface ChatMessageFilePart extends ChatMessageFilePartInput {
  /** 发送时固化的文件内容快照 */
  snapshot: ChatMessageFilePartSnapshot;
}

/**
 * 聊天消息文本片段
 */
export interface ChatMessageTextPart {
  /** 片段类型 */
  type: 'text';
  /** 文本内容 */
  text: string;
}

/**
 * 聊天消息思考片段
 */
export interface ChatMessageThinkingPart {
  /** 片段类型 */
  type: 'thinking';
  /** 思考内容 */
  thinking: string;
}

/**
 * 聊天消息 Shell 命令输出片段
 */
export interface ChatMessageShellOutputChunk {
  /** 命令唯一标识 */
  commandId: string;
  /** 输出流 */
  stream: 'stdout' | 'stderr';
  /** 输出文本 */
  text: string;
  /** 输出序号 */
  sequence: number;
  /** 创建时间 */
  createdAt: string;
}

/**
 * 聊天消息统一工具片段。
 * 合并原 tool-input / tool-call / tool-result 为同一片段，通过 status 追踪工具执行生命周期。
 */
export interface ChatMessageToolPart {
  /** 片段类型 */
  type: 'tool';
  /** 工具调用 ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具执行生命周期：inputting（流式输入中）→ executing（执行中）→ done（已完成） */
  status: 'inputting' | 'executing' | 'done';
  /** 工具输入参数（inputting 阶段可能不完整） */
  input: unknown;
  /** 流式输入文本片段，仅 inputting 阶段使用 */
  inputText?: string;
  /** 工具执行结果，仅 status === 'done' 时存在 */
  result?: AIToolExecutionResult;
  /** Shell 命令实时输出缓冲，仅 run_shell_command 使用 */
  shellOutput?: ChatMessageShellOutputChunk[];
}

/**
 * 聊天消息小组件片段状态。
 */
export type ChatMessageWidgetStatus = 'created' | 'mounted' | 'running' | 'awaiting_user_input' | 'finished' | 'failure' | 'cancelled';

/**
 * 聊天消息小组件运行态生命周期记录。
 */
export interface ChatMessageWidgetLifecycle {
  /** mounted 执行完成时间 */
  mountedAt?: string;
  /** unmounted 执行完成时间 */
  unmountedAt?: string;
}

/**
 * 聊天消息小组件快照片段。
 */
export interface ChatMessageWidgetPart {
  /** 片段类型 */
  type: 'widget';
  /** 小组件会话 ID，用于后续执行闭环关联；独立运行态使用所在消息 ID 表示 */
  sessionId: string;
  /** 小组件稳定 ID */
  widgetId: string;
  /** 小组件执行或展示状态 */
  status: ChatMessageWidgetStatus;
  /** 小组件运行态生命周期记录 */
  lifecycle: ChatMessageWidgetLifecycle;
  /** 小组件快照值 */
  value: WidgetData;
  /** 运行态渲染上下文 */
  renderContext: WidgetRenderContext;
}

/**
 * 小组件运行态成功提交结果。
 */
export interface ChatMessageWidgetSubmitSuccessResult {
  /** 提交状态 */
  status: 'success';
  /** 成功提交的数据，字段值统一使用字符串 */
  data: Record<string, string>;
  /** 成功结果不携带错误 */
  error?: never;
}

/**
 * 小组件运行态失败提交结果。
 */
export interface ChatMessageWidgetSubmitFailureResult {
  /** 提交状态 */
  status: 'failure';
  /** 失败详情 */
  error: {
    /** 机器可读错误码 */
    code: string;
    /** 给用户或模型展示的错误说明 */
    message: string;
  };
  /** 失败结果不携带数据 */
  data?: never;
}

/**
 * 小组件运行态提交结果。
 */
export type ChatMessageWidgetSubmitResult = ChatMessageWidgetSubmitSuccessResult | ChatMessageWidgetSubmitFailureResult;

/**
 * Widget 运行态提交结果载荷。
 */
export interface ChatMessageWidgetSubmitPayload {
  /** 小组件会话 ID */
  sessionId: string;
  /** 小组件稳定 ID */
  widgetId: string;
  /** 用户在 Widget 中提交的结果 */
  result: ChatMessageWidgetSubmitResult;
}

/**
 * 聊天消息 Widget 提交结果片段。
 */
export interface ChatMessageWidgetResultPart extends ChatMessageWidgetSubmitPayload {
  /** 片段类型 */
  type: 'widget_result';
  /** 提交时间 */
  submittedAt: string;
}

/**
 * 用户选择题单题答案。
 */
export interface AIUserChoiceQuestionAnswer {
  /** 问题文本 */
  question: string;
  /** 选中的选项值列表 */
  answers: string[];
}

/**
 * 用户选择题答案数据
 */
export interface AIUserChoiceAnswerData {
  /** 对应问题 ID */
  questionId: string;
  /** 对应工具调用 ID */
  toolCallId: string;
  /** 选中的选项值列表 */
  answers: string[];
  /** 批量问题的逐题答案 */
  questionAnswers?: AIUserChoiceQuestionAnswer[];
  /** 其他手动输入文本 */
  otherText?: string;
}

/**
 * 确认卡片状态
 */
export type ChatMessageConfirmationStatus = 'pending' | 'approved' | 'cancelled' | 'expired';

/**
 * 确认卡片执行状态
 */
export type ChatMessageConfirmationExecutionStatus = 'idle' | 'running' | 'success' | 'failure';

/**
 * 确认卡片操作类型
 */
export type ChatMessageConfirmationAction = 'approve' | 'approve-session' | 'approve-always' | 'cancel';

/**
 * 确认卡片操作事件载荷
 */
export interface ChatMessageConfirmationActionPayload {
  /** 确认项 ID */
  confirmationId: string;
  /** 确认操作 */
  action: ChatMessageConfirmationAction;
}

/**
 * 确认卡片自定义输入事件载荷
 */
export interface ChatMessageConfirmationCustomInputPayload {
  /** 确认项 ID */
  confirmationId: string;
  /** 用户自定义输入内容 */
  text: string;
}

/**
 * 确认卡片自定义输入配置
 */
export interface ChatMessageConfirmationCustomInputConfig {
  /** 是否允许用户绕过当前建议，自行输入内容 */
  enabled: boolean;
  /** 输入区提示文案 */
  placeholder?: string;
  /** 触发按钮文案 */
  triggerLabel?: string;
}

/**
 * 聊天消息确认卡片片段
 */
export interface ChatMessageConfirmationPart {
  /** 片段类型 */
  type: 'confirmation';
  /** 关联的工具调用 ID，用于在展示确认卡时抑制对应 tool-call 的展示（可选） */
  toolCallId?: string;
  /** 确认项唯一标识 */
  confirmationId: string;
  /** 工具名称 */
  toolName: string;
  /** 标题 */
  title: string;
  /** 描述 */
  description: string;
  /** 风险级别 */
  riskLevel: 'write' | 'dangerous';
  /** 原始文本 */
  beforeText?: string;
  /** 新文本 */
  afterText?: string;
  /** 是否允许记住本次授权 */
  allowRemember?: boolean;
  /** 可选的记忆授权范围 */
  rememberScopes?: Array<'session' | 'always'>;
  /** 与当前确认卡关联的自定义输入配置 */
  customInput?: ChatMessageConfirmationCustomInputConfig;
  /** 确认状态 */
  confirmationStatus: ChatMessageConfirmationStatus;
  /** 执行状态 */
  executionStatus: ChatMessageConfirmationExecutionStatus;
  /** 执行失败信息 */
  executionError?: string;
}

export interface ChatMessageErrorPart {
  /** 片段类型 */
  type: 'error';
  /** 错误内容 */
  text: string;
}

/**
 * 聊天消息结构化片段
 */
export type ChatMessagePart =
  | ChatMessageTextPart
  | ChatMessageFilePart
  | ChatMessageErrorPart
  | ChatMessageThinkingPart
  | ChatMessageToolPart
  | ChatMessageWidgetPart
  | ChatMessageWidgetResultPart
  | ChatMessageConfirmationPart
  | ChatMessageCompactionPart;

/**
 * 聊天会话
 */
export interface ChatSession {
  /** 会话唯一标识 */
  id: string;
  /** 会话类型 */
  type: ChatSessionType;
  /** 会话标题 */
  title: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 最后一条消息时间 */
  lastMessageAt: string;
  /** 会话累计 Token 使用统计 */
  usage?: AIUsage;
}

/**
 * 聊天消息记录
 */
export interface ChatMessageRecord {
  /** 消息唯一标识 */
  id: string;
  /** 所属会话 ID */
  sessionId: string;
  /** 角色 */
  role: ChatMessageRole;
  /** 消息内容 */
  content: string;
  /** 结构化消息片段 */
  parts: ChatMessagePart[];
  /** 思考内容 */
  thinking?: string;
  /** 文件列表 */
  files?: ChatMessageFile[];
  /** Token 使用统计 */
  usage?: AIUsage;
  /** 压缩消息元数据 */
  compression?: ChatCompressionMeta;
  /** 是否为压缩摘要消息 */
  summary?: boolean;
  /** 执行该消息的 agent ID */
  agentId?: string;
  /** 创建或更新该消息的 runtime ID */
  runtimeId?: string;
  /** 父 runtime ID，预留给多 agent 调度 */
  parentRuntimeId?: string;
  /** runtime 扩展元数据 */
  meta?: ChatMessageRuntimeMeta;
  /** 创建时间 */
  createdAt: string;
  /** 是否处于加载中，用于恢复硬中断前的 assistant 草稿 */
  loading?: boolean;
  /** 是否已完成，用于区分流式草稿与终态消息 */
  finished?: boolean;
}

/**
 * 聊天历史消息加载游标
 */
export interface ChatMessageHistoryCursor {
  /** 仅加载早于该创建时间的消息 */
  beforeCreatedAt: string;
  /** 同创建时间下的边界消息角色，用于保持分页顺序与展示顺序一致 */
  beforeRole: ChatMessageRole;
  /** 同创建时间下的边界消息 ID，用于规避时间戳精度冲突 */
  beforeId: string;
}

/**
 * 会话分页游标，基于时间戳实现游标分页
 */
export interface SessionCursor {
  /** 最后一条消息时间戳，用于主排序游标 */
  lastMessageAt: string;
  /** 创建时间戳，用于相同 lastMessageAt 时的二级排序游标 */
  createdAt: string;
}

/**
 * 会话分页查询参数
 */
export interface SessionPaginationParams {
  /** 每页数量 */
  limit: number;
  /** 游标（可选，不传时加载第一页） */
  cursor?: SessionCursor;
}

/**
 * 会话分页查询结果
 */
export interface PaginatedSessionsResult {
  /** 当前页会话列表 */
  items: ChatSession[];
  /** 是否还有更多数据可加载 */
  hasMore: boolean;
  /** 下一页游标，无更多数据时为 undefined */
  nextCursor?: SessionCursor;
}
