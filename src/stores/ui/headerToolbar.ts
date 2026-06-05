/**
 * @file headerToolbar.ts
 * @description Header 动态工具栏 Store，负责接收当前激活视图注册的工具栏控件。
 */
import { defineStore } from 'pinia';

/**
 * Header 工具栏点击处理函数。
 */
export type HeaderToolbarClickHandler = () => void | Promise<void>;

/**
 * Header 工具栏基础条目配置。
 */
interface HeaderToolbarBaseItem {
  /** 条目唯一标识 */
  key: string;
  /** 是否显示当前条目 */
  visible?: boolean;
}

/**
 * Header 工具栏普通按钮配置。
 */
export interface HeaderToolbarAction extends HeaderToolbarBaseItem {
  /** 条目类型 */
  type: 'action';
  /** 图标名称 */
  icon: string;
  /** 鼠标悬浮提示 */
  tooltip: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否处于激活态 */
  active?: boolean;
  /** 点击按钮时执行的动作 */
  onClick: HeaderToolbarClickHandler;
}

/**
 * Header 工具栏单选下拉选项。
 */
export interface HeaderToolbarSelectOption {
  /** 选项值 */
  value: string;
  /** 选项文案 */
  label: string;
  /** 选项图标 */
  icon?: string;
}

/**
 * Header 工具栏单选下拉配置。
 */
export interface HeaderToolbarSelect extends HeaderToolbarBaseItem {
  /** 条目类型 */
  type: 'select';
  /** 当前选中值 */
  value: string;
  /** 下拉提示文案 */
  tooltip?: string;
  /** 下拉宽度 */
  width?: number;
  /** 选项列表 */
  options: HeaderToolbarSelectOption[];
  /** 选项变更回调 */
  onChange: (value: string) => void;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * Header 工具栏菜单分隔线。
 */
export interface HeaderToolbarMenuDivider {
  /** 菜单项类型 */
  type: 'divider';
}

/**
 * Header 工具栏菜单项。
 */
export interface HeaderToolbarMenuOption {
  /** 菜单项类型 */
  type?: 'item';
  /** 菜单项唯一值 */
  value: string;
  /** 菜单项文案 */
  label: string;
  /** 菜单项图标 */
  icon?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否选中 */
  checked?: boolean;
  /** 点击菜单项时执行的动作 */
  onClick?: HeaderToolbarClickHandler;
  /** 子菜单项 */
  children?: Array<HeaderToolbarMenuOption | HeaderToolbarMenuDivider>;
}

/**
 * Header 工具栏菜单条目。
 */
export type HeaderToolbarMenuItem = HeaderToolbarMenuOption | HeaderToolbarMenuDivider;

/**
 * Header 工具栏菜单配置。
 */
export interface HeaderToolbarMenu extends HeaderToolbarBaseItem {
  /** 条目类型 */
  type: 'menu';
  /** 触发按钮图标 */
  icon: string;
  /** 鼠标悬浮提示 */
  tooltip?: string;
  /** 菜单宽度 */
  width?: number;
  /** 菜单项列表 */
  options: HeaderToolbarMenuItem[];
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * Header 工具栏分隔线配置。
 */
export interface HeaderToolbarDivider {
  /** 条目类型 */
  type: 'divider';
  /** 分隔线唯一标识 */
  key: string;
  /** 是否显示当前分隔线 */
  visible?: boolean;
}

/**
 * Header 工具栏条目。
 */
export type HeaderToolbarItem = HeaderToolbarAction | HeaderToolbarSelect | HeaderToolbarMenu | HeaderToolbarDivider;

/**
 * Header 工具栏 Store 状态。
 */
interface HeaderToolbarState {
  /** 当前工具栏注册者 ID */
  ownerId: string;
  /** 当前工具栏条目 */
  items: HeaderToolbarItem[];
}

/**
 * Header 动态工具栏 Store。
 */
export const useHeaderToolbarStore = defineStore('headerToolbar', {
  state: (): HeaderToolbarState => ({
    ownerId: '',
    items: []
  }),
  getters: {
    /**
     * 当前可见工具栏条目。
     * @param state - Store 状态
     * @returns 过滤隐藏项后的工具栏条目
     */
    visibleItems: (state): HeaderToolbarItem[] => state.items.filter((item) => item.visible !== false)
  },
  actions: {
    /**
     * 注册当前激活视图的 Header 工具栏。
     * @param ownerId - 注册者 ID
     * @param items - 工具栏条目
     */
    register(ownerId: string, items: HeaderToolbarItem[]): void {
      this.ownerId = ownerId;
      this.items = [...items];
    },

    /**
     * 注销 Header 工具栏；只有当前注册者匹配时才清空。
     * @param ownerId - 注册者 ID
     */
    unregister(ownerId: string): void {
      if (this.ownerId !== ownerId) {
        return;
      }

      this.ownerId = '';
      this.items = [];
    }
  }
});
