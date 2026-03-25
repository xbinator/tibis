<script setup lang="ts">
import { Button, Dropdown, Menu } from 'ant-design-vue'

const emit = defineEmits([
  'new-file',
  'open-file',
  'save-file',
  'save-file-as'
])

function handleNewFile() {
  emit('new-file')
}

function handleOpenFile() {
  emit('open-file')
}

function handleSaveFile() {
  emit('save-file')
}

function handleSaveFileAs() {
  emit('save-file-as')
}
</script>

<template>
  <div class="toolbar-header">
    <div class="toolbar-left">
      <Dropdown>
        <Button type="primary">文件</Button>
        <template #overlay>
          <Menu>
            <Menu.Item key="new" @click="handleNewFile">新建</Menu.Item>
            <Menu.Item key="open" @click="handleOpenFile">打开</Menu.Item>
            <Menu.Item key="save" @click="handleSaveFile">保存</Menu.Item>
            <Menu.Item key="saveAs" @click="handleSaveFileAs">另存为</Menu.Item>
          </Menu>
        </template>
      </Dropdown>
    </div>
  </div>
</template>

<style scoped>
.toolbar-header {
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: 64px;
  border-bottom: 1px solid #f0f0f0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>