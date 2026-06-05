/**
 * @file compression.d.ts
 * @description 压缩记录核心类型定义，供 electron-api 和主进程共享使用。
 * 从组件级文件提取到共享类型目录，原文件 re-export 保持兼容。
 */

/** 压缩记录构建模式 */
export type CompressionBuildMode = 'incremental' | 'full_rebuild';

/** 压缩记录状态 */
export type CompressionRecordStatus = 'draft' | 'valid' | 'superseded' | 'invalid';

/** 压缩触发原因 */
export type TriggerReason = 'message_count' | 'context_size' | 'manual';

/** 文件上下文摘要 */
export interface FileContextSummary {
  filePath: string;
  startLine?: number;
  endLine?: number;
  userIntent: string;
  keySnippetSummary: string;
  shouldReloadOnDemand: boolean;
}

/** 结构化会话摘要 */
export interface StructuredConversationSummary {
  goal: string;
  recentTopic: string;
  userPreferences: string[];
  constraints: string[];
  decisions: string[];
  importantFacts: string[];
  fileContext: FileContextSummary[];
  openQuestions: string[];
  pendingActions: string[];
}

/** 通用长聊天压缩摘要 */
export interface GeneralConversationSummary {
  /** 对话连续性：关系、语气、长期主线和用户期待的互动方式 */
  conversationContinuity: string[];
  /** 用户正在长期或当前尝试达成的目标 */
  goal: string;
  /** 最近讨论主线，偏自然语言，不替代事实字段 */
  recentTopic: string;
  /** 用户长期偏好、称呼、语气、边界和互动方式 */
  userPreferences: string[];
  /** 明确限制、必须遵守的条件和用户要求 */
  constraints: string[];
  /** 已达成的共识、判断或选择 */
  decisions: string[];
  /** 不可丢的事实、数字、名单、代码、路径、URL、时间点 */
  criticalFacts: string[];
  /** 从用户原文中确定性摘录出的需求和清单 */
  rawUserRequirements: string[];
  /** 当前未完成事项、等待回答的问题、下一步方向 */
  openLoops: string[];
  /** 最近 3 轮左右的对话转折 */
  recentDirection: string[];
  /** 文件上下文 */
  fileContext: FileContextSummary[];
}

/** 会话压缩记录持久化对象 */
export interface CompressionRecord {
  id: string;
  sessionId: string;
  buildMode: CompressionBuildMode;
  derivedFromRecordId?: string;
  coveredStartMessageId: string;
  coveredEndMessageId: string;
  coveredUntilMessageId: string;
  sourceMessageIds: string[];
  preservedMessageIds: string[];
  recordText: string;
  structuredSummary: StructuredConversationSummary;
  /** v3 通用长聊天摘要视图 */
  generalSummary?: GeneralConversationSummary;
  triggerReason: TriggerReason;
  messageCountSnapshot: number;
  charCountSnapshot: number;
  tokenCountSnapshot?: number;
  schemaVersion: number;
  status: CompressionRecordStatus;
  invalidReason?: string;
  degradeReason?: 'degraded_to_incremental';
  createdAt: string;
  updatedAt: string;
  recordSetId?: string;
  segmentIndex?: number;
  segmentCount?: number;
  topicTags?: string[];
  relevanceEmbedding?: number[];
}

/** 压缩记录存储层接口 */
export interface CompressionRecordStorage {
  getLatestValidRecord(sessionId: string): Promise<CompressionRecord | undefined>;
  createRecord(record: Omit<CompressionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<CompressionRecord>;
  updateRecordStatus(id: string, status: CompressionRecordStatus, invalidReason?: string): Promise<void>;
  getAllRecords(sessionId: string): Promise<CompressionRecord[]>;
}
