<template>
  <div class="editor-layout">
    <div class="editor-header">
      <div class="header-left">
        <Toolbar :title="'文件'" :options="toolbarFileOptions" />

        <Toolbar :title="'编辑'" :options="toolbarEditOptions" />

        <Toolbar :title="'视图'" show-selected-check :options="toolbarViewOptions" />
      </div>

      <div v-if="showFind" class="header-right">
        <AInput v-model:value="findKeyword" v-focus placeholder="查找" @keydown.esc="closeFind" />
      </div>
    </div>

    <div class="editor-content">
      <BEditor
        :key="fileState.id"
        ref="editor"
        v-model:value="fileState.content"
        v-model:title="fileState.name"
        :editor-id="fileState?.id"
        :view-mode="viewState.mode"
        :show-outline="viewState.showOutline"
        @title-blur="handleTitleBlur"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EditorFile } from './types';
import { ref } from 'vue';
import BEditor from '@/components/BEditor/index.vue';
import Toolbar from '@/components/Toolbar.vue';
import { vFocus } from '@/directives/focus';
import { native } from '@/utils/native';
import { indexedDB } from '@/utils/storage';
import { useAutoSave } from './hooks/useAutoSave';
import { useEditActive } from './hooks/useEditActive';
import { useFileActive } from './hooks/useFileActive';
import { useViewActive } from './hooks/useViewActive';

const fileState = ref<EditorFile>({ id: '', path: '', content: '', name: '', ext: 'md' });
const editor = ref<InstanceType<typeof BEditor> | null>(null);

const { pause, resume } = useAutoSave(fileState);

const { toolbarFileOptions, loadRecentFiles } = useFileActive(fileState, { pause, resume });

const { toolbarEditOptions, showFind, findKeyword, closeFind } = useEditActive(fileState, editor);

const { viewState, toolbarViewOptions } = useViewActive();

function handleTitleBlur(title: string): void {
  if (!title || !fileState.value?.id) return;

  const ext = fileState.value?.ext || '';
  native.setWindowTitle(ext ? `${title}.${ext}` : title);

  indexedDB.updateRecentFile(fileState.value.id, fileState.value).then(loadRecentFiles);
}
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

.header-right {
  display: flex;
  align-items: center;
}

.find-input {
  width: 220px;
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
