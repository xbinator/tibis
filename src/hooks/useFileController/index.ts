/**
 * @file index.ts
 * @description 提供文件状态、业务数据、保存状态与标签脏状态的公共控制器入口。
 */
import type {
  FileControllerActions,
  FileControllerErrorContext,
  FileControllerErrorSource,
  FileControllerOptions,
  FileControllerResult,
  FileControllerSnapshot,
  FileLoadCandidates,
  FileOperationSnapshot
} from './types';
import type { Ref } from 'vue';
import { computed, getCurrentInstance, getCurrentScope, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue';
import type { FileChangeEvent, FileState } from '@/shared/platform/native/types';
import type { EditorSaveStrategy } from '@/stores/editor/preferences';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';
import { useRecentStore } from '@/stores/workspace/recent';
import { useTabsStore } from '@/stores/workspace/tabs';
import { asyncTo } from '@/utils/asyncTo';
import { useDiskSave } from './useDiskSave';
import { useDraftPersistence } from './useDraftPersistence';
import { useFileWatch } from './useFileWatch';

/**
 * 创建通用文件控制器。
 * @param options - 文件 ID 与文件类型事件
 * @returns 文件状态、保存状态与公共动作
 */
export function useFileController<TData>(options: FileControllerOptions<TData>): FileControllerResult<TData> {
  const { fileId, events } = options;
  const tabsStore = useTabsStore();
  const recentStore = useRecentStore();
  const editorPreferencesStore = useEditorPreferencesStore();
  const initial = events.onCreate({ fileId: fileId.value });
  const fileState = ref<FileState>({ ...initial.fileState });
  const data = ref<TData>(initial.data) as Ref<TData>;
  const savedContent = ref<string>(initial.savedContent);
  const isLoading = ref<boolean>(false);
  const loadError = ref<Error | null>(null);
  const serializationError = ref<Error | null>(null);
  const sessionVersion = ref<number>(0);
  const contentRevision = ref<number>(0);
  const status = {
    syncingData: false,
    disposing: false,
    deleting: false,
    disposed: false
  };
  const tasks = {
    dispose: null as Promise<void> | null,
    external: Promise.resolve()
  };
  const runtime = {
    stopFileIdWatch: null as (() => void) | null,
    pauseReasonSeed: 0,
    activeLoadPause: null as string | null
  };

  /**
   * 为一次异步文件操作创建独立的写盘暂停令牌。
   * @param scope - 暂停所属操作类别
   * @returns 当前控制器内唯一的暂停原因
   */
  function onCreatePauseReason(scope: string): string {
    runtime.pauseReasonSeed += 1;
    return `${scope}:${runtime.pauseReasonSeed}`;
  }

  const isSaved = computed<boolean>((): boolean => serializationError.value === null && fileState.value.content === savedContent.value);
  const isMissing = computed<boolean>((): boolean => tabsStore.isMissing(fileId.value));

  /**
   * 将当前保存状态同步到标签脏状态。
   */
  function onSyncDirty(): void {
    if (isSaved.value) {
      tabsStore.clearDirty(fileId.value);
      return;
    }

    tabsStore.setDirty(fileId.value);
  }

  /**
   * 把持久化错误交给页面事件层显示或记录。
   * @param source - 失败操作来源
   * @param error - 归一化错误
   */
  function onReportError(source: FileControllerErrorSource, error: Error): void {
    const context: FileControllerErrorContext = { source, error };
    if (events.onError) {
      events.onError(context);
      return;
    }

    console.error(`File controller ${source} failed:`, error);
  }

  /**
   * 原子应用一个控制器快照。
   * @param snapshot - 待应用的完整文件快照
   */
  function onApplySnapshot(snapshot: FileControllerSnapshot<TData>): void {
    status.syncingData = true;
    fileState.value = { ...snapshot.fileState };
    data.value = snapshot.data;
    savedContent.value = snapshot.savedContent;
    contentRevision.value += 1;
    serializationError.value = null;
    status.syncingData = false;
    onSyncDirty();
  }

  /**
   * 捕获公共文件动作的身份与内容快照。
   * @returns 当前文件操作快照
   */
  function onCaptureOperation(): FileOperationSnapshot {
    return {
      fileId: fileId.value,
      sessionVersion: sessionVersion.value,
      contentRevision: contentRevision.value,
      path: fileState.value.path,
      content: fileState.value.content
    };
  }

  /**
   * 判断控制器是否处于终态（已 dispose、正在 dispose 或正在删除）。
   * @returns 是否已不再接受新副作用
   */
  function isTerminal(): boolean {
    return status.disposed || status.disposing || status.deleting;
  }

  /**
   * 在生命周期切换期间校验不含运行状态的文件身份。
   * @param snapshot - 操作开始时的文件快照
   * @returns 文件 ID、会话版本与路径是否未变化
   */
  function onHasIdentity(snapshot: FileOperationSnapshot): boolean {
    return snapshot.fileId === fileId.value && snapshot.sessionVersion === sessionVersion.value && snapshot.path === fileState.value.path;
  }

  /**
   * 判断异步副作用是否仍属于当前文件身份与路径。
   * @param snapshot - 操作开始时的文件快照
   * @returns 是否仍可应用路径类副作用结果
   */
  function onIsCurrentIdentity(snapshot: FileOperationSnapshot): boolean {
    return !isTerminal() && onHasIdentity(snapshot);
  }

  /**
   * 判断异步操作结果是否仍属于当前文件版本。
   * @param snapshot - 操作开始时的文件快照
   * @returns 是否允许应用结果
   */
  function onIsCurrentOperation(snapshot: FileOperationSnapshot): boolean {
    return onIsCurrentIdentity(snapshot) && snapshot.contentRevision === contentRevision.value && snapshot.content === fileState.value.content;
  }

  /**
   * 将选定的文件状态解析为完整控制器快照。
   * @param nextFileState - 最终采用的文件状态
   * @param nextSavedContent - 最终保存基线
   * @returns 可原子应用的控制器快照
   */
  function onParseSnapshot(nextFileState: FileState, nextSavedContent: string): FileControllerSnapshot<TData> {
    const [parseError, parsedData] = events.onParse({ content: nextFileState.content, path: nextFileState.path });
    if (parseError) throw parseError;

    return { fileState: { ...nextFileState }, data: parsedData, savedContent: nextSavedContent };
  }

  /**
   * 协调草稿、保存基线与磁盘候选内容。
   * @param candidates - 加载事件返回的候选内容
   * @param loadingFileId - 本轮加载所属文件 ID
   * @returns 最终可安全应用的快照
   */
  async function onResolveInitial(candidates: FileLoadCandidates, loadingFileId: string): Promise<FileControllerSnapshot<TData>> {
    const { draft, disk } = candidates;
    if (!draft && !disk) {
      return events.onCreate({ fileId: loadingFileId });
    }

    if (draft && !disk) {
      return onParseSnapshot(draft.fileState, draft.savedContent ?? draft.fileState.content);
    }

    if (disk && !draft) {
      return onParseSnapshot(disk.fileState, disk.fileState.content);
    }

    if (!draft || !disk) {
      return events.onCreate({ fileId: loadingFileId });
    }

    const baseline = draft.savedContent;
    if (baseline === null) {
      return onParseSnapshot(disk.fileState, disk.fileState.content);
    }

    const draftChanged = draft.fileState.content !== baseline;
    const diskChanged = disk.fileState.content !== baseline;
    if (draft.fileState.content === disk.fileState.content) {
      return onParseSnapshot(disk.fileState, disk.fileState.content);
    }

    if (draftChanged && diskChanged) {
      const decision = await events.onResolveConflict({ draft, disk });
      return decision ? onParseSnapshot(draft.fileState, baseline) : onParseSnapshot(disk.fileState, disk.fileState.content);
    }

    if (draftChanged) {
      return onParseSnapshot(draft.fileState, baseline);
    }

    return onParseSnapshot(disk.fileState, disk.fileState.content);
  }

  const draftPersistence = useDraftPersistence({ fileState, data, savedContent, onBuildRecord: events.onBuildRecord });

  /** 文件监听初始化完成后接管的异步变化处理器。 */
  let onExternalHandler: ((event: FileChangeEvent) => Promise<void>) | null = null;

  /**
   * 接收文件监听模块转发的外部变化。
   * @param event - 当前路径文件变化
   */
  function onExternalChange(event: FileChangeEvent): void {
    // 文件事件按到达顺序串行处理，确保突发 change 最终以最新事件为准。
    tasks.external = tasks.external.then(async (): Promise<void> => {
      if (onExternalHandler) {
        await asyncTo(onExternalHandler(event));
      }
    });
  }

  const fileWatch = useFileWatch({
    fileId,
    sessionVersion,
    onExternalChange,
    onError: (error: Error): void => onReportError('watch', error)
  });

  /**
   * 提交成功写入的精确内容快照。
   * @param snapshot - 已写入磁盘的文件操作快照
   */
  function onCommitSnapshot(snapshot: FileOperationSnapshot): void {
    const isCurrentSession = snapshot.fileId === fileId.value && snapshot.sessionVersion === sessionVersion.value;
    const isCurrentPath = snapshot.path === fileState.value.path;
    if (!isCurrentSession || !isCurrentPath) {
      return;
    }

    savedContent.value = snapshot.content;
    tabsStore.clearMissing(fileId.value);
    onSyncDirty();
    draftPersistence.onScheduleDraft();
  }

  const diskSave = useDiskSave({
    fileId,
    fileState,
    saveStrategy: computed<EditorSaveStrategy>((): EditorSaveStrategy => editorPreferencesStore.saveStrategy),
    sessionVersion,
    contentRevision,
    isDirty: (): boolean => !isSaved.value,
    canAutoWrite: (): boolean => fileWatch.isAutoWriteAllowed.value,
    onWriteFile: events.onWriteFile,
    onCommitSnapshot,
    onBeforeWrite: fileWatch.onSuppressWrite,
    onWriteFailed: fileWatch.onClearSuppression
  });

  /**
   * 释放指定加载操作的写盘暂停，并清理当前加载令牌。
   * @param loadPause - 加载操作持有的暂停原因
   */
  function onReleaseLoadPause(loadPause: string): void {
    diskSave.onResumeSave(loadPause);
    if (runtime.activeLoadPause === loadPause) {
      runtime.activeLoadPause = null;
      isLoading.value = false;
    }
  }

  const stopDraftErrorWatch = watch(
    draftPersistence.draftError,
    (error: Error | null): void => {
      if (error) onReportError('draft', error);
    },
    { flush: 'sync' }
  );
  const stopSaveErrorWatch = watch(
    diskSave.saveError,
    (error: Error | null): void => {
      if (error) onReportError('save', error);
    },
    { flush: 'sync' }
  );

  const stopDataWatch = watch(
    data,
    (nextData: TData): void => {
      if (status.syncingData || isTerminal()) {
        return;
      }

      try {
        fileState.value.content = events.onSerialize({ data: nextData, path: fileState.value.path });
        serializationError.value = null;
        contentRevision.value += 1;
        // 加载或解析错误期间只更新内存状态，禁止把不完整状态写入草稿或磁盘。
        if (!isLoading.value && !loadError.value) {
          draftPersistence.onScheduleDraft();
          diskSave.onScheduleSave();
        }
      } catch (error: unknown) {
        serializationError.value = error instanceof Error ? error : new Error('serialize file data failed');
      }

      onSyncDirty();
    },
    { deep: true, flush: 'sync' }
  );

  /**
   * 重新加载当前文件的初始候选内容。
   */
  async function onReload(): Promise<void> {
    if (isTerminal()) {
      return;
    }

    const loadingFileId = fileId.value;
    const loadingRevision = contentRevision.value;
    const previousPath = fileState.value.path;
    const currentVersion = sessionVersion.value + 1;
    const loadPause = onCreatePauseReason('load');
    if (runtime.activeLoadPause) {
      diskSave.onResumeSave(runtime.activeLoadPause);
    }
    runtime.activeLoadPause = loadPause;
    sessionVersion.value = currentVersion;
    isLoading.value = true;
    loadError.value = null;
    await diskSave.onPauseSave(loadPause);
    if (currentVersion !== sessionVersion.value || loadingFileId !== fileId.value || isTerminal()) {
      onReleaseLoadPause(loadPause);
      return;
    }

    await fileWatch.onSwitchPath(null);
    const [error, candidates] = await asyncTo(events.onLoad({ fileId: fileId.value, sessionVersion: currentVersion }));

    if (currentVersion !== sessionVersion.value || loadingFileId !== fileId.value || isTerminal()) {
      onReleaseLoadPause(loadPause);
      return;
    }

    if (error) {
      loadError.value = error;
      isLoading.value = false;
      await fileWatch.onSwitchPath(previousPath);
      onReleaseLoadPause(loadPause);
      return;
    }

    if (candidates.error) {
      loadError.value = candidates.error;
      isLoading.value = false;
      await fileWatch.onSwitchPath(previousPath);
      onReleaseLoadPause(loadPause);
      return;
    }

    if (candidates.aborted) {
      onReleaseLoadPause(loadPause);
      return;
    }

    const [resolveError, snapshot] = await asyncTo(onResolveInitial(candidates, loadingFileId));
    if (currentVersion !== sessionVersion.value || loadingFileId !== fileId.value || isTerminal()) {
      onReleaseLoadPause(loadPause);
      return;
    }
    if (resolveError) {
      loadError.value = resolveError;
      isLoading.value = false;
      await fileWatch.onSwitchPath(previousPath);
      onReleaseLoadPause(loadPause);
      return;
    }

    if (loadingRevision !== contentRevision.value) {
      // 加载期间的新编辑保留内容，但仍接管已加载文件的路径、名称和磁盘基线。
      const currentContent = fileState.value.content;
      fileState.value = { ...snapshot.fileState, content: currentContent };
      savedContent.value = snapshot.savedContent;
      onSyncDirty();
      await fileWatch.onSwitchPath(fileState.value.path ?? previousPath);
      if (currentVersion !== sessionVersion.value || loadingFileId !== fileId.value || isTerminal()) {
        onReleaseLoadPause(loadPause);
        return;
      }
      if (candidates.missing) {
        tabsStore.markMissing(fileId.value);
        await diskSave.onPauseSave('missing');
      } else {
        tabsStore.clearMissing(fileId.value);
        diskSave.onResumeSave('missing');
      }
      draftPersistence.onScheduleDraft();
      await draftPersistence.onFlushDraft();
      if (currentVersion !== sessionVersion.value || loadingFileId !== fileId.value || isTerminal()) {
        onReleaseLoadPause(loadPause);
        return;
      }
      onReleaseLoadPause(loadPause);
      diskSave.onScheduleSave();
      return;
    }

    onApplySnapshot(snapshot);
    await fileWatch.onSwitchPath(fileState.value.path);
    if (currentVersion !== sessionVersion.value || loadingFileId !== fileId.value || isTerminal()) {
      onReleaseLoadPause(loadPause);
      return;
    }
    if (candidates.missing) {
      tabsStore.markMissing(fileId.value);
      await diskSave.onPauseSave('missing');
    } else {
      tabsStore.clearMissing(fileId.value);
      diskSave.onResumeSave('missing');
    }
    // 加载后的最终调和结果必须显式持久化，不能依赖数据 watcher 的副作用。
    draftPersistence.onScheduleDraft();
    await draftPersistence.onFlushDraft();
    if (currentVersion !== sessionVersion.value || loadingFileId !== fileId.value || isTerminal()) {
      onReleaseLoadPause(loadPause);
      return;
    }
    onReleaseLoadPause(loadPause);
  }

  /**
   * 处理外部文件被删除事件：暂停保存并进入 missing 状态。
   */
  async function onHandleUnlink(): Promise<void> {
    await diskSave.onPauseSave('missing');
  }

  /**
   * 处理外部新增文件事件：若当前处于 missing 状态则重新加载恢复。
   */
  async function onHandleAdd(): Promise<void> {
    if (isMissing.value) {
      await onReload();
    }
  }

  /**
   * 处理外部文件内容变化事件：含冲突检测与重新解析流程。
   * @param event - 携带新内容的 change 事件
   */
  async function onHandleChange(event: FileChangeEvent): Promise<void> {
    if (typeof event.content !== 'string') {
      return;
    }

    const operation = onCaptureOperation();
    const externalPause = onCreatePauseReason('external');
    await diskSave.onPauseSave(externalPause);
    if (!onIsCurrentOperation(operation)) {
      diskSave.onResumeSave(externalPause);
      return;
    }

    if (!isSaved.value) {
      const [conflictError, decision] = await asyncTo(
        events.onResolveConflict({
          draft: { fileState: { ...fileState.value }, savedContent: savedContent.value },
          disk: { fileState: { ...fileState.value, content: event.content } }
        })
      );
      if (conflictError) {
        loadError.value = conflictError;
        diskSave.onResumeSave(externalPause);
        return;
      }
      if (!onIsCurrentOperation(operation)) {
        diskSave.onResumeSave(externalPause);
        return;
      }
      if (decision) {
        diskSave.onResumeSave(externalPause);
        diskSave.onScheduleSave();
        return;
      }
    }

    const [parseError, nextData] = events.onParse({ content: event.content, path: fileState.value.path });
    if (parseError) {
      loadError.value = parseError;
      diskSave.onResumeSave(externalPause);
      return;
    }
    onApplySnapshot({ fileState: { ...fileState.value, content: event.content }, data: nextData, savedContent: event.content });
    draftPersistence.onScheduleDraft();
    await draftPersistence.onFlushDraft();
    loadError.value = null;
    diskSave.onResumeSave(externalPause);
  }

  /**
   * 外部文件事件策略表：按事件类型分发到对应处理函数。
   */
  const externalEventStrategies: Record<FileChangeEvent['type'], (event: FileChangeEvent) => Promise<void>> = {
    unlink: onHandleUnlink,
    add: onHandleAdd,
    change: onHandleChange
  };

  /**
   * 应用当前路径上的外部文件内容。按 `FileChangeEvent.type` 分派到对应策略。
   * @param event - 未被自写入抑制的文件变化
   */
  async function onApplyExternal(event: FileChangeEvent): Promise<void> {
    if (isTerminal()) {
      return;
    }
    // 路径切换前已排队的旧路径事件不得影响新的文件身份。
    if (event.filePath !== fileState.value.path) {
      return;
    }
    await externalEventStrategies[event.type](event);
  }

  onExternalHandler = onApplyExternal;

  /**
   * 从文件路径解析文件名与扩展名。
   * @param filePath - 文件绝对路径
   * @returns 文件名与扩展名
   */
  function onParseFilePath(filePath: string): { name: string; ext: string } {
    const fileName = filePath.split(/[/\\]/).pop() ?? '';
    const [, name = '', ext = ''] = /^(.+?)(?:\.([^.]+))?$/.exec(fileName) ?? [];
    return { name, ext };
  }

  /**
   * 为无法恢复原路径的文件生成建议恢复路径。
   * @param filePath - 原文件绝对路径
   * @returns 带 recovered 后缀的建议路径
   */
  function onBuildRecoveredPath(filePath: string): string {
    const separator = filePath.includes('\\') ? '\\' : '/';
    const segments = filePath.split(/[/\\]/);
    const fileName = segments.pop() ?? '';
    const [, name = 'Untitled', ext = ''] = /^(.+?)(?:\.([^.]+))?$/.exec(fileName) ?? [];
    const recoveredName = ext ? `${name}-recovered.${ext}` : `${name}-recovered`;
    return [...segments, recoveredName].join(separator);
  }

  /**
   * 使用可选建议路径执行首次保存或另存为。
   * @param suggestedPath - 控制器建议的默认保存路径
   */
  async function onSaveAsPath(suggestedPath: string | null = null): Promise<void> {
    if (serializationError.value || loadError.value || isLoading.value || isTerminal()) {
      return;
    }

    const snapshot = onCaptureOperation();
    const saveAsPause = onCreatePauseReason('saveAs');
    await diskSave.onPauseSave(saveAsPause);
    if (!onIsCurrentIdentity(snapshot)) {
      diskSave.onResumeSave(saveAsPause);
      return;
    }

    // 另存为可能覆盖当前路径，需在平台写盘前登记旧会话的精确内容签名。
    fileWatch.onSuppressWrite(snapshot);
    const [error, savedPath] = await asyncTo(
      events.onSaveAs({
        fileState: { ...fileState.value },
        content: snapshot.content,
        suggestedPath
      })
    );
    if (error) {
      onReportError('saveAs', error);
    }
    if (error || !savedPath) {
      fileWatch.onClearSuppression(snapshot);
      diskSave.onResumeSave(saveAsPause);
      if (onIsCurrentIdentity(snapshot)) {
        diskSave.onScheduleSave();
      }
      return;
    }
    if (!onIsCurrentIdentity(snapshot)) {
      fileWatch.onClearSuppression(snapshot);
      diskSave.onResumeSave(saveAsPause);
      return;
    }

    const { name, ext } = onParseFilePath(savedPath);
    sessionVersion.value += 1;
    fileState.value = {
      ...fileState.value,
      path: savedPath,
      name: name || fileState.value.name,
      ext: ext || fileState.value.ext
    };
    savedContent.value = snapshot.content;
    tabsStore.clearMissing(fileId.value);
    onSyncDirty();
    fileWatch.onClearSuppression();
    await fileWatch.onSwitchPath(savedPath);
    // 路径切换后保留新会话签名，以吞掉平台稍后送达的同内容 change 事件。
    fileWatch.onSuppressWrite({
      ...snapshot,
      sessionVersion: sessionVersion.value,
      path: savedPath
    });
    draftPersistence.onScheduleDraft();
    await draftPersistence.onFlushDraft();
    diskSave.onResumeSave('missing');
    diskSave.onResumeSave(saveAsPause);
    // 对话框等待期间的新编辑仍保持未保存，并按当前策略写入新路径。
    diskSave.onScheduleSave();
  }

  /**
   * 手动执行首次保存或另存为。
   */
  async function onSaveAs(): Promise<void> {
    await onSaveAsPath();
  }

  /**
   * 恢复被外部删除的原文件路径，失败时转入恢复副本保存。
   */
  async function onSaveMissing(): Promise<void> {
    const originalPath = fileState.value.path;
    if (!originalPath) {
      await onSaveAsPath();
      return;
    }

    const operation = onCaptureOperation();
    await diskSave.onPauseSave('missing');
    fileWatch.onSuppressWrite(operation);
    const [restoreError, didRestore] = await asyncTo(
      events.onRestoreFile({ fileState: { ...fileState.value, path: originalPath, content: operation.content } })
    );
    if (restoreError) {
      onReportError('restore', restoreError);
      fileWatch.onClearSuppression(operation);
      if (onIsCurrentIdentity(operation)) {
        await onSaveAsPath(onBuildRecoveredPath(originalPath));
      }
      return;
    }
    if (!didRestore || !onIsCurrentIdentity(operation)) {
      fileWatch.onClearSuppression(operation);
      return;
    }

    onCommitSnapshot(operation);
    diskSave.onResumeSave('missing');
  }

  /**
   * 手动保存当前文件。
   */
  async function onSave(): Promise<void> {
    if (serializationError.value || loadError.value || isLoading.value || isTerminal()) {
      return;
    }

    if (isMissing.value) {
      await onSaveMissing();
      return;
    }

    if (!fileState.value.path) {
      await onSaveAsPath();
      return;
    }

    await diskSave.onSaveSnapshot();
  }

  /**
   * 重命名当前文件并原子应用事件结果。
   */
  async function onRename(): Promise<void> {
    if (loadError.value || isLoading.value || isTerminal()) {
      return;
    }

    const snapshot = onCaptureOperation();
    const renamePause = onCreatePauseReason('rename');
    await diskSave.onPauseSave(renamePause);
    if (!onIsCurrentIdentity(snapshot)) {
      diskSave.onResumeSave(renamePause);
      return;
    }

    const [error, result] = await asyncTo(events.onRename({ fileState: { ...fileState.value } }));
    if (error) {
      onReportError('rename', error);
    }
    if (error || !result) {
      diskSave.onResumeSave(renamePause);
      if (onIsCurrentIdentity(snapshot)) {
        diskSave.onScheduleSave();
      }
      return;
    }
    if (!onIsCurrentIdentity(snapshot)) {
      diskSave.onResumeSave(renamePause);
      return;
    }

    const pathChanged = result.path !== fileState.value.path;
    if (pathChanged) {
      sessionVersion.value += 1;
      fileWatch.onClearSuppression();
    }
    fileState.value = {
      ...fileState.value,
      name: result.name,
      ext: result.ext,
      path: result.path
    };
    if (pathChanged) {
      await fileWatch.onSwitchPath(result.path);
    }
    tabsStore.clearMissing(fileId.value);
    diskSave.onResumeSave('missing');
    draftPersistence.onScheduleDraft();
    await draftPersistence.onFlushDraft();
    diskSave.onResumeSave(renamePause);
    diskSave.onScheduleSave();
  }

  /**
   * 处理编辑区域失焦保存。
   */
  async function onBlur(): Promise<void> {
    if (loadError.value || isLoading.value || isTerminal()) {
      return;
    }

    await diskSave.onBlur();
  }

  /**
   * 立即补写草稿并等待当前磁盘任务。
   */
  async function onFlush(): Promise<void> {
    if (status.disposed || status.deleting) {
      return;
    }

    await draftPersistence.onFlushDraft();
    await diskSave.onFlushSave();
    await draftPersistence.onFlushDraft();
  }

  /**
   * 终止控制器 watcher、调度器和文件监听资源。
   */
  async function onFinalizeDispose(): Promise<void> {
    sessionVersion.value += 1;
    status.disposed = true;
    status.disposing = false;
    status.deleting = false;
    isLoading.value = false;
    stopDataWatch();
    stopDraftErrorWatch();
    stopSaveErrorWatch();
    runtime.stopFileIdWatch?.();
    runtime.stopFileIdWatch = null;
    diskSave.onDisposeSave();
    draftPersistence.onDisposeDraft();
    await fileWatch.onDisposeWatch();
  }

  /**
   * 释放草稿与磁盘保存调度资源。
   */
  async function onDispose(): Promise<void> {
    if (status.disposed) {
      return;
    }
    if (tasks.dispose) {
      await tasks.dispose;
      return;
    }

    // 入口即进入终态并停止响应式入口，异步 flush 期间旧加载结果也不能再落地。
    status.disposing = true;
    stopDataWatch();
    runtime.stopFileIdWatch?.();
    runtime.stopFileIdWatch = null;
    tasks.dispose = (async (): Promise<void> => {
      await draftPersistence.onFlushDraft();
      await diskSave.onFlushSave();
      await draftPersistence.onFlushDraft();
      await onFinalizeDispose();
    })();
    await tasks.dispose;
  }

  /**
   * 删除当前最近文件记录并释放会话资源。
   */
  async function onDelete(): Promise<void> {
    if (isTerminal()) {
      return;
    }

    const operation = onCaptureOperation();
    const deleteContext = { fileState: { ...fileState.value } };
    if (events.onConfirmDelete) {
      const [confirmError, confirmed] = await asyncTo(events.onConfirmDelete(deleteContext));
      if (confirmError) {
        onReportError('delete', confirmError);
      }
      if (confirmError || !confirmed || !onIsCurrentIdentity(operation)) {
        return;
      }
    }

    status.deleting = true;
    const deletePause = onCreatePauseReason('delete');
    await diskSave.onPauseSave(deletePause);
    if (!onHasIdentity(operation)) {
      status.deleting = false;
      diskSave.onResumeSave(deletePause);
      return;
    }

    await draftPersistence.onFlushDraft();
    await fileWatch.onSwitchPath(null);
    let didDeleteFile = false;
    if (events.onDeleteFile && !tabsStore.isMissing(fileId.value)) {
      const [deleteError] = await asyncTo(events.onDeleteFile(deleteContext));
      if (deleteError) {
        onReportError('delete', deleteError);
        status.deleting = false;
        await fileWatch.onSwitchPath(operation.path);
        diskSave.onResumeSave(deletePause);
        return;
      }
      didDeleteFile = true;
    }

    const [removeError] = await asyncTo(recentStore.removeFile(operation.fileId));
    if (removeError) {
      onReportError('delete', removeError);
      if (didDeleteFile) {
        tabsStore.markMissing(operation.fileId);
        await diskSave.onPauseSave('missing');
      }
      status.deleting = false;
      await fileWatch.onSwitchPath(operation.path);
      diskSave.onResumeSave(deletePause);
      diskSave.onScheduleSave();
      return;
    }
    if (events.onDeleted) {
      const [finishError] = await asyncTo(events.onDeleted(deleteContext));
      if (finishError) {
        onReportError('delete', finishError);
        // 页面收尾失败时恢复最近记录与监听，使当前会话仍可重试删除。
        draftPersistence.onScheduleDraft();
        await draftPersistence.onFlushDraft();
        if (didDeleteFile) {
          tabsStore.markMissing(operation.fileId);
          await diskSave.onPauseSave('missing');
        }
        status.deleting = false;
        await fileWatch.onSwitchPath(operation.path);
        diskSave.onResumeSave(deletePause);
        diskSave.onScheduleSave();
        return;
      }
    }
    await onFinalizeDispose();
  }

  /**
   * KeepAlive 页面激活时恢复当前路径的页面级监听。
   */
  async function onActivateController(): Promise<void> {
    if (isTerminal()) return;
    await fileWatch.onActivate();
    // 停用期间重新出现的文件仍保留 missing，激活后必须先重新加载并协调内容。
    if (isMissing.value) {
      await onReload();
    }
  }

  /**
   * KeepAlive 页面停用时停止页面级变化处理。
   */
  function onDeactivateController(): void {
    fileWatch.onDeactivate();
  }

  const actions: FileControllerActions = {
    onSave,
    onSaveAs,
    onRename,
    onBlur,
    onReload,
    onDelete,
    onFlush,
    onDispose
  };

  if (getCurrentScope()) {
    onScopeDispose((): void => {
      asyncTo(onDispose());
    });
  }

  if (getCurrentInstance()) {
    onActivated(onActivateController);
    onDeactivated(onDeactivateController);
  }

  runtime.stopFileIdWatch = watch(fileId, (nextFileId: string, previousFileId: string): void => {
    if (nextFileId === previousFileId || isTerminal()) {
      return;
    }

    sessionVersion.value += 1;
    asyncTo(onReload());
  });

  return {
    fileState,
    data,
    savedContent,
    isSaved,
    isMissing,
    isLoading,
    loadError,
    actions
  };
}
