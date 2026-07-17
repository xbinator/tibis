/**
 * @file types.ts
 * @description 全局 Hook 共享类型。
 */
import type { File } from '@/shared/platform/native/types';

/**
 * 文件会话状态。
 */
export interface FileSessionState extends File {
  /** 文件唯一 ID */
  id: string;
}
