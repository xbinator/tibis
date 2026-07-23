/**
 * @file index.ts
 * @description 创建并打开未保存草稿的通用用例，供 AI 工具降级或其他入口复用。
 */
import { customAlphabet } from 'nanoid';
import type { OpenDraftInput, OpenDraftResult } from '@/ai/tools/shared/types';
import { useOpenFile } from '@/hooks/useOpenFile';
import { createDocumentDescription, createDocumentTitle, createRecentUrl } from '@/shared/storage';
import type { StoredFile } from '@/shared/storage/files/types';
import { useRecentStore } from '@/stores/workspace/recent';
import { buildUnsavedPath } from '@/utils/file/unsaved';

const createFileId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);

/**
 * 扩展名合法性校验：长度 1-20，仅含字母、数字、下划线。
 * @param ext - 候选扩展名
 * @returns 是否合法
 */
function isValidExtension(ext: string): boolean {
  return ext.length >= 1 && ext.length <= 20 && /^[A-Za-z0-9_]+$/.test(ext);
}

/**
 * 从原始相对路径提取文件名和扩展名。
 * 同时兼容 `/` 和 `\` 分隔符；扩展名不合法时默认 `md`。
 * @param originalPath - 模型传入的原始相对路径
 * @returns 文件名与扩展名
 */
export function extractNameAndExt(originalPath: string): { name: string; ext: string } {
  const lastSegment = originalPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';

  if (!lastSegment) {
    return { name: 'Untitled', ext: 'md' };
  }

  const dotIndex = lastSegment.lastIndexOf('.');

  if (dotIndex <= 0) {
    return { name: lastSegment, ext: 'md' };
  }

  const candidateExt = lastSegment.slice(dotIndex + 1);

  if (isValidExtension(candidateExt)) {
    return { name: lastSegment.slice(0, dotIndex), ext: candidateExt };
  }

  return { name: lastSegment, ext: 'md' };
}

/**
 * 提供创建并打开未保存草稿的通用能力。
 * @returns 草稿创建函数
 */
export function useOpenDraft() {
  const recentStore = useRecentStore();
  const { openFile } = useOpenFile();

  /**
   * 创建未保存草稿并打开编辑器。
   * @param input - 原始路径与内容
   * @returns 草稿记录与虚拟路径
   */
  async function openDraft(input: OpenDraftInput): Promise<OpenDraftResult> {
    const { name, ext } = extractNameAndExt(input.originalPath);
    const fileId = createFileId();
    const now = Date.now();

    const storedFile: StoredFile = {
      type: 'file',
      id: fileId,
      url: createRecentUrl('file', fileId),
      title: createDocumentTitle(name, ext),
      description: createDocumentDescription(null),
      path: null,
      content: input.content,
      savedContent: '',
      name,
      ext,
      createdAt: now,
      openedAt: now,
      modifiedAt: now
    };

    const createdFile = await recentStore.createAndOpen(storedFile);
    await openFile(createdFile);

    const unsavedPath = buildUnsavedPath({
      id: createdFile.id,
      fileName: `${createdFile.name}.${createdFile.ext}`,
      ext: createdFile.ext
    });

    return { file: createdFile, unsavedPath };
  }

  return { openDraft };
}
