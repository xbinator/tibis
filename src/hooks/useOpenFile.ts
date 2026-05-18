/**
 * @file useOpenFile.ts
 * @description 收口最近文件相关的打开与新建路由逻辑。
 */

import { useRouter } from 'vue-router';
import { customAlphabet } from 'nanoid';
import { native } from '@/shared/platform';
import type { StoredFile } from '@/shared/storage/files/types';
import { useFilesStore } from '@/stores/workspace/files';
import { useTabsStore } from '@/stores/workspace/tabs';

const createFileId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);

/**
 * 提供统一的文件打开与新建行为。
 * @returns 文件打开相关操作
 */
export function useOpenFile() {
  const router = useRouter();
  const filesStore = useFilesStore();
  const tabsStore = useTabsStore();

  /**
   * 打开一个已存在的最近文件。
   * @param file - 文件记录
   * @returns 更新 openedAt 后的文件记录
   */
  async function openFile(file: StoredFile): Promise<StoredFile> {
    const openedFile = await filesStore.openExistingFile(file.id);

    // 无磁盘路径的未保存草稿仍然沿用最近文件缓存恢复。
    await router.push({ name: 'editor', params: { id: openedFile.id } });
    return openedFile;
  }

  /**
   * 按磁盘路径查找当前已打开标签，命中时返回其路由路径。
   * @param path - 目标文件绝对路径
   * @returns 已打开标签的路由路径；未命中时返回 null
   */
  async function findOpenTabPathByFilePath(path: string): Promise<string | null> {
    const tabEntries = await Promise.all(
      tabsStore.tabs.map(async (tab) => ({
        tab,
        storedFile: await filesStore.getFileById(tab.id)
      }))
    );
    const matchedEntry = tabEntries.find((entry) => entry.storedFile?.path === path);

    return matchedEntry?.tab.path ?? null;
  }

  /**
   * 通过磁盘路径打开文件；若已有打开标签则直接复用，否则强制从磁盘刷新记录后再跳转。
   * @param path - 文件绝对路径
   * @returns 打开的文件记录；未命中时返回 null
   */
  async function openFileByPath(path: string): Promise<StoredFile | null> {
    const openedTabPath = await findOpenTabPathByFilePath(path);
    if (openedTabPath) {
      await router.push(openedTabPath);
      return (await filesStore.getFileByPath(path)) ?? null;
    }

    const openedFile = await filesStore.openOrRefreshByPathFromDisk(path);
    if (!openedFile) return null;

    await router.push({ name: 'editor', params: { id: openedFile.id } });
    return openedFile;
  }

  /**
   * 通过文件 ID 打开最近文件。
   * @param id - 文件 ID
   * @returns 更新后的文件记录；未命中时返回 null
   */
  async function openFileById(id: string): Promise<StoredFile | null> {
    const file = await filesStore.getFileById(id);
    if (!file) return null;

    if (file.path) {
      return openFileByPath(file.path);
    }

    return openFile(file);
  }

  /**
   * 通过原生文件选择器打开文件。
   * @returns 打开的文件记录；用户取消时返回 null
   */
  async function openNativeFile(): Promise<StoredFile | null> {
    const file = await native.openFile();
    if (!file.path) return null;

    return openFileByPath(file.path);
  }

  /**
   * 创建一个新的未保存文件并打开。
   * @returns 创建后的文件记录
   */
  async function createNewFile(): Promise<StoredFile> {
    const createdFile = await filesStore.createAndOpen({
      id: createFileId(),
      path: null,
      name: 'Untitled',
      ext: 'md',
      content: '',
      savedContent: ''
    });

    await router.push({ name: 'editor', params: { id: createdFile.id } });
    return createdFile;
  }

  return { openFile, openFileById, openFileByPath, openNativeFile, createNewFile };
}
