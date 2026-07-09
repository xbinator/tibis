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
import { computed, nextTick, onActivated, onDeactivated, ref } from 'vue';
import { useRoute } from 'vue-router';
import BEditor from '@/components/BEditor/index.vue';
import type { EditorController, EditorScrollController } from '@/components/BEditor/types';
import { useBindings } from './hooks/useBindings';
import { useFileSelection } from './hooks/useFileSelection';
import { useSession } from './hooks/useSession';

const route = useRoute();

const fileId = ref(String(route.params.id || ''));

const { fileState, actions } = useSession(fileId);

/**
 * 编辑器页面需要额外调度的 BEditor 实例能力。
 */
type EditorPageController = EditorController & EditorScrollController;

const editorRef = ref<EditorPageController | null>(null);
const isActive = ref(true);
const isEditorReady = computed<boolean>(() => editorRef.value !== null);
let scrollRestoreVersion = 0;

useBindings(fileId, { fileState, isActive, actions, editorInstance: editorRef });

useFileSelection({
  fileState,
  isEditorReady,
  editorInstance: editorRef
});

/**
 * 等待浏览器完成一次布局帧。
 * @returns 下一帧 Promise
 */
function waitForNextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame((): void => resolve());
  });
}

/**
 * 在 KeepAlive 父视图重新激活并完成布局后恢复编辑器滚动位置。
 */
async function restoreEditorScrollPositionAfterActivation(): Promise<void> {
  const currentVersion = ++scrollRestoreVersion;

  await nextTick();
  await waitForNextFrame();

  if (currentVersion !== scrollRestoreVersion || !isActive.value) {
    return;
  }

  await editorRef.value?.restoreScrollPosition();
}

onActivated(async (): Promise<void> => {
  isActive.value = true;
  await restoreEditorScrollPositionAfterActivation();
});

onDeactivated(() => {
  scrollRestoreVersion += 1;
  editorRef.value?.rememberScrollPosition();
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
}
</style>
