/**
 * @file types.ts
 * @description Chat Actor 系统与纯策略共享领域类型。
 */
import type { AIUserChoiceAnswerData, ChatMessageFile, ChatMessageRole } from 'types/chat';
import type { ChatRuntimeUserInputPart } from 'types/chat-runtime';

/**
 * Chat Actor 的完整运行地址。
 */
export interface ChatActorAddress {
  /** 会话 ID */
  sessionId: string;
  /** 用户轮次 ID */
  turnId: string;
  /** Agent ID */
  agentId: string;
  /** 主进程 Runtime ID */
  runtimeId: string;
}

/**
 * 纯聊天策略所需的最小消息形状。
 */
export interface ChatPolicyMessage {
  /** 消息 ID */
  id: string;
  /** 消息角色 */
  role: ChatMessageRole;
  /** 聚合文本 */
  content: string;
}

/**
 * 新用户消息提交输入。
 */
export interface ChatSubmitInput {
  /** 用户消息 ID */
  messageId: string;
  /** 用户消息创建时间 */
  createdAt: string;
  /** 用户输入文本 */
  content: string;
  /** Runtime 结构化输入片段 */
  parts: ChatRuntimeUserInputPart[];
  /** 用户附件 */
  files?: ChatMessageFile[];
}

/**
 * 聊天流程意图。
 */
export type ChatIntent =
  | { type: 'submit'; input: ChatSubmitInput }
  | { type: 'compact' }
  | { type: 'regenerate'; targetMessageId: string }
  | { type: 'continue'; answer: AIUserChoiceAnswerData }
  | { type: 'recover'; runtimeId: string };

/**
 * 聊天流程稳定错误码。
 */
export type ChatWorkflowErrorCode =
  | 'preparation_failed'
  | 'runtime_start_failed'
  | 'runtime_failed'
  | 'recoverable_agent_failed'
  | 'protocol_error'
  | 'cancel_failed'
  | 'rollback_failed';

/**
 * 聊天流程错误。
 */
export interface ChatWorkflowError {
  /** 稳定错误码 */
  code: ChatWorkflowErrorCode;
  /** 用户或日志可读错误信息 */
  message: string;
  /** 原始错误原因 */
  cause?: unknown;
}
