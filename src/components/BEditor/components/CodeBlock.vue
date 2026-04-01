<template>
  <NodeViewWrapper class="b-code-block">
    <div class="b-code-block__header" contenteditable="false" @mousedown.prevent>
      <span class="b-code-block__language">{{ languageLabel }}</span>

      <button type="button" class="b-code-block__copy" :title="copyLabel" :aria-label="copyLabel" @click="handleCopy">
        <Icon class="b-code-block__copy-icon" :icon="copyIconName" />
      </button>
    </div>

    <pre class="b-code-block__body"><NodeViewContent as="code" :class="codeClassName" /></pre>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import { useClipboard } from '@vueuse/core';
import { message } from 'ant-design-vue';

const props = defineProps(nodeViewProps);

const copyLabel = ref('复制');
const { copy } = useClipboard();
let resetTimer: number | null = null;

const languageLabel = computed(() => {
  const language = props.node.attrs.language as string | null;
  if (!language) return 'Plain Text';

  return language.charAt(0).toUpperCase() + language.slice(1);
});

const codeClassName = computed(() => {
  const language = props.node.attrs.language as string | null;
  return language ? `language-${language}` : '';
});

const copyIconName = computed(() => {
  if (copyLabel.value === '已复制') return 'lucide:check';
  if (copyLabel.value === '复制失败') return 'lucide:x';
  return 'lucide:copy';
});

function scheduleResetCopyLabel(): void {
  if (resetTimer !== null) {
    window.clearTimeout(resetTimer);
  }

  resetTimer = window.setTimeout(() => {
    copyLabel.value = '复制';
    resetTimer = null;
  }, 1500);
}

async function handleCopy(): Promise<void> {
  const text = props.node.textContent;
  if (!text) return;

  try {
    await copy(text);
    copyLabel.value = '已复制';
    message.success('复制成功');
    scheduleResetCopyLabel();
  } catch (error) {
    copyLabel.value = '复制失败';
    message.error('复制失败');
    scheduleResetCopyLabel();
  }
}

onUnmounted(() => {
  if (resetTimer !== null) {
    window.clearTimeout(resetTimer);
  }
});
</script>

<style lang="less" scoped>
.b-code-block {
  margin: 0.75em 0;
  overflow: hidden;
  background: #f6f8fa;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgb(31 35 40 / 6%);
}

.b-code-block__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  padding: 0 14px;
  background: #f6f8fa;
  border-bottom: 1px solid #d8dee4;
}

.b-code-block__language {
  font-size: 12px;
  font-weight: 600;
  color: #57606a;
  letter-spacing: 0.08em;
}

.b-code-block__copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: #24292f;
  cursor: pointer;
  background: transparent;
  border-radius: 2px;
  transition: all 0.2s ease;
}

.b-code-block__copy-icon {
  font-size: 14px;
}

.b-code-block__copy:hover {
  background: fade(#000, 6);
}

.b-code-block__body {
  padding: 16px;
  margin: 0;
  overflow-x: auto;
  background: #f6f8fa;
}
</style>
