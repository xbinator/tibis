/**
 * @file types.ts
 * @description 定义公共文件控制器的事件、快照、动作与返回值类型。
 */
import type { ComputedRef, Ref } from 'vue';
import type { FileState } from '@/shared/platform/native/types';
import type { StoredDocumentRecord } from '@/shared/storage/files/types';

/**
 * 文件冲突处理结果。
 */
export type FileConflictDecision = 'keepDraft' | 'useDisk';

/**
 * 控制器持久化错误来源。
 */
export type FileControllerErrorSource = 'draft' | 'save' | 'saveAs' | 'rename' | 'restore' | 'delete' | 'watch';

/**
 * 控制器向页面事件层报告的持久化错误。
 */
export interface FileControllerErrorContext {
  /** 失败操作来源。 */
  source: FileControllerErrorSource;
  /** 归一化后的错误。 */
  error: Error;
}

/**
 * 创建默认文件会话的上下文。
 */
export interface FileCreateContext {
  /** 当前文件 ID。 */
  fileId: string;
}

/**
 * 文件控制器的完整内容快照。
 */
export interface FileControllerSnapshot<TData> {
  /** 当前文件状态。 */
  fileState: FileState;
  /** 页面业务数据。 */
  data: TData;
  /** 最近一次磁盘同步的内容。 */
  savedContent: string;
}

/**
 * 最近文件中的草稿候选项。
 */
export interface FileDraftCandidate {
  /** 最近文件中的文件状态。 */
  fileState: FileState;
  /** 最近一次磁盘同步内容；历史记录缺失时为 null。 */
  savedContent: string | null;
}

/**
 * 磁盘读取候选项。
 */
export interface FileDiskCandidate {
  /** 磁盘内容转换后的文件状态。 */
  fileState: FileState;
}

/**
 * 文件加载事件返回的候选内容。
 */
export interface FileLoadCandidates {
  /** 最近文件草稿。 */
  draft: FileDraftCandidate | null;
  /** 当前磁盘内容。 */
  disk: FileDiskCandidate | null;
  /** 无法安全继续加载时的错误。 */
  error: Error | null;
  /** 已确认磁盘路径不存在。 */
  missing?: boolean;
  /** 当前加载已由事件层接管，控制器不得创建或持久化替代快照。 */
  aborted?: boolean;
}

/**
 * 加载文件候选内容的上下文。
 */
export interface FileLoadContext {
  /** 当前文件 ID。 */
  fileId: string;
  /** 当前会话版本。 */
  sessionVersion: number;
}

/**
 * 解析序列化字符串的上下文。
 */
export interface FileParseContext {
  /** 原始文件内容。 */
  content: string;
  /** 当前文件路径。 */
  path: string | null;
}

/**
 * 序列化页面数据的上下文。
 */
export interface FileSerializeContext<TData> {
  /** 待序列化的页面业务数据。 */
  data: TData;
  /** 当前文件路径。 */
  path: string | null;
}

/**
 * 构建最近文件记录的上下文。
 */
export interface FileRecordContext<TData> extends FileControllerSnapshot<TData> {
  /** 本次记录修改时间。 */
  modifiedAt: number;
}

/**
 * 写入已有磁盘路径的上下文。
 */
export interface FileWriteContext {
  /** 写入目标路径。 */
  path: string;
  /** 本次写入的精确内容快照。 */
  content: string;
}

/**
 * 首次保存或另存为上下文。
 */
export interface FileSaveAsContext {
  /** 操作开始时的文件状态。 */
  fileState: Readonly<FileState>;
  /** 本次保存的精确内容快照。 */
  content: string;
  /** 控制器建议的默认保存路径。 */
  suggestedPath?: string | null;
}

/**
 * 丢失文件恢复确认上下文。
 */
export interface FileRestoreContext {
  /** 当前丢失文件状态。 */
  fileState: Readonly<FileState>;
}

/**
 * 文件删除阶段上下文。
 */
export interface FileDeleteContext {
  /** 删除前捕获的文件状态。 */
  fileState: Readonly<FileState>;
}

/**
 * 重命名上下文。
 */
export interface FileRenameContext {
  /** 操作开始时的文件状态。 */
  fileState: Readonly<FileState>;
}

/**
 * 重命名事件返回值。
 */
export interface FileRenameResult {
  /** 新文件名。 */
  name: string;
  /** 新文件路径。 */
  path: string | null;
  /** 新文件扩展名。 */
  ext: string;
}

/**
 * 草稿与磁盘内容冲突时的上下文。
 */
export interface FileConflictContext {
  /** 最近文件草稿。 */
  draft: FileDraftCandidate;
  /** 当前磁盘内容。 */
  disk: FileDiskCandidate;
}

/**
 * 异步文件操作的身份与内容快照。
 */
export interface FileOperationSnapshot {
  /** 操作所属文件 ID。 */
  fileId: string;
  /** 操作所属会话版本。 */
  sessionVersion: number;
  /** 操作开始时的内容修订号。 */
  contentRevision: number;
  /** 操作目标路径。 */
  path: string | null;
  /** 操作使用的精确内容。 */
  content: string;
}

/**
 * 文件类型相关事件集合。
 */
export interface FileControllerEvents<TData> {
  /** 创建默认会话。 */
  onCreate: (context: FileCreateContext) => FileControllerSnapshot<TData>;
  /** 加载草稿与磁盘候选内容。 */
  onLoad: (context: FileLoadContext) => Promise<FileLoadCandidates>;
  /** 将字符串解析为页面数据。 */
  onParse: (context: FileParseContext) => TData;
  /** 将页面数据序列化为字符串。 */
  onSerialize: (context: FileSerializeContext<TData>) => string;
  /** 构建最近文件记录。 */
  onBuildRecord: (context: FileRecordContext<TData>) => StoredDocumentRecord;
  /** 写入已有磁盘路径。 */
  onWriteFile: (context: FileWriteContext) => Promise<void>;
  /** 完成首次保存或另存为并返回最终路径。 */
  onSaveAs: (context: FileSaveAsContext) => Promise<string | null>;
  /** 完成重命名并返回最新元信息。 */
  onRename: (context: FileRenameContext) => Promise<FileRenameResult | null>;
  /** 处理草稿与磁盘冲突。 */
  onResolveConflict: (context: FileConflictContext) => Promise<FileConflictDecision>;
  /** 安全恢复丢失文件的原路径；用户取消时返回 false。 */
  onRestoreFile: (context: FileRestoreContext) => Promise<boolean>;
  /** 确认是否删除当前文件会话。 */
  onConfirmDelete?: (context: FileDeleteContext) => Promise<boolean>;
  /** 删除控制器外部拥有的磁盘文件。 */
  onDeleteFile?: (context: FileDeleteContext) => Promise<void>;
  /** 文件与最近记录删除后的页面收尾。 */
  onDeleted?: (context: FileDeleteContext) => Promise<void>;
  /** 向页面报告无法静默忽略的持久化错误。 */
  onError?: (context: FileControllerErrorContext) => void;
}

/**
 * 文件控制器配置。
 */
export interface FileControllerOptions<TData> {
  /** 响应式文件 ID。 */
  fileId: Ref<string>;
  /** 文件类型相关事件。 */
  events: FileControllerEvents<TData>;
}

/**
 * 文件控制器公共动作。
 */
export interface FileControllerActions {
  /** 手动保存当前文件。 */
  onSave: () => Promise<void>;
  /** 手动另存为。 */
  onSaveAs: () => Promise<void>;
  /** 重命名当前文件。 */
  onRename: () => Promise<void>;
  /** 编辑区域失焦。 */
  onBlur: () => Promise<void>;
  /** 重新加载当前文件。 */
  onReload: () => Promise<void>;
  /** 删除当前最近文件记录。 */
  onDelete: () => Promise<void>;
  /** 立即补写挂起的持久化任务。 */
  onFlush: () => Promise<void>;
  /** 释放控制器资源。 */
  onDispose: () => Promise<void>;
}

/**
 * 文件控制器公共返回值。
 */
export interface FileControllerResult<TData> {
  /** 当前文件状态。 */
  fileState: Ref<FileState>;
  /** 当前页面业务数据。 */
  data: Ref<TData>;
  /** 最近一次磁盘同步的内容。 */
  savedContent: Ref<string>;
  /** 当前内容是否已保存。 */
  isSaved: ComputedRef<boolean>;
  /** 当前磁盘文件是否丢失。 */
  isMissing: ComputedRef<boolean>;
  /** 是否正在加载文件。 */
  isLoading: Ref<boolean>;
  /** 最近一次加载或解析错误。 */
  loadError: Ref<Error | null>;
  /** 文件公共动作。 */
  actions: FileControllerActions;
}
