/**
 * @file document.ts
 * @description 收口最近文档记录的打开、新建与文件路径恢复逻辑。
 */
import type { DocumentNavigationActions, FileRouteLocation } from '../types';
import { useRouter } from 'vue-router';
import { customAlphabet } from 'nanoid';
import { native } from '@/shared/platform';
import { createDocumentDescription, createDocumentTitle, createRecentUrl } from '@/shared/storage';
import type { StoredDocumentRecord } from '@/shared/storage';
import { useRecentStore } from '@/stores/workspace/recent';
import { useTabsStore } from '@/stores/workspace/tabs';
import { asyncTo } from '@/utils/asyncTo';
import { Modal } from '@/utils/modal';

/**
 * 生成最近文档 ID。
 */
const createFileId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);

/**
 * 根据文件记录类型解析目标路由。
 * @param file - 最近文档记录
 * @returns 路由位置
 */
function resolveFileRoute(file: StoredDocumentRecord): FileRouteLocation {
  if (file.type === 'widget') {
    return { name: 'widget', params: { id: file.id } };
  }

  return { name: 'editor', params: { id: file.id } };
}

/**
 * 提供最近文档打开、新建和 Widget 会话打开行为。
 * @returns 文档导航动作
 */
export function useDocumentNavigation(): DocumentNavigationActions {
  const router = useRouter();
  const recentStore = useRecentStore();
  const tabsStore = useTabsStore();

  /**
   * 按磁盘路径查找当前已打开标签，命中时返回其路由路径。
   * @param path - 目标文件绝对路径
   * @returns 已打开标签的路由路径；未命中时返回 null
   */
  async function findOpenTabPath(path: string): Promise<string | null> {
    await recentStore.ensureLoaded();

    const matchedFileId = recentStore.recentFiles?.find((file) => file.path === path)?.id;
    if (!matchedFileId) return null;

    return tabsStore.tabs.find((tab) => tab.id === matchedFileId)?.path ?? null;
  }

  /**
   * 通过磁盘路径打开文件；若已有打开标签则直接复用，否则强制从磁盘刷新记录后再跳转。
   * @param path - 文件绝对路径
   * @returns 打开的文件记录；未命中时返回 null
   */
  async function openFileByPath(path: string): Promise<StoredDocumentRecord | null> {
    const openedTabPath = await findOpenTabPath(path);
    if (openedTabPath) {
      await router.push(openedTabPath);
      return (await recentStore.getFileByPath(path)) ?? null;
    }

    const [openError, openedFile] = await asyncTo(recentStore.openOrRefreshByPathFromDisk(path));
    if (openError || !openedFile) {
      const existingFile = await recentStore.getFileByPath(path);
      if (existingFile?.path) {
        await Modal.alert('文件不存在', `路径不存在：${existingFile.path}`);
        await recentStore.removeFile(existingFile.id);
      }
      return null;
    }

    await router.push(resolveFileRoute(openedFile));
    return openedFile;
  }

  /**
   * 打开一个已存在的最近文档；有磁盘路径时先校验文件是否存在。
   * @param file - 文件记录
   * @returns 打开的文件记录；文件不存在时为 null
   */
  async function openDocument(file: StoredDocumentRecord): Promise<StoredDocumentRecord | null> {
    if (file.path) {
      return openFileByPath(file.path);
    }

    const openedFile = await recentStore.openExistingFile(file.id);
    await router.push(resolveFileRoute(openedFile));

    return openedFile;
  }

  /**
   * 通过文件 ID 打开最近文档。
   * @param id - 文件 ID
   * @returns 更新后的文件记录；未命中时返回 null
   */
  async function openFileById(id: string): Promise<StoredDocumentRecord | null> {
    const file = await recentStore.getFileById(id);
    if (!file) return null;

    if (file.path) {
      return openFileByPath(file.path);
    }

    return openDocument(file);
  }

  /**
   * 通过原生文件选择器打开文件。
   * @returns 打开的文件记录；用户取消时返回 null
   */
  async function openNativeFile(): Promise<StoredDocumentRecord | null> {
    const file = await native.openFile();
    if (!file.path) return null;

    return openFileByPath(file.path);
  }

  /**
   * 创建一个新的未保存文件并打开。
   * @returns 创建后的文件记录
   */
  async function createNewFile(): Promise<StoredDocumentRecord> {
    const fileId = createFileId();
    const createdFile = await recentStore.createAndOpen({
      type: 'file',
      id: fileId,
      url: createRecentUrl('file', fileId),
      title: createDocumentTitle('Untitled', 'md'),
      description: createDocumentDescription(null),
      path: null,
      name: 'Untitled',
      ext: 'md',
      content: ''
    });

    await router.push({ name: 'editor', params: { id: createdFile.id } });
    return createdFile;
  }

  /**
   * 打开已安装小组件对应的 Widget 文件会话。
   * @param widgetId - 已安装小组件 ID
   */
  async function openWidgetFile(widgetId: string): Promise<void> {
    await router.push({ name: 'widget', params: { id: `widget-${widgetId}` } });
  }

  return { openDocument, openFileById, openFileByPath, openNativeFile, createNewFile, openWidgetFile };
}
