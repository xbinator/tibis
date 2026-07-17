/**
 * @file useSession.ts
 * @description 编排编辑器页面的文件加载、保存、监听与标签状态。
 */
import type { EditorFile } from '../types';
import type { Ref } from 'vue';
import { computed, nextTick, onActivated, onDeactivated, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { customAlphabet } from 'nanoid';
import { useClipboard } from '@/hooks/useClipboard';
import { useFileAutoSave } from '@/hooks/useFileAutoSave';
import { resolveRouteTabInfo } from '@/router/cache';
import { native } from '@/shared/platform';
import type { ReadFileResult } from '@/shared/platform/native/types';
import type { StoredDocumentRecord, StoredFile } from '@/shared/storage';
import { useEditorFileWatchStore } from '@/stores/editor/fileWatch';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';
import { useRecentStore } from '@/stores/workspace/recent';
import { useTabsStore } from '@/stores/workspace/tabs';
import { resolveFileTitle } from '@/utils/file/title';
import { Modal } from '@/utils/modal';
import { getDefaultSavePath, getRecoveredSavePath, parseFileName, replaceFileName } from '../utils/filePath';
import { resolveFileReconcileDecision } from '../utils/reconcileFileContent';
import { useFileState } from './useFileState';
import { useFileWatcher } from './useFileWatcher';
import { type SaveToDiskResult, useSavePolicy } from './useSavePolicy';

/**
 * 编辑器视图模式：富文本编辑或纯源码编辑。
 */
type ViewMode = 'rich' | 'source';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);

/**
 * 判断文件型记录是否为普通编辑器文件。
 * @param record - 文件型记录
 * @returns 是否为普通文件记录
 */
function isStoredFileRecord(record: StoredDocumentRecord | undefined): record is StoredFile {
  return record?.type === 'file';
}

/**
 * 编排单个编辑器会话的生命周期：文件加载、磁盘调和、命令面板动作、缓存激活/停用。
 *
 * 本 hook 不直接管理编辑器内容，仅作为胶水层串联：
 * 1. `useFileState`：文件状态与本地存储同步
 * 2. `useFileWatcher`：磁盘文件监听与变更回调
 * 3. `useFileAutoSave`：自动保存节流
 * 4. `useSavePolicy`：保存策略（Ctrl+S、关闭、blur）
 * 5. 路由 + 标签 store + 最近文件 store
 *
 * @param fileId - 当前会话对应的文件 ID（响应式，路由切换时更新）
 * @returns 暴露给模板的状态与动作
 */
export function useSession(fileId: Ref<string>) {
  const route = useRoute();
  const router = useRouter();

  const tabsStore = useTabsStore();
  const recentStore = useRecentStore();
  const fileWatchStore = useEditorFileWatchStore();
  const editorPreferencesStore = useEditorPreferencesStore();
  const { clipboard } = useClipboard();
  const { switchWatchedFile, clearWatchedFile, setOnFileChanged, setIsDirty, finishReload, suppressNextChange, clearSuppressedChange } = useFileWatcher();

  const sessionPath = ref(route.fullPath);
  const sessionCacheKey = ref(resolveRouteTabInfo(route).cacheKey);
  const fileState = ref<EditorFile>({ id: '', name: '', content: '', ext: 'md', path: null });
  const viewState = reactive<{ mode: ViewMode }>({ mode: 'rich' });
  const isActive = ref(true);

  const autoSave = useFileAutoSave(fileState);

  const currentTitle = computed(() => resolveFileTitle(fileState.value));
  // 文件状态相关的存储同步、保存收尾和外部文件回填都收口到这里，useSession 只做流程编排。
  const fileStateActions = useFileState({
    fileId,
    fileState,
    switchWatchedFile,
    autoSave,
    finishReload
  });
  // 用版本号丢弃过期的异步加载结果，避免快速切换标签时旧请求覆盖新文件状态。
  let loadVersion = 0;
  // 记录当前会话已经注册到全局 watcher 的文件 ID，避免路由复用时旧 ID 残留。
  let registeredWatchFileId: string | null = null;

  setIsDirty(() => tabsStore.isDirty(fileId.value));

  /**
   * 同步当前会话在全局 watcher 中的路径引用。
   * @param currentFileId - 当前编辑器文件 ID
   * @param filePath - 当前文件磁盘路径
   */
  async function syncGlobalWatch(currentFileId: string, filePath: string | null): Promise<void> {
    if (registeredWatchFileId && registeredWatchFileId !== currentFileId) {
      await fileWatchStore.unregister(registeredWatchFileId);
      registeredWatchFileId = null;
    }

    if (!filePath) {
      if (registeredWatchFileId === currentFileId) {
        await fileWatchStore.unregister(currentFileId);
        registeredWatchFileId = null;
      }
      return;
    }

    await fileWatchStore.register(currentFileId, filePath);
    registeredWatchFileId = currentFileId;
  }

  /**
   * 更新当前会话在全局 watcher 中的路径引用。
   * @param currentFileId - 当前编辑器文件 ID
   * @param filePath - 新的磁盘路径
   */
  async function updateGlobalWatchPath(currentFileId: string, filePath: string): Promise<void> {
    if (registeredWatchFileId && registeredWatchFileId !== currentFileId) {
      await fileWatchStore.unregister(registeredWatchFileId);
    }

    await fileWatchStore.updatePath(currentFileId, filePath);
    registeredWatchFileId = currentFileId;
  }

  /**
   * 释放当前会话在全局 watcher 中的路径引用。
   */
  async function unregisterGlobalWatch(): Promise<void> {
    if (!registeredWatchFileId) return;

    await fileWatchStore.unregister(registeredWatchFileId);
    registeredWatchFileId = null;
  }

  /**
   * 把当前会话的元信息（路径、标题、缓存 key）同步到标签 store。
   * 监听 fileId / 名称 / 扩展名变化时触发，保证标签始终反映最新状态。
   */
  function updateTab(): void {
    if (!fileId.value) return;

    tabsStore.addTab({ id: fileId.value, path: sessionPath.value, title: currentTitle.value, cacheKey: sessionCacheKey.value });
  }

  setOnFileChanged(fileStateActions.handleExternalFileChange);

  const savePolicy = useSavePolicy({
    saveStrategy: computed(() => editorPreferencesStore.saveStrategy),
    hasFilePath: computed(() => Boolean(fileState.value.path)),
    isDirty: () => tabsStore.isDirty(fileId.value),
    // eslint-disable-next-line no-use-before-define
    saveCurrentFileToDisk
  });

  /**
   * 通过保存对话框选择目标路径并完成文件保存。
   * @returns 是否保存成功
   */
  async function saveWithDialog(defaultPathOverride?: string): Promise<boolean> {
    const defaultPath = defaultPathOverride || fileState.value.path || getDefaultSavePath(fileState.value);
    const contentToSave = fileState.value.content;

    if (fileState.value.path) {
      suppressNextChange(fileState.value.path, contentToSave);
    }

    const savedPath = await native.saveFile(contentToSave, undefined, { defaultPath });

    if (!savedPath) {
      clearSuppressedChange(fileState.value.path ?? undefined);
      return false;
    }

    suppressNextChange(savedPath, contentToSave);
    await fileStateActions.finalizeSave(savedPath);
    await updateGlobalWatchPath(fileId.value, savedPath);
    tabsStore.clearMissing(fileId.value);
    return true;
  }

  /**
   * 检查指定路径当前是否已有可读文件。
   * @param filePath - 需要检查的文件路径
   * @returns 文件是否存在且可读
   */
  async function isReadableFilePath(filePath: string): Promise<boolean> {
    try {
      await native.readFile(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 将当前编辑内容写回已有路径，并恢复标签和文件监听状态。
   * @param filePath - 写入目标路径
   */
  async function restoreCurrentFileAtPath(filePath: string): Promise<void> {
    suppressNextChange(filePath, fileState.value.content);
    await native.writeFile(filePath, fileState.value.content);
    await fileStateActions.markCurrentContentSaved();
    await switchWatchedFile(filePath);
    await updateGlobalWatchPath(fileId.value, filePath);
    tabsStore.clearMissing(fileId.value);
  }

  /**
   * 仅在已有磁盘路径时执行一次无交互写盘。
   * @returns 本次写盘结果
   */
  async function saveCurrentFileToDisk(): Promise<SaveToDiskResult> {
    const filePath = fileState.value.path;

    if (!filePath) {
      return { status: 'skipped' };
    }

    try {
      suppressNextChange(filePath, fileState.value.content);
      await native.writeFile(filePath, fileState.value.content);
      await fileStateActions.markCurrentContentSaved();
      tabsStore.clearMissing(fileId.value);
      return { status: 'saved' };
    } catch (error) {
      return {
        status: 'failed',
        error: error instanceof Error ? error : new Error('save to disk failed')
      };
    }
  }

  /**
   * 保存已被外部删除的文件，优先恢复原路径，无法恢复时再走另存为。
   */
  async function saveMissingFile(): Promise<void> {
    const originalPath = fileState.value.path;

    if (!originalPath) {
      await saveWithDialog();
      return;
    }

    if (await isReadableFilePath(originalPath)) {
      const [cancelled] = await Modal.confirm('文件已存在', '原文件路径已重新出现同名文件。是否覆盖它？', {
        confirmText: '覆盖',
        cancelText: '取消'
      });

      if (cancelled) {
        return;
      }
    }

    try {
      await restoreCurrentFileAtPath(originalPath);
    } catch {
      await saveWithDialog(getRecoveredSavePath(originalPath));
    }
  }

  /**
   * 统一的保存入口。
   * 1. 确保存在可写入的存储记录
   * 2. 文件标记为 missing（外部被删）时走恢复流程
   * 3. 已有路径直接写盘
   * 4. 其余情况弹出系统保存对话框
   */
  async function onSave(): Promise<void> {
    await fileStateActions.ensureStoredFile();

    if (tabsStore.isMissing(fileId.value)) {
      await saveMissingFile();
      return;
    }

    if (fileState.value.path) {
      await saveCurrentFileToDisk();
      return;
    }

    await saveWithDialog();
  }

  /**
   * 另存为：总是走系统保存对话框，允许选择新路径。
   */
  async function onSaveAs(): Promise<void> {
    await fileStateActions.ensureStoredFile();

    await saveWithDialog();
  }

  /**
   * 重命名当前文件。
   * - 已有磁盘路径：先在系统层重命名文件，再更新本地状态和全局 watcher
   * - 未保存文档：只更新内存中的名称与存储记录
   */
  async function onRename(): Promise<void> {
    await fileStateActions.ensureStoredFile();

    const [cancelled, newName] = await Modal.input('重命名', { defaultValue: fileState.value.name, placeholder: '请输入文件名', autofocus: true });

    const normalizedName = String(newName || '').trim();

    if (cancelled || !normalizedName || normalizedName === fileState.value.name) {
      return;
    }

    if (fileState.value.path) {
      const nextPath = replaceFileName(fileState.value.path, normalizedName, fileState.value.ext);

      await native.renameFile(fileState.value.path, nextPath);
      fileState.value.path = nextPath;
      await switchWatchedFile(nextPath);
      await updateGlobalWatchPath(fileId.value, nextPath);
    }

    fileState.value.name = normalizedName;
    await fileStateActions.persistCurrentFile();
  }

  /**
   * 复制当前文档为新文件并跳转到新标签。
   * 注意：副本是未保存的（path = null），后续需要走另存为落盘。
   */
  async function onDuplicate(): Promise<void> {
    const nextId = nanoid();
    const nextName = fileState.value.name ? `${fileState.value.name}-副本` : '';

    await recentStore.addFile({ ...fileState.value, type: 'file' as const, id: nextId, name: nextName, path: null, savedContent: fileState.value.content });

    await router.push({ name: 'editor', params: { id: nextId } });
  }

  /**
   * 在系统文件管理器中定位当前文件（仅对已落盘文件生效）。
   */
  async function onShowInFolder(): Promise<void> {
    if (!fileState.value.path) {
      return;
    }

    await native.showItemInFolder(fileState.value.path);
  }

  /**
   * 复制当前文件绝对路径。
   */
  async function onCopyPath(): Promise<void> {
    if (!fileState.value.path) {
      return;
    }

    await clipboard(fileState.value.path, { successMessage: '已复制路径', trim: false });
  }

  /**
   * 复制相对当前工作目录的路径。
   */
  async function onCopyRelativePath(): Promise<void> {
    if (!fileState.value.path) {
      return;
    }

    const relativePath = await native.getRelativePath(fileState.value.path);
    const normalizedPath = relativePath || fileState.value.path;
    await clipboard(normalizedPath, { successMessage: '已复制相对路径', trim: false });
  }

  /**
   * 删除当前文件/文档。
   * - 先暂停自动保存，避免删除过程被中间保存覆盖
   * - 已落盘：释放全局 watcher、停用本地文件监听、把磁盘文件移入回收站
   * - 未落盘：仅删除本地记录和标签
   * - 最后跳转到欢迎页
   */
  async function onDelete(): Promise<void> {
    autoSave.pause();

    const path = fileState.value.path || '';

    const [cancelled] = await Modal.delete(path ? `确定要删除文件 "${currentTitle.value}" 吗？` : `确定要删除未保存文档 "${currentTitle.value}" 吗？`);

    if (cancelled) return;

    if (path) {
      // 释放全局 watcher 引用，再停用本地文件监听
      await unregisterGlobalWatch();
      await clearWatchedFile();
      // 将磁盘文件移入回收站
      await native.trashFile(path);
    }
    // 清理本地存储记录、标签页并退出到欢迎页
    await recentStore.removeFile(fileId.value);
    tabsStore.removeTab(fileId.value);

    await router.push('/welcome');
  }

  /**
   * 把磁盘上的内容回填到当前会话，标记为已保存状态。
   * 文件名/扩展名优先取自当前 path（确保和保存路径一致），缺失时回退到磁盘返回的元数据。
   *
   * @param diskFile - 从磁盘读取的最新文件内容与元数据
   */
  async function applyDiskState(diskFile: ReadFileResult): Promise<void> {
    const diskMeta = fileState.value.path ? parseFileName(fileState.value.path) : { name: fileState.value.name, ext: fileState.value.ext };

    fileState.value.content = diskFile.content;
    fileState.value.name = diskMeta.name || fileState.value.name;
    fileState.value.ext = diskMeta.ext || diskFile.ext || fileState.value.ext;
    fileStateActions.savedContent.value = diskFile.content;
    fileStateActions.hasUnsavedDraft.value = false;
    tabsStore.clearDirty(fileId.value);
    await fileStateActions.persistCurrentFile();
  }

  /**
   * 启动时调和本地存储与磁盘内容，避免出现"磁盘改了但本地还是旧值"的情况。
   *
   * 决策由 `resolveFileReconcileDecision` 给出，约定：
   * - `keepDraft`：本地草稿与磁盘一致或无冲突，保持现状
   * - `markSaved`：磁盘没有改动但本地误标脏，把基线对齐到当前内容
   * - `applyDisk`：磁盘是更新源，直接覆盖（用于文件被外部修改等场景）
   * - `confirm`：本地有未保存草稿 + 磁盘也已变化，弹窗让用户二选一
   */
  async function reconcileStoredFileWithDisk(): Promise<void> {
    if (!fileState.value.path) return;

    let diskFile: ReadFileResult;

    try {
      diskFile = await native.readFile(fileState.value.path);
    } catch {
      // 读取失败（最常见的就是文件被外部删除），交给上层 missing 流程处理。
      return;
    }

    if (!fileStateActions.hasSavedContentBaseline.value) {
      // 第一次打开这个文件：以磁盘内容作为基线，避免误判为冲突。
      fileStateActions.savedContent.value = diskFile.content;
      fileStateActions.hasSavedContentBaseline.value = true;
      fileStateActions.hasUnsavedDraft.value = false;
      fileStateActions.syncDirtyState();
      await fileStateActions.persistCurrentFile();
      return;
    }

    const currentContent = fileState.value.content;
    const lastSavedContent = fileStateActions.savedContent.value;
    const diskMeta = parseFileName(fileState.value.path);
    const decision = resolveFileReconcileDecision({
      currentContent,
      savedContent: lastSavedContent,
      currentName: fileState.value.name,
      currentExt: fileState.value.ext,
      diskFile,
      diskName: diskMeta.name,
      diskExt: diskMeta.ext,
      hasUnsavedDraft: fileStateActions.hasUnsavedDraft.value
    });

    if (decision === 'keepDraft') {
      return;
    }

    if (decision === 'markSaved') {
      fileStateActions.savedContent.value = currentContent;
      fileStateActions.hasUnsavedDraft.value = false;
      tabsStore.clearDirty(fileId.value);
      await fileStateActions.persistCurrentFile();
      return;
    }

    if (decision === 'applyDisk') {
      await applyDiskState(diskFile);
      return;
    }

    // 决策为 confirm：本地草稿和磁盘都有未同步的改动，交给用户裁决。
    const [cancelled] = await Modal.confirm('发现内容冲突', '当前文件有未保存草稿，同时磁盘内容也已变化。是否使用磁盘中的最新内容？', {
      confirmText: '使用磁盘内容',
      cancelText: '保留本地草稿'
    });

    // 确认按钮的语义是"用磁盘内容"，所以 cancelled=false 时采用磁盘版本。
    if (!cancelled) {
      await applyDiskState(diskFile);
    }
  }

  /**
   * 加载并初始化一个文件会话。每次 fileId 变化都会重新执行。
   *
   * 关键点：
   * - 用 `loadVersion` 丢弃过期的异步结果，避免快速切换标签时旧请求覆盖新文件
   * - 加载期间暂停自动保存和 dirty 跟踪，初始化回填不应被识别为用户编辑
   * - 文件被识别为 widget 类型时直接跳转到对应路由
   * - 加载完成后与磁盘做一次 reconcile，处理外部修改
   */
  async function loadFileState(): Promise<void> {
    // 1. 自增版本号，标记本次加载请求；后续 await 之前都需要校验版本号。
    const currentVersion = ++loadVersion;
    // 2. 暂停自动保存：避免加载过程中触发自动保存覆盖刚刚初始化好的内容。
    autoSave.pause();
    // 3. 暂停 dirty 跟踪：把初始化回填的数据视为"基线"而不是"用户编辑"。
    fileStateActions.pauseDirtyTracking();

    try {
      // 4. 锁定本次请求对应的 fileId，后续可能因路由切换而变化。
      const currentFileId = fileId.value;

      const storedRecord = await recentStore.getFileById(currentFileId);
      // 5. 版本号校验：如果在 await 期间产生了新的加载请求，立即放弃本次结果。
      if (currentVersion !== loadVersion) return;

      if (storedRecord?.type === 'widget') {
        await router.push({ name: 'widget', params: { id: currentFileId } });
        return;
      }

      const stored = isStoredFileRecord(storedRecord) ? storedRecord : undefined;
      // 6. 初始化 fileState（清空旧值、写入存储记录、设定扩展名等）。
      await fileStateActions.initializeFileState(stored, currentFileId);

      // 7. 再次校验版本号，再进入磁盘调和阶段。
      if (currentVersion !== loadVersion) return;
      await reconcileStoredFileWithDisk();

      // 8. 调和后再次校验版本号，然后接管全局 watcher 和本地文件监听。
      if (currentVersion !== loadVersion) return;
      await syncGlobalWatch(currentFileId, fileState.value.path);
      if (isActive.value) {
        await switchWatchedFile(fileState.value.path);
      }

      // 9. 最后再做一次版本号校验，并等待 Vue 更新周期让编辑器完成挂载。
      if (currentVersion !== loadVersion) return;
      await nextTick();
    } finally {
      // 10. 仅在本次请求仍然有效时才恢复跟踪，避免旧请求提前解除新请求的保护。
      if (currentVersion === loadVersion) {
        fileStateActions.resumeDirtyTracking();
        autoSave.resume();
      }
    }
  }

  watch(fileId, () => loadFileState(), { immediate: true });

  watch([fileId, () => fileState.value.name, () => fileState.value.ext], updateTab);

  watch(
    () => fileState.value.content,
    (): void => {
      savePolicy.notifyContentChanged();
    }
  );

  /**
   * 激活缓存中的编辑器实例，并接管当前文件监听。
   */
  async function activate(): Promise<void> {
    isActive.value = true;
    await switchWatchedFile(fileState.value.path);
  }

  /**
   * 停用缓存中的编辑器实例，并释放当前文件监听。
   */
  async function deactivate(): Promise<void> {
    isActive.value = false;
    await clearWatchedFile();
  }

  /**
   * 释放会话占用的全局资源：取消全局文件 watcher 引用，停用本地文件监听。
   * 由 `onUnmounted` 自动调用，也可在外部手动调用（例如路由被强制销毁时）。
   */
  async function dispose(): Promise<void> {
    await unregisterGlobalWatch();
    await clearWatchedFile();
  }

  onActivated(() => {
    activate();
  });

  onDeactivated(() => {
    deactivate();
  });

  onUnmounted(() => {
    dispose();
  });

  const actions = {
    onEditorBlur: savePolicy.handleEditorBlur,
    onSave,
    onSaveAs,
    onRename,
    onDelete,
    onShowInFolder,
    onCopyPath,
    onCopyRelativePath,
    onDuplicate
  };

  return {
    fileState,
    viewState,
    currentTitle,
    actions,
    loadFileState,
    dispose
  };
}
