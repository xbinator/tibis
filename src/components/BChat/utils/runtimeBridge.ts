/**
 * @file runtimeBridge.ts
 * @description BChat ChatRuntime renderer bridge 请求处理。
 */
import type { AIToolContext, AIToolExecutionError } from 'types/ai';
import type { ChatRuntimeBridgeRequestEvent } from 'types/chat-runtime';
import type { DrawingToolContext } from '@/ai/tools/context/drawing';
import type { WebviewToolContext } from '@/ai/tools/context/webview';
import type { OpenDraftInput, OpenDraftResult } from '@/ai/tools/shared/types';
import type { DrawingData } from '@/components/BDrawing/types';
import type { StoredFile } from '@/shared/storage/files/types';
import { isAbsoluteFilePath } from '@/shared/workspace/pathUtils';
import { isUnsavedPath, parseUnsavedPath } from '@/utils/file/unsaved';

/** 可通过 ChatRuntime 暴露给模型的设置键。 */
export type BChatRuntimeSettingKey = 'theme' | 'themePreset' | 'sourceMode' | 'editorPageWidth';

/** ChatRuntime 设置快照。 */
export interface BChatRuntimeSettingsSnapshot {
  /** 当前设置键值。 */
  settings: Partial<Record<BChatRuntimeSettingKey, string | boolean | number>>;
}

/** ChatRuntime 设置修改输入。 */
export interface BChatRuntimeApplySettingInput {
  /** 设置键。 */
  key: BChatRuntimeSettingKey;
  /** 设置值。 */
  value: unknown;
}

/** ChatRuntime 设置修改结果。 */
export interface BChatRuntimeApplySettingResult {
  /** 是否已应用。 */
  applied: true;
  /** 设置键。 */
  key: BChatRuntimeSettingKey;
  /** 修改前的值。 */
  previousValue: string | boolean | number;
  /** 修改后的值。 */
  currentValue: string | boolean | number;
}

/** BChat runtime bridge 依赖。 */
export interface BChatRuntimeBridgeDependencies {
  /** 获取当前编辑器工具上下文。 */
  getEditorContext: () => AIToolContext | undefined;
  /** 通过文档 ID 获取编辑器工具上下文。 */
  getEditorContextByDocumentId?: (documentId: string) => AIToolContext | undefined;
  /** 通过文件路径查找文件记录。 */
  findFileByPath?: (filePath: string) => Promise<{ id: string } | null>;
  /** 通过最近文件 ID 获取文件记录。 */
  getRecentFileById?: (fileId: string) => StoredFile | undefined | Promise<StoredFile | undefined>;
  /** 更新最近文件记录。 */
  updateRecentFileById?: (fileId: string, updates: Partial<StoredFile>) => Promise<StoredFile>;
  /** 获取当前画板工具上下文。 */
  getDrawingContext: () => DrawingToolContext | undefined;
  /** 获取当前 WebView 工具上下文。 */
  getWebviewContext: () => WebviewToolContext | undefined;
  /** 获取应用设置快照。 */
  getSettingsSnapshot?: () => BChatRuntimeSettingsSnapshot;
  /** 应用设置修改。 */
  applySetting?: (input: BChatRuntimeApplySettingInput) => BChatRuntimeApplySettingResult;
  /** 创建并打开未保存草稿。 */
  openDraft?: (input: OpenDraftInput) => Promise<OpenDraftResult>;
  /** 通过文件路径打开文件标签页。 */
  openFileByPath?: (filePath: string) => Promise<{ id: string } | null>;
  /** 在内置 WebView 中打开 URL。 */
  openInWebview?: (url: string) => Promise<void> | void;
  /** 在系统默认程序中打开 URL。 */
  openExternal?: (url: string) => Promise<void> | void;
}

/** 编辑器文档快照。 */
export interface BChatRuntimeDocumentSnapshot {
  /** 文档 ID。 */
  id: string;
  /** 文档标题。 */
  title: string;
  /** 磁盘路径。 */
  path: string | null;
  /** 虚拟定位符。 */
  locator?: string;
  /** 文档内容。 */
  content: string;
  /** 当前选区。 */
  selection: ReturnType<AIToolContext['editor']['getSelection']>;
}

/** 画板 bridge 快照。 */
export interface BChatRuntimeDrawingSnapshot {
  /** 画板 ID。 */
  id: string;
  /** 画板标题。 */
  title: string;
  /** 磁盘路径。 */
  path: string | null;
  /** 画板数据。 */
  data: ReturnType<DrawingToolContext['getData']>;
}

/** 文件内容 bridge 快照。 */
export interface BChatRuntimeFileContentSnapshot {
  /** 原始请求路径。 */
  path: string;
  /** 文件内容。 */
  content: string;
}

/** ChatRuntime 打开资源类型。 */
type BChatRuntimeOpenResourceType = 'file' | 'webview' | 'external';

/** ChatRuntime 打开资源结果。 */
interface BChatRuntimeOpenResourceResult {
  /** 原始路径或 URL。 */
  path: string;
  /** 资源类型。 */
  resourceType: BChatRuntimeOpenResourceType;
  /** 是否打开成功。 */
  opened: true;
  /** 文件 ID。 */
  fileId?: string;
}

/**
 * 创建带稳定错误码的 bridge 错误。
 * @param code - 工具错误码
 * @param message - 错误信息
 * @returns 错误对象
 */
function createBridgeError(code: AIToolExecutionError['code'], message: string): Error & { code: AIToolExecutionError['code'] } {
  const error = new Error(message) as Error & { code: AIToolExecutionError['code'] };
  error.code = code;
  return error;
}

/**
 * 判断值是否为对象记录。
 * @param value - 待判断值
 * @returns 是否为对象记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 读取当前编辑器文档快照。
 * @param dependencies - bridge 依赖
 * @returns 文档快照
 */
function readDocumentSnapshot(dependencies: BChatRuntimeBridgeDependencies): BChatRuntimeDocumentSnapshot {
  const context = dependencies.getEditorContext();
  if (!context) {
    throw createBridgeError('EDITOR_UNAVAILABLE', '当前没有可用的编辑器文档');
  }

  return {
    id: context.document.id,
    title: context.document.title,
    path: context.document.path,
    ...(context.document.locator ? { locator: context.document.locator } : {}),
    content: context.document.getContent(),
    selection: context.editor.getSelection()
  };
}

/**
 * 读取当前画板快照。
 * @param dependencies - bridge 依赖
 * @returns 画板快照
 */
function readDrawingSnapshot(dependencies: BChatRuntimeBridgeDependencies): BChatRuntimeDrawingSnapshot {
  const context = dependencies.getDrawingContext();
  if (!context) {
    throw createBridgeError('EDITOR_UNAVAILABLE', '当前没有可用的画板');
  }

  return {
    id: context.id,
    title: context.title,
    path: context.path,
    data: context.getData()
  };
}

/**
 * 判断值是否为 DrawingData。
 * @param value - 待判断值
 * @returns 是否为 DrawingData
 */
function isDrawingData(value: unknown): value is DrawingData {
  return (
    isRecord(value) &&
    Array.isArray(value.elements) &&
    Array.isArray(value.edges) &&
    isRecord(value.viewport) &&
    isRecord(value.viewport.center) &&
    typeof value.viewport.center.x === 'number' &&
    typeof value.viewport.center.y === 'number' &&
    typeof value.viewport.zoom === 'number'
  );
}

/**
 * 写回当前画板数据。
 * @param event - bridge 请求事件
 * @param dependencies - bridge 依赖
 * @returns 写回后的画板快照
 */
async function applyDrawingData(event: ChatRuntimeBridgeRequestEvent, dependencies: BChatRuntimeBridgeDependencies): Promise<BChatRuntimeDrawingSnapshot> {
  const context = dependencies.getDrawingContext();
  if (!context) {
    throw createBridgeError('EDITOR_UNAVAILABLE', '当前没有可用的画板');
  }

  const payload = isRecord(event.payload) ? event.payload : {};
  if (!isDrawingData(payload.data)) {
    throw createBridgeError('INVALID_INPUT', '画板数据格式无效');
  }

  const data = await context.replaceData(payload.data);
  return {
    id: context.id,
    title: context.title,
    path: context.path,
    data
  };
}

/**
 * 解析编辑器文件查找路径。
 * @param filePath - 原始文件路径
 * @param workspaceRoot - 工作区根目录
 * @returns 可用于查找文件的绝对路径，无法解析时返回空字符串
 */
function resolveEditorFilePath(filePath: string, workspaceRoot: string | null | undefined): string {
  if (isAbsoluteFilePath(filePath)) {
    return filePath;
  }

  if (!workspaceRoot) {
    return '';
  }

  return `${workspaceRoot.replace(/\/$/, '')}/${filePath.replace(/^\//, '')}`;
}

/**
 * 读取文件内容快照。
 * @param event - bridge 请求事件
 * @param dependencies - bridge 依赖
 * @returns 文件内容快照
 */
async function readFileContentSnapshot(
  event: ChatRuntimeBridgeRequestEvent,
  dependencies: BChatRuntimeBridgeDependencies
): Promise<BChatRuntimeFileContentSnapshot> {
  const payload = isRecord(event.payload) ? event.payload : {};
  const filePath = typeof payload.path === 'string' ? payload.path.trim() : '';
  if (!filePath) {
    throw createBridgeError('INVALID_INPUT', '文件路径不能为空');
  }

  const workspaceRoot = typeof payload.workspaceRoot === 'string' ? payload.workspaceRoot : null;
  if (isUnsavedPath(filePath)) {
    const unsavedReference = parseUnsavedPath(filePath);
    const file = unsavedReference ? await dependencies.getRecentFileById?.(unsavedReference.fileId) : undefined;
    if (!file || file.type !== 'file') {
      throw createBridgeError('EDITOR_UNAVAILABLE', '当前没有可用的未保存文件内容');
    }

    return {
      path: filePath,
      content: file.content
    };
  }

  const resolvedPath = resolveEditorFilePath(filePath, workspaceRoot);
  if (!resolvedPath || !dependencies.findFileByPath || !dependencies.getEditorContextByDocumentId) {
    throw createBridgeError('EDITOR_UNAVAILABLE', '当前没有可用的编辑器文件内容');
  }

  const file = await dependencies.findFileByPath(resolvedPath);
  const context = file ? dependencies.getEditorContextByDocumentId(file.id) : undefined;
  if (!context) {
    throw createBridgeError('EDITOR_UNAVAILABLE', '当前没有可用的编辑器文件内容');
  }

  return {
    path: filePath,
    content: context.document.getContent()
  };
}

/**
 * 写入已打开编辑器或未保存草稿内容。
 * @param event - bridge 请求事件
 * @param dependencies - bridge 依赖
 * @returns 写入结果
 */
async function writeFileContent(event: ChatRuntimeBridgeRequestEvent, dependencies: BChatRuntimeBridgeDependencies): Promise<BChatRuntimeFileContentSnapshot> {
  const payload = isRecord(event.payload) ? event.payload : {};
  const filePath = typeof payload.path === 'string' ? payload.path.trim() : '';
  const content = typeof payload.content === 'string' ? payload.content : '';
  if (!filePath) {
    throw createBridgeError('INVALID_INPUT', '文件路径不能为空');
  }

  if (isUnsavedPath(filePath)) {
    const unsavedReference = parseUnsavedPath(filePath);
    if (!unsavedReference) {
      throw createBridgeError('INVALID_INPUT', `未识别的未保存文档路径：${filePath}`);
    }

    const activeContext = dependencies.getEditorContext();
    if (activeContext?.document.locator === filePath || activeContext?.document.path === filePath || activeContext?.document.id === unsavedReference.fileId) {
      await activeContext.editor.replaceDocument(content);
      return { path: filePath, content };
    }

    if (!dependencies.updateRecentFileById) {
      throw createBridgeError('EDITOR_UNAVAILABLE', '当前没有可写入的未保存文件内容');
    }

    await dependencies.updateRecentFileById(unsavedReference.fileId, { content, modifiedAt: Date.now() });
    return { path: filePath, content };
  }

  const workspaceRoot = typeof payload.workspaceRoot === 'string' ? payload.workspaceRoot : null;
  const resolvedPath = resolveEditorFilePath(filePath, workspaceRoot);
  if (!resolvedPath || !dependencies.findFileByPath || !dependencies.getEditorContextByDocumentId) {
    throw createBridgeError('EDITOR_UNAVAILABLE', '当前没有可写入的编辑器文件内容');
  }

  const file = await dependencies.findFileByPath(resolvedPath);
  const context = file ? dependencies.getEditorContextByDocumentId(file.id) : undefined;
  if (!context) {
    throw createBridgeError('EDITOR_UNAVAILABLE', '当前没有可写入的编辑器文件内容');
  }

  await context.editor.replaceDocument(content);
  return { path: filePath, content };
}

/**
 * 读取应用设置快照。
 * @param dependencies - bridge 依赖
 * @returns 设置快照
 */
function readSettingsSnapshot(dependencies: BChatRuntimeBridgeDependencies): BChatRuntimeSettingsSnapshot {
  if (!dependencies.getSettingsSnapshot) {
    throw createBridgeError('EDITOR_UNAVAILABLE', '当前没有可用的设置快照');
  }

  return dependencies.getSettingsSnapshot();
}

/**
 * 判断值是否为设置键。
 * @param value - 待判断值
 * @returns 是否为设置键
 */
function isSettingKey(value: unknown): value is BChatRuntimeSettingKey {
  return value === 'theme' || value === 'themePreset' || value === 'sourceMode' || value === 'editorPageWidth';
}

/**
 * 应用应用设置修改。
 * @param event - bridge 请求事件
 * @param dependencies - bridge 依赖
 * @returns 设置修改结果
 */
function applySetting(event: ChatRuntimeBridgeRequestEvent, dependencies: BChatRuntimeBridgeDependencies): BChatRuntimeApplySettingResult {
  if (!dependencies.applySetting) {
    throw createBridgeError('EDITOR_UNAVAILABLE', '当前环境不支持修改设置');
  }

  const payload = isRecord(event.payload) ? event.payload : {};
  if (!isSettingKey(payload.key)) {
    throw createBridgeError('INVALID_INPUT', '不支持的设置键。');
  }

  return dependencies.applySetting({
    key: payload.key,
    value: payload.value
  });
}

/**
 * 创建并打开未保存草稿。
 * @param event - bridge 请求事件
 * @param dependencies - bridge 依赖
 * @returns 未保存草稿结果
 */
async function openDraft(event: ChatRuntimeBridgeRequestEvent, dependencies: BChatRuntimeBridgeDependencies): Promise<OpenDraftResult> {
  if (!dependencies.openDraft) {
    throw createBridgeError('EXECUTION_FAILED', '当前环境不支持创建未保存草稿');
  }

  const payload = isRecord(event.payload) ? event.payload : {};
  const originalPath = typeof payload.originalPath === 'string' ? payload.originalPath.trim() : '';
  const content = typeof payload.content === 'string' ? payload.content : '';
  if (!originalPath) {
    throw createBridgeError('INVALID_INPUT', '草稿原始路径不能为空');
  }

  return dependencies.openDraft({ originalPath, content });
}

/**
 * 判断 bridge payload 是否为打开资源类型。
 * @param value - 待判断值
 * @returns 是否为打开资源类型
 */
function isOpenResourceType(value: unknown): value is BChatRuntimeOpenResourceType {
  return value === 'file' || value === 'webview' || value === 'external';
}

/**
 * 执行 renderer 侧资源打开动作。
 * @param event - bridge 请求事件
 * @param dependencies - bridge 依赖
 * @returns 打开结果
 */
async function openResource(event: ChatRuntimeBridgeRequestEvent, dependencies: BChatRuntimeBridgeDependencies): Promise<BChatRuntimeOpenResourceResult> {
  const payload = isRecord(event.payload) ? event.payload : {};
  const path = typeof payload.path === 'string' ? payload.path.trim() : '';
  const resourceType = isOpenResourceType(payload.resourceType) ? payload.resourceType : null;
  if (!path || !resourceType) {
    throw createBridgeError('INVALID_INPUT', '打开资源参数无效');
  }

  if (resourceType === 'webview') {
    if (!dependencies.openInWebview) {
      throw createBridgeError('EXECUTION_FAILED', '当前环境不支持打开网页');
    }

    await dependencies.openInWebview(path);
    return { path, resourceType, opened: true };
  }

  if (resourceType === 'external') {
    if (!dependencies.openExternal) {
      throw createBridgeError('EXECUTION_FAILED', '当前环境不支持打开外部链接');
    }

    await dependencies.openExternal(path);
    return { path, resourceType, opened: true };
  }

  if (!dependencies.openFileByPath) {
    throw createBridgeError('EXECUTION_FAILED', '当前环境不支持打开文件');
  }

  const file = await dependencies.openFileByPath(path);
  if (!file) {
    throw createBridgeError('EXECUTION_FAILED', `未找到文件：${path}`);
  }

  return { path, resourceType, opened: true, fileId: file.id };
}

/**
 * 处理 BChat runtime bridge 请求。
 * @param event - runtime bridge 请求事件
 * @param dependencies - bridge 依赖
 * @returns bridge 响应数据
 */
export async function handleBChatRuntimeBridgeRequest(event: ChatRuntimeBridgeRequestEvent, dependencies: BChatRuntimeBridgeDependencies): Promise<unknown> {
  if (event.kind === 'document-snapshot') {
    return readDocumentSnapshot(dependencies);
  }

  if (event.kind === 'drawing-snapshot') {
    return readDrawingSnapshot(dependencies);
  }

  if (event.kind === 'apply-drawing-data') {
    return applyDrawingData(event, dependencies);
  }

  if (event.kind === 'webview-snapshot') {
    const context = dependencies.getWebviewContext();
    if (!context) {
      throw createBridgeError('EDITOR_UNAVAILABLE', '当前没有可用的网页');
    }
    return context.readPageSnapshot();
  }

  if (event.kind === 'file-content-snapshot') {
    return readFileContentSnapshot(event, dependencies);
  }

  if (event.kind === 'write-file-content') {
    return writeFileContent(event, dependencies);
  }

  if (event.kind === 'settings-snapshot') {
    return readSettingsSnapshot(dependencies);
  }

  if (event.kind === 'apply-setting') {
    return applySetting(event, dependencies);
  }

  if (event.kind === 'open-draft') {
    return openDraft(event, dependencies);
  }

  if (event.kind === 'open-resource') {
    return openResource(event, dependencies);
  }

  throw createBridgeError('INVALID_INPUT', `不支持的 bridge 请求类型：${event.kind}`);
}
