/**
 * @file reference.ts
 * @description 处理聊天与富文本引用文件的打开及打开后选区定位意图。
 */
import type { DocumentNavigationActions, FileReferenceNavigationActions, FileSelectionRange, OpenFileOptions } from '../types';
import { message } from 'ant-design-vue';
import { customAlphabet } from 'nanoid';
import type { StoredDocumentRecord } from '@/shared/storage';
import { useFileSelectionIntentStore } from '@/stores/editor/fileSelectionIntent';

/**
 * 生成一次性文件选区意图 ID。
 */
const createIntentId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);

/**
 * 规范化待写入的文件选区范围。
 * @param range - 原始文件选区范围
 * @returns 有效的文件选区范围
 */
function normalizeRange(range: FileSelectionRange): FileSelectionRange {
  const startLine = Math.max(1, range.startLine);
  const endLine = Math.max(startLine, range.endLine);

  return {
    startLine,
    endLine
  };
}

/**
 * 根据打开参数解析并打开文件。
 * @param options - 引用文件打开参数
 * @param documentActions - 文档导航动作
 * @returns 打开的文档记录；未命中时返回 null
 */
async function resolveOpenedFile(options: OpenFileOptions, documentActions: DocumentNavigationActions): Promise<StoredDocumentRecord | null> {
  if (options.filePath) {
    return documentActions.openFileByPath(options.filePath);
  }

  if (options.fileId) {
    return documentActions.openFileById(options.fileId);
  }

  return null;
}

/**
 * 判断是否需要设置文件选区意图。
 * @param range - 可选选区范围
 * @returns 是否需要设置选区意图
 */
function shouldSetIntent(range: FileSelectionRange | undefined): range is FileSelectionRange {
  if (!range) {
    return false;
  }

  return !(range.startLine === 0 && range.endLine === 0);
}

/**
 * 创建引用文件打开能力。
 * @param documentActions - 文档导航动作
 * @returns 引用文件导航动作
 */
export function useFileReferenceNavigation(documentActions: DocumentNavigationActions): FileReferenceNavigationActions {
  const fileSelectionIntentStore = useFileSelectionIntentStore();
  let isNavigating = false;

  /**
   * 写入一次性文件选区意图。
   * @param fileId - 文件 ID
   * @param range - 文件选区范围
   */
  function setFileSelectionIntent(fileId: string, range: FileSelectionRange): void {
    const normalizedRange = normalizeRange(range);

    fileSelectionIntentStore.setIntent({
      intentId: createIntentId(),
      fileId,
      startLine: normalizedRange.startLine,
      endLine: normalizedRange.endLine
    });
  }

  /**
   * 根据路径或文件 ID 打开文件，并在需要时写入一次性选区意图。
   * @param options - 打开文件参数
   */
  async function openFile(options: OpenFileOptions): Promise<void> {
    if (isNavigating) {
      return;
    }

    isNavigating = true;

    try {
      const openedFile = await resolveOpenedFile(options, documentActions);

      if (!openedFile) {
        message.error(options.fileId ? '未找到引用草稿' : '未找到引用文件');
        return;
      }

      if (!shouldSetIntent(options.range)) {
        return;
      }

      setFileSelectionIntent(openedFile.id, options.range);
    } finally {
      isNavigating = false;
    }
  }

  return { openFile };
}
