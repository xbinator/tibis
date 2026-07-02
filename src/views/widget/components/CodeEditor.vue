<!--
  @file CodeEditor.vue
  @description Widget 组件脚本当前页代码编辑器。
-->
<template>
  <main class="widget-code-page">
    <header class="widget-code-page__toolbar">
      <h1 class="widget-code-page__title">编辑运行脚本</h1>
      <div class="widget-code-page__actions">
        <BButton icon="lucide:x" size="small" square type="ghost" @click="handleClose" />
      </div>
    </header>

    <section class="widget-code-page__editor">
      <BMonaco
        ref="codeEditorRef"
        v-model:value="scriptCodeDraft"
        language="typescript"
        :editable="true"
        :editor-state="codeEditorState"
        :extra-libs="widgetMethodScriptExtraLibs"
        :options="{ wordWrap: true, search: true, stickyScroll: true, typescriptCompilerOptions: widgetMethodScriptCompilerOptions }"
      />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { EditorState } from '@/components/BEditor/types';
import BMonaco from '@/components/BMonaco/index.vue';
import type { MonacoCompilerOptions, MonacoExtraLib } from '@/components/BMonaco/utils/createMonaco';
import type { WidgetData, WidgetSchemaObject } from '@/components/BWidget/types';
import { buildWidgetDataSchema } from '@/components/BWidget/utils/widgetDataSchema';
import { readWidgetMethodNames } from '@/components/BWidget/utils/widgetMethodNames';
import { createWidgetMethodScriptExtraLibContent } from '../constants/methodScriptExtraLib';
import { createWidgetExecuteMethodWithCode, readWidgetExecuteMethod } from '../utils/widgetExecuteMethod';

defineOptions({ name: 'CodeEditor' });

/**
 * Widget 代码编辑器入参。
 */
interface Props {
  /** 当前编辑器是否处于可见激活态 */
  active?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  active: false
});
const emit = defineEmits<{
  /** 关闭 组件脚本编辑器 */
  close: [];
}>();

const dataItem = defineModel<WidgetData>('value', { required: true });
const codeEditorRef = ref<InstanceType<typeof BMonaco> | null>(null);
const scriptCodeDraft = ref(readWidgetExecuteMethod(dataItem.value.execute).code);
const syncingModelToDraft = ref(false);

/** Widget 组件脚本编辑器只加载 ECMAScript 基础类型，不引入浏览器 DOM 全局变量。 */
const widgetMethodScriptCompilerOptions: MonacoCompilerOptions = {
  lib: ['es2020'],
  noImplicitThis: true
};

/** 当前 Widget 入参 schema。 */
const inputSchema = computed<WidgetSchemaObject>((): WidgetSchemaObject => dataItem.value.inputSchema);
/** 当前组件脚本草稿推导出的数据 schema。 */
const methodDraftDataSchema = computed<WidgetSchemaObject>((): WidgetSchemaObject => buildWidgetDataSchema(scriptCodeDraft.value, inputSchema.value));
/** 当前组件脚本草稿声明的 methods 方法名。 */
const methodDraftMethodNames = computed<string[]>((): string[] => readWidgetMethodNames(scriptCodeDraft.value));
/** Widget 组件脚本编辑器类型提示内容。 */
const widgetMethodScriptExtraLibContent = computed<string>((): string =>
  createWidgetMethodScriptExtraLibContent(inputSchema.value, methodDraftDataSchema.value, methodDraftMethodNames.value)
);
/** Widget 组件脚本编辑器类型提示声明。 */
const widgetMethodScriptExtraLibs = computed<MonacoExtraLib[]>((): MonacoExtraLib[] => [
  {
    content: widgetMethodScriptExtraLibContent.value,
    filePath: 'tibis-widget-method-script.d.ts'
  }
]);
/** 组件脚本编辑器数据。 */
const codeEditorState = computed<EditorState>(() => ({
  id: 'widget-method-script',
  name: 'widget-method.ts',
  path: null,
  ext: 'ts',
  content: scriptCodeDraft.value
}));

/**
 * 读取当前 Widget 组件脚本源码。
 * @returns 组件脚本源码
 */
function readCurrentMethodCode(): string {
  return readWidgetExecuteMethod(dataItem.value.execute).code;
}

/**
 * 聚焦组件脚本编辑器。
 */
function focusCodeEditor(): void {
  if (!codeEditorRef.value || typeof codeEditorRef.value.focusEditor !== 'function') {
    return;
  }

  codeEditorRef.value.focusEditor();
}

/**
 * 从当前模型同步编辑草稿。
 * @param code - 当前组件脚本源码
 * @param shouldFocus - 同步后是否聚焦编辑器
 * @returns 异步完成信号
 */
async function syncScriptCodeDraftFromModel(code: string, shouldFocus: boolean): Promise<void> {
  syncingModelToDraft.value = true;
  scriptCodeDraft.value = code;
  await nextTick();
  syncingModelToDraft.value = false;

  if (shouldFocus) {
    focusCodeEditor();
  }
}

/**
 * 将编辑草稿写回 Widget 数据模型。
 * @param code - 最新组件脚本源码
 */
function syncScriptCodeToModel(code: string): void {
  if (readCurrentMethodCode() === code) {
    return;
  }

  dataItem.value = {
    ...dataItem.value,
    execute: createWidgetExecuteMethodWithCode(dataItem.value.execute, code)
  };
}

/**
 * 关闭当前脚本编辑器。
 */
function handleClose(): void {
  emit('close');
}

watch(
  (): string => readCurrentMethodCode(),
  async (code: string): Promise<void> => {
    if (scriptCodeDraft.value === code) {
      return;
    }

    if (!props.active) {
      await syncScriptCodeDraftFromModel(code, false);
      return;
    }

    await syncScriptCodeDraftFromModel(code, true);
  },
  { immediate: true }
);

watch(scriptCodeDraft, (code: string): void => {
  if (syncingModelToDraft.value) {
    return;
  }

  syncScriptCodeToModel(code);
});

watch(
  (): boolean => props.active,
  async (active: boolean): Promise<void> => {
    if (!active) {
      return;
    }

    await syncScriptCodeDraftFromModel(readCurrentMethodCode(), true);
  }
);
</script>

<style lang="less" scoped>
.widget-code-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
  border-radius: 8px;
}

.widget-code-page__toolbar {
  position: relative;
  z-index: 1;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 12px;
  box-shadow: 0 1px 0 0 var(--border-primary);
}

.widget-code-page__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: var(--text-primary);
  white-space: nowrap;
}

.widget-code-page__actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
}

.widget-code-page__editor {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.widget-code-page__editor :deep(.b-editor-monaco),
.widget-code-page__editor :deep(.b-editor-monaco__host),
.widget-code-page__editor :deep(.b-editor-monaco__fallback) {
  min-height: 100%;
}

.widget-code-page__editor :deep(.monaco-editor),
.widget-code-page__editor :deep(.monaco-editor-background),
.widget-code-page__editor :deep(.monaco-editor .margin),
.widget-code-page__editor :deep(.monaco-editor .monaco-editor-background) {
  background: var(--bg-primary);
}
</style>
