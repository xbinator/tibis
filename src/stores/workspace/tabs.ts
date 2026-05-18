/**
 * @file tabs.ts
 * @description 管理编辑器标签页列表、脏状态以及持久化顺序。
 */

import { defineStore } from 'pinia';
import { resolveRouteCacheName } from '@/router/cache';
import { local } from '@/shared/storage/base';

/**
 * 拖拽排序时的插入位置。
 */
export type TabMovePosition = 'before' | 'after';

/**
 * 标签页关闭动作类型。
 */
export type TabCloseAction = 'close' | 'closeOthers' | 'closeRight' | 'closeSaved' | 'closeAll';

/**
 * 关闭计划生成时的输入参数。
 */
export interface TabClosePlanOptions {
  /** 右键命中的锚点标签 ID */
  anchorTabId?: string | null;
  /** 调用方感知到的当前激活标签 ID */
  activeTabId?: string | null;
  /** 是否允许关闭最后一个剩余标签 */
  allowCloseLastTab?: boolean;
}

/**
 * 单个标签页数据。
 */
export interface Tab {
  /** 标签页唯一标识 */
  id: string;
  /** 当前页面路径（router path / fullPath） */
  path: string;
  /** 标签页显示的标题 */
  title: string;
  /** 标签页对应的 KeepAlive 缓存 key */
  cacheKey?: string;
}

/**
 * 标签页状态结构。
 */
export interface TabsState {
  /** 标签页列表 */
  tabs: Tab[];
  /** 标签页未保存修改状态映射 */
  dirtyById: Record<string, boolean>;
  /** 标签页对应文件已从磁盘丢失的状态映射 */
  missingById: Record<string, boolean>;
  /** 当前需要保留的 KeepAlive 缓存 key 列表 */
  cachedKeys: string[];
}

/**
 * 单次标签页关闭动作的执行计划。
 */
export interface TabClosePlan {
  /** 关闭动作类型 */
  action: TabCloseAction;
  /** 本次动作的锚点标签 ID */
  anchorTabId: string | null;
  /** 当前激活标签 ID */
  activeTabId: string | null;
  /** 是否允许关闭最后一个剩余标签 */
  allowCloseLastTab: boolean;
  /** 当前动作是否禁用 */
  disabled: boolean;
  /** 命中的目标标签 ID 列表 */
  targetTabIds: string[];
  /** 目标中处于脏状态的标签 ID 列表 */
  dirtyTabIds: string[];
  /** 是否需要二次确认 */
  requiresConfirm: boolean;
  /** 执行后是否需要导航 */
  requiresNavigation: boolean;
  /** 导航目标路径；当 requiresNavigation 为 true 且为 null 时表示跳转欢迎页 */
  nextActivePath: string | null;
}

const TABS_STORAGE_KEY = 'app_tabs';

/**
 * 规范化标签页数据，兼容历史缓存中缺少 cacheKey 的记录。
 * @param tab - 待规范化的标签页
 * @returns 带有缓存 key 的标签页
 */
function normalizeTab(tab: Tab): Tab {
  return { id: tab.id, path: tab.path, title: tab.title, cacheKey: tab.cacheKey || tab.id };
}

/**
 * 去重缓存 key，并过滤空值。
 * @param keys - 缓存 key 列表
 * @returns 去重后的缓存 key 列表
 */
function normalizeCachedKeys(keys: string[]): string[] {
  return Array.from(new Set(keys.filter(Boolean)));
}

/**
 * 读取本地持久化的标签页数据。
 * @returns 标签页状态
 */
export function loadSavedData(): TabsState {
  const saved = local.getItem<TabsState>(TABS_STORAGE_KEY);
  if (!saved || !Array.isArray(saved.tabs)) return { tabs: [], dirtyById: {}, missingById: {}, cachedKeys: [] };

  const tabs = saved.tabs.map(normalizeTab);
  const savedCachedKeys = Array.isArray(saved.cachedKeys) ? saved.cachedKeys : [];

  return {
    tabs,
    dirtyById: saved.dirtyById ?? {},
    missingById: saved.missingById ?? {},
    cachedKeys: normalizeCachedKeys([...savedCachedKeys, ...tabs.map((tab) => tab.cacheKey || tab.id)])
  };
}

/**
 * 持久化标签页状态。
 * @param state - 当前标签页状态
 */
export function persistData(state: TabsState): void {
  local.setItem(TABS_STORAGE_KEY, state);
}

/**
 * 在标签页列表中查找指定标签的索引。
 * @param tabs - 当前标签页列表
 * @param tabId - 待查找的标签 ID
 * @returns 标签索引，不存在时返回 -1
 */
function findTabIndex(tabs: Tab[], tabId: string | null | undefined): number {
  if (!tabId) {
    return -1;
  }

  return tabs.findIndex((tab) => tab.id === tabId);
}

/**
 * 按关闭动作收集将被关闭的目标标签。
 * @param tabs - 当前标签页列表
 * @param action - 关闭动作类型
 * @param anchorIndex - 锚点标签索引
 * @param dirtyById - 脏状态映射
 * @returns 命中的目标标签列表
 */
function collectTargetTabs(tabs: Tab[], action: TabCloseAction, anchorIndex: number, dirtyById: Record<string, boolean>): Tab[] {
  if (action === 'close') {
    return anchorIndex === -1 ? [] : [tabs[anchorIndex]];
  }

  if (action === 'closeOthers') {
    return anchorIndex === -1 ? [] : tabs.filter((_, index) => index !== anchorIndex);
  }

  if (action === 'closeRight') {
    return anchorIndex === -1 ? [] : tabs.slice(anchorIndex + 1);
  }

  if (action === 'closeSaved') {
    return tabs.filter((tab) => dirtyById[tab.id] !== true);
  }

  return tabs.slice();
}

/**
 * 收集目标集合中的脏标签 ID。
 * @param targetTabIds - 目标标签 ID 列表
 * @param dirtyById - 脏状态映射
 * @returns 脏标签 ID 列表
 */
function collectDirtyTabIds(targetTabIds: string[], dirtyById: Record<string, boolean>): string[] {
  return targetTabIds.filter((tabId) => dirtyById[tabId] === true);
}

/**
 * 计算关闭后需要回退到的标签路径。
 * @param tabs - 关闭前的标签顺序
 * @param activeTabId - 当前激活标签 ID
 * @param targetTabIds - 本次将关闭的标签 ID 列表
 * @returns 导航目标路径；null 表示应跳转欢迎页
 */
function resolveNextActivePath(tabs: Tab[], activeTabId: string | null, targetTabIds: string[]): string | null {
  const activeIndex = findTabIndex(tabs, activeTabId);
  if (activeIndex === -1) {
    return null;
  }

  const closingIds = new Set(targetTabIds);
  const survivingTabs = tabs.filter((tab) => !closingIds.has(tab.id));
  if (survivingTabs.length === 0) {
    return null;
  }

  // 优先选择原激活标签右侧仍然保留的标签。
  for (let index = activeIndex + 1; index < tabs.length; index += 1) {
    const candidate = tabs[index];
    if (candidate && !closingIds.has(candidate.id)) {
      return candidate.path;
    }
  }

  // 若右侧没有，再回退到左侧最近的保留标签。
  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    const candidate = tabs[index];
    if (candidate && !closingIds.has(candidate.id)) {
      return candidate.path;
    }
  }

  return null;
}

/**
 * 生成不可执行的空关闭计划。
 * @param action - 关闭动作类型
 * @param anchorTabId - 锚点标签 ID
 * @param activeTabId - 当前激活标签 ID
 * @param allowCloseLastTab - 是否允许关闭最后一个标签
 * @returns 禁用态关闭计划
 */
function createDisabledClosePlan(action: TabCloseAction, anchorTabId: string | null, activeTabId: string | null, allowCloseLastTab: boolean): TabClosePlan {
  return {
    action,
    anchorTabId,
    activeTabId,
    allowCloseLastTab,
    disabled: true,
    targetTabIds: [],
    dirtyTabIds: [],
    requiresConfirm: false,
    requiresNavigation: false,
    nextActivePath: null
  };
}

// 标签页状态管理 Store
export const useTabsStore = defineStore('tabs', {
  state: (): TabsState => loadSavedData(),

  getters: {
    /**
     * 获取当前 KeepAlive 应保留的包装组件名称。
     * Vue KeepAlive 的 include 按组件名过滤，因此不能直接使用业务缓存 key。
     * @param state - 标签页状态
     * @returns 组件名称列表
     */
    cachedComponentNames: (state): string[] => state.cachedKeys.map(resolveRouteCacheName),

    /**
     * 获取当前激活的标签页对象。
     * @returns 当前激活标签页，暂未维护 activeId 时返回 null
     */
    activeTab: (): Tab | null => {
      // 由于 activeId 已移除，这里返回 null
      return null;
    }
  },

  actions: {
    /**
     * 添加或更新标签页。
     * @param tab - 需要加入状态的标签页
     */
    addTab(tab: Tab): void {
      const normalizedTab = normalizeTab(tab);
      const index = this.tabs.findIndex((t) => t.id === normalizedTab.id);
      if (tab.path.startsWith('/settings')) {
        const _index = this.tabs.findIndex((t) => t.path.includes('/settings'));

        const _tab = { ...normalizedTab, title: '设置' };
        _index === -1 ? this.tabs.push(_tab) : (this.tabs[_index] = _tab);
      } else if (index === -1) {
        this.tabs.push(normalizedTab);
      } else {
        this.tabs[index] = normalizedTab;
      }

      const cacheKey = normalizedTab.cacheKey || normalizedTab.id;
      if (cacheKey && !this.cachedKeys.includes(cacheKey)) {
        this.cachedKeys.push(cacheKey);
      }

      persistData(this.$state);
    },

    /**
     * 按拖拽结果重新排列标签页顺序。
     * @param fromId - 被拖拽标签页 ID
     * @param toId - 目标标签页 ID
     * @param position - 插入到目标标签页前方或后方
     */
    moveTab(fromId: string, toId: string, position: TabMovePosition = 'before'): void {
      if (fromId === toId) {
        return;
      }

      const fromIndex = this.tabs.findIndex((tab) => tab.id === fromId);
      const toIndex = this.tabs.findIndex((tab) => tab.id === toId);
      if (fromIndex === -1 || toIndex === -1) {
        return;
      }

      const [movedTab] = this.tabs.splice(fromIndex, 1);
      if (!movedTab) {
        return;
      }

      const nextTargetIndex = this.tabs.findIndex((tab) => tab.id === toId);
      if (nextTargetIndex === -1) {
        this.tabs.splice(fromIndex, 0, movedTab);
        return;
      }

      const insertIndex = position === 'after' ? nextTargetIndex + 1 : nextTargetIndex;
      this.tabs.splice(insertIndex, 0, movedTab);
      persistData(this.$state);
    },

    /**
     * 根据关闭动作生成统一关闭计划。
     * @param action - 关闭动作类型
     * @param options - 关闭动作上下文
     * @returns 关闭计划
     */
    getClosePlan(action: TabCloseAction, options: TabClosePlanOptions = {}): TabClosePlan {
      const anchorTabId = options.anchorTabId ?? null;
      const activeTabId = options.activeTabId ?? null;
      const allowCloseLastTab = options.allowCloseLastTab === true;
      const anchorIndex = findTabIndex(this.tabs, anchorTabId);
      const activeIndex = findTabIndex(this.tabs, activeTabId);
      const targetTabs = collectTargetTabs(this.tabs, action, anchorIndex, this.dirtyById);
      const targetTabIds = targetTabs.map((tab) => tab.id);
      const dirtyTabIds = collectDirtyTabIds(targetTabIds, this.dirtyById);

      let disabled = false;
      if (action === 'close') {
        disabled = anchorIndex === -1 || (!allowCloseLastTab && this.tabs.length === 1);
      } else if (action === 'closeOthers') {
        disabled = anchorIndex === -1 || this.tabs.length === 1;
      } else if (action === 'closeRight') {
        disabled = anchorIndex === -1 || anchorIndex === this.tabs.length - 1;
      } else if (action === 'closeSaved') {
        disabled = targetTabIds.length === 0;
      } else if (action === 'closeAll') {
        disabled = this.tabs.length === 0;
      }

      if (disabled || targetTabIds.length === 0) {
        return createDisabledClosePlan(action, anchorTabId, activeTabId, allowCloseLastTab);
      }

      const closesActiveTab = activeIndex !== -1 && targetTabIds.includes(activeTabId as string);

      return {
        action,
        anchorTabId,
        activeTabId,
        allowCloseLastTab,
        disabled: false,
        targetTabIds,
        dirtyTabIds,
        requiresConfirm: action !== 'closeSaved' && dirtyTabIds.length > 0,
        requiresNavigation: closesActiveTab,
        nextActivePath: closesActiveTab ? resolveNextActivePath(this.tabs, activeTabId, targetTabIds) : null
      };
    },

    /**
     * 按关闭计划批量删除标签页。
     * @param plan - 已确认的关闭计划
     */
    applyClosePlan(plan: TabClosePlan): void {
      if (plan.disabled || plan.targetTabIds.length === 0) {
        return;
      }

      const existingIds = new Set(this.tabs.map((tab) => tab.id));
      const validIds = plan.targetTabIds.filter((tabId) => existingIds.has(tabId));
      if (validIds.length === 0) {
        return;
      }

      this.removeTabsByIds(validIds);
    },

    /**
     * 批量删除标签页并清理关联状态。
     * @param ids - 待删除的标签页 ID 列表
     */
    removeTabsByIds(ids: string[]): void {
      if (ids.length === 0) {
        return;
      }

      const idSet = new Set(ids);
      const removedCacheKeys = this.tabs
        .filter((tab) => idSet.has(tab.id))
        .map((tab) => tab.cacheKey || tab.id)
        .filter(Boolean);

      this.tabs = this.tabs.filter((tab) => !idSet.has(tab.id));
      this.cachedKeys = this.cachedKeys.filter((cacheKey) => !removedCacheKeys.includes(cacheKey));

      ids.forEach((id) => {
        delete this.dirtyById[id];
        delete this.missingById[id];
      });

      persistData(this.$state);
    },

    /**
     * 删除标签页。
     * @param id - 标签页 ID
     */
    removeTab(id: string): void {
      this.removeTabsByIds([id]);
    },

    /**
     * 标记标签页存在未保存修改。
     * @param id - 标签页 ID
     */
    setDirty(id: string): void {
      this.dirtyById[id] = true;
      persistData(this.$state);
    },

    /**
     * 清除标签页未保存修改标记。
     * @param id - 标签页 ID
     */
    clearDirty(id: string): void {
      this.dirtyById[id] = false;
      persistData(this.$state);
    },

    /**
     * 检查标签页是否存在未保存修改。
     * @param id - 标签页 ID
     * @returns 是否为脏状态
     */
    isDirty(id: string): boolean {
      return this.dirtyById[id] === true;
    },

    /**
     * 标记标签页对应的磁盘文件已丢失。
     * @param id - 标签页 ID
     */
    markMissing(id: string): void {
      this.missingById[id] = true;
      persistData(this.$state);
    },

    /**
     * 清除标签页对应的磁盘文件丢失标记。
     * @param id - 标签页 ID
     */
    clearMissing(id: string): void {
      this.missingById[id] = false;
      persistData(this.$state);
    },

    /**
     * 检查标签页对应的磁盘文件是否已丢失。
     * @param id - 标签页 ID
     * @returns 文件是否已丢失
     */
    isMissing(id: string): boolean {
      return this.missingById[id] === true;
    },

    /**
     * 更新标签页标题。
     * @param params - 包含 id 和 title 的对象
     */
    updateTabTitle(params: { id: string; title: string }): void {
      const index = this.tabs.findIndex((t) => t.id === params.id);
      if (index === -1) return;

      this.tabs[index] = { ...this.tabs[index], title: params.title };
      persistData(this.$state);
    }
  }
});
