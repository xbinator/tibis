/**
 * @file useSession.ts
 * @description 编排 Widget 页面文件的磁盘加载、草稿协调、保存与监听。
 */
import type { Ref } from 'vue';
import { computed, getCurrentInstance, nextTick, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { parseWidgetJson } from '@/ai/widget';
import type { WidgetData } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { useClipboard } from '@/hooks/useClipboard';
import { useFileAutoSave } from '@/hooks/useFileAutoSave';
import type { FileSessionState, UseFileSessionReturn } from '@/hooks/useFileSession';
import type { SaveToDiskResult } from '@/hooks/useSavePolicy';
import { useSavePolicy } from '@/hooks/useSavePolicy';
import { native } from '@/shared/platform';
import type { FileChangeEvent, ReadFileResult } from '@/shared/platform/native/types';
import type { StoredDocumentRecord, StoredWidget } from '@/shared/storage/files/types';
import { useWidgetStore } from '@/stores/ai/widget';
import { useEditorFileWatchStore } from '@/stores/editor/fileWatch';
import type { EditorSaveStrategy } from '@/stores/editor/preferences';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';
import { useRecentStore } from '@/stores/workspace/recent';
import { useTabsStore } from '@/stores/workspace/tabs';
import { resolveFileTitle } from '@/utils/file/title';
import { Modal } from '@/utils/modal';
import { getDefaultSavePath, parseFileName } from '@/views/editor/utils/filePath';
import { resolveFileReconcileDecision } from '@/views/editor/utils/reconcileFileContent';
import { useBindings } from './useBindings';

/** 已安装 Widget 对应的文件会话 ID 前缀。 */
const WIDGET_FILE_PREFIX = 'widget-';
/** 当前会话写盘事件的最长抑制时间。 */
const FILE_CHANGE_SUPPRESSION_MS = 5_000;

/**
 * Widget 会话加载结果。
 */
interface LoadedWidgetState {
  /** 当前文件状态 */
  fileState: FileSessionState;
  /** 最近一次与磁盘同步的内容基线 */
  savedContent: string;
  /** 是否应将加载结果写入最近文件记录 */
  shouldPersist: boolean;
  /** 加载失败信息 */
  loadError: string | null;
}

/**
 * 下一次由当前会话写盘触发的文件变化签名。
 */
interface SuppressedFileChange {
  /** 写入操作 ID */
  id: number;
  /** 写入文件路径 */
  filePath: string;
  /** 写入内容快照 */
  content: string;
  /** 抑制记录过期时间 */
  expiresAt: number;
}

/**
 * Widget 内容解析结果。
 */
interface ParsedWidgetContent {
  /** 补齐默认结构后的 Widget 数据 */
  data: WidgetData;
  /** JSON 解析失败信息 */
  parseError: string | null;
}

/**
 * Widget 页面统一会话。
 */
export interface WidgetSessionReturn extends UseFileSessionReturn<WidgetData> {
  /** 当前文件 ID */
  fileId: Ref<string>;
  /** 当前 KeepAlive 页面是否活跃 */
  isActive: Ref<boolean>;
  /** 文件会话是否正在加载 */
  isLoading: Ref<boolean>;
  /** 文件加载或解析失败信息 */
  loadError: Ref<string | null>;
  /** 重新加载当前 Widget 文件 */
  reload: () => Promise<void>;
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
    content: JSON.stringify(createDefaultWidgetData(), null, 2)
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
 * 创建保留目标磁盘路径的加载失败状态。
 * @param fileId - Widget 文件会话 ID
 * @param filePath - 目标 Widget 文件路径
 * @returns 加载失败时保留的文件状态
 */
function createFallbackState(fileId: string, filePath: string): FileSessionState {
  const fallbackState = createDefaultState(fileId);
  const { name, ext } = parseFileName(filePath);

  return {
    ...fallbackState,
    path: filePath,
    name: name || fallbackState.name,
    ext: ext || fallbackState.ext
  };
}

/**
 * 将 JSON 内容解析为 Widget 数据。
 * @param content - Widget JSON 内容
 * @param filePath - Widget JSON 文件路径
 * @returns Widget 数据与解析错误
 */
function parseWidgetContent(content: string, filePath: string | null): ParsedWidgetContent {
  const definition = parseWidgetJson(content, filePath ?? 'widget.json');

  return {
    data: definition.data,
    parseError: definition.parseError ?? null
  };
}

/**
 * 创建 Widget 页面专用文件会话。
 * @returns Widget 文件会话
 */
export function useSession(): WidgetSessionReturn {
  const route = useRoute();
  const fileId = ref(String(route.params.id || ''));
  const isActive = ref(true);
  const isLoading = ref(true);
  const loadError = ref<string | null>(null);
  const recentStore = useRecentStore();
  const tabsStore = useTabsStore();
  const widgetStore = useWidgetStore();
  const fileWatchStore = useEditorFileWatchStore();
  const editorPreferencesStore = useEditorPreferencesStore();
  const { clipboard } = useClipboard();
  const fileState = ref<FileSessionState>(createDefaultState(fileId.value));
  const data = ref<WidgetData>(parseWidgetContent(fileState.value.content, fileState.value.path).data);
  const savedContent = ref<string>(fileState.value.content);
  const syncingContentToData = ref(false);
  const serializationError = ref<Error | null>(null);
  const autoSave = useFileAutoSave(fileState, { recordType: 'widget' });
  const currentTitle = computed<string>((): string => resolveFileTitle(fileState.value));
  const routePath = `/widget/${fileId.value}`;
  let registeredWatchPath: string | null = null;
  let desiredWatchPath: string | null = null;
  let watchSyncTask = Promise.resolve();
  const suppressedFileChanges: SuppressedFileChange[] = [];
  let writeSequence = 0;
  let loadVersion = 0;

  /**
   * 将 Widget 数据安全序列化为 JSON 内容。
   * @param nextData - 最新 Widget 数据
   * @returns 序列化成功时返回 JSON，失败时返回 null
   */
  function serializeData(nextData: WidgetData): string | null {
    try {
      const content = JSON.stringify(nextData ?? {}, null, 2);
      serializationError.value = null;
      return content;
    } catch (error: unknown) {
      serializationError.value = error instanceof Error ? error : new Error('serialize widget document failed');
      return null;
    }
  }

  /**
   * 将文件监听 Store 追赶到最近请求的路径。
   */
  async function applyWatchedPath(): Promise<void> {
    const targetPath = desiredWatchPath;
    if (registeredWatchPath === targetPath) {
      return;
    }

    if (!targetPath) {
      await fileWatchStore.unregister(fileId.value);
      registeredWatchPath = null;
    } else if (!registeredWatchPath) {
      await fileWatchStore.register(fileId.value, targetPath);
      registeredWatchPath = targetPath;
    } else {
      await fileWatchStore.updatePath(fileId.value, targetPath);
      registeredWatchPath = targetPath;
    }

    // 路径在异步操作期间再次变化时，继续串行追赶最新请求。
    if (registeredWatchPath !== desiredWatchPath) {
      await applyWatchedPath();
    }
  }

  /**
   * 同步当前磁盘路径到全局文件监听 Store。
   * @param nextPath - 最新磁盘路径
   * @returns 本轮路径同步任务
   */
  function syncWatchedPath(nextPath: string | null): Promise<void> {
    desiredWatchPath = nextPath;
    watchSyncTask = watchSyncTask.catch((): void => undefined).then(applyWatchedPath);

    return watchSyncTask;
  }

  /**
   * 根据当前内容与保存基线同步标签脏状态。
   */
  function syncDirtyState(): void {
    if (fileState.value.content !== savedContent.value) {
      tabsStore.setDirty(fileId.value);
      return;
    }

    tabsStore.clearDirty(fileId.value);
  }

  /**
   * 解析已安装 Widget 的磁盘文件路径。
   * @returns 磁盘路径；未找到 Widget 时返回 null
   */
  async function resolveWidgetPath(): Promise<string | null> {
    await widgetStore.waitForInit();
    return widgetStore.getWidgetById(resolveWidgetId(fileId.value))?.filePath ?? null;
  }

  /**
   * 协调最近记录、保存基线与磁盘文件，解析页面初始状态。
   * @param stored - 最近 Widget 记录
   * @returns 页面应采用的文件状态与保存基线
   */
  async function resolveLoadedState(stored: StoredWidget | undefined): Promise<LoadedWidgetState> {
    const widgetPath = await resolveWidgetPath();
    const filePath = widgetPath ?? stored?.path ?? null;
    const storedState = stored ? createStoredState(stored) : null;
    if (storedState && widgetPath) {
      const { name, ext } = parseFileName(widgetPath);
      storedState.path = widgetPath;
      storedState.name = name || storedState.name;
      storedState.ext = ext || storedState.ext;
    }

    if (!filePath) {
      const fallbackState = storedState ?? createDefaultState(fileId.value);
      return {
        fileState: fallbackState,
        savedContent: stored?.savedContent ?? fallbackState.content,
        shouldPersist: Boolean(stored),
        loadError: stored ? null : '未找到已安装 Widget 的文件路径'
      };
    }

    let diskFile: ReadFileResult;
    try {
      diskFile = await native.readFile(filePath);
    } catch (error: unknown) {
      console.error('Failed to load Widget file:', error);
      const fallbackState = storedState ?? createFallbackState(fileId.value, filePath);
      const reason = error instanceof Error ? error.message : String(error);
      return {
        fileState: fallbackState,
        savedContent: stored?.savedContent ?? fallbackState.content,
        shouldPersist: false,
        loadError: `无法读取 Widget 文件：${reason}`
      };
    }

    const diskState = createDiskState(fileId.value, filePath, diskFile);
    if (!storedState || stored?.savedContent === undefined) {
      return { fileState: diskState, savedContent: diskFile.content, shouldPersist: true, loadError: null };
    }

    const savedBaseline = stored.savedContent;
    const currentMeta = parseFileName(filePath);
    const hasUnsavedDraft = storedState.content !== savedBaseline;
    const decision = resolveFileReconcileDecision({
      currentContent: storedState.content,
      savedContent: savedBaseline,
      currentName: storedState.name,
      currentExt: storedState.ext,
      diskFile,
      diskName: currentMeta.name,
      diskExt: currentMeta.ext,
      hasUnsavedDraft
    });

    if (decision === 'keepDraft') {
      return { fileState: storedState, savedContent: savedBaseline, shouldPersist: true, loadError: null };
    }

    if (decision === 'markSaved') {
      return { fileState: storedState, savedContent: storedState.content, shouldPersist: true, loadError: null };
    }

    if (decision === 'applyDisk') {
      return { fileState: diskState, savedContent: diskFile.content, shouldPersist: true, loadError: null };
    }

    const [cancelled] = await Modal.confirm('发现内容冲突', '当前 Widget 有未保存草稿，同时磁盘内容也已变化。是否使用磁盘中的最新内容？', {
      confirmText: '使用磁盘内容',
      cancelText: '保留本地草稿'
    });

    return cancelled
      ? { fileState: storedState, savedContent: savedBaseline, shouldPersist: true, loadError: null }
      : { fileState: diskState, savedContent: diskFile.content, shouldPersist: true, loadError: null };
  }

  /**
   * 将当前会话状态持久化到最近文件记录。
   * @param stored - 已有最近 Widget 记录
   */
  async function persistLoadedState(stored: StoredWidget | undefined): Promise<void> {
    const nextRecord: StoredWidget = {
      ...fileState.value,
      type: 'widget',
      savedContent: savedContent.value,
      openedAt: Date.now()
    };

    if (stored) {
      await recentStore.updateFile(fileId.value, nextRecord);
      return;
    }

    await recentStore.addFile(nextRecord);
  }

  /**
   * 加载当前 Widget 文件状态。
   */
  async function loadFileState(): Promise<void> {
    const currentVersion = ++loadVersion;
    isLoading.value = true;
    loadError.value = null;
    autoSave.pause();

    try {
      const storedRecord = await recentStore.getFileById(fileId.value);
      const stored = isStoredWidget(storedRecord) ? storedRecord : undefined;
      const loaded = await resolveLoadedState(stored);
      if (currentVersion !== loadVersion) return;

      fileState.value = loaded.fileState;
      savedContent.value = loaded.savedContent;
      const parsedContent = parseWidgetContent(fileState.value.content, fileState.value.path);
      syncingContentToData.value = true;
      data.value = parsedContent.data;
      await nextTick();
      syncingContentToData.value = false;
      loadError.value = loaded.loadError ?? (parsedContent.parseError ? `Widget JSON 解析失败：${parsedContent.parseError}` : null);
      if (loadError.value) {
        return;
      }

      if (loaded.shouldPersist) {
        await persistLoadedState(stored);
      }
      syncDirtyState();
    } catch (error: unknown) {
      if (currentVersion === loadVersion) {
        const reason = error instanceof Error ? error.message : String(error);
        loadError.value = `加载 Widget 失败：${reason}`;
        console.error('Failed to load Widget session:', error);
      }
    } finally {
      if (currentVersion === loadVersion) {
        syncingContentToData.value = false;
        isLoading.value = false;
        if (loadError.value) {
          autoSave.pause();
        } else {
          autoSave.resume();
        }
      }
    }
  }

  /**
   * 标记当前内容已成功保存。
   * @param content - 已写入磁盘的内容快照
   * @param savedAt - 保存时间
   */
  async function markContentSaved(content: string, savedAt = Date.now()): Promise<void> {
    savedContent.value = content;
    syncDirtyState();
    tabsStore.clearMissing(fileId.value);
    await recentStore.updateFile(fileId.value, {
      ...fileState.value,
      type: 'widget',
      savedContent: content,
      savedAt
    });
  }

  /**
   * 清除已经过期的文件事件抑制记录。
   * @param now - 当前时间戳
   */
  function pruneFileSuppressions(now: number): void {
    for (let index = suppressedFileChanges.length - 1; index >= 0; index -= 1) {
      if (suppressedFileChanges[index]?.expiresAt && suppressedFileChanges[index].expiresAt <= now) {
        suppressedFileChanges.splice(index, 1);
      }
    }
  }

  /**
   * 记录一次即将触发文件监听事件的当前会话写盘。
   * @param filePath - 写入文件路径
   * @param content - 写入内容快照
   * @returns 写入操作 ID
   */
  function addFileSuppression(filePath: string, content: string): number {
    const now = Date.now();
    pruneFileSuppressions(now);
    const id = ++writeSequence;
    suppressedFileChanges.push({ id, filePath, content, expiresAt: now + FILE_CHANGE_SUPPRESSION_MS });
    if (suppressedFileChanges.length > 20) {
      suppressedFileChanges.shift();
    }
    return id;
  }

  /**
   * 清除指定写入操作的文件事件抑制记录。
   * @param id - 写入操作 ID
   */
  function clearFileSuppression(id: number): void {
    const index = suppressedFileChanges.findIndex((item: SuppressedFileChange): boolean => item.id === id);
    if (index >= 0) {
      suppressedFileChanges.splice(index, 1);
    }
  }

  /**
   * 将当前内容写回已有磁盘路径。
   * @returns 保存结果
   */
  async function saveFileToDisk(): Promise<SaveToDiskResult> {
    if (isLoading.value || loadError.value) {
      return { status: 'skipped' };
    }

    const filePath = fileState.value.path;
    if (!filePath) {
      return { status: 'skipped' };
    }

    if (serializationError.value) {
      return { status: 'failed', error: serializationError.value };
    }

    const contentToSave = fileState.value.content;
    const suppressionId = addFileSuppression(filePath, contentToSave);

    try {
      await native.writeFile(filePath, contentToSave);
      await markContentSaved(contentToSave);
      return { status: 'saved' };
    } catch (error: unknown) {
      clearFileSuppression(suppressionId);
      return { status: 'failed', error: error instanceof Error ? error : new Error('save to disk failed') };
    }
  }

  const savePolicy = useSavePolicy({
    saveStrategy: computed<EditorSaveStrategy>((): EditorSaveStrategy => editorPreferencesStore.saveStrategy),
    hasFilePath: computed((): boolean => Boolean(fileState.value.path)),
    isDirty: (): boolean => fileState.value.content !== savedContent.value,
    saveCurrentFileToDisk: saveFileToDisk
  });

  /**
   * 通过保存对话框保存当前 Widget。
   * @returns 是否保存成功
   */
  async function saveWithDialog(): Promise<boolean> {
    if (isLoading.value || loadError.value || serializationError.value) {
      return false;
    }

    const contentToSave = fileState.value.content;
    const defaultPath = fileState.value.path || getDefaultSavePath(fileState.value);
    const savedPath = await native.saveFile(contentToSave, undefined, { defaultPath });
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
    addFileSuppression(savedPath, contentToSave);
    await markContentSaved(contentToSave);
    return true;
  }

  /**
   * 通过保存对话框导出当前 Widget 副本，不改变已安装 Widget 会话路径。
   * @returns 是否成功导出副本
   */
  async function exportWidgetCopy(): Promise<boolean> {
    if (isLoading.value || loadError.value || serializationError.value) {
      return false;
    }

    const contentToSave = fileState.value.content;
    const defaultPath = fileState.value.path || getDefaultSavePath(fileState.value);
    const savedPath = await native.saveFile(contentToSave, undefined, { defaultPath });

    return Boolean(savedPath);
  }

  /**
   * 将外部文件内容写回会话和最近文件存储。
   * @param content - 外部 Widget JSON 内容
   */
  async function applyExternalContent(content: string): Promise<void> {
    const parsedContent = parseWidgetContent(content, fileState.value.path);
    if (parsedContent.parseError) {
      loadError.value = `Widget JSON 解析失败：${parsedContent.parseError}`;
      autoSave.pause();
      return;
    }

    syncingContentToData.value = true;
    data.value = parsedContent.data;
    await nextTick();
    syncingContentToData.value = false;
    loadError.value = null;
    autoSave.resume();

    fileState.value = { ...fileState.value, content };
    savedContent.value = content;
    tabsStore.clearDirty(fileId.value);
    tabsStore.clearMissing(fileId.value);
    await recentStore.updateFile(fileId.value, {
      ...fileState.value,
      type: 'widget',
      savedContent: content
    });
  }

  /**
   * 读取文件变化事件携带的最新内容。
   * @param event - 文件变化事件
   * @returns 最新内容；读取失败时返回 null
   */
  async function readChangedContent(event: FileChangeEvent): Promise<string | null> {
    if (typeof event.content === 'string') {
      return event.content;
    }

    try {
      const file = await native.readFile(event.filePath);
      return file.content;
    } catch (error: unknown) {
      return null;
    }
  }

  /**
   * 判断文件变化是否由当前会话最近一次写盘触发。
   * @param event - 文件变化事件
   * @param content - 事件对应的最新文件内容
   * @returns 是否应忽略该变化
   */
  function shouldSuppressChange(event: FileChangeEvent, content: string): boolean {
    pruneFileSuppressions(Date.now());
    return suppressedFileChanges.some((item: SuppressedFileChange): boolean => item.filePath === event.filePath && item.content === content);
  }

  /**
   * 处理当前 Widget 的外部磁盘变化。
   * @param event - 文件变化事件
   */
  async function handleFileChanged(event: FileChangeEvent): Promise<void> {
    const isContentEvent = event.type === 'change' || event.type === 'add';
    if (!isContentEvent || event.filePath !== fileState.value.path) {
      return;
    }

    const content = await readChangedContent(event);
    if (content === null || shouldSuppressChange(event, content) || content === fileState.value.content) {
      return;
    }

    if (fileState.value.content !== savedContent.value) {
      const [cancelled] = await Modal.confirm('外部修改', '当前 Widget 在外部已被修改，是否重新加载？未保存的更改将丢失。', {
        confirmText: '重新加载',
        cancelText: '忽略'
      });
      if (cancelled) {
        return;
      }
    }

    await applyExternalContent(content);
  }

  watch(
    data,
    (nextData: WidgetData): void => {
      if (syncingContentToData.value) {
        return;
      }

      const content = serializeData(nextData);
      if (content === null) {
        tabsStore.setDirty(fileId.value);
        return;
      }

      fileState.value = { ...fileState.value, content };
      syncDirtyState();
      if (fileState.value.content !== savedContent.value) {
        savePolicy.notifyContentChanged();
      }
    },
    { deep: true }
  );

  watch(
    () => fileState.value.path,
    (nextPath: string | null): void => {
      syncWatchedPath(nextPath).catch((error: unknown): void => {
        console.error('Failed to sync watched Widget path:', error);
      });
    },
    { immediate: true }
  );

  watch(
    fileId,
    (): void => {
      loadFileState().catch((error: unknown): void => {
        console.error('Failed to load Widget session:', error);
      });
    },
    { immediate: true }
  );

  /**
   * 将当前 Widget 文件同步到标签页列表。
   */
  function syncWidgetTab(): void {
    if (!fileId.value) {
      return;
    }

    tabsStore.addTab({
      id: fileId.value,
      path: routePath,
      title: currentTitle.value,
      cacheKey: `widget:${fileId.value}`
    });
  }

  watch([fileId, currentTitle], syncWidgetTab, { immediate: true });

  const unsubscribeFileChanged = native.onFileChanged((event: FileChangeEvent): void => {
    handleFileChanged(event).catch((error: unknown): void => {
      console.error('Failed to handle Widget change:', error);
    });
  });

  onScopeDispose((): void => {
    unsubscribeFileChanged();
    syncWatchedPath(null).catch((error: unknown): void => {
      console.error('Failed to unregister Widget watch:', error);
    });
  });

  /**
   * 重新加载当前 Widget 文件。
   */
  async function reload(): Promise<void> {
    await loadFileState();
  }

  /**
   * 保存当前 Widget 文件。
   */
  async function onSave(): Promise<void> {
    if (fileState.value.path) {
      await saveFileToDisk();
      return;
    }

    await saveWithDialog();
  }

  /**
   * 通过保存对话框导出当前 Widget 副本。
   */
  async function onSaveAs(): Promise<void> {
    await exportWidgetCopy();
  }

  /**
   * 拒绝重命名固定名称的已安装 Widget 配置文件。
   */
  async function onRename(): Promise<void> {
    await Modal.alert('无法重命名', '已安装 Widget 的配置文件名固定为 widget.json');
  }

  /**
   * 删除当前 Widget 最近文件记录。
   */
  async function onDelete(): Promise<void> {
    await recentStore.removeFile(fileId.value);
  }

  /**
   * 在系统文件夹中显示当前 Widget。
   */
  async function onShowInFolder(): Promise<void> {
    if (fileState.value.path) {
      await native.showItemInFolder(fileState.value.path);
    }
  }

  /**
   * 复制当前 Widget 绝对路径。
   */
  async function onCopyPath(): Promise<void> {
    if (fileState.value.path) {
      await clipboard(fileState.value.path, { successMessage: '已复制路径', trim: false });
    }
  }

  /**
   * 复制当前 Widget 相对路径。
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

  // 页面生命周期绑定只在组件 setup 上下文中注册，便于独立测试文件会话。
  if (getCurrentInstance()) {
    useBindings({
      isActive,
      actions: {
        onSave,
        onSaveAs,
        onRename,
        onDelete
      }
    });

    onActivated((): void => {
      isActive.value = true;
    });

    onDeactivated((): void => {
      isActive.value = false;
    });
  }

  return {
    fileId,
    isActive,
    isLoading,
    loadError,
    fileState,
    data,
    currentTitle,
    reload,
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
