<!--
  @file index.vue
  @description 编辑器设置页，负责管理视图偏好与真实写盘保存策略。
-->
<template>
  <BSettingsPage title="编辑器">
    <BSettingsSection title="常用设置">
      <div class="editor-settings__item">
        <div class="editor-settings__meta">
          <div class="editor-settings__label">自动保存</div>
        </div>
        <div>
          <BSelect :value="store.saveStrategy" :options="saveStrategyOptions" :width="280" @change="handleSaveStrategyChange" />
        </div>
      </div>
    </BSettingsSection>

    <BSettingsSection title="视图">
      <div class="editor-settings__item">
        <div class="editor-settings__meta">
          <div class="editor-settings__label">默认视图模式</div>
        </div>
        <div>
          <BSelect :value="store.viewMode" :options="viewModeOptions" :width="280" @change="handleViewModeChange" />
        </div>
      </div>

      <div class="editor-settings__item">
        <div class="editor-settings__meta">
          <div class="editor-settings__label">页面宽度</div>
        </div>
        <div>
          <BSelect :value="store.pageWidth" :options="pageWidthOptions" :width="280" @change="handlePageWidthChange" />
        </div>
      </div>
    </BSettingsSection>
  </BSettingsPage>
</template>

<script setup lang="ts">
import { SelectOption } from '@/components/BSelect/types';
import type { EditorViewMode, EditorPageWidth, EditorSaveStrategy } from '@/stores/editor/preferences';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';

const store = useEditorPreferencesStore();

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

function handleViewModeChange(value: string | number) {
  store.setViewMode(value as EditorViewMode);
}

function handlePageWidthChange(value: string | number) {
  store.setPageWidth(value as EditorPageWidth);
}

function handleSaveStrategyChange(value: string | number) {
  store.setSaveStrategy(value as EditorSaveStrategy);
}
</script>

<style scoped lang="less">
// ─── Item ─────────────────────────────────────────────────────────────────────
.editor-settings__item {
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

.editor-settings__meta {
  flex: 1;
  min-width: 0;
  padding: 12px 0;
}

.editor-settings__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

// ─── Responsive ───────────────────────────────────────────────────────────────

@media (width <= 720px) {
  .editor-settings__item {
    flex-direction: column;
    align-items: flex-start;

    :deep(.b-select) {
      width: 100%;
    }
  }
}

// ─── Accessibility ────────────────────────────────────────────────────────────

@media (prefers-reduced-motion: reduce) {
  .editor-settings__item {
    transition: none;
  }
}
</style>
