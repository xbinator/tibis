/**
 * @file widget.ts
 * @description Widget 编辑页工具上下文与当前激活页面注册表。
 */
import type { WidgetData } from '@/components/BWidget/types';

/**
 * Widget 文件快照。
 */
export interface WidgetDocumentFileSnapshot {
  /** 文件唯一 ID */
  id: string;
  /** 文件名主体 */
  name: string;
  /** 文件扩展名 */
  ext: string;
  /** 磁盘路径，未保存时为空 */
  path: string | null;
  /** 当前标签页标题 */
  title: string;
}

/**
 * Widget 编辑页文档快照。
 */
export interface WidgetDocumentSnapshot {
  /** 当前文件信息 */
  file: WidgetDocumentFileSnapshot;
  /** 当前页面内存中的 WidgetData */
  value: WidgetData;
}

/**
 * Widget 编辑页工具上下文。
 */
export interface WidgetToolContext {
  /** Widget 文件 ID */
  id: string;
  /**
   * 读取当前页面内存快照。
   * @returns Widget 文档快照
   */
  getSnapshot: () => WidgetDocumentSnapshot;
  /**
   * 替换当前页面 WidgetData。
   * @param value - 新 WidgetData
   */
  replaceValue: (value: WidgetData) => Promise<void> | void;
}

/**
 * Widget 工具上下文注册表。
 */
export interface WidgetToolContextRegistry {
  /**
   * 注册 Widget 页面上下文，不改变当前激活项。
   * @param id - Widget 文件 ID
   * @param context - Widget 工具上下文
   */
  register: (id: string, context: WidgetToolContext) => void;
  /**
   * 注销 Widget 页面上下文。
   * @param id - Widget 文件 ID
   */
  unregister: (id: string) => void;
  /**
   * 标记当前激活 Widget 页面。
   * @param id - Widget 文件 ID
   */
  setCurrent: (id: string) => void;
  /**
   * 清理当前激活 Widget 页面。
   * @param id - Widget 文件 ID
   */
  clearCurrent: (id: string) => void;
  /**
   * 读取当前激活 Widget 页面上下文。
   * @returns 当前上下文，不存在时返回 undefined
   */
  getCurrentContext: () => WidgetToolContext | undefined;
  /**
   * 按文件 ID 读取已注册的 Widget 页面上下文。
   * @param id - Widget 文件 ID
   * @returns 匹配的上下文，不存在时返回 undefined
   */
  getContext: (id: string) => WidgetToolContext | undefined;
}

/**
 * 创建 Widget 工具上下文注册表。
 * @returns Widget 工具上下文注册表
 */
export function createWidgetToolContextRegistry(): WidgetToolContextRegistry {
  /** Widget 文件 ID 到上下文的映射。 */
  const contexts = new Map<string, WidgetToolContext>();
  /** 当前激活 Widget 文件 ID。 */
  let currentId: string | null = null;

  return {
    register(id: string, context: WidgetToolContext): void {
      contexts.set(id, context);
    },
    unregister(id: string): void {
      contexts.delete(id);
      if (currentId === id) {
        currentId = null;
      }
    },
    setCurrent(id: string): void {
      if (contexts.has(id)) {
        currentId = id;
      }
    },
    clearCurrent(id: string): void {
      if (currentId === id) {
        currentId = null;
      }
    },
    getCurrentContext(): WidgetToolContext | undefined {
      return currentId === null ? undefined : contexts.get(currentId);
    },
    getContext(id: string): WidgetToolContext | undefined {
      return contexts.get(id);
    }
  };
}

/** 全局 Widget 工具上下文注册表单例。 */
export const widgetToolContextRegistry = createWidgetToolContextRegistry();
