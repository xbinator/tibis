/**
 * @file useFileSession.ts
 * @description 通用文件会话 hook 与 .tibis 文件容器工具。
 */
import type { SaveToDiskResult } from './useSavePolicy';
import type { Ref } from 'vue';
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { isPlainObject } from 'lodash-es';
import { TIBIS_FILE_FILTER } from '@/constants/extensions';
import { useClipboard } from '@/hooks/useClipboard';
import { native } from '@/shared/platform';
import type { File, FileChangeEvent } from '@/shared/platform/native/types';
import type { StoredFile } from '@/shared/storage/files/types';
import { useEditorFileWatchStore } from '@/stores/editor/fileWatch';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';
import { useFilesStore } from '@/stores/workspace/files';
import { useTabsStore } from '@/stores/workspace/tabs';
import { resolveFileTitle } from '@/utils/file/title';
import { Modal } from '@/utils/modal';
import { getDefaultSavePath, parseFileName, replaceFileName } from '@/views/editor/utils/filePath';
import { useFileAutoSave } from './useFileAutoSave';
import { useSavePolicy } from './useSavePolicy';

/**
 * 文件会话状态。
 */
export interface FileSessionState extends File {
  /** 文件唯一 ID */
  id: string;
}

/**
 * 文件会话业务模式。
 */
export type FileSessionKind = 'text' | 'tibis';

/**
 * 通用文件会话配置。
 */
export interface UseFileSessionOptions<TData> {
  /** 当前文件 ID */
  fileId: Ref<string>;
  /** 文件会话类型 */
  kind: FileSessionKind;
  /** 默认文件名主体 */
  defaultName: string;
  /** 默认扩展名 */
  defaultExt: string;
  /** 默认业务数据 */
  defaultData: TData;
  /** .tibis 业务类型 */
  type?: string;
  /** .tibis 业务版本 */
  version?: number;
  /** 当前业务路由名称 */
  routeName: string;
  /** 不支持当前内容时的兜底路由名称 */
  fallbackRouteName: string;
}

/**
 * 通用文件会话返回值。
 */
export interface UseFileSessionReturn<TData> {
  /** 当前文件状态 */
  fileState: Ref<FileSessionState>;
  /** 当前业务数据 */
  data: Ref<TData>;
  /** 当前文件标题 */
  currentTitle: Ref<string>;
  /** 文件操作 */
  actions: {
    /** 保存当前文件 */
    onSave: () => Promise<void>;
    /** 另存当前文件 */
    onSaveAs: () => Promise<void>;
    /** 重命名当前文件 */
    onRename: () => Promise<void>;
    /** 删除当前最近文件记录 */
    onDelete: () => Promise<void>;
    /** 在系统文件夹中显示 */
    onShowInFolder: () => Promise<void>;
    /** 复制绝对路径 */
    onCopyPath: () => Promise<void>;
    /** 复制相对路径 */
    onCopyRelativePath: () => Promise<void>;
    /** 失焦保存入口 */
    onBlur: () => Promise<void>;
  };
}

/**
 * .tibis 文档解析结果。
 */
export interface TibisDocumentParseResult<TData> {
  /** 是否是当前支持的 Tibis 文档 */
  supported: boolean;
  /** 文档类型 */
  type: string;
  /** 文档版本 */
  version: number;
  /** 业务数据 */
  data: TData;
  /** 原始解析错误 */
  error?: Error;
}

/**
 * .tibis 文档序列化参数。
 */
export interface CreateTibisDocumentContentOptions<TData extends object> {
  /** 业务文档类型 */
  type: string;
  /** 业务数据版本 */
  version: number;
  /** 业务数据 */
  data: TData;
}

/**
 * .tibis 文档支持性判断参数。
 */
export interface TibisDocumentSupportOptions {
  /** 期望的业务文档类型 */
  type: string;
  /** 期望的业务数据版本 */
  version: number;
}

/**
 * Tibis 路由解析结果。
 */
export interface TibisDocumentRouteTarget {
  /** 目标路由名称 */
  routeName: 'widget' | 'editor';
}

/**
 * 判断值是否为可索引对象。
 * @param value - 待判断值
 * @returns 是否为普通对象记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

/**
 * 将业务数据序列化为扁平 .tibis 文档内容。
 * @param options - 序列化参数
 * @returns JSON 字符串
 */
export function createTibisDocumentContent<TData extends object>(options: CreateTibisDocumentContentOptions<TData>): string {
  return JSON.stringify(
    {
      type: options.type,
      version: options.version,
      ...options.data
    },
    null,
    2
  );
}

/**
 * 解析 .tibis 文档内容。
 * @param content - 原始文件内容
 * @returns 解析结果
 */
export function parseTibisDocumentContent<TData extends object>(
  content: string,
  options: TibisDocumentSupportOptions = { type: 'widget', version: 1 }
): TibisDocumentParseResult<TData> {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) {
      return {
        supported: false,
        type: '',
        version: 0,
        data: {} as TData,
        error: new Error('Tibis document must be an object')
      };
    }

    const { type, version, ...data } = parsed;
    return {
      supported: type === options.type && version === options.version,
      type: typeof type === 'string' ? type : '',
      version: typeof version === 'number' ? version : 0,
      data: data as TData
    };
  } catch (error: unknown) {
    return {
      supported: false,
      type: '',
      version: 0,
      data: {} as TData,
      error: error instanceof Error ? error : new Error('Failed to parse Tibis document')
    };
  }
}

/**
 * 解析 .tibis 文档对应的目标路由。
 * @param content - 原始文件内容
 * @returns 路由目标
 */
export function resolveTibisDocumentRoute(content: string): TibisDocumentRouteTarget {
  const parsed = parseTibisDocumentContent<Record<string, unknown>>(content);

  return {
    routeName: parsed.supported ? 'widget' : 'editor'
  };
}

/**
 * 将最近文件记录转换为文件会话状态。
 * @param stored - 最近文件记录
 * @returns 文件会话状态
 */
function createFileStateFromStored(stored: StoredFile): FileSessionState {
  return {
    id: stored.id,
    name: stored.name,
    ext: stored.ext,
    path: stored.path,
    content: stored.content
  };
}

/**
 * 创建默认文件状态。
 * @param options - 文件会话配置
 * @returns 文件状态
 */
function createDefaultFileState<TData>(options: UseFileSessionOptions<TData>): FileSessionState {
  const content =
    options.kind === 'tibis'
      ? createTibisDocumentContent({
          type: options.type ?? '',
          version: options.version ?? 1,
          data: options.defaultData as object
        })
      : String(options.defaultData ?? '');

  return {
    id: options.fileId.value,
    name: options.defaultName,
    ext: options.defaultExt,
    path: null,
    content
  };
}

/**
 * 从文件内容创建业务数据。
 * @param options - 文件会话配置
 * @param content - 文件内容
 * @returns 业务数据
 */
function createDataFromContent<TData>(options: UseFileSessionOptions<TData>, content: string): TData {
  if (options.kind === 'text') {
    return content as TData;
  }

  const parsed = parseTibisDocumentContent<object>(content, {
    type: options.type ?? '',
    version: options.version ?? 1
  });
  if (!parsed.supported) {
    return options.defaultData;
  }

  return parsed.data as TData;
}

/**
 * 创建通用文件会话。
 * @param options - 文件会话配置
 * @returns 文件会话
 */
export function useFileSession<TData>(options: UseFileSessionOptions<TData>): UseFileSessionReturn<TData> {
  const router = useRouter();
  const filesStore = useFilesStore();
  const tabsStore = useTabsStore();
  const fileWatchStore = useEditorFileWatchStore();
  const editorPreferencesStore = useEditorPreferencesStore();
  const { clipboard } = useClipboard();
  const fileState = ref<FileSessionState>(createDefaultFileState(options)) as Ref<FileSessionState>;
  const data = ref<TData>(createDataFromContent(options, fileState.value.content)) as Ref<TData>;
  const savedContent = ref<string>(fileState.value.content);
  const syncingContentToData = ref<boolean>(false);
  const serializationError = ref<Error | null>(null);
  const autoSave = useFileAutoSave(fileState);
  const currentTitle = computed<string>(() => resolveFileTitle(fileState.value));
  let registeredWatchPath: string | null = null;

  /**
   * 将业务数据安全序列化为文件内容。
   * @param nextData - 最新业务数据
   * @returns 成功时返回文件内容，失败时返回 null
   */
  function serializeDataToContent(nextData: TData): string | null {
    if (options.kind === 'text') {
      serializationError.value = null;
      return String(nextData ?? '');
    }

    try {
      const content = createTibisDocumentContent({
        type: options.type ?? '',
        version: options.version ?? 1,
        data: nextData as object
      });
      serializationError.value = null;
      return content;
    } catch (error: unknown) {
      serializationError.value = error instanceof Error ? error : new Error('serialize tibis document failed');
      return null;
    }
  }

  /**
   * 同步当前磁盘路径到全局文件监听 store。
   * @param nextPath - 最新磁盘路径
   */
  async function syncWatchedPath(nextPath: string | null): Promise<void> {
    if (!nextPath) {
      if (registeredWatchPath) {
        await fileWatchStore.unregister(options.fileId.value);
        registeredWatchPath = null;
      }
      return;
    }

    if (!registeredWatchPath) {
      await fileWatchStore.register(options.fileId.value, nextPath);
      registeredWatchPath = nextPath;
      return;
    }

    if (registeredWatchPath !== nextPath) {
      await fileWatchStore.updatePath(options.fileId.value, nextPath);
      registeredWatchPath = nextPath;
    }
  }

  /**
   * 根据加载出的内容和保存基线恢复标签页脏状态。
   */
  function syncLoadedDirtyState(): void {
    const hasDraftContent = fileState.value.content !== savedContent.value;

    if (hasDraftContent) {
      tabsStore.setDirty(options.fileId.value);
      return;
    }

    tabsStore.clearDirty(options.fileId.value);
  }

  /**
   * 从最近文件存储加载文件会话。
   */
  async function load(): Promise<void> {
    autoSave.pause();
    const stored = await filesStore.getFileById(options.fileId.value);

    fileState.value = stored ? createFileStateFromStored(stored) : createDefaultFileState(options);
    savedContent.value = stored?.savedContent ?? fileState.value.content;
    syncingContentToData.value = true;
    data.value = createDataFromContent(options, fileState.value.content);
    await nextTick();
    syncingContentToData.value = false;

    if (stored) {
      await filesStore.updateFile(options.fileId.value, { ...fileState.value, savedContent: savedContent.value });
    } else {
      await filesStore.addFile({ ...fileState.value, type: 'file', savedContent: savedContent.value });
    }

    syncLoadedDirtyState();
    autoSave.resume();
  }

  /**
   * 标记当前内容已保存。
   * @param savedAt - 保存时间
   */
  async function markCurrentContentSaved(savedAt = Date.now()): Promise<void> {
    savedContent.value = fileState.value.content;
    tabsStore.clearDirty(options.fileId.value);
    tabsStore.clearMissing(options.fileId.value);
    await filesStore.updateFile(options.fileId.value, {
      ...fileState.value,
      savedContent: fileState.value.content,
      savedAt
    });
  }

  /**
   * 写回已有磁盘路径。
   * @returns 保存结果
   */
  async function saveCurrentFileToDisk(): Promise<SaveToDiskResult> {
    const filePath = fileState.value.path;
    if (!filePath) {
      return { status: 'skipped' };
    }

    if (serializationError.value) {
      return { status: 'failed', error: serializationError.value };
    }

    try {
      await native.writeFile(filePath, fileState.value.content);
      await markCurrentContentSaved();
      return { status: 'saved' };
    } catch (error: unknown) {
      return { status: 'failed', error: error instanceof Error ? error : new Error('save to disk failed') };
    }
  }

  /**
   * 通过保存对话框保存文件。
   * @returns 是否保存成功
   */
  async function saveWithDialog(): Promise<boolean> {
    if (serializationError.value) {
      return false;
    }

    const defaultPath = fileState.value.path || getDefaultSavePath(fileState.value);
    const saveOptions = options.kind === 'tibis' ? { defaultPath, filters: [TIBIS_FILE_FILTER] } : { defaultPath };
    const savedPath = await native.saveFile(fileState.value.content, undefined, saveOptions);
    if (!savedPath) {
      return false;
    }

    const { name, ext } = parseFileName(savedPath);
    fileState.value = {
      ...fileState.value,
      path: savedPath,
      name: name || fileState.value.name,
      ext: ext || fileState.value.ext
    };
    await markCurrentContentSaved();
    return true;
  }

  /**
   * 将外部文件内容写回会话和最近文件存储。
   * @param content - 外部文件内容
   */
  async function updateSessionContentFromDisk(content: string): Promise<void> {
    fileState.value = {
      ...fileState.value,
      content
    };
    savedContent.value = content;
    tabsStore.clearDirty(options.fileId.value);
    tabsStore.clearMissing(options.fileId.value);
    await filesStore.updateFile(options.fileId.value, {
      ...fileState.value,
      savedContent: content
    });
  }

  /**
   * 应用外部文本内容变化。
   * @param content - 外部文件内容
   */
  async function applyExternalTextContent(content: string): Promise<void> {
    syncingContentToData.value = true;
    data.value = content as TData;
    await nextTick();
    syncingContentToData.value = false;
    await updateSessionContentFromDisk(content);
  }

  /**
   * 应用外部 .tibis 内容变化。
   * @param content - 外部文件内容
   */
  async function applyExternalTibisContent(content: string): Promise<void> {
    const parsed = parseTibisDocumentContent<object>(content, {
      type: options.type ?? '',
      version: options.version ?? 1
    });
    if (!parsed.supported) {
      await updateSessionContentFromDisk(content);
      await router.push({ name: options.fallbackRouteName, params: { id: options.fileId.value } });
      return;
    }

    syncingContentToData.value = true;
    data.value = parsed.data as TData;
    await nextTick();
    syncingContentToData.value = false;
    await updateSessionContentFromDisk(content);
  }

  /**
   * 读取文件变化事件中的最新内容。
   * @param event - 文件变化事件
   * @returns 文件内容，不可读取时返回 null
   */
  async function readChangedContent(event: FileChangeEvent): Promise<string | null> {
    if (typeof event.content === 'string') {
      return event.content;
    }

    try {
      const file = await native.readFile(event.filePath);
      return file.content;
    } catch (error: unknown) {
      console.error('Failed to read changed file:', error);
      return null;
    }
  }

  /**
   * 响应当前文件的外部磁盘变化。
   * @param event - 文件变化事件
   */
  async function handleFileChanged(event: FileChangeEvent): Promise<void> {
    if (event.type !== 'change' || event.filePath !== fileState.value.path) {
      return;
    }

    const content = await readChangedContent(event);
    if (content === null || content === fileState.value.content) {
      return;
    }

    if (options.kind === 'text') {
      await applyExternalTextContent(content);
      return;
    }

    await applyExternalTibisContent(content);
  }

  const savePolicy = useSavePolicy({
    saveStrategy: computed(() => editorPreferencesStore.saveStrategy),
    hasFilePath: computed((): boolean => Boolean(fileState.value.path)),
    isDirty: (): boolean => fileState.value.content !== savedContent.value,
    saveCurrentFileToDisk
  });

  watch(
    data,
    (nextData: TData): void => {
      if (syncingContentToData.value) {
        return;
      }

      const content = serializeDataToContent(nextData);
      if (content === null) {
        tabsStore.setDirty(options.fileId.value);
        return;
      }

      fileState.value = {
        ...fileState.value,
        content
      };

      if (fileState.value.content !== savedContent.value) {
        tabsStore.setDirty(options.fileId.value);
        savePolicy.notifyContentChanged();
      } else {
        tabsStore.clearDirty(options.fileId.value);
      }
    },
    { deep: true }
  );

  watch(
    () => fileState.value.path,
    (nextPath: string | null): void => {
      syncWatchedPath(nextPath).catch((error: unknown): void => {
        console.error('Failed to sync watched file path:', error);
      });
    },
    { immediate: true }
  );

  const unsubscribeFileChanged = native.onFileChanged((event: FileChangeEvent): void => {
    handleFileChanged(event).catch((error: unknown): void => {
      console.error('Failed to handle file change:', error);
    });
  });

  onScopeDispose((): void => {
    unsubscribeFileChanged();
    if (registeredWatchPath) {
      Promise.resolve(fileWatchStore.unregister(options.fileId.value)).catch((error: unknown): void => {
        console.error('Failed to unregister watched file path:', error);
      });
      registeredWatchPath = null;
    }
  });

  load().catch((error: unknown): void => {
    console.error('Failed to load file session:', error);
  });

  /**
   * 保存当前文件。
   */
  async function onSave(): Promise<void> {
    if (fileState.value.path) {
      await saveCurrentFileToDisk();
      return;
    }

    await saveWithDialog();
  }

  /**
   * 通过保存对话框另存当前文件。
   */
  async function onSaveAs(): Promise<void> {
    await saveWithDialog();
  }

  /**
   * 重命名当前文件。
   */
  async function onRename(): Promise<void> {
    const [cancelled, newName] = await Modal.input('重命名', { defaultValue: fileState.value.name, placeholder: '请输入文件名' });
    const normalizedName = String(newName || '').trim();
    if (cancelled || !normalizedName || normalizedName === fileState.value.name) {
      return;
    }

    if (fileState.value.path) {
      const nextPath = replaceFileName(fileState.value.path, normalizedName, fileState.value.ext);
      await native.renameFile(fileState.value.path, nextPath);
      fileState.value = { ...fileState.value, path: nextPath };
    }

    fileState.value = { ...fileState.value, name: normalizedName };
    await autoSave.save();
  }

  /**
   * 删除当前最近文件记录。
   */
  async function onDelete(): Promise<void> {
    await filesStore.removeFile(options.fileId.value);
  }

  /**
   * 在系统文件夹中显示当前文件。
   */
  async function onShowInFolder(): Promise<void> {
    if (fileState.value.path) {
      await native.showItemInFolder(fileState.value.path);
    }
  }

  /**
   * 复制当前文件绝对路径。
   */
  async function onCopyPath(): Promise<void> {
    if (fileState.value.path) {
      await clipboard(fileState.value.path, { successMessage: '已复制路径', trim: false });
    }
  }

  /**
   * 复制当前文件相对路径。
   */
  async function onCopyRelativePath(): Promise<void> {
    if (!fileState.value.path) {
      return;
    }

    const relativePath = await native.getRelativePath(fileState.value.path);
    await clipboard(relativePath || fileState.value.path, { successMessage: '已复制相对路径', trim: false });
  }

  /**
   * 失焦时按保存策略写盘。
   */
  async function onBlur(): Promise<void> {
    await savePolicy.handleEditorBlur();
  }

  return {
    fileState,
    data,
    currentTitle,
    actions: {
      onSave,
      onSaveAs,
      onRename,
      onDelete,
      onShowInFolder,
      onCopyPath,
      onCopyRelativePath,
      onBlur
    }
  };
}
