<template>
  <div class="editor-layout editor-content">
    <div class="editor-main-container">
      <div class="editor-content-wrapper">
        <BEditor
          :key="fileState.id"
          v-model:value="fileState.content"
          v-model:title="fileState.name"
          :editor-id="fileState?.id"
          :show-outline="viewState.showOutline"
        />

        <!-- :view-mode="viewState.mode" -->
      </div>

      <!-- 辅助工具侧边栏 -->
      <BPanelSplitter v-show="sidebarState.visible" v-model:size="sidebarState.width" position="left" :min-width="200" :max-width="500">
        <AuxiliarySidebar />
      </BPanelSplitter>

      <ShortcutsHelp v-model:visible="visible.shortcuts" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EditorFile } from './types';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import BEditor from '@/components/BEditor/index.vue';
import BPanelSplitter from '@/components/BPanelSplitter/index.vue';
import { recentFilesStorage } from '@/shared/storage';
import AuxiliarySidebar from './components/AuxiliarySidebar.vue';
import ShortcutsHelp from './components/ShortcutsHelp.vue';

const route = useRoute();

const fileId = computed(() => (route.params.id || '') as string);

const fileState = ref<EditorFile>({ id: '', name: '', content: '', ext: '', path: null });

const viewState = reactive({ mode: 'rich', showOutline: true });

const sidebarState = ref({ visible: false, width: 300 });

const visible = reactive({ shortcuts: false });

async function loadFileState() {
  if (!fileId.value) return;

  const stored = await recentFilesStorage.getRecentFile(fileId.value);

  stored && (fileState.value = stored);
}

watch(fileId, () => loadFileState(), { immediate: true });
</script>

<style lang="less" scoped>
.editor-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor-main-container {
  position: relative;
  display: flex;
  flex: 1;
  gap: 6px;
  height: 100%;
  margin: 0 6px 6px;
  overflow: hidden;
}

.editor-content-wrapper {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
}
</style>
