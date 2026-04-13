<template>
  <div class="editor-sidebar">
    <BChat class="editor-sidebar__chat" />

    <div class="editor-sidebar__input">
      <BPromptEditor v-model:value="inputValue" placeholder="输入消息..." :options="variableOptions" :max-height="200" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { VariableOptionGroup } from '@/components/BPromptEditor/types';

const inputValue = ref('');

const variableOptions: VariableOptionGroup[] = [
  {
    type: 'variable',
    options: [
      { label: '文件名', value: 'filename', description: '当前文件名' },
      { label: '选中内容', value: 'selection', description: '当前选中的文本' },
      { label: '当前日期', value: 'date', description: '今天的日期' }
    ]
  }
];
</script>

<style scoped lang="less">
.editor-sidebar {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
  border-radius: 8px;

  &__chat {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  &__input {
    padding: 12px;
  }
}

.sidebar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}
</style>
