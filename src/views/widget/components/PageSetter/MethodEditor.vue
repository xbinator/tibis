<!--
  @file MethodEditor.vue
  @description Widget页面交互脚本代码编辑弹窗。
-->
<template>
  <BModal v-model:open="open" title="编辑" :width="860" @close="handleEditorCancel">
    <div class="method-editor">
      <div class="method-editor__host">
        <BMonaco
          ref="methodEditorRef"
          v-model:value="methodCodeDraft"
          language="typescript"
          :editable="true"
          :editor-state="methodEditorState"
          :extra-libs="widgetMethodScriptExtraLibs"
          :options="{ wordWrap: true, search: true, stickyScroll: true, typescriptCompilerOptions: widgetMethodScriptCompilerOptions }"
        />
      </div>
    </div>

    <template #footer>
      <BButton type="secondary" @click="handleEditorCancel">取消</BButton>
      <BButton type="primary" @click="handleEditorConfirm">保存</BButton>
    </template>
  </BModal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { EditorState } from '@/components/BEditor/types';
import BMonaco from '@/components/BMonaco/index.vue';
import type { MonacoCompilerOptions, MonacoExtraLib } from '@/components/BMonaco/utils/createMonaco';
import type { WidgetSchemaObject } from '@/components/BWidget/types';
import { buildWidgetStateSchema } from '@/components/BWidget/utils/widgetStateSchema';
import { createWidgetMethodScriptExtraLibContent } from '@/views/widget/constants/methodScriptExtraLib';

/**
 * 交互脚本编辑弹窗入参。
 */
interface Props {
  /** 当前交互脚本代码 */
  code: string;
  /** 当前小组件入参 schema */
  inputSchema: WidgetSchemaObject;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** 保存交互脚本代码 */
  confirm: [code: string];
}>();
const open = defineModel<boolean>('open', { required: true });

/** 交互脚本代码草稿。 */
const methodCodeDraft = ref('');
/** Monaco 编辑器实例。 */
const methodEditorRef = ref<InstanceType<typeof BMonaco> | null>(null);

/** 当前用于类型推导的交互脚本代码，弹窗打开时优先使用编辑草稿。 */
const methodCodeForTypeHints = computed<string>((): string => (open.value ? methodCodeDraft.value : props.code));
/** 当前交互脚本草稿推导出的状态 schema。 */
const methodDraftStateSchema = computed<WidgetSchemaObject>((): WidgetSchemaObject => buildWidgetStateSchema(methodCodeForTypeHints.value, props.inputSchema));
/** Widget 交互脚本编辑器类型提示内容。 */
const widgetMethodScriptExtraLibContent = computed<string>((): string =>
  createWidgetMethodScriptExtraLibContent(props.inputSchema, methodDraftStateSchema.value)
);
/** Widget 交互脚本编辑器类型提示声明。 */
const widgetMethodScriptExtraLibs = computed<MonacoExtraLib[]>((): MonacoExtraLib[] => [
  {
    content: widgetMethodScriptExtraLibContent.value,
    filePath: 'tibis-widget-method-script.d.ts'
  }
]);
/** Widget 交互脚本编辑器只加载 ECMAScript 基础类型，不引入浏览器 DOM 全局变量。 */
const widgetMethodScriptCompilerOptions: MonacoCompilerOptions = {
  lib: ['es2020'],
  noImplicitThis: true
};

/**
 * 聚焦交互脚本编辑器。
 */
function focusMethodEditor(): void {
  if (!methodEditorRef.value || typeof methodEditorRef.value.focusEditor !== 'function') {
    return;
  }

  methodEditorRef.value.focusEditor();
}

/**
 * 使用当前交互脚本代码重置编辑草稿。
 * @returns 异步完成信号
 */
async function resetMethodDraft(): Promise<void> {
  methodCodeDraft.value = props.code;

  await nextTick();
  focusMethodEditor();
}

/**
 * 关闭交互脚本编辑弹窗。
 */
function handleEditorCancel(): void {
  open.value = false;
}

/**
 * 保存交互脚本代码。
 */
function handleEditorConfirm(): void {
  emit('confirm', methodCodeDraft.value);
  open.value = false;
}

watch(open, async (isOpen: boolean): Promise<void> => {
  if (!isOpen) {
    return;
  }

  await resetMethodDraft();
});

watch(
  (): string => props.code,
  async (): Promise<void> => {
    if (!open.value) {
      return;
    }

    await resetMethodDraft();
  }
);

/** 交互脚本编辑器状态。 */
const methodEditorState = computed<EditorState>(() => ({
  id: 'widget-method-script',
  name: 'widget-method.ts',
  path: null,
  ext: 'ts',
  content: methodCodeDraft.value
}));
</script>

<style lang="less" scoped>
.method-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.method-editor__host {
  position: relative;
  min-height: 420px;
  padding: 1px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 6px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.method-editor__host:hover {
  border-color: var(--border-hover);
}

.method-editor__host:focus-within {
  border-color: var(--input-focus-border);
  box-shadow: 0 0 0 2px var(--input-focus-shadow);
}

.method-editor__host :deep(.b-editor-monaco),
.method-editor__host :deep(.b-editor-monaco__host),
.method-editor__host :deep(.b-editor-monaco__fallback) {
  min-height: 420px;
}

.method-editor__host :deep(.monaco-editor),
.method-editor__host :deep(.monaco-editor-background) {
  background: var(--input-bg);
}

.method-editor__host :deep(.monaco-editor .margin),
.method-editor__host :deep(.monaco-editor .monaco-editor-background) {
  background: var(--input-bg);
}

.method-editor__host :deep(.monaco-editor .view-lines) {
  font-family: var(--font-family-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace);
}
</style>
