/**
 * @file useOpenFile.ts
 * @description 收口最近文件相关的打开与新建路由逻辑。
 */

import { useRouter } from 'vue-router';
import { customAlphabet } from 'nanoid';
import type { DrawingData } from '@/components/BDrawing/types';
import { native } from '@/shared/platform';
import type { StoredFile } from '@/shared/storage/files/types';
import { useFilesStore } from '@/stores/workspace/files';
import { useTabsStore } from '@/stores/workspace/tabs';
import { Modal } from '@/utils/modal';
import { createTibisDocumentContent, resolveTibisDocumentRoute } from './useFileSession';

const createFileId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);

/**
 * 文件打开目标路由。
 */
interface FileRouteLocation {
  /** 目标路由名称 */
  name: string;
  /** 路由参数 */
  params: {
    /** 文件 ID */
    id: string;
  };
}

/**
 * 统一文件打开与新建行为。
 */
interface OpenFileActions {
  /** 打开最近文件记录 */
  openFile: (file: StoredFile) => Promise<StoredFile | null>;
  /** 通过文件 ID 打开最近文件 */
  openFileById: (id: string) => Promise<StoredFile | null>;
  /** 通过磁盘路径打开文件 */
  openFileByPath: (path: string) => Promise<StoredFile | null>;
  /** 通过原生文件选择器打开文件 */
  openNativeFile: () => Promise<StoredFile | null>;
  /** 创建新的 Markdown 文件 */
  createNewFile: () => Promise<StoredFile>;
  /** 创建新的 Tibis 画图文件 */
  createNewDrawingFile: () => Promise<StoredFile>;
}

/**
 * 创建空画图数据。
 * @returns 空画图数据
 */
function createEmptyDrawingData(): DrawingData {
  return {
    elements: [],
    edges: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 根据文件内容解析目标路由。
 * @param file - 最近文件记录
 * @returns 路由位置
 */
function resolveFileRoute(file: StoredFile): FileRouteLocation {
  if (file.ext !== 'tibis') {
    return { name: 'editor', params: { id: file.id } };
  }

  const route = resolveTibisDocumentRoute(file.content);

  return { name: route.routeName, params: { id: file.id } };
}

/**
 * 提供统一的文件打开与新建行为。
 * @returns 文件打开相关操作
 */
export function useOpenFile(): OpenFileActions {
  const router = useRouter();
  const filesStore = useFilesStore();
  const tabsStore = useTabsStore();

  /**
   * 按磁盘路径查找当前已打开标签，命中时返回其路由路径。
   * 直接从内存缓存查找路径对应的文件 ID，再匹配标签页，避免逐个 tab 调用 getFileById。
   * @param path - 目标文件绝对路径
   * @returns 已打开标签的路由路径；未命中时返回 null
   */
  async function findOpenTabPathByFilePath(path: string): Promise<string | null> {
    await filesStore.ensureLoaded();

    const matchedFileId = filesStore.recentFiles?.find((f) => f.path === path)?.id;
    if (!matchedFileId) return null;

    return tabsStore.tabs.find((tab) => tab.id === matchedFileId)?.path ?? null;
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

    try {
      const openedFile = await filesStore.openOrRefreshByPathFromDisk(path);
      if (!openedFile) return null;

      await router.push(resolveFileRoute(openedFile));
      return openedFile;
    } catch {
      // 文件不存在则弹窗提示后从最近记录中移除。
      const existingFile = await filesStore.getFileByPath(path);
      if (existingFile?.path) {
        await Modal.alert('文件不存在', `路径不存在：${existingFile.path}`);

        await filesStore.removeFile(existingFile.id);
      }
      return null;
    }
  }

  /**
   * 打开一个已存在的最近文件；有磁盘路径时先校验文件是否存在。
   * @param file - 文件记录
   * @returns 打开的文件记录；文件不存在时为 null
   */
  async function openFile(file: StoredFile): Promise<StoredFile | null> {
    // 有磁盘路径则走路径统一入口，确保文件存在性校验。
    if (file.path) {
      return openFileByPath(file.path);
    }

    // 无磁盘路径的未保存草稿仍然沿用最近文件缓存恢复。
    const openedFile = await filesStore.openExistingFile(file.id);
    await router.push(resolveFileRoute(openedFile));

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
      type: 'file',
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

  /**
   * 创建一个新的未保存画图文件并打开。
   * @returns 创建后的文件记录
   */
  async function createNewDrawingFile(): Promise<StoredFile> {
    const drawingData = createEmptyDrawingData();
    const content = createTibisDocumentContent({
      type: 'drawing',
      version: 1,
      data: drawingData
    });
    const createdFile = await filesStore.createAndOpen({
      type: 'file',
      id: createFileId(),
      path: null,
      name: 'Untitled',
      ext: 'tibis',
      content,
      savedContent: content
    });

    await router.push(resolveFileRoute(createdFile));
    return createdFile;
  }

  return { openFile, openFileById, openFileByPath, openNativeFile, createNewFile, createNewDrawingFile };
}
