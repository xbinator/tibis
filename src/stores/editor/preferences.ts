/**
 * @file editorPreferences.ts
 * @description 编辑器偏好 Store，负责管理视图模式、大纲显示、页宽和保存策略。
 */
import { defineStore } from 'pinia';
import { native } from '@/shared/platform';
import { local } from '@/shared/storage/base';

/**
 * 编辑器默认视图模式。
 */
export type EditorViewMode = 'rich' | 'source';

/**
 * 编辑器正文页宽模式。
 */
export type EditorPageWidth = 'default' | 'wide' | 'full';

/**
 * 编辑器真实磁盘保存策略。
 */
export type EditorSaveStrategy = 'off' | 'onBlur' | 'onChange';

/**
 * Monaco 编辑器自动换行模式。
 */
export type MonacoWordWrap = 'on' | 'off';

const EDITOR_PREFERENCES_STORAGE_KEY = 'editor_preferences';
const LEGACY_SETTINGS_STORAGE_KEY = 'app_settings';

/**
 * 编辑器持久化偏好结构。
 */
interface PersistedEditorPreferences {
  /** 默认视图模式 */
  viewMode: EditorViewMode;
  /** 正文页宽模式 */
  pageWidth: EditorPageWidth;
  /** 真实磁盘保存策略 */
  saveStrategy: EditorSaveStrategy;
  /** 是否显示大纲 */
  showOutline: boolean;
  /** Monaco 自动换行模式 */
  monacoWordWrap: MonacoWordWrap;
}

/**
 * 旧版全局设置中与编辑器相关的快照字段。
 */
interface LegacySettingsSnapshot {
  /** 旧版源码模式开关 */
  sourceMode?: unknown;
  /** 旧版页宽模式 */
  editorPageWidth?: unknown;
}

const DEFAULT_EDITOR_PREFERENCES: PersistedEditorPreferences = {
  viewMode: 'rich',
  pageWidth: 'default',
  saveStrategy: 'off',
  showOutline: false,
  monacoWordWrap: 'off'
};

/**
 * 判断给定值是否为合法的编辑器视图模式。
 * @param value - 待判断的值
 * @returns 是否为合法视图模式
 */
function isEditorViewMode(value: unknown): value is EditorViewMode {
  return value === 'rich' || value === 'source';
}

/**
 * 判断给定值是否为合法的页宽模式。
 * @param value - 待判断的值
 * @returns 是否为合法页宽模式
 */
function isEditorPageWidth(value: unknown): value is EditorPageWidth {
  return value === 'default' || value === 'wide' || value === 'full';
}

/**
 * 判断给定值是否为合法的保存策略。
 * @param value - 待判断的值
 * @returns 是否为合法保存策略
 */
function isEditorSaveStrategy(value: unknown): value is EditorSaveStrategy {
  return value === 'off' || value === 'onBlur' || value === 'onChange';
}

/**
 * 判断给定值是否为合法的 Monaco 自动换行模式。
 * @param value - 待判断的值
 * @returns 是否为合法自动换行模式
 */
function isMonacoWordWrap(value: unknown): value is MonacoWordWrap {
  return value === 'on' || value === 'off';
}

/**
 * 将未知输入归一化为合法的编辑器偏好对象。
 * @param value - 读取到的原始持久化值
 * @returns 归一化后的编辑器偏好
 */
function normalizeEditorPreferences(value: unknown): PersistedEditorPreferences {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<PersistedEditorPreferences>) : {};

  return {
    viewMode: isEditorViewMode(source.viewMode) ? source.viewMode : DEFAULT_EDITOR_PREFERENCES.viewMode,
    pageWidth: isEditorPageWidth(source.pageWidth) ? source.pageWidth : DEFAULT_EDITOR_PREFERENCES.pageWidth,
    saveStrategy: isEditorSaveStrategy(source.saveStrategy) ? source.saveStrategy : DEFAULT_EDITOR_PREFERENCES.saveStrategy,
    showOutline: typeof source.showOutline === 'boolean' ? source.showOutline : DEFAULT_EDITOR_PREFERENCES.showOutline,
    monacoWordWrap: isMonacoWordWrap(source.monacoWordWrap) ? source.monacoWordWrap : DEFAULT_EDITOR_PREFERENCES.monacoWordWrap
  };
}

/**
 * 持久化当前编辑器偏好。
 * @param preferences - 待保存的偏好对象
 */
function persistEditorPreferences(preferences: PersistedEditorPreferences): void {
  local.setItem(EDITOR_PREFERENCES_STORAGE_KEY, preferences);
}

/**
 * 从旧版 app settings 中提取编辑器相关偏好并迁移为新结构。
 * @returns 迁移后的偏好对象
 */
function loadLegacyEditorPreferences(): PersistedEditorPreferences {
  const legacySettings = local.getItem<LegacySettingsSnapshot>(LEGACY_SETTINGS_STORAGE_KEY);

  return normalizeEditorPreferences({
    viewMode: legacySettings?.sourceMode === true ? 'source' : 'rich',
    pageWidth: legacySettings?.editorPageWidth,
    saveStrategy: 'off'
  });
}

/**
 * 加载持久化的编辑器偏好；若新结构不存在则从旧设置迁移。
 * @returns 当前应使用的编辑器偏好
 */
function loadPersistedEditorPreferences(): PersistedEditorPreferences {
  const saved = local.getItem<PersistedEditorPreferences>(EDITOR_PREFERENCES_STORAGE_KEY);
  if (saved) {
    const normalized = normalizeEditorPreferences(saved);
    persistEditorPreferences(normalized);
    return normalized;
  }

  const migrated = loadLegacyEditorPreferences();
  persistEditorPreferences(migrated);
  return migrated;
}

/**
 * 编辑器偏好 Store。
 */
export const useEditorPreferencesStore = defineStore('editorPreferences', {
  state: (): PersistedEditorPreferences => ({
    ...loadPersistedEditorPreferences()
  }),
  actions: {
    /**
     * 同步编辑器相关系统菜单选中态。
     */
    syncNativeMenuState(): void {
      native.updateMenuItem?.('view:source', { checked: this.viewMode === 'source' });
      native.updateMenuItem?.('view:outline', { checked: this.showOutline });
      native.updateMenuItem?.('view:pageWidth:default', { checked: this.pageWidth === 'default' });
      native.updateMenuItem?.('view:pageWidth:wide', { checked: this.pageWidth === 'wide' });
      native.updateMenuItem?.('view:pageWidth:full', { checked: this.pageWidth === 'full' });
    },

    /**
     * 持久化当前 store 状态。
     */
    savePreferences(): void {
      persistEditorPreferences({
        viewMode: this.viewMode,
        pageWidth: this.pageWidth,
        saveStrategy: this.saveStrategy,
        showOutline: this.showOutline,
        monacoWordWrap: this.monacoWordWrap
      });
    },

    /**
     * 设置默认视图模式。
     * @param mode - 目标视图模式
     */
    setViewMode(mode: EditorViewMode): void {
      this.viewMode = mode;
      this.savePreferences();
      this.syncNativeMenuState();
    },

    setPageWidth(width: EditorPageWidth): void {
      this.pageWidth = width;
      this.savePreferences();
      this.syncNativeMenuState();
    },

    /**
     * 设置真实磁盘保存策略。
     * @param strategy - 目标保存策略
     */
    setSaveStrategy(strategy: EditorSaveStrategy): void {
      this.saveStrategy = strategy;
      this.savePreferences();
    },

    /**
     * 设置大纲显示状态。
     * @param visible - 目标显示状态
     */
    setShowOutline(visible: boolean): void {
      this.showOutline = visible;
      this.savePreferences();
      this.syncNativeMenuState();
    },

    /**
     * 设置 Monaco 自动换行模式。
     * @param mode - 目标自动换行模式
     */
    setMonacoWordWrap(mode: MonacoWordWrap): void {
      this.monacoWordWrap = mode;
      this.savePreferences();
    }
  }
});
