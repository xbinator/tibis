import type {
  AICreateOptions,
  AIRequestOptions,
  AIServiceError,
  AIInvokeResult,
  AIStreamFinishChunk,
  AIStreamToolCallChunk,
  AIStreamToolInputDeltaChunk,
  AIStreamToolInputEndChunk,
  AIStreamToolInputStartChunk,
  AIStreamToolResultChunk,
  MCPDiscoveryRefreshResult,
  MCPServerConfig,
  MCPServerDiscoveryCache,
  MCPStatusResponse
} from './ai';

/**
 * Electron API 类型定义
 * 为 window.electronAPI 提供类型支持
 */

export interface ElectronDialogFilter {
  name: string;
  extensions: string[];
}

export interface ElectronOpenFileOptions {
  filters?: ElectronDialogFilter[];
}

export interface ElectronSaveFileOptions {
  filters?: ElectronDialogFilter[];
  defaultPath?: string;
}

/**
 * Electron PDF 导出参数。
 */
export interface ElectronExportPdfOptions {
  /** 已准备好的完整 HTML 文档 */
  html: string;
  /** 保存对话框过滤器 */
  filters?: ElectronDialogFilter[];
  /** 默认保存路径 */
  defaultPath?: string;
}

export interface ElectronFileResult {
  canceled: boolean;
  filePath: string | null;
  content: string;
  fileName: string;
  ext: string;
}

export interface ElectronReadFileResult {
  content: string;
  fileName: string;
  ext: string;
}

/**
 * Electron 文件路径状态。
 */
export interface ElectronFilePathStatus {
  /** 路径是否存在。 */
  exists: boolean;
  /** 路径是否为普通文件。 */
  isFile: boolean;
  /** 路径是否为目录。 */
  isDirectory: boolean;
}

/**
 * Electron 工作区文件读取参数。
 */
export interface ElectronReadWorkspaceFileOptions {
  /** 文件路径，支持相对工作区路径或绝对路径 */
  filePath: string;
  /** 工作区根目录，缺省时仅允许读取绝对路径 */
  workspaceRoot?: string;
  /** 起始行号，默认 1 */
  offset?: number;
  /** 读取行数，默认 200，最大 1000 */
  limit?: number;
}

/**
 * Electron 工作区文件读取结果。
 */
export interface ElectronReadWorkspaceFileResult {
  /** 规范化后的真实文件路径 */
  path: string;
  /** 截取后的文本内容 */
  content: string;
  /** 文件总行数 */
  totalLines: number;
  /** 实际读取行数 */
  readLines: number;
  /** 是否还有后续内容 */
  hasMore: boolean;
  /** 下一次滚动读取的起始行号，没有后续内容时为 null */
  nextOffset: number | null;
}

/**
 * Electron 工作区目录读取参数。
 */
export interface ElectronReadWorkspaceDirectoryOptions {
  /** 目录路径，支持相对工作区路径或绝对路径 */
  directoryPath: string;
  /** 工作区根目录，缺省时仅允许读取绝对路径 */
  workspaceRoot?: string;
}

/**
 * Electron 工作区目录子项。
 */
export interface ElectronReadWorkspaceDirectoryEntry {
  /** 子项名称。 */
  name: string;
  /** 子项绝对路径。 */
  path: string;
  /** 子项类型。 */
  type: 'file' | 'directory';
}

/**
 * Electron 工作区目录读取结果。
 */
export interface ElectronReadWorkspaceDirectoryResult {
  /** 规范化后的真实目录路径 */
  path: string;
  /** 当前目录下的直接子项 */
  entries: ElectronReadWorkspaceDirectoryEntry[];
}

/** Shell 命令支持的 shell 类型。 */
export type ElectronShellCommandShell = 'bash' | 'powershell';

/**
 * Electron Shell 命令安全发现项。
 */
export interface ElectronShellCommandSafetyFinding {
  /** 严重级别。 */
  severity: 'info' | 'warning' | 'blocker';
  /** 机器可读编码。 */
  code: string;
  /** 展示消息。 */
  message: string;
  /** 触发规则的命令片段。 */
  nodeText?: string;
}

/**
 * Electron Shell 命令安全报告。
 */
export interface ElectronShellCommandSafetyReport {
  /** 分析状态。 */
  status: 'allowed' | 'blocked';
  /** Shell 类型。 */
  shell: ElectronShellCommandShell | 'unknown';
  /** 安全发现项。 */
  findings: ElectronShellCommandSafetyFinding[];
  /** 归一化命令预览。 */
  normalizedCommandPreview: string;
  /** 归一化执行目录。 */
  cwd: string;
}

/**
 * Electron Shell 命令安全分析请求。
 */
export interface ElectronShellCommandSafetyRequest {
  /** Shell 类型。 */
  shell?: unknown;
  /** 命令文本。 */
  command?: unknown;
  /** 执行目录。 */
  cwd?: unknown;
  /** 工作区根目录。 */
  workspaceRoot?: unknown;
}

/**
 * Electron Shell 命令执行请求。
 */
export interface ElectronShellCommandRunRequest {
  /** 命令唯一标识。 */
  commandId: string;
  /** Shell 类型。 */
  shell: ElectronShellCommandShell;
  /** 命令文本。 */
  command: string;
  /** 执行目录。 */
  cwd: string;
  /** 工作区根目录。 */
  workspaceRoot: string;
  /** 超时时间，单位毫秒。 */
  timeoutMs: number;
  /** 最终输出最大字符数。 */
  maxOutputChars?: number;
}

/**
 * Electron Shell 命令输出片段。
 */
export interface ElectronShellCommandOutputChunk {
  /** 命令唯一标识。 */
  commandId: string;
  /** 输出流。 */
  stream: 'stdout' | 'stderr';
  /** 输出文本。 */
  text: string;
  /** 递增序号。 */
  sequence: number;
  /** 创建时间。 */
  createdAt: string;
}

/**
 * Electron Shell 命令执行结果。
 */
export interface ElectronShellCommandRunResult {
  /** 命令唯一标识。 */
  commandId: string;
  /** Shell 类型。 */
  shell: ElectronShellCommandShell;
  /** 命令文本。 */
  command: string;
  /** 执行目录。 */
  cwd: string;
  /** 退出码。 */
  exitCode: number | null;
  /** 退出信号。 */
  signal: string | null;
  /** 执行耗时。 */
  durationMs: number;
  /** 是否超时。 */
  timedOut: boolean;
  /** 截断后的 stdout。 */
  stdout: string;
  /** 截断后的 stderr。 */
  stderr: string;
  /** 是否截断。 */
  truncated: boolean;
}

export interface DbExecuteResult {
  changes: number;
  lastInsertRowid: number;
}

export interface FileChangeEvent {
  type: 'change' | 'unlink' | 'add';
  filePath: string;
  content?: string;
}

export interface WebViewState {
  url: string; // 当前加载的 URL
  title: string; // 页面标题
  isLoading: boolean; // 是否正在加载
  canGoBack: boolean; // 是否可以后退
  canGoForward: boolean; // 是否可以前进
  loadProgress: number; // 加载进度 0-1
}

export interface WebViewAPI {
  create: (tabId: string, url: string) => Promise<void>; // 创建 WebContentsView
  destroy: (tabId: string) => Promise<void>; // 销毁 WebContentsView
  navigate: (tabId: string, url: string) => Promise<void>; // 导航到 URL
  goBack: (tabId: string) => Promise<void>; // 后退
  goForward: (tabId: string) => Promise<void>; // 前进
  reload: (tabId: string) => Promise<void>; // 刷新
  stop: (tabId: string) => Promise<void>; // 停止加载
  setBounds: (tabId: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<void>; // 设置边界
  show: (tabId: string) => Promise<void>; // 显示
  hide: (tabId: string) => Promise<void>; // 隐藏
  onStateChanged: (callback: (tabId: string, state: WebViewState) => void) => () => void; // 加载状态变化
  onTitleUpdated: (callback: (tabId: string, title: string) => void) => () => void; // 标题更新
  onNavigationStateChanged: (callback: (tabId: string, canGoBack: boolean, canGoForward: boolean) => void) => () => void; // 导航状态变化
  onOpenInNewTab: (callback: (url: string) => void) => () => void; // 在新标签页打开
  onAttachRejected: (callback: (payload: { src: string; reason: string }) => void) => () => void; // `<webview>` 附加被拒绝
}

/**
 * 最近文件的最小输入信息。
 */
export interface RecentFileShortcutInput {
  /** 文件唯一标识 */
  id: string;
  /** 文件名 */
  name: string;
  /** 文件扩展名 */
  ext: string;
  /** 文件路径，未保存文件为空 */
  path: string | null;
}

/**
 * 图片压缩请求参数
 */
export interface ElectronImageCompressRequest {
  /** 原始图片二进制数据 */
  buffer: ArrayBuffer;
  /** 图片 MIME 类型 */
  mimeType: string;
}

/**
 * 图片压缩结果
 */
export interface ElectronImageCompressResult {
  /** 压缩后的二进制数据 */
  buffer: ArrayBuffer;
  /** 是否实际执行了压缩 */
  compressed: boolean;
}

/**
 * 语音转写请求参数。
 */
export interface ElectronAudioTranscribeRequest {
  /** 音频二进制数据。 */
  buffer: ArrayBuffer;
  /** 音频 MIME 类型。 */
  mimeType: string;
  /** 段落唯一标识。 */
  segmentId: string;
  /** 指定语言。 */
  language?: string;
  /** 可选提示词。 */
  prompt?: string;
}

/**
 * 语音转写结果。
 */
export interface ElectronAudioTranscribeResult {
  /** 段落唯一标识。 */
  segmentId: string;
  /** 转写文本。 */
  text: string;
  /** 识别语言。 */
  language?: string;
  /** 转写耗时，单位毫秒。 */
  durationMs: number;
}

/**
 * 语音运行时状态。
 */
export interface ElectronSpeechRuntimeStatus {
  /** 当前状态。 */
  state: 'ready' | 'missing' | 'installing' | 'failed';
  /** 平台标识。 */
  platform: 'darwin' | 'win32';
  /** 架构标识。 */
  arch: 'arm64' | 'x64';
  /** 默认模型名。 */
  modelName?: string;
  /** 当前安装目录。 */
  installDir?: string;
  /** 当前运行时版本。 */
  version?: string;
  /** 失败时的错误信息。 */
  errorMessage?: string;
}

/**
 * 语音运行时安装进度。
 */
export interface ElectronSpeechInstallProgress {
  /** 当前阶段。 */
  phase: 'downloading' | 'extracting' | 'verifying' | 'completed';
  /** 当前完成数量。 */
  current: number;
  /** 总数。 */
  total: number;
  /** 当前说明。 */
  message: string;
}

/**
 * Tibis 工作区根目录信息。
 */
export interface ElectronTibisWorkspaceRoot {
  /** 绝对根目录路径，作为安全边界。 */
  rootPath: string;
  /** 本次请求是否创建了目录。 */
  created: boolean;
}

export interface ElectronAPI {
  readFile: (filePath: string) => Promise<ElectronReadFileResult>;
  readWorkspaceFile: (options: ElectronReadWorkspaceFileOptions) => Promise<ElectronReadWorkspaceFileResult>;
  readWorkspaceDirectory: (options: ElectronReadWorkspaceDirectoryOptions) => Promise<ElectronReadWorkspaceDirectoryResult>;
  getPathStatus?: (targetPath: string) => Promise<ElectronFilePathStatus>;

  // 文件对话框操作
  openFile: (options?: ElectronOpenFileOptions) => Promise<ElectronFileResult>;

  saveFile: (content: string, filePath?: string, options?: ElectronSaveFileOptions) => Promise<string | null>;
  exportPdf: (options: ElectronExportPdfOptions) => Promise<string | null>;

  writeFile: (filePath: string, content: string) => Promise<void>;
  renameFile: (oldPath: string, newPath: string) => Promise<void>;
  trashFile: (filePath: string) => Promise<void>;
  showItemInFolder: (filePath: string) => Promise<void>;
  getRelativePath: (filePath: string) => Promise<string>;

  getCwd: () => Promise<string>;
  getHomeDir: () => Promise<string>;

  watchFile: (filePath: string) => Promise<void>;
  unwatchFile: (filePath: string) => Promise<void>;
  unwatchAll: () => Promise<void>;
  onFileChanged: (callback: (data: FileChangeEvent) => void) => () => void;

  watchDirectory: (dirPath: string, globPattern?: string) => Promise<void>;
  unwatchDirectory: (dirPath: string, globPattern?: string) => Promise<void>;
  onSkillChanged: (callback: (data: { type: string; filePath: string; content?: string }) => void) => () => void;

  /** 监听系统通过"打开方式"传入的文件路径 */
  onOpenFile: (callback: (filePath: string) => void) => () => void;

  // 窗口控制操作
  setWindowTitle: (title: string) => Promise<void>;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  windowIsFullScreen: () => Promise<boolean>;

  // 数据库操作
  dbExecute: (sql: string, params?: unknown[]) => Promise<DbExecuteResult>;
  dbSelect: <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>;

  // 安全存储操作
  storeGet: <T = unknown>(key: string) => Promise<T | undefined>;
  storeSet: (key: string, value: unknown) => Promise<void>;
  storeDelete: (key: string) => Promise<void>;

  // 系统操作
  openExternal: (url: string) => Promise<void>;
  /** 获取 Tibis 工作区根目录，不可用时返回 null。 */
  getTibisWorkspaceRoot: () => Promise<ElectronTibisWorkspaceRoot | null>;
  analyzeShellCommand: (request: ElectronShellCommandSafetyRequest) => Promise<ElectronShellCommandSafetyReport>;
  runShellCommand: (request: ElectronShellCommandRunRequest) => Promise<ElectronShellCommandRunResult>;
  cancelShellCommand: (commandId: string) => Promise<boolean>;
  onShellCommandOutput: (callback: (chunk: ElectronShellCommandOutputChunk) => void) => () => void;

  // 语音转写
  transcribeAudio: (request: ElectronAudioTranscribeRequest) => Promise<ElectronAudioTranscribeResult>;
  getSpeechRuntimeStatus: () => Promise<ElectronSpeechRuntimeStatus>;
  installSpeechRuntime: () => Promise<ElectronSpeechRuntimeStatus>;
  removeSpeechRuntime: () => Promise<ElectronSpeechRuntimeStatus>;
  requestMicrophonePermission: () => Promise<boolean>;
  onSpeechInstallProgress: (listener: (progress: ElectronSpeechInstallProgress) => void) => () => void;

  // AI 服务操作
  aiInvoke: (createOptions: AICreateOptions, request: AIRequestOptions) => Promise<AsyncResult<AIInvokeResult, AIServiceError>>;
  aiStream: (createOptions: AICreateOptions, request: AIRequestOptions) => Promise<void>;
  aiStreamAbort: (requestId: string) => Promise<void>;

  // MCP runtime 操作
  getMcpStatus: (serverIds: string[]) => Promise<MCPStatusResponse[]>;
  getMcpDiscoveryCache: (serverId?: string) => Promise<MCPServerDiscoveryCache | MCPServerDiscoveryCache[] | undefined>;
  refreshMcpDiscovery: (server: MCPServerConfig) => Promise<MCPDiscoveryRefreshResult>;
  connectMcpServer: (server: MCPServerConfig) => Promise<MCPDiscoveryRefreshResult>;
  disconnectMcpServer: (serverId: string) => Promise<void>;
  restartMcpServer: (server: MCPServerConfig) => Promise<MCPDiscoveryRefreshResult>;

  // AI 流式事件监听
  onAiStreamText: (callback: (text: string) => void) => () => void;
  onAiStreamThinking: (callback: (thinking: string) => void) => () => void;
  onAiStreamComplete: (callback: () => void) => () => void;
  onAiStreamError: (callback: (error: AIServiceError) => void) => () => void;
  onAiStreamFinish: (callback: (payload: AIStreamFinishChunk) => void) => () => void;
  onAiStreamToolInputStart: (callback: (payload: AIStreamToolInputStartChunk) => void) => () => void;
  onAiStreamToolInputDelta: (callback: (payload: AIStreamToolInputDeltaChunk) => void) => () => void;
  onAiStreamToolInputEnd: (callback: (payload: AIStreamToolInputEndChunk) => void) => () => void;
  onAiStreamToolCall: (callback: (payload: AIStreamToolCallChunk) => void) => () => void;
  onAiStreamToolResult: (callback: (payload: AIStreamToolResultChunk) => void) => () => void;

  // 控制台日志（保留原有，与文件日志分离）
  consoleLogger: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };

  // Logger — 文件日志收集
  logger: {
    /** 写入 ERROR 级别日志文件 */
    error: (message: string) => Promise<void>;
    /** 写入 WARN 级别日志文件 */
    warn: (message: string) => Promise<void>;
    /** 写入 INFO 级别日志文件 */
    info: (message: string) => Promise<void>;
    /** 读取日志文件内容 */
    getLogs: (options: {
      level?: 'ERROR' | 'WARN' | 'INFO';
      scope?: 'main' | 'renderer' | 'preload';
      keyword?: string;
      date?: string;
      limit?: number;
      offset?: number;
    }) => Promise<
      {
        level: 'ERROR' | 'WARN' | 'INFO';
        message: string;
        scope: 'main' | 'renderer' | 'preload';
        timestamp: string;
      }[]
    >;
    /** 获取日志文件列表 */
    getLogFiles: () => Promise<
      {
        name: string;
        size: number;
        createdAt: string;
      }[]
    >;
    /** 在系统文件管理器中打开日志文件夹 */
    openLogFolder: () => Promise<void>;
  };

  // 菜单操作
  onMenuAction: (callback: (action: string) => void) => () => void;
  updateMenuItem: (id: string, properties: { checked?: boolean }) => void;
  syncRecentFiles: (files: RecentFileShortcutInput[]) => Promise<void>;

  // WebView 操作
  webview: WebViewAPI;

  // ==================== 图片压缩 ====================

  /**
   * 压缩图片，使用 sharp 在后台进行压缩。
   * @param buffer - 原始图片二进制数据
   * @param mimeType - 图片 MIME 类型
   * @returns 压缩结果（压缩后 ArrayBuffer + 是否实际压缩）
   */
  compressImage: (buffer: ArrayBuffer, mimeType: string) => Promise<ElectronImageCompressResult>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
