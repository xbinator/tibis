/**
 * @file restore.ts
 * @description 通过独占创建与覆盖确认安全恢复外部删除的文件路径。
 */
import { native } from '@/shared/platform';
import type { FileState } from '@/shared/platform/native/types';
import { asyncTo } from '@/utils/asyncTo';
import { Modal } from '@/utils/modal';

/**
 * 缺失文件恢复交互文案。
 */
export interface RestoreFileOptions {
  /** 同名文件重新出现时的确认标题。 */
  title: string;
  /** 同名文件重新出现时的确认内容。 */
  message: string;
}

/**
 * 在用户确认后覆盖已重新出现的同名路径。
 * @param fileState - 待恢复的文件状态
 * @param options - 覆盖确认文案
 * @returns 用户是否确认并完成覆盖
 */
async function onOverwriteFile(fileState: Readonly<FileState>, options: RestoreFileOptions): Promise<boolean> {
  const [confirmError, confirmResult] = await asyncTo(
    Modal.confirm(options.title, options.message, {
      confirmText: '覆盖',
      cancelText: '取消'
    })
  );
  if (confirmError) throw confirmError;
  if (confirmResult[0]) return false;

  const [writeError] = await asyncTo(native.writeFile(fileState.path ?? '', fileState.content));
  if (writeError) throw writeError;
  return true;
}

/**
 * 恢复缺失文件；不存在时独占创建，竞态出现同名文件时先确认再覆盖。
 * @param fileState - 待恢复的文件状态
 * @param options - 覆盖确认文案
 * @returns 是否完成恢复；用户取消时为 false
 */
export async function restoreMissingFile(fileState: Readonly<FileState>, options: RestoreFileOptions): Promise<boolean> {
  if (!fileState.path) return false;

  const [statusError, status] = await asyncTo(native.getPathStatus(fileState.path));
  if (statusError) throw statusError;
  if (status.exists) return onOverwriteFile(fileState, options);

  const [createError] = await asyncTo(native.createFile(fileState.path, fileState.content));
  if (!createError) return true;

  // 独占创建失败后重新检查：只有竞态出现同名路径才转入覆盖确认。
  const [latestError, latestStatus] = await asyncTo(native.getPathStatus(fileState.path));
  if (latestError) throw latestError;
  if (!latestStatus.exists) throw createError;
  return onOverwriteFile(fileState, options);
}
