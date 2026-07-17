/**
 * @file useFileWatch.ts
 * @description 管理公共文件控制器的路径监听、外部变化与自写入抑制。
 */
import type { FileOperationSnapshot } from './types';
import type { Ref } from 'vue';
import { ref } from 'vue';
import { native } from '@/shared/platform';
import type { FileChangeEvent } from '@/shared/platform/native/types';
import { useEditorFileWatchStore } from '@/stores/editor/fileWatch';
import { useTabsStore } from '@/stores/workspace/tabs';
import { asyncTo } from '@/utils/asyncTo';

/**
 * 文件监听配置。
 */
export interface FileWatchOptions {
  /** 当前文件 ID。 */
  fileId: Ref<string>;
  /** 当前会话版本。 */
  sessionVersion: Ref<number>;
  /** 接收未被抑制的当前路径变化。 */
  onExternalChange: (event: FileChangeEvent) => void;
  /** 报告监听注册、更新或注销错误。 */
  onError?: (error: Error) => void;
}

/**
 * 当前会话的自写入抑制签名。
 */
interface SuppressedWrite {
  /** 文件 ID。 */
  fileId: string;
  /** 会话版本。 */
  sessionVersion: number;
  /** 写入路径。 */
  path: string;
  /** 写入内容。 */
  content: string;
  /** 签名过期时间。 */
  expiresAt: number;
}

/**
 * 同一路径下的控制器实例写入租约。
 */
interface FileWriteLease {
  /** 控制器实例 ID。 */
  controllerId: number;
  /** 当前业务文件 ID。 */
  fileId: string;
  /** 租约所属路径。 */
  path: string;
  /** 重新计算当前实例权限。 */
  onRefresh: () => void;
}

/**
 * 文件监听控制器。
 */
export interface FileWatchController {
  /** 当前会话是否允许自动写盘。 */
  isAutoWriteAllowed: Ref<boolean>;
  /** 切换监听路径。 */
  onSwitchPath: (nextPath: string | null) => Promise<void>;
  /** 登记当前会话写盘快照。 */
  onSuppressWrite: (snapshot: FileOperationSnapshot) => void;
  /** 清理当前自写入抑制签名。 */
  onClearSuppression: (snapshot?: FileOperationSnapshot) => void;
  /** 激活页面级变化订阅。 */
  onActivate: () => Promise<void>;
  /** 停用页面级变化订阅。 */
  onDeactivate: () => void;
  /** 释放页面订阅与全局路径引用。 */
  onDisposeWatch: () => Promise<void>;
}

const SUPPRESSION_DURATION = 5_000;
const MAX_SUPPRESSIONS = 8;
const pathLeases = new Map<string, FileWriteLease[]>();
let controllerIdSeed = 0;

/**
 * 通知同一路径的全部控制器重新计算自动写入权。
 * @param filePath - 发生租约变化的路径
 */
function onRefreshLeases(filePath: string): void {
  pathLeases.get(filePath)?.forEach((lease: FileWriteLease): void => lease.onRefresh());
}

/**
 * 创建公共文件监听控制器。
 * @param options - 文件身份、会话版本与外部变化回调
 * @returns 文件路径监听与抑制动作
 */
export function useFileWatch(options: FileWatchOptions): FileWatchController {
  const { fileId, sessionVersion, onExternalChange, onError } = options;
  const fileWatchStore = useEditorFileWatchStore();
  const tabsStore = useTabsStore();
  controllerIdSeed += 1;
  const controllerId = controllerIdSeed;
  const registrationId = `file-controller:${controllerId}`;
  const isAutoWriteAllowed = ref<boolean>(true);
  let desiredPath: string | null = null;
  let registeredPath: string | null = null;
  let registeredFileId: string | null = null;
  let suppressions: SuppressedWrite[] = [];
  let leasePath: string | null = null;
  let leaseFileId: string | null = null;
  let unsubscribe: (() => void) | null = null;
  let active = true;
  let pathTask: Promise<void> = Promise.resolve();

  /**
   * 判断当前 change 事件是否来自本会话的精确写入快照。
   * @param event - 当前文件变化事件
   * @returns 是否应吞掉该事件
   */
  function onShouldSuppress(event: FileChangeEvent): boolean {
    if (event.type !== 'change') {
      return false;
    }

    suppressions = suppressions.filter(
      (suppression: SuppressedWrite): boolean =>
        suppression.expiresAt > Date.now() && suppression.fileId === fileId.value && suppression.sessionVersion === sessionVersion.value
    );
    const isMatchingWrite = suppressions.some(
      (suppression: SuppressedWrite): boolean => event.filePath === suppression.path && event.content === suppression.content
    );
    if (isMatchingWrite) {
      return true;
    }

    // 同一路径出现不同内容意味着外部写入，立即终止该路径上的旧自写入抑制。
    suppressions = suppressions.filter((suppression: SuppressedWrite): boolean => suppression.path !== event.filePath);
    return false;
  }

  /**
   * 处理 native 文件变化并隔离非当前路径事件。
   * @param event - native 文件变化事件
   */
  function onHandleChange(event: FileChangeEvent): void {
    if (!active || !desiredPath || event.filePath !== desiredPath) {
      return;
    }

    if (onShouldSuppress(event)) {
      return;
    }

    if (event.type === 'unlink') {
      tabsStore.markMissing(fileId.value);
      onExternalChange(event);
      return;
    }

    if (event.type === 'add') {
      onExternalChange(event);
      return;
    }

    onExternalChange(event);
  }

  /**
   * 确保当前激活会话订阅一次页面级文件变化。
   */
  function onSubscribe(): void {
    if (!active || unsubscribe) {
      return;
    }

    unsubscribe = native.onFileChanged(onHandleChange);
  }

  /**
   * 判断目标路径是否已被其他文件会话占用。
   * @param targetPath - 目标磁盘路径
   * @param currentFileId - 当前文件 ID
   * @returns 当前会话是否可作为自动写入者
   */
  function onResolveWriteAccess(targetPath: string, currentFileId: string): boolean {
    const leases = pathLeases.get(targetPath) ?? [];
    const knownFileIds = new Set<string>(leases.map((lease: FileWriteLease): string => lease.fileId));
    const owners = fileWatchStore.pathToFileIds.get(targetPath);
    const hasExternalOwner = owners ? [...owners].some((ownerId: string): boolean => !knownFileIds.has(ownerId)) : false;
    if (hasExternalOwner) {
      return false;
    }

    return leases[0]?.controllerId === controllerId && leases[0]?.fileId === currentFileId;
  }

  /**
   * 按当前租约注册表刷新自动写入权限。
   */
  function onRefreshWriteAccess(): void {
    if (!leasePath || !leaseFileId) {
      isAutoWriteAllowed.value = true;
      return;
    }

    isAutoWriteAllowed.value = onResolveWriteAccess(leasePath, leaseFileId);
  }

  /**
   * 释放当前控制器实例持有的自动写入租约。
   */
  function onReleaseLease(): void {
    if (!leasePath || !leaseFileId) {
      return;
    }

    const previousPath = leasePath;
    const leases = (pathLeases.get(previousPath) ?? []).filter((lease: FileWriteLease): boolean => lease.controllerId !== controllerId);
    if (leases.length > 0) {
      pathLeases.set(previousPath, leases);
    } else {
      pathLeases.delete(previousPath);
    }
    leasePath = null;
    leaseFileId = null;
    isAutoWriteAllowed.value = true;
    onRefreshLeases(previousPath);
  }

  /**
   * 为当前控制器申请目标路径的自动写入租约。
   * @param targetPath - 目标磁盘路径
   * @param currentFileId - 当前业务文件 ID
   */
  function onAcquireLease(targetPath: string, currentFileId: string): void {
    if (leasePath === targetPath && leaseFileId === currentFileId) {
      onRefreshWriteAccess();
      return;
    }

    onReleaseLease();
    const leases = pathLeases.get(targetPath) ?? [];
    leases.push({ controllerId, fileId: currentFileId, path: targetPath, onRefresh: onRefreshWriteAccess });
    pathLeases.set(targetPath, leases);
    leasePath = targetPath;
    leaseFileId = currentFileId;
    onRefreshLeases(targetPath);
  }

  /**
   * 将全局监听引用追赶到最新文件 ID 与路径。
   */
  async function onApplyPath(): Promise<void> {
    const targetPath = desiredPath;
    const targetFileId = fileId.value;

    if (registeredFileId && registeredFileId !== targetFileId) {
      const previousPath = registeredPath;
      onReleaseLease();
      const [unregisterError] = await asyncTo(fileWatchStore.unregister(registeredFileId, registrationId));
      if (unregisterError) {
        isAutoWriteAllowed.value = false;
        onError?.(unregisterError);
        return;
      }
      if (previousPath) onRefreshLeases(previousPath);
      registeredFileId = null;
      registeredPath = null;
    }

    if (!targetPath) {
      if (registeredFileId) {
        const previousPath = registeredPath;
        onReleaseLease();
        const [unregisterError] = await asyncTo(fileWatchStore.unregister(registeredFileId, registrationId));
        if (unregisterError) {
          isAutoWriteAllowed.value = false;
          onError?.(unregisterError);
          return;
        }
        if (previousPath) onRefreshLeases(previousPath);
      } else {
        onReleaseLease();
      }
      registeredFileId = null;
      registeredPath = null;
      isAutoWriteAllowed.value = true;
      return;
    }

    onAcquireLease(targetPath, targetFileId);
    if (registeredFileId === targetFileId && registeredPath === targetPath) {
      return;
    }

    const watchTask =
      registeredFileId === targetFileId && registeredPath
        ? fileWatchStore.updatePath(targetFileId, targetPath, registrationId)
        : fileWatchStore.register(targetFileId, targetPath, registrationId);
    const [watchError] = await asyncTo(watchTask);
    if (watchError) {
      onReleaseLease();
      isAutoWriteAllowed.value = false;
      onError?.(watchError);
      return;
    }

    registeredFileId = targetFileId;
    registeredPath = targetPath;
    onRefreshLeases(targetPath);

    if (desiredPath !== targetPath || fileId.value !== targetFileId) {
      await onApplyPath();
    }
  }

  /**
   * 切换当前会话需要监听的磁盘路径。
   * @param nextPath - 最新磁盘路径
   */
  async function onSwitchPath(nextPath: string | null): Promise<void> {
    desiredPath = nextPath;
    suppressions = [];
    pathTask = pathTask.then(onApplyPath);
    await pathTask;
  }

  /**
   * 登记当前会话写入的精确快照。
   * @param snapshot - 即将写盘的文件操作快照
   */
  function onSuppressWrite(snapshot: FileOperationSnapshot): void {
    if (!snapshot.path) {
      return;
    }

    const suppression: SuppressedWrite = {
      fileId: snapshot.fileId,
      sessionVersion: snapshot.sessionVersion,
      path: snapshot.path,
      content: snapshot.content,
      expiresAt: Date.now() + SUPPRESSION_DURATION
    };
    const isDuplicate = suppressions.some(
      (candidate: SuppressedWrite): boolean =>
        candidate.fileId === suppression.fileId &&
        candidate.sessionVersion === suppression.sessionVersion &&
        candidate.path === suppression.path &&
        candidate.content === suppression.content
    );
    if (!isDuplicate) {
      suppressions.push(suppression);
      suppressions = suppressions.slice(-MAX_SUPPRESSIONS);
    }
  }

  /**
   * 清理当前自写入抑制签名。
   * @param snapshot - 可选的目标快照；提供时只清理匹配签名
   */
  function onClearSuppression(snapshot?: FileOperationSnapshot): void {
    if (!snapshot) {
      suppressions = [];
      return;
    }

    suppressions = suppressions.filter(
      (suppression: SuppressedWrite): boolean =>
        !(
          snapshot.fileId === suppression.fileId &&
          snapshot.sessionVersion === suppression.sessionVersion &&
          snapshot.path === suppression.path &&
          snapshot.content === suppression.content
        )
    );
  }

  /**
   * 恢复页面级文件变化订阅。
   */
  async function onActivate(): Promise<void> {
    active = true;
    onSubscribe();
    await onSwitchPath(desiredPath);
  }

  /**
   * 停止页面级文件变化订阅，但保留全局路径引用。
   */
  function onDeactivate(): void {
    active = false;
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  /**
   * 释放页面订阅与全局路径引用。
   */
  async function onDisposeWatch(): Promise<void> {
    onDeactivate();
    desiredPath = null;
    suppressions = [];
    await pathTask;

    if (registeredFileId) {
      const previousPath = registeredPath;
      onReleaseLease();
      await asyncTo(fileWatchStore.unregister(registeredFileId, registrationId));
      if (previousPath) onRefreshLeases(previousPath);
    } else {
      onReleaseLease();
    }

    registeredFileId = null;
    registeredPath = null;
    isAutoWriteAllowed.value = true;
  }

  onSubscribe();

  return {
    isAutoWriteAllowed,
    onSwitchPath,
    onSuppressWrite,
    onClearSuppression,
    onActivate,
    onDeactivate,
    onDisposeWatch
  };
}
