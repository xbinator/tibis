<!--
  @file index.vue
  @description 独立Widget工具页面。
-->
<template>
  <main class="widget-page" tabindex="0" :style="widgetPageStyle" @blur="session.actions.onBlur">
    <PanelSidebar
      v-model:value="session.data.value"
      :active-element-id="activeElementId"
      :elements="session.data.value.elements"
      :selected-element-ids="selectedElementIds"
      :settings-width="settingsWidth"
      @save="handleSave"
      @select-elements="layer.select"
      @copy-elements="layer.copy"
      @delete-elements="layer.remove"
      @move-elements="layer.move"
    />

    <section ref="canvasRef" class="widget-page__canvas">
      <BWidget
        ref="widgetRef"
        :select="selectedTarget"
        :value="session.data.value"
        @selection-change="onSelectionUpdate"
        @update:select="onSelectUpdate"
        @update:value="onDataUpdate"
      />
    </section>

    <BPanelSplitter v-model:size="settingsWidth" class="widget-page__settings" position="left" :min-width="220" :max-width="320">
      <PanelSettings
        v-model:value="session.data.value"
        v-model:select="selectedTarget"
        :selected-element-ids="selectedElementIds"
        @element-command="(command) => onElementCommand({ command })"
        @multi-command="(command) => onMultiCommand({ command })"
        @multi-layout-change="onMultiLayoutChange"
        @multi-style-change="onMultiStyleChange"
      />
    </BPanelSplitter>
  </main>
</template>

<script setup lang="ts">
import type { WidgetComponentRef } from './hooks/types';
import { ref } from 'vue';
import PanelSettings from './components/PanelSettings.vue';
import PanelSidebar from './components/PanelSidebar.vue';
import { useCanvasDrop } from './hooks/useCanvasDrop';
import { useLayerActions } from './hooks/useLayerActions';
import { useMultiSelection } from './hooks/useMultiSelection';
import { usePageSession } from './hooks/usePageSession';
import { useSelection } from './hooks/useSelection';

const widgetRef = ref<WidgetComponentRef>();
const canvasRef = ref<HTMLElement | null>(null);
const { session, settingsWidth, widgetPageStyle, handleSave } = usePageSession();
const { selectedTarget, selectedElementIds, activeElementId, onDataUpdate, onSelectUpdate, onSelectionUpdate } = useSelection({
  session,
  settingsWidth
});

useCanvasDrop({ canvasRef, widgetRef });

// 创建侧栏图层操作处理器。
const layer = useLayerActions({
  session,
  selectedTarget,
  selectedElementIds,
  widgetRef
});

const { onMultiCommand, onElementCommand, onMultiLayoutChange, onMultiStyleChange } = useMultiSelection({
  session,
  selectedElementIds,
  widgetRef
});
</script>

<style lang="less" scoped>
.widget-page {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
}

.widget-page__canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex: 1;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
}

.widget-page__settings {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  pointer-events: none;
}

.widget-page__settings :deep(.b-panel-splitter__section),
.widget-page__settings :deep(.b-panel-splitter__line) {
  pointer-events: auto;
}

.widget-page :deep(.b-widget-toolbar__group--bottom-left) {
  right: calc(var(--widget-page-settings-width) + 12px);
}
</style>
