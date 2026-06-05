<template>
  <div class="editor-content">
    <BEditor
      ref="editorRef"
      :key="fileState.id"
      v-model:value="fileState"
      :active="isActive"
      @editor-blur="actions.onEditorBlur"
      @rename-file="actions.onRename"
      @save="actions.onSave"
      @save-as="actions.onSaveAs"
      @copy-path="actions.onCopyPath"
      @show-in-folder="actions.onShowInFolder"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref } from 'vue';
import { useRoute } from 'vue-router';
import BEditor from '@/components/BEditor/index.vue';
import type { EditorController } from '@/components/BEditor/types';
import { useBindings } from './hooks/useBindings';
import { useFileSelection } from './hooks/useFileSelection';
import { useSession } from './hooks/useSession';

const route = useRoute();

const fileId = ref(String(route.params.id || ''));

const { fileState, actions } = useSession(fileId);

const editorRef = ref<EditorController | null>(null);
const isActive = ref(true);
const isEditorReady = computed<boolean>(() => editorRef.value !== null);

useBindings(fileId, { fileState, isActive, actions, editorInstance: editorRef });

useFileSelection({
  fileState,
  isEditorReady,
  editorInstance: editorRef
});

onActivated(() => {
  isActive.value = true;
});

onDeactivated(() => {
  isActive.value = false;
});
</script>

<style lang="less" scoped>
.editor-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-radius: 8px;
}
</style>
