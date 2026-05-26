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
