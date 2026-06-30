<!--
  @file MethodEditor.vue
  @description Widget页面执行方法代码编辑弹窗。
-->
<template>
  <BModal v-model:open="open" title="编辑执行方法" :width="860" @close="handleEditorCancel">
    <div class="method-editor">
      <div class="method-editor__host">
        <BMonaco
          ref="methodEditorRef"
          v-model:value="methodCodeDraft"
          language="typescript"
          :editable="true"
          :editor-state="methodEditorState"
          :extra-libs="widgetSkillMethodExtraLibs"
          :options="{ wordWrap: true, search: true, stickyScroll: true, typescriptCompilerOptions: widgetSkillMethodCompilerOptions }"
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

/**
 * 执行方法编辑弹窗入参。
 */
interface Props {
  /** 当前 execute 方法代码 */
  code: string;
}

/** Widget Skill 方法编辑器类型提示。 */
const WIDGET_SKILL_METHOD_EXTRA_LIB_CONTENT = `
declare interface WidgetSkillContext {
  /** 调用小组件时 AI 提取到的入参。 */
  input: Record<string, unknown>
  /** 当前小组件运行态数据，可通过 setState 更新。 */
  state: Record<string, unknown>
  /** 最近一次方法返回的结构化出参。 */
  output?: unknown
  /** 触发当前执行的事件信息。 */
  event?: unknown
  /** 写入小组件运行态数据，path 支持点路径，例如 weather.temperature。 */
  setState(path: string, value: unknown): void
  /**
   * 构造标准执行结果。
   *
   * - success：方法正常完成，返回可绑定到 output 的数据。
   * - failure：方法执行失败，返回错误码与错误信息。
   * - cancelled：方法被取消，用于用户主动取消或流程中止。
   * - awaitingUserInput：暂停执行，等待用户继续输入或选择。
   */
  result: WidgetSkillResultFactory
}

declare interface WidgetSkillResultFactory {
  /**
   * 标记方法执行成功，并把 data 作为执行结果返回。
   * @param data - 成功结果中携带的数据。
   * @returns 标准成功执行结果。
   */
  success(data?: unknown): ExecutionResult
  /**
   * 标记方法执行失败，并返回错误码与错误信息。
   * @param code - 机器可读错误码。
   * @param message - 给用户或日志展示的错误说明。
   * @returns 标准失败执行结果。
   */
  failure(code: string, message: string): ExecutionResult
  /**
   * 标记执行已取消，用于用户主动取消或流程被中止。
   * @param code - 机器可读取消码。
   * @param message - 给用户或日志展示的取消说明。
   * @returns 标准取消执行结果。
   */
  cancelled(code: string, message: string): ExecutionResult
  /**
   * 暂停执行并等待用户继续输入或选择。
   * @param data - 等待用户输入时携带的提示、选项或上下文数据。
   * @returns 标准等待用户输入执行结果。
   */
  awaitingUserInput(data?: unknown): ExecutionResult
}

declare interface ExecutionResult {
  /** 执行状态。 */
  status: 'success' | 'failure' | 'cancelled' | 'awaiting_user_input'
  /** 成功或等待输入时携带的数据。 */
  data?: unknown
  /** 失败或取消时携带的错误信息。 */
  error?: {
    /** 机器可读错误码。 */
    code: string
    /** 给用户或日志展示的错误说明。 */
    message: string
  }
}
`;
/** Widget Skill 方法编辑器类型提示声明。 */
const widgetSkillMethodExtraLibs: MonacoExtraLib[] = [
  {
    content: WIDGET_SKILL_METHOD_EXTRA_LIB_CONTENT,
    filePath: 'tibis-widget-skill-method.d.ts'
  }
];
/** Widget Skill 方法编辑器只加载 ECMAScript 基础类型，不引入浏览器 DOM 全局变量。 */
const widgetSkillMethodCompilerOptions: MonacoCompilerOptions = {
  lib: ['es2020']
};

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 保存 execute 方法代码 */
  confirm: [code: string];
}>();
const open = defineModel<boolean>('open', { required: true });

/** 执行方法代码草稿。 */
const methodCodeDraft = ref('');
/** Monaco 编辑器实例。 */
const methodEditorRef = ref<InstanceType<typeof BMonaco> | null>(null);

/**
 * 聚焦执行方法编辑器。
 */
function focusMethodEditor(): void {
  if (!methodEditorRef.value || typeof methodEditorRef.value.focusEditor !== 'function') {
    return;
  }

  methodEditorRef.value.focusEditor();
}

/**
 * 使用当前方法代码重置编辑草稿。
 * @returns 异步完成信号
 */
async function resetMethodDraft(): Promise<void> {
  methodCodeDraft.value = props.code;

  await nextTick();
  focusMethodEditor();
}

/**
 * 关闭执行方法编辑弹窗。
 */
function handleEditorCancel(): void {
  open.value = false;
}

/**
 * 保存执行方法代码。
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

/** 执行方法编辑器状态。 */
const methodEditorState = computed<EditorState>(() => ({
  id: 'widget-skill-execute-method',
  name: 'execute.ts',
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
