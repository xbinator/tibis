<!--
  @file TextEditorOverlay.vue
  @description BDrawing 文本编辑覆盖层，承载原生 textarea 输入能力并转发编辑事件。
-->
<template>
  <textarea
    ref="textareaRef"
    :value="modelValue"
    class="b-drawing__text-editor"
    data-testid="drawing-text-editor"
    spellcheck="false"
    :style="style"
    @blur="emit('commit')"
    @input="handleInput"
    @keydown.stop="emit('editor-keydown', $event)"
    @pointerdown.stop
  ></textarea>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue';
import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * 文本编辑覆盖层入参。
 */
interface Props {
  /** 文本编辑值 */
  modelValue: string;
  /** 覆盖层定位和排版样式 */
  style: CSSProperties;
}

defineProps<Props>();
const emit = defineEmits<{
  /** 更新文本编辑值 */
  'update:modelValue': [value: string];
  /** 原生输入事件 */
  input: [event: Event];
  /** 提交编辑 */
  commit: [];
  /** 键盘事件 */
  'editor-keydown': [event: KeyboardEvent];
  /** textarea DOM 就绪状态 */
  ready: [editor: HTMLTextAreaElement | null];
}>();

/** 内部 textarea DOM 引用。 */
const textareaRef = ref<HTMLTextAreaElement | null>(null);

/**
 * 转发输入事件并同步 v-model。
 * @param event - 输入事件
 */
function handleInput(event: Event): void {
  const target = event.currentTarget;
  if (target instanceof HTMLTextAreaElement) {
    emit('update:modelValue', target.value);
  }

  emit('input', event);
}

onMounted((): void => {
  emit('ready', textareaRef.value);
});

onBeforeUnmount((): void => {
  emit('ready', null);
});
</script>

<style lang="less" scoped>
.b-drawing__text-editor {
  position: fixed;
  z-index: 20;
  box-sizing: border-box;
  overflow: hidden;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.35;
  color: var(--text-primary);
  text-align: center;
  white-space: pre;
  resize: none;
  outline: none;
  background: transparent;
  border: none;
  border-radius: 6px;
  box-shadow: none;
}
</style>
