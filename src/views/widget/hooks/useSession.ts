/**
 * @file useSession.ts
 * @description 将 Widget JSON、已安装路径与页面动作适配到公共文件控制器。
 */
import type { ComputedRef, Ref } from 'vue';
import { computed, getCurrentInstance, onActivated, onDeactivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { parseWidgetJson } from '@/ai/widget/parser';
import type { WidgetData } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import type { FileSessionState } from '@/hooks/types';
import { useClipboard } from '@/hooks/useClipboard';
import type {
  FileConflictDecision,
  FileControllerErrorContext,
  FileControllerSnapshot,
  FileLoadCandidates,
  FileLoadContext,
  FileParseContext,
  FileRecordContext,
  FileRenameResult,
  FileRestoreContext,
  FileSaveAsContext,
  FileSerializeContext,
  FileWriteContext
} from '@/hooks/useFileController';
import { useFileController } from '@/hooks/useFileController';
import { native } from '@/shared/platform';
import type { ReadFileResult } from '@/shared/platform/native/types';
import type { StoredDocumentRecord, StoredWidget } from '@/shared/storage/files/types';
import { useWidgetStore } from '@/stores/ai/widget';
import { useRecentStore } from '@/stores/workspace/recent';
import { useTabsStore } from '@/stores/workspace/tabs';
import { asyncTo } from '@/utils/asyncTo';
import { restoreMissingFile } from '@/utils/file/restore';
import { resolveFileTitle } from '@/utils/file/title';
import { Modal } from '@/utils/modal';
import { getDefaultSavePath, parseFileName } from '@/views/editor/utils/filePath';
import { useBindings } from './useBindings';

/** 已安装 Widget 对应的文件会话 ID 前缀。 */
const WIDGET_FILE_PREFIX = 'widget-';

/**
 * Widget 文件操作。
 */
export interface WidgetSessionActions {
  /** 保存当前文件。 */
  onSave: () => Promise<void>;
  /** 另存为并切换当前会话路径。 */
  onSaveAs: () => Promise<void>;
  /** 处理 Widget 重命名。 */
  onRename: () => Promise<void>;
  /** 删除当前最近文件记录。 */
  onDelete: () => Promise<void>;
  /** 在系统文件夹中显示。 */
  onShowInFolder: () => Promise<void>;
  /** 复制绝对路径。 */
  onCopyPath: () => Promise<void>;
  /** 复制相对路径。 */
  onCopyRelativePath: () => Promise<void>;
  /** 失焦保存入口。 */
  onBlur: () => Promise<void>;
  /** 重新加载当前 Widget。 */
  onReload: () => Promise<void>;
}

/**
 * Widget 页面统一会话。
 */
export interface WidgetSessionReturn {
  /** 当前文件 ID。 */
  fileId: Ref<string>;
  /** 当前 KeepAlive 页面是否活跃。 */
  isActive: Ref<boolean>;
  /** 文件会话是否正在加载。 */
  isLoading: Ref<boolean>;
  /** 文件加载或解析失败信息。 */
  loadError: Ref<Error | null>;
  /** 当前文件状态。 */
  fileState: Ref<FileSessionState>;
  /** 当前 Widget 数据。 */
  data: Ref<WidgetData>;
  /** 当前文件标题。 */
  currentTitle: ComputedRef<string>;
  /** Widget 文件操作。 */
  actions: WidgetSessionActions;
}

/**
 * 判断文件记录是否属于 Widget。
 * @param record - 最近文件记录
 * @returns 是否为 Widget 文件记录
 */
function isStoredWidget(record: StoredDocumentRecord | undefined): record is StoredWidget {
  return record?.type === 'widget';
}

/**
 * 从 Widget 文件会话 ID 解析已安装 Widget ID。
 * @param fileId - Widget 文件会话 ID
 * @returns 已安装 Widget ID
 */
function resolveWidgetId(fileId: string): string {
  return fileId.startsWith(WIDGET_FILE_PREFIX) ? fileId.slice(WIDGET_FILE_PREFIX.length) : fileId;
}

/**
 * 创建未绑定磁盘文件的默认 Widget 状态。
 * @param fileId - Widget 文件会话 ID
 * @returns 默认文件状态
 */
function createDefaultState(fileId: string): FileSessionState {
  return {
    id: fileId,
    name: 'Untitled',
    ext: 'json',
    path: null,
    content: JSON.stringify(createDefaultWidgetData(resolveWidgetId(fileId)), null, 2)
  };
}

/**
 * 将最近 Widget 记录转换为页面文件状态。
 * @param stored - 最近 Widget 记录
 * @returns 页面文件状态
 */
function createStoredState(stored: StoredWidget): FileSessionState {
  return {
    id: stored.id,
    name: stored.name,
    ext: stored.ext,
    path: stored.path,
    content: stored.content
  };
}

/**
 * 将磁盘读取结果转换为页面文件状态。
 * @param fileId - Widget 文件会话 ID
 * @param filePath - Widget 文件路径
 * @param diskFile - 磁盘读取结果
 * @returns 页面文件状态
 */
function createDiskState(fileId: string, filePath: string, diskFile: ReadFileResult): FileSessionState {
  const { name, ext } = parseFileName(filePath);
  return {
    id: fileId,
    path: filePath,
    name: name || diskFile.name,
    ext: ext || diskFile.ext || 'json',
    content: diskFile.content
  };
}

/**
 * 创建 Widget 页面专用文件会话。
 * @returns Widget 文件会话
 */
export function useSession(): WidgetSessionReturn {
  const route = useRoute();
  const router = useRouter();
  const fileId = ref<string>(String(route.params.id || ''));
  const isActive = ref<boolean>(true);
  const recentStore = useRecentStore();
  const tabsStore = useTabsStore();
  const widgetStore = useWidgetStore();
  const { clipboard } = useClipboard();

  /**
   * 创建默认 Widget 控制器快照。
   * @param context - 默认会话上下文
   * @returns 默认 Widget 快照
   */
  function onCreateWidget(context: { fileId: string }): FileControllerSnapshot<WidgetData> {
    const nextFile = createDefaultState(context.fileId);
    const nextData = createDefaultWidgetData(resolveWidgetId(context.fileId));
    return { fileState: nextFile, data: nextData, savedContent: nextFile.content };
  }

  /**
   * 读取 Widget 最近草稿、已安装路径与磁盘内容。
   * @param context - 当前加载上下文
   * @returns Widget 草稿与磁盘候选内容
   */
  async function onLoadWidget(context: FileLoadContext): Promise<FileLoadCandidates> {
    const [initError] = await asyncTo(widgetStore.waitForInit());
    if (initError) {
      return { draft: null, disk: null, error: initError };
    }

    const [recordError, record] = await asyncTo(recentStore.getFileById(context.fileId));
    if (recordError) {
      return { draft: null, disk: null, error: recordError };
    }

    const stored = isStoredWidget(record) ? record : undefined;
    const installedPath = widgetStore.getWidgetById(resolveWidgetId(context.fileId))?.filePath ?? null;
    const filePath = installedPath ?? stored?.path ?? null;
    const storedState = stored ? createStoredState(stored) : null;
    if (storedState && installedPath) {
      const { name, ext } = parseFileName(installedPath);
      storedState.path = installedPath;
      storedState.name = name || storedState.name;
      storedState.ext = ext || storedState.ext;
    }

    const draft = storedState ? { fileState: storedState, savedContent: stored?.savedContent ?? null } : null;
    if (!filePath) {
      const error = draft ? null : new Error('未找到已安装 Widget 的文件路径');
      return { draft, disk: null, error };
    }

    const [diskError, diskFile] = await asyncTo(native.readFile(filePath));
    if (diskError) {
      const [statusError, status] = await asyncTo(native.getPathStatus(filePath));
      if (statusError) {
        return { draft, disk: null, error: statusError };
      }
      if (!status.exists) {
        return { draft, disk: null, error: null, missing: true };
      }
      return { draft, disk: null, error: new Error(`无法读取 Widget 文件：${diskError.message}`, { cause: diskError }) };
    }

    return {
      draft,
      disk: { fileState: createDiskState(context.fileId, filePath, diskFile) },
      error: null,
      missing: false
    };
  }

  /**
   * 将 Widget JSON 字符串解析为页面数据。
   * @param context - 文件解析上下文
   * @returns Widget 页面数据
   */
  function onParseWidget(context: FileParseContext): WidgetData {
    const definition = parseWidgetJson(context.content, context.path ?? 'widget.json');
    if (definition.parseError) {
      throw new Error(`Widget JSON 解析失败：${definition.parseError}`);
    }
    return definition.data;
  }

  /**
   * 将 Widget 页面数据序列化为稳定 JSON。
   * @param context - 文件序列化上下文
   * @returns 格式化 JSON 字符串
   */
  function onSerializeWidget(context: FileSerializeContext<WidgetData>): string {
    return JSON.stringify(context.data ?? {}, null, 2);
  }

  /**
   * 构建 Widget 最近文件记录。
   * @param context - 当前控制器记录上下文
   * @returns Widget 最近文件记录
   */
  function onBuildRecord(context: FileRecordContext<WidgetData>): StoredWidget {
    return {
      ...context.fileState,
      type: 'widget',
      savedContent: context.savedContent,
      modifiedAt: context.modifiedAt
    };
  }

  /**
   * 写入已有 Widget 文件路径。
   * @param context - 精确写盘上下文
   */
  async function onWriteWidget(context: FileWriteContext): Promise<void> {
    const [error] = await asyncTo(native.writeFile(context.path, context.content));
    if (error) throw error;
  }

  /**
   * 通过系统保存对话框保存 Widget 快照。
   * @param context - 另存为上下文
   * @returns 最终保存路径；取消时返回 null
   */
  async function onSaveAsWidget(context: FileSaveAsContext): Promise<string | null> {
    const defaultPath = context.suggestedPath || context.fileState.path || getDefaultSavePath(context.fileState);
    const [error, savedPath] = await asyncTo(native.saveFile(context.content, undefined, { defaultPath }));
    if (error) throw error;
    return savedPath;
  }

  /**
   * 拒绝重命名固定名称的已安装 Widget 配置文件。
   * @returns 始终返回 null
   */
  async function onRenameWidget(): Promise<FileRenameResult | null> {
    const [error] = await asyncTo(Modal.alert('无法重命名', '已安装 Widget 的配置文件名固定为 widget.json'));
    if (error) throw error;
    return null;
  }

  /**
   * 询问用户如何处理 Widget 草稿与磁盘冲突。
   * @returns 用户选择的冲突结果
   */
  async function onResolveConflict(): Promise<FileConflictDecision> {
    const [error, result] = await asyncTo(
      Modal.confirm('发现内容冲突', '当前 Widget 有未保存草稿，同时磁盘内容也已变化。是否使用磁盘中的最新内容？', {
        confirmText: '使用磁盘内容',
        cancelText: '保留本地草稿'
      })
    );
    if (error) throw error;
    return result[0] ? 'keepDraft' : 'useDisk';
  }

  /**
   * 通过独占创建与覆盖确认安全恢复丢失的 Widget 文件。
   * @param context - 当前丢失文件状态
   * @returns 是否完成原路径恢复
   */
  async function onRestoreFile(context: FileRestoreContext): Promise<boolean> {
    return restoreMissingFile(context.fileState, {
      title: '文件已存在',
      message: '原 Widget 路径已重新出现同名文件。是否覆盖它？'
    });
  }

  /**
   * 向用户显示 Widget 文件持久化错误。
   * @param context - 错误来源与错误对象
   */
  function onReportFileError(context: FileControllerErrorContext): void {
    const labels: Record<FileControllerErrorContext['source'], string> = {
      draft: 'Widget 草稿保存失败',
      save: 'Widget 保存失败',
      saveAs: 'Widget 另存为失败',
      rename: 'Widget 重命名失败',
      restore: 'Widget 文件恢复失败',
      delete: 'Widget 删除失败',
      watch: 'Widget 文件监听失败'
    };
    message.error(`${labels[context.source]}：${context.error.message}`);
  }

  /**
   * 完成 Widget 最近记录删除后的标签和路由收尾。
   */
  async function onDeletedWidget(): Promise<void> {
    const [routeError] = await asyncTo(router.push('/welcome'));
    if (routeError) throw routeError;
    tabsStore.removeTab(fileId.value);
  }

  const controller = useFileController<WidgetData>({
    fileId,
    events: {
      onCreate: onCreateWidget,
      onLoad: onLoadWidget,
      onParse: onParseWidget,
      onSerialize: onSerializeWidget,
      onBuildRecord,
      onWriteFile: onWriteWidget,
      onSaveAs: onSaveAsWidget,
      onRename: onRenameWidget,
      onResolveConflict,
      onRestoreFile,
      onDeleted: onDeletedWidget,
      onError: onReportFileError
    }
  });
  const currentTitle = computed<string>((): string => resolveFileTitle(controller.fileState.value));
  const routePath = computed<string>((): string => `/widget/${fileId.value}`);

  /**
   * 将当前 Widget 文件同步到标签页列表。
   */
  function onSyncWidgetTab(): void {
    if (!fileId.value) return;
    tabsStore.addTab({
      id: fileId.value,
      path: routePath.value,
      title: currentTitle.value,
      cacheKey: `widget:${fileId.value}`
    });
  }

  watch([fileId, currentTitle], onSyncWidgetTab, { immediate: true });

  /**
   * 在系统文件夹中显示当前 Widget。
   */
  async function onShowInFolder(): Promise<void> {
    if (!controller.fileState.value.path) return;
    await asyncTo(native.showItemInFolder(controller.fileState.value.path));
  }

  /**
   * 复制当前 Widget 绝对路径。
   */
  async function onCopyPath(): Promise<void> {
    if (!controller.fileState.value.path) return;
    await asyncTo(clipboard(controller.fileState.value.path, { successMessage: '已复制路径', trim: false }));
  }

  /**
   * 复制当前 Widget 相对路径。
   */
  async function onCopyRelativePath(): Promise<void> {
    const currentPath = controller.fileState.value.path;
    if (!currentPath) return;
    const [pathError, relativePath] = await asyncTo(native.getRelativePath(currentPath));
    if (pathError) return;
    await asyncTo(clipboard(relativePath || currentPath, { successMessage: '已复制相对路径', trim: false }));
  }

  const actions: WidgetSessionActions = {
    onSave: controller.actions.onSave,
    onSaveAs: controller.actions.onSaveAs,
    onRename: controller.actions.onRename,
    onDelete: controller.actions.onDelete,
    onShowInFolder,
    onCopyPath,
    onCopyRelativePath,
    onBlur: controller.actions.onBlur,
    onReload: controller.actions.onReload
  };

  // 页面生命周期绑定只在组件 setup 上下文中注册，便于独立测试文件会话。
  if (getCurrentInstance()) {
    useBindings({ isActive, actions });
    onActivated((): void => {
      isActive.value = true;
    });
    onDeactivated((): void => {
      isActive.value = false;
    });
  }

  asyncTo(controller.actions.onReload());

  return {
    fileId,
    isActive,
    isLoading: controller.isLoading,
    loadError: controller.loadError,
    fileState: controller.fileState,
    data: controller.data,
    currentTitle,
    actions
  };
}
