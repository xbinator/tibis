<!--
  @file index.vue
  @description 基础设置页，管理配色方案、编辑器视图偏好与保存策略。
-->
<template>
  <BSettingsPage :title="MENU_ITEMS.basic.label">
    <BSettingsSection title="配色方案">
      <div class="basic-settings__item">
        <div class="basic-settings__meta">
          <div class="basic-settings__label">外观</div>
        </div>
        <div>
          <BSelect :value="settingStore.theme" :options="themeOptions" :width="280" @change="handleThemeChange" />
        </div>
      </div>
      <div class="basic-settings__item">
        <div class="basic-settings__meta">
          <div class="basic-settings__label">主题风格</div>
        </div>
        <div>
          <BSelect :value="settingStore.themePreset" :options="presetOptions" :width="280" @change="handlePresetChange" />
        </div>
      </div>
    </BSettingsSection>

    <BSettingsSection title="编辑器">
      <div class="basic-settings__item">
        <div class="basic-settings__meta">
          <div class="basic-settings__label">自动保存</div>
        </div>
        <div>
          <BSelect :value="editorStore.saveStrategy" :options="saveStrategyOptions" :width="280" @change="handleSaveStrategyChange" />
        </div>
      </div>

      <div class="basic-settings__item">
        <div class="basic-settings__meta">
          <div class="basic-settings__label">默认视图模式</div>
        </div>
        <div>
          <BSelect :value="editorStore.viewMode" :options="viewModeOptions" :width="280" @change="handleViewModeChange" />
        </div>
      </div>

      <div class="basic-settings__item">
        <div class="basic-settings__meta">
          <div class="basic-settings__label">页面宽度</div>
        </div>
        <div>
          <BSelect :value="editorStore.pageWidth" :options="pageWidthOptions" :width="280" @change="handlePageWidthChange" />
        </div>
      </div>
    </BSettingsSection>
  </BSettingsPage>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SelectOption } from '@/components/BSelect/types';
import type { EditorViewMode, EditorPageWidth, EditorSaveStrategy } from '@/stores/editor/preferences';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';
import type { ThemeMode } from '@/stores/ui/setting';
import { useSettingStore } from '@/stores/ui/setting';
import { getPresetList } from '@/theme';
import { MENU_ITEMS } from '@/views/settings/constants';

const editorStore = useEditorPreferencesStore();
const settingStore = useSettingStore();

/**
 * 配色方案选项。
 */
const themeOptions: SelectOption[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色主题' },
  { value: 'dark', label: '深色主题' }
];

/**
 * 主题风格选项，从注册表动态获取。
 */
const presetOptions = computed<SelectOption[]>(() => getPresetList().map((p) => ({ value: p.id, label: p.label })));

/**
 * 默认视图模式选项。
 */
const viewModeOptions: SelectOption[] = [
  { value: 'rich', label: '富文本' },
  { value: 'source', label: '源码' }
];

/**
 * 页宽模式选项。
 */
const pageWidthOptions: SelectOption[] = [
  { value: 'default', label: '默认' },
  { value: 'wide', label: '宽版' },
  { value: 'full', label: '全宽' }
];

/**
 * 保存策略选项。
 */
const saveStrategyOptions: SelectOption[] = [
  { value: 'off', label: '关闭', tips: '不自动保存，需手动保存所有更改' },
  { value: 'onBlur', label: '失焦保存', tips: '编辑器失去焦点时，自动保存已修改的内容' },
  { value: 'onChange', label: '实时保存', tips: '内容变更时立即自动保存' }
];

/**
 * 处理配色方案变更。
 * @param value - 新的主题模式
 */
function handleThemeChange(value: string | number): void {
  settingStore.setTheme(value as ThemeMode);
}

/**
 * 处理主题风格变更。
 * @param value - 新的预设 ID
 */
function handlePresetChange(value: string | number): void {
  settingStore.setThemePreset(value as string);
}

function handleViewModeChange(value: string | number): void {
  editorStore.setViewMode(value as EditorViewMode);
}

function handlePageWidthChange(value: string | number): void {
  editorStore.setPageWidth(value as EditorPageWidth);
}

function handleSaveStrategyChange(value: string | number): void {
  editorStore.setSaveStrategy(value as EditorSaveStrategy);
}
</script>

<style scoped lang="less">
// ─── Item ─────────────────────────────────────────────────────────────────────
.basic-settings__item {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  padding: 0 16px;
  transition: background 0.2s ease;

  & + & {
    border-top: 1px solid var(--border-tertiary);
  }

  &:hover {
    background: var(--bg-hover);
  }

  &:focus-within {
    background: var(--bg-hover);
  }
}

.basic-settings__meta {
  flex: 1;
  min-width: 0;
  padding: 12px 0;
}

.basic-settings__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

// ─── Responsive ───────────────────────────────────────────────────────────────

@media (width <= 720px) {
  .basic-settings__item {
    flex-direction: column;
    align-items: flex-start;

    :deep(.b-select) {
      width: 100%;
    }
  }
}

// ─── Accessibility ────────────────────────────────────────────────────────────

@media (prefers-reduced-motion: reduce) {
  .basic-settings__item {
    transition: none;
  }
}
</style>
