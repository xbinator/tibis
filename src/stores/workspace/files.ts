/**
 * @file files.ts
 * @description 兼容层，委托到 useRecentStore。新代码请直接使用 useRecentStore。
 */

import { useRecentStore } from './recent';

export const useFilesStore = useRecentStore;

export type { RecentState as FilesState } from './recent';
export type { OpenSource } from './recent';
