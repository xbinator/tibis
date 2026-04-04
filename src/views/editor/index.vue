<template>
  <div class="editor-layout">
    <div class="editor-header">
      <div class="header-left">
        <Toolbar :title="'文件'" :options="toolbarFileOptions" />

        <Toolbar :title="'编辑'" :options="toolbarEditOptions" />

        <Toolbar :title="'视图'" show-selected-check :options="toolbarViewOptions" />
      </div>

      <FindBar v-model:visible="visible.find" :content="fileState.content" :editor-instance="editorInstance" />
    </div>

    <div class="editor-content">
      <BEditor
        :key="fileState.id"
        ref="editorInstance"
        v-model:value="fileState.content"
        v-model:title="fileState.name"
        :editor-id="fileState?.id"
        :view-mode="viewState.mode"
        :show-outline="viewState.showOutline"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EditorFile } from './types';
import { reactive, ref } from 'vue';
import BEditor from '@/components/BEditor/index.vue';
import Toolbar from '@/components/Toolbar.vue';
import FindBar from './components/FindBar.vue';
import { useAutoSave } from './hooks/useAutoSave';
import { useEditActive } from './hooks/useEditActive';
import { useFileActive } from './hooks/useFileActive';
import { useViewActive } from './hooks/useViewActive';

const fileState = ref<EditorFile>({ id: '', path: '', content: '', name: '', ext: 'md' });
const editorInstance = ref<InstanceType<typeof BEditor> | null>(null);

const visible = reactive({ find: false });

const { pause, resume } = useAutoSave(fileState);

const { toolbarFileOptions } = useFileActive(fileState, { pause, resume });

const { toolbarEditOptions } = useEditActive(fileState, { editorInstance, visible });

const { viewState, toolbarViewOptions } = useViewActive();
</script>

<style scoped>
.editor-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f5f5;
}

/* 顶部工具栏 */
.editor-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 20px;
  background: #fff;
}

.header-left {
  display: flex;
  gap: 10px;
  align-items: center;
}

.editor-content {
  flex: 1;
  height: 0;
  margin: 6px;
  overflow: hidden;
  background: #fff;
  border-radius: 8px;
}
</style>
