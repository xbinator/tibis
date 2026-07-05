<!--
  @file CodeEditor.vue
  @description Widget 组件脚本代码编辑器（无外壳，仅承载 Monaco 编辑器）。
-->
<template>
  <div class="code-editor">
    <BMonaco
      ref="codeEditorRef"
      v-model:value="inputCode"
      language="typescript"
      :editable="true"
      :editor-state="codeEditorState"
      :extra-libs="widgetMethodScriptExtraLibs"
      :options="{ wordWrap: true, search: true, stickyScroll: true, typescriptCompilerOptions: widgetMethodScriptCompilerOptions }"
      @save="handleSave"
    />
  </div>
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
  /** 请求保存当前 Widget 文件 */
  save: [];
}>();

const dataItem = defineModel<WidgetData>('value', { required: true });
const codeEditorRef = ref<InstanceType<typeof BMonaco> | null>(null);
/** 当前 Widget 运行脚本编辑器本地草稿。 */
const inputCode = ref(dataItem.value.execute.code);
/** 是否正在从模型刷新本地草稿，避免刷新过程回写模型。 */
const syncingModelToInput = ref(false);

/** Widget 组件脚本编辑器只加载 ECMAScript 基础类型，不引入浏览器 DOM 全局变量。 */
const widgetMethodScriptCompilerOptions: MonacoCompilerOptions = {
  lib: ['es2020'],
  noImplicitThis: true
};

/** 当前 Widget 入参 schema。 */
const inputSchema = computed<WidgetSchemaObject>((): WidgetSchemaObject => dataItem.value.inputSchema);
/** 当前 Widget 运行脚本配置，创建流程保证该字段已初始化。 */
const executeMethod = computed<WidgetData['execute']>((): WidgetData['execute'] => dataItem.value.execute);
/** 当前组件脚本草稿推导出的数据 schema。 */
const methodDraftDataSchema = computed<WidgetSchemaObject>((): WidgetSchemaObject => buildWidgetDataSchema(inputCode.value, inputSchema.value));
/** 当前组件脚本草稿声明的 methods 方法名。 */
const methodDraftMethodNames = computed<string[]>((): string[] => readWidgetMethodNames(inputCode.value));
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
  content: inputCode.value
}));

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
 * 从当前模型刷新运行脚本草稿。
 * @param shouldFocus - 刷新后是否聚焦编辑器
 * @returns 刷新完成信号
 */
async function syncInputCodeFromModel(shouldFocus: boolean): Promise<void> {
  syncingModelToInput.value = true;
  inputCode.value = executeMethod.value.code;
  await nextTick();
  syncingModelToInput.value = false;

  if (shouldFocus) {
    focusCodeEditor();
  }
}

/**
 * 将运行脚本草稿同步回 Widget 数据模型。
 * @param code - 最新运行脚本源码
 */
function syncInputCodeToModel(code: string): void {
  if (syncingModelToInput.value || executeMethod.value.code === code) {
    return;
  }

  dataItem.value = { ...dataItem.value, execute: { ...executeMethod.value, code } };
}

/**
 * 向外抛出保存请求，由 Widget 页面统一执行文件保存。
 */
function handleSave(): void {
  emit('save');
}

watch(inputCode, (code: string): void => {
  syncInputCodeToModel(code);
});

watch(
  (): boolean => props.active,
  async (active: boolean): Promise<void> => {
    if (!active) return;

    await syncInputCodeFromModel(true);
  },
  { immediate: true }
);
</script>

<style lang="less" scoped>
.code-editor {
  display: flex;
  flex: 1;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
}

.code-editor :deep(.b-editor-monaco),
.code-editor :deep(.b-editor-monaco__host),
.code-editor :deep(.b-editor-monaco__fallback) {
  flex: 1;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.code-editor :deep(.monaco-editor),
.code-editor :deep(.monaco-editor-background),
.code-editor :deep(.monaco-editor .margin),
.code-editor :deep(.monaco-editor .monaco-editor-background) {
  background: var(--bg-primary);
}
</style>
