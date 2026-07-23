/**
 * @file index.ts
 * @description 提供最近记录统一打开与删除用例，收口各页面对最近记录类型的分支判断。
 */

import { useRouter, type Router } from 'vue-router';
import { useNavigate } from '@/hooks/useNavigate';
import { createRecentKey, isDocumentRecord, type RecentRecord, type RecentRecordType, type StoredDocumentRecord } from '@/shared/storage';
import { useRecentStore } from '@/stores/workspace/recent';
import { useTabsStore } from '@/stores/workspace/tabs';
import { asyncTo } from '@/utils/asyncTo';

/**
 * 最近记录动作集合。
 */
export interface RecentRecordActions {
  /** 打开最近记录。 */
  openRecentRecord: (record: RecentRecord) => Promise<void>;
  /** 删除最近记录。 */
  removeRecentRecord: (record: RecentRecord) => Promise<void>;
}

/**
 * 最近记录处理器。
 */
interface RecentRecordHandler {
  /** 打开指定类型的最近记录。 */
  open: (record: RecentRecord) => Promise<void>;
  /** 删除指定类型的最近记录。 */
  remove: (record: RecentRecord) => Promise<void>;
}

/**
 * 最近记录存储实例。
 */
type RecentStore = ReturnType<typeof useRecentStore>;

/**
 * 标签页存储实例。
 */
type TabsStore = ReturnType<typeof useTabsStore>;

/**
 * 文件型记录打开函数。
 */
type OpenDocument = (record: StoredDocumentRecord) => Promise<StoredDocumentRecord | null>;

/**
 * WebView 打开函数。
 */
type OpenWebview = (url: URL) => void;

/**
 * 判断最近记录 URL 是否为 WebView 外链。
 * @param url - 最近记录 URL
 * @returns 是否为 HTTP(S) 外链
 */
function isWebviewUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * 按最近记录稳定键删除记录。
 * @param recentStore - 最近记录存储
 * @param record - 最近记录
 */
async function removeRecent(recentStore: RecentStore, record: RecentRecord): Promise<void> {
  await recentStore.removeFile(createRecentKey(record));
}

/**
 * 跳转到最近记录 URL。
 * @param router - Vue Router 实例
 * @param url - 应用内路由地址
 */
async function pushRecentUrl(router: Router, url: string): Promise<void> {
  await asyncTo(router.push(url));
}

/**
 * 创建文件型最近记录处理器。
 * @param openDocument - 文档打开函数
 * @param recentStore - 最近记录存储
 * @param tabsStore - 标签页存储
 * @returns 文件型最近记录处理器
 */
function createDocumentHandler(openDocument: OpenDocument, recentStore: RecentStore, tabsStore: TabsStore): RecentRecordHandler {
  return {
    /**
     * 打开文件型最近记录。
     * @param record - 最近记录
     */
    async open(record: RecentRecord): Promise<void> {
      if (!isDocumentRecord(record)) return;

      await openDocument(record);
    },
    /**
     * 删除文件型最近记录并关闭同 ID 标签页。
     * @param record - 最近记录
     */
    async remove(record: RecentRecord): Promise<void> {
      await removeRecent(recentStore, record);
      if (isDocumentRecord(record)) tabsStore.removeTab(record.id);
    }
  };
}

/**
 * 创建聊天最近记录处理器。
 * @param recentStore - 最近记录存储
 * @param router - Vue Router 实例
 * @returns 聊天最近记录处理器
 */
function createChatHandler(recentStore: RecentStore, router: Router): RecentRecordHandler {
  return {
    /**
     * 进入最近记录指向的聊天页。
     * @param record - 最近记录
     */
    async open(record: RecentRecord): Promise<void> {
      await pushRecentUrl(router, record.url);
    },
    /**
     * 删除聊天最近记录。
     * @param record - 最近记录
     */
    async remove(record: RecentRecord): Promise<void> {
      await removeRecent(recentStore, record);
    }
  };
}

/**
 * 创建 WebView 最近记录处理器。
 * @param openWebview - WebView 打开函数
 * @param recentStore - 最近记录存储
 * @param router - Vue Router 实例
 * @returns WebView 最近记录处理器
 */
function createWebviewHandler(openWebview: OpenWebview, recentStore: RecentStore, router: Router): RecentRecordHandler {
  return {
    /**
     * 打开 WebView 外链，非外链则回退为应用内路由。
     * @param record - 最近记录
     */
    async open(record: RecentRecord): Promise<void> {
      if (isWebviewUrl(record.url)) {
        openWebview(new URL(record.url));
        return;
      }

      await pushRecentUrl(router, record.url);
    },
    /**
     * 删除 WebView 最近记录。
     * @param record - 最近记录
     */
    async remove(record: RecentRecord): Promise<void> {
      await removeRecent(recentStore, record);
    }
  };
}

/**
 * 提供最近记录打开和删除行为。
 * @returns 最近记录动作集合
 */
export function useRecentRecord(): RecentRecordActions {
  const router = useRouter();
  const { openDocument, openWebview } = useNavigate();
  const recentStore = useRecentStore();
  const tabsStore = useTabsStore();

  const handlers = {
    file: createDocumentHandler(openDocument, recentStore, tabsStore),
    widget: createDocumentHandler(openDocument, recentStore, tabsStore),
    chat: createChatHandler(recentStore, router),
    webview: createWebviewHandler(openWebview, recentStore, router)
  } satisfies Record<RecentRecordType, RecentRecordHandler>;

  /**
   * 打开最近记录。
   * @param record - 最近记录
   */
  async function openRecentRecord(record: RecentRecord): Promise<void> {
    await handlers[record.type].open(record);
  }

  /**
   * 删除最近记录。
   * @param record - 最近记录
   */
  async function removeRecentRecord(record: RecentRecord): Promise<void> {
    await handlers[record.type].remove(record);
  }

  return {
    openRecentRecord,
    removeRecentRecord
  };
}
