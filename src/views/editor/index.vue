<template>
  <div class="editor-layout editor-content">
    <div class="editor-main-container">
      <div class="editor-content-wrapper">
        <component
          :is="activeDriver.component"
          ref="editorRef"
          :key="fileState.id"
          v-model:value="fileState"
          :view-mode="editorPreferencesStore.viewMode"
          @editor-blur="actions.onEditorBlur"
          @rename-file="actions.onRename"
          @save="actions.onSave"
          @save-as="actions.onSaveAs"
          @copy-path="actions.onCopyPath"
          @show-in-folder="actions.onShowInFolder"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { editorToolContextRegistry } from '@/ai/tools/editor-context';
import type { EditorController } from '@/components/BMarkdown/types';
import { useEditorPreferencesStore } from '@/stores/editorPreferences';
import { resolveEditorDriver } from './drivers';
import { useBindings } from './hooks/useBindings';
import { useFileSelection } from './hooks/useFileSelection';
import { useSession } from './hooks/useSession';

const route = useRoute();
const editorPreferencesStore = useEditorPreferencesStore();

const fileId = ref(String(route.params.id || ''));

const { fileState, actions } = useSession(fileId);

const editorRef = ref<EditorController | null>(null);
const isActive = ref(true);
const isEditorReady = computed<boolean>(() => editorRef.value !== null);
const activeDriver = computed(() => resolveEditorDriver(fileState.value));

useBindings(fileId, { fileState, actions, editorInstance: editorRef });
useFileSelection({
  fileState,
  isEditorReady,
  editorInstance: editorRef
});

/**
 * 注销当前编辑器工具上下文。
 */
function unregisterEditorContext(): void {
  const documentId = fileState.value.id;
  if (documentId) {
    editorToolContextRegistry.unregister(documentId);
  }
}

/**
 * 注册当前激活编辑器的工具上下文。
 */
function registerEditorContext(): void {
  const editorInstance = editorRef.value;
  const documentId = fileState.value.id;

  if (!isActive.value || !editorInstance || !documentId) {
    return;
  }

  editorToolContextRegistry.register(
    documentId,
    activeDriver.value.createToolContext({
      fileState: fileState.value,
      editorInstance,
      isActive: isActive.value
    })
  );
}

watch(
  [editorRef, () => fileState.value.id, () => fileState.value.name, () => fileState.value.path, () => fileState.value.ext, activeDriver],
  registerEditorContext
);

onActivated(() => {
  isActive.value = true;
  registerEditorContext();
});

onDeactivated(() => {
  isActive.value = false;
  unregisterEditorContext();
});

onBeforeUnmount(() => {
  unregisterEditorContext();
});
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
