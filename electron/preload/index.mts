/**
 * Electron 预加载脚本
 * 在渲染进程（前端）加载前执行，负责安全地暴露主进程 API
 * 通过 contextBridge 将 electronAPI 注入到 window 对象
 */

import type {
  AIServiceError,
  AIStreamFinishChunk,
  AIStreamToolCallChunk,
  AIStreamToolInputDeltaChunk,
  AIStreamToolInputEndChunk,
  AIStreamToolInputStartChunk,
  AIStreamToolResultChunk
} from 'types/ai';
import type { ElectronAPI, ElectronShellCommandOutputChunk, ElectronSpeechInstallProgress, FileChangeEvent } from 'types/electron-api';
import { contextBridge, ipcRenderer } from 'electron';
import { formatPreloadErrorMessage, shouldIgnorePreloadError } from './error-collector.mjs';
import webviewAPI from './webview.mjs';

/**
 * 发送带来源标识的日志到主进程
 * IPC 失败时静默处理，与主进程写入失败策略保持一致
 * @param scope - 进程来源标识
 * @param level - 日志级别
 * @param message - 日志消息
 */
async function writeScopedLog(scope: 'renderer' | 'preload', level: 'ERROR' | 'WARN' | 'INFO', message: string) {
  return ipcRenderer.invoke('logger:write', { scope, level, message }).catch(() => {
    // 静默处理，避免未捕获的 Promise rejection 污染控制台
  });
}

// ============================================================
// Preload 层错误收集
// ============================================================

/**
 * 初始化 Preload 层错误收集
 * 在 contextBridge 暴露之前调用，捕获 preload 自身错误
 */
function initPreloadErrorCollector(): void {
  window.onerror = (message, source, lineno, colno, error) => {
    const errorObj = error || new Error(String(message));
    if (shouldIgnorePreloadError(errorObj)) {
      return false;
    }

    const context = {
      source: source ? source.replace(/.*\//, '') : 'N/A',
      lineno,
      colno,
      type: 'preload.onerror'
    };
    writeScopedLog('preload', 'ERROR', formatPreloadErrorMessage(errorObj, context));
    return false;
  };

  window.onunhandledrejection = (event) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    if (shouldIgnorePreloadError(error)) {
      return;
    }

    writeScopedLog('preload', 'ERROR', formatPreloadErrorMessage(error, { type: 'unhandledrejection' }));
  };
}

// 初始化 Preload 错误收集
initPreloadErrorCollector();

/**
 * 通过 contextBridge 暴露 Electron API 到渲染进程
 * 所有 IPC 调用都通过这里进行，确保安全隔离
 */
const electronAPI: ElectronAPI = {
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  readWorkspaceFile: (options) => ipcRenderer.invoke('fs:readWorkspaceTextFile', options),
  readWorkspaceDirectory: (options) => ipcRenderer.invoke('fs:readWorkspaceDirectory', options),
  getPathStatus: (targetPath: string) => ipcRenderer.invoke('fs:getPathStatus', targetPath),

  // ==================== 文件对话框操作 ====================

  /**
   * 打开文件对话框
   * @param options 文件过滤选项
   * @returns 选择的文件信息（路径、内容、文件名等）
   */
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),

  /**
   * 保存文件对话框或直接保存到指定路径
   * @param content 文件内容
   * @param filePath 指定保存路径（可选，为空则显示对话框）
   * @param options 保存选项（过滤器、默认路径等）
   * @returns 保存的文件路径
   */
  saveFile: (content, filePath, options) => ipcRenderer.invoke('dialog:saveFile', content, filePath, options),

  /**
   * 导出 PDF。
   * @param options - 导出选项，包含完整 HTML 文档与默认保存路径
   * @returns 成功保存后的文件路径
   */
  exportPdf: (options) => ipcRenderer.invoke('export:pdf', options),

  /**
   * 直接写入文件（已知路径时使用）
   * @param filePath 文件路径
   * @param content 文件内容
   */
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),

  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:renameFile', oldPath, newPath),

  trashFile: (filePath: string) => ipcRenderer.invoke('ui:trashFile', filePath),

  showItemInFolder: (filePath: string) => ipcRenderer.invoke('ui:showItemInFolder', filePath),

  getRelativePath: (filePath: string) => ipcRenderer.invoke('ui:getRelativePath', filePath),

  getCwd: () => ipcRenderer.invoke('ui:getCwd') as Promise<string>,
  getHomeDir: () => ipcRenderer.invoke('ui:getHomeDir') as Promise<string>,

  watchFile: (filePath: string) => ipcRenderer.invoke('fs:watchFile', filePath),

  unwatchFile: (filePath: string) => ipcRenderer.invoke('fs:unwatchFile', filePath),

  unwatchAll: () => ipcRenderer.invoke('fs:unwatchAll'),

  onFileChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: FileChangeEvent) => {
      callback(data);
    };
    ipcRenderer.on('file:changed', handler);
    return () => {
      ipcRenderer.removeListener('file:changed', handler);
    };
  },

  watchDirectory: (dirPath: string, globPattern?: string) => ipcRenderer.invoke('fs:watchDirectory', dirPath, globPattern),

  unwatchDirectory: (dirPath: string, globPattern?: string) => ipcRenderer.invoke('fs:unwatchDirectory', dirPath, globPattern),

  onSkillChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { type: string; filePath: string; content?: string }) => {
      callback(data);
    };
    ipcRenderer.on('skill:changed', handler);
    return () => {
      ipcRenderer.removeListener('skill:changed', handler);
    };
  },

  /**
   * 监听通过系统"打开方式"传入的文件路径。
   * @param callback - 文件路径回调
   * @returns 取消监听函数
   */
  onOpenFile: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, filePath: string) => {
      callback(filePath);
    };
    ipcRenderer.on('app:open-file', handler);
    return () => {
      ipcRenderer.removeListener('app:open-file', handler);
    };
  },

  // ==================== 窗口控制操作 ====================

  /**
   * 设置窗口标题
   * @param title 窗口标题
   */
  setWindowTitle: (title: string) => ipcRenderer.invoke('ui:setTitle', title),

  /**
   * 最小化窗口
   */
  windowMinimize: () => ipcRenderer.invoke('ui:minimize'),

  /**
   * 最大化/恢复窗口
   */
  windowMaximize: () => ipcRenderer.invoke('ui:maximize'),

  /**
   * 关闭窗口
   */
  windowClose: () => ipcRenderer.invoke('ui:close'),

  /**
   * 查询窗口是否已最大化
   * @returns 是否最大化
   */
  windowIsMaximized: () => ipcRenderer.invoke('ui:isMaximized'),

  /**
   * 查询窗口是否全屏
   * @returns 是否全屏
   */
  windowIsFullScreen: () => ipcRenderer.invoke('ui:isFullScreen'),

  // ==================== 数据库操作 ====================

  /**
   * 执行数据库写操作（INSERT/UPDATE/DELETE）
   * @param sql SQL语句
   * @param params 参数数组
   * @returns 执行结果（影响行数、最后插入ID）
   */
  dbExecute: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:execute', sql, params),

  /**
   * 执行数据库查询操作（SELECT）
   * @param sql SQL查询语句
   * @param params 参数数组
   * @returns 查询结果数组
   */
  dbSelect: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:select', sql, params),

  // ==================== 安全存储操作 ====================

  /**
   * 从安全存储读取数据
   * @param key 存储键名
   * @returns 存储的值
   */
  storeGet: (key: string) => ipcRenderer.invoke('store:get', key),

  /**
   * 写入安全存储
   * @param key 存储键名
   * @param value 存储值
   */
  storeSet: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),

  /**
   * 删除安全存储中的数据
   * @param key 存储键名
   */
  storeDelete: (key: string) => ipcRenderer.invoke('store:delete', key),

  // ==================== 系统操作 ====================

  /**
   * 使用系统默认浏览器打开外部链接
   * @param url 要打开的 URL
   */
  openExternal: (url: string) => ipcRenderer.invoke('ui:openExternal', url),

  /**
   * 获取 Tibis 工作区根目录。
   * @returns 工作区根目录信息，不可用时返回 null
   */
  getTibisWorkspaceRoot: () => ipcRenderer.invoke('workspace:get-root'),

  /**
   * 分析 Shell 命令安全性。
   * @param request - 安全分析请求
   * @returns 安全分析报告
   */
  analyzeShellCommand: (request) => ipcRenderer.invoke('shell:analyze', request),

  /**
   * 运行 Shell 命令。
   * @param request - 命令运行请求
   * @returns 命令执行结果
   */
  runShellCommand: (request) => ipcRenderer.invoke('shell:run', request),

  /**
   * 取消 Shell 命令。
   * @param commandId - 命令 ID
   * @returns 是否取消成功
   */
  cancelShellCommand: (commandId) => ipcRenderer.invoke('shell:cancel', commandId),

  /**
   * 监听 Shell 命令输出。
   * @param callback - 输出片段回调
   * @returns 取消监听函数
   */
  onShellCommandOutput: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: ElectronShellCommandOutputChunk) => callback(chunk);

    ipcRenderer.on('shell:output', handler);
    return () => {
      ipcRenderer.removeListener('shell:output', handler);
    };
  },

  // ==================== 语音转写 ====================

  /**
   * 转写单段音频。
   * @param request - 音频转写请求
   * @returns 转写结果
   */
  transcribeAudio: (request) => ipcRenderer.invoke('speech:transcribe', request),

  /**
   * 获取语音运行时状态。
   * @returns 语音运行时状态
   */
  getSpeechRuntimeStatus: () => ipcRenderer.invoke('speech:getRuntimeStatus'),

  /**
   * 下载并安装语音运行时。
   * @returns 安装完成后的运行时状态
   */
  installSpeechRuntime: () => ipcRenderer.invoke('speech:installRuntime'),

  /**
   * 删除已安装的语音运行时。
   * @returns 删除后的运行时状态
   */
  removeSpeechRuntime: () => ipcRenderer.invoke('speech:removeRuntime'),

  /**
   * 请求系统麦克风权限。
   * macOS 需要主动请求，Windows/浏览器端 getUserMedia 会自动触发权限提示。
   * @returns 是否已授权
   */
  requestMicrophonePermission: () => ipcRenderer.invoke('speech:requestMicrophonePermission'),

  /**
   * 监听语音运行时安装进度。
   * @param callback - 进度回调
   * @returns 取消监听函数
   */
  onSpeechInstallProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload as ElectronSpeechInstallProgress);

    ipcRenderer.on('speech:install-progress', handler);
    return () => {
      ipcRenderer.removeListener('speech:install-progress', handler);
    };
  },

  // ==================== AI 服务操作 ====================

  /**
   * 非流式文本生成
   * @param payload AI 创建参数与请求参数
   * @returns 生成的文本结果
   */
  aiInvoke: (createOptions, request) => ipcRenderer.invoke('ai:invoke', createOptions, request),

  /**
   * 流式文本生成
   * @param payload AI 创建参数与请求参数
   */
  aiStream: (createOptions, request) => ipcRenderer.invoke('ai:stream', createOptions, request),

  /**
   * 中止流式文本生成
   * @param requestId 请求唯一标识
   */
  aiStreamAbort: (requestId) => ipcRenderer.invoke('ai:stream:abort', requestId),

  // ==================== MCP runtime 操作 ====================

  /**
   * 查询 MCP server 运行态状态
   * @param serverIds server ID 列表
   */
  getMcpStatus: (serverIds) => ipcRenderer.invoke('tools:mcp:get-status', serverIds),

  /**
   * 读取 MCP discovery cache
   * @param serverId 可选 server ID
   */
  getMcpDiscoveryCache: (serverId) => ipcRenderer.invoke('tools:mcp:get-discovery-cache', serverId),

  /**
   * 刷新 MCP discovery
   * @param server MCP server 配置
   */
  refreshMcpDiscovery: (server) => ipcRenderer.invoke('tools:mcp:refresh-discovery', server),

  /**
   * 连接 MCP server 并刷新 discovery
   * @param server MCP server 配置
   */
  connectMcpServer: (server) => ipcRenderer.invoke('tools:mcp:connect', server),

  /**
   * 断开 MCP server
   * @param serverId MCP server ID
   */
  disconnectMcpServer: (serverId) => ipcRenderer.invoke('tools:mcp:disconnect', serverId),

  /**
   * 重启 MCP server 并刷新 discovery
   * @param server MCP server 配置
   */
  restartMcpServer: (server) => ipcRenderer.invoke('tools:mcp:restart', server),

  // ==================== AI 流式事件监听 ====================
  onAiStreamText: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text);

    ipcRenderer.on('ai:stream:text', handler);
    return () => {
      ipcRenderer.removeListener('ai:stream:text', handler);
    };
  },

  onAiStreamThinking: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, thinking: string) => callback(thinking);

    ipcRenderer.on('ai:stream:thinking', handler);
    return () => {
      ipcRenderer.removeListener('ai:stream:thinking', handler);
    };
  },

  onAiStreamComplete: (callback) => {
    const handler = () => callback();

    ipcRenderer.on('ai:stream:complete', handler);
    return () => {
      ipcRenderer.removeListener('ai:stream:complete', handler);
    };
  },

  onAiStreamError: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, error: AIServiceError) => callback(error);

    ipcRenderer.on('ai:stream:error', handler);
    return () => {
      ipcRenderer.removeListener('ai:stream:error', handler);
    };
  },

  onAiStreamFinish: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AIStreamFinishChunk) => callback(payload);

    ipcRenderer.on('ai:stream:finish', handler);
    return () => {
      ipcRenderer.removeListener('ai:stream:finish', handler);
    };
  },

  onAiStreamToolInputStart: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AIStreamToolInputStartChunk) => callback(payload);

    ipcRenderer.on('ai:stream:tool-input-start', handler);
    return () => {
      ipcRenderer.removeListener('ai:stream:tool-input-start', handler);
    };
  },

  onAiStreamToolInputDelta: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AIStreamToolInputDeltaChunk) => callback(payload);

    ipcRenderer.on('ai:stream:tool-input-delta', handler);
    return () => {
      ipcRenderer.removeListener('ai:stream:tool-input-delta', handler);
    };
  },

  onAiStreamToolInputEnd: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AIStreamToolInputEndChunk) => callback(payload);

    ipcRenderer.on('ai:stream:tool-input-end', handler);
    return () => {
      ipcRenderer.removeListener('ai:stream:tool-input-end', handler);
    };
  },

  onAiStreamToolCall: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AIStreamToolCallChunk) => callback(payload);

    ipcRenderer.on('ai:stream:tool-call', handler);
    return () => {
      ipcRenderer.removeListener('ai:stream:tool-call', handler);
    };
  },

  onAiStreamToolResult: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AIStreamToolResultChunk) => callback(payload);

    ipcRenderer.on('ai:stream:tool-result', handler);
    return () => {
      ipcRenderer.removeListener('ai:stream:tool-result', handler);
    };
  },

  // ==================== 日志操作 ====================
  // 控制台日志（保留原有实现，不删除）
  consoleLogger: {
    debug: (...args) => ipcRenderer.send('logger:debug', ...args),
    info: (...args) => ipcRenderer.send('logger:info', ...args),
    warn: (...args) => ipcRenderer.send('logger:warn', ...args),
    error: (...args) => ipcRenderer.send('logger:error', ...args)
  },

  // 文件日志收集（新增）
  logger: {
    error: (message: string) => writeScopedLog('renderer', 'ERROR', message),
    warn: (message: string) => writeScopedLog('renderer', 'WARN', message),
    info: (message: string) => writeScopedLog('renderer', 'INFO', message),

    getLogs: (options: Parameters<ElectronAPI['logger']['getLogs']>[0]) => ipcRenderer.invoke('logger:getLogs', options),

    getLogFiles: () => ipcRenderer.invoke('logger:getFiles'),

    openLogFolder: () => ipcRenderer.invoke('logger:openFolder')
  },

  // ==================== 菜单操作 ====================
  onMenuAction: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('ui:menuAction', handler);
    return () => {
      ipcRenderer.removeListener('ui:menuAction', handler);
    };
  },

  updateMenuItem: (id: string, properties: { checked?: boolean }) => {
    ipcRenderer.send('ui:updateMenuItem', id, properties);
  },

  syncRecentFiles: (files) => ipcRenderer.invoke('ui:syncRecentFiles', files),

  // WebView 操作
  webview: webviewAPI,

  // ==================== 图片压缩 ====================

  /**
   * 压缩图片，使用 sharp 在后台进行压缩。
   * @param buffer - 原始图片二进制数据
   * @param mimeType - 图片 MIME 类型
   * @returns 压缩结果（压缩后 ArrayBuffer + 是否实际压缩）
   */
  compressImage: async (buffer, mimeType) => {
    const result = await ipcRenderer.invoke('image:compress', { buffer, mimeType });
    if (result.buffer instanceof ArrayBuffer) {
      return result;
    }
    // 主进程返回的 Buffer 经结构化克隆后变为 Uint8Array
    // 取其底层 .buffer 并 slice 出有效字节范围
    if (result.buffer instanceof Uint8Array) {
      const { byteOffset, byteLength } = result.buffer;

      result.buffer = result.buffer.buffer.slice(byteOffset, byteOffset + byteLength);
      return result;
    }
    // 兜底：无法识别的类型，回退到原始 buffer（调用方已有 fallback）
    result.buffer = buffer;
    return result;
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
