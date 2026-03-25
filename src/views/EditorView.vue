<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'

import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  Layout,
  LayoutContent
} from 'ant-design-vue'
import Toolbar from '../components/Toolbar.vue'

const currentFilePath = ref<string | null>(null)
const isModified = ref(false)
const editorContent = ref('')

const appWindow = getCurrentWindow()

const editor = useEditor({
  content: '',
  extensions: [
    StarterKit,
  ],
  onUpdate: ({ editor }) => {
    editorContent.value = editor.getHTML()
    isModified.value = true
  },
})



async function newFile() {
  if (isModified.value) {
    const confirmed = confirm('当前文档有未保存的修改，是否保存？')
    if (confirmed) {
      await saveFile()
    }
  }
  currentFilePath.value = null
  isModified.value = false
  if (editor.value) {
    editor.value.commands.clearContent()
  }
}

async function openFile() {
  const file = await open({
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
  })
  if (file) {
    const content = await readTextFile(file as string)
    currentFilePath.value = file as string
    if (editor.value) {
      editor.value.commands.setContent(content)
    }
    isModified.value = false
    await updateTitle()
  }
}

async function saveFile() {
  if (currentFilePath.value) {
    const content = editor.value?.getHTML() || ''
    await writeTextFile(currentFilePath.value, content)
    isModified.value = false
    await updateTitle()
  } else {
    await saveFileAs()
  }
}

async function saveFileAs() {
  const file = await save({
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    defaultPath: 'untitled.md'
  })
  if (file) {
    currentFilePath.value = file
    const content = editor.value?.getHTML() || ''
    await writeTextFile(file, content)
    isModified.value = false
    await updateTitle()
  }
}

async function updateTitle() {
  const fileName = currentFilePath.value 
    ? currentFilePath.value.split(/[/\\]/).pop() 
    : '未命名'
  const title = isModified.value ? `${fileName} *` : fileName
  await appWindow.setTitle(`Markdown Editor - ${title}`)
}

onMounted(() => {
  // 初始化编辑器
})
</script>

<template>
  <Layout class="app-layout">
    <Toolbar
      @new-file="newFile"
      @open-file="openFile"
      @save-file="saveFile"
      @save-file-as="saveFileAs"
    />
      
      <LayoutContent class="editor-content">
        <EditorContent 
          v-if="editor" 
          :editor="editor" 
          class="editor"
        />
      </LayoutContent>
    </Layout>
</template>

<style scoped>
.app-layout {
  height: 100%;
}

.toolbar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  -webkit-app-region: drag;
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.ant-dropdown-menu {
  background: var(--ant-color-bg-container);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
}

.dropdown-item {
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
}

.dropdown-item:hover {
  background: var(--ant-color-primary-light);
}

.editor-content {
  padding: 24px 48px;
  overflow: auto;
}

.editor {
  height: 100%;
  max-width: 800px;
  margin: 0 auto;
  padding: 32px 48px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

:global(.dark) .editor {
  background: #1e1e1e;
}

.editor :deep(.ProseMirror) {
  outline: none;
  min-height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.8;
  color: #37352f;
  caret-color: #37352f;
}

:global(.dark) .editor :deep(.ProseMirror) {
  color: #d4d4d4;
}

.editor :deep(.ProseMirror h1) {
  font-size: 2em;
  font-weight: 600;
  margin: 1.2em 0 0.8em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid #eaeaea;
  color: #37352f;
}

:global(.dark) .editor :deep(.ProseMirror h1) {
  border-bottom-color: #3e3e42;
}

.editor :deep(.ProseMirror h2) {
  font-size: 1.5em;
  font-weight: 600;
  margin: 1em 0 0.6em;
  padding-bottom: 0.2em;
  border-bottom: 1px solid #eaeaea;
  color: #37352f;
}

:global(.dark) .editor :deep(.ProseMirror h2) {
  border-bottom-color: #3e3e42;
}

.editor :deep(.ProseMirror h3) {
  font-size: 1.25em;
  font-weight: 600;
  margin: 0.8em 0 0.5em;
}

.editor :deep(.ProseMirror h4),
.editor :deep(.ProseMirror h5),
.editor :deep(.ProseMirror h6) {
  font-weight: 600;
  margin: 0.6em 0 0.4em;
}

.editor :deep(.ProseMirror p) {
  margin: 0.8em 0;
  min-height: 1em;
}

.editor :deep(.ProseMirror ul),
.editor :deep(.ProseMirror ol) {
  padding-left: 2em;
  margin: 0.5em 0;
}

.editor :deep(.ProseMirror li) {
  margin: 0.3em 0;
}

.editor :deep(.ProseMirror li > p) {
  margin: 0.3em 0;
}

.editor :deep(.ProseMirror blockquote) {
  margin: 0.8em 0;
  padding: 0.5em 1em;
  border-left: 4px solid #eaeaea;
  background: #fafafa;
  color: #5a5a5a;
}

:global(.dark) .editor :deep(.ProseMirror blockquote) {
  border-left-color: #3e3e42;
  background: #252526;
  color: #9e9e9e;
}

.editor :deep(.ProseMirror code) {
  font-family: "Fira Code", Consolas, Monaco, monospace;
  font-size: 0.9em;
  padding: 2px 6px;
  background: #f6f8fa;
  border-radius: 4px;
  color: #e91e63;
}

:global(.dark) .editor :deep(.ProseMirror code) {
  background: #2d2d2d;
  color: #f48fb1;
}

.editor :deep(.ProseMirror pre) {
  margin: 1em 0;
  padding: 1em 1.2em;
  background: #f6f8fa;
  border-radius: 6px;
  overflow-x: auto;
  font-family: "Fira Code", Consolas, Monaco, monospace;
  font-size: 0.9em;
  line-height: 1.5;
}

:global(.dark) .editor :deep(.ProseMirror pre) {
  background: #2d2d2d;
}

.editor :deep(.ProseMirror pre code) {
  padding: 0;
  background: none;
  color: inherit;
}

.editor :deep(.ProseMirror hr) {
  border: none;
  border-top: 1px solid #eaeaea;
  margin: 1.5em 0;
}

:global(.dark) .editor :deep(.ProseMirror hr) {
  border-top-color: #3e3e42;
}

.editor :deep(.ProseMirror a) {
  color: #409eff;
  text-decoration: none;
}

.editor :deep(.ProseMirror a:hover) {
  text-decoration: underline;
}

.editor :deep(.ProseMirror img) {
  max-width: 100%;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.editor :deep(.ProseMirror table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.editor :deep(.ProseMirror th),
.editor :deep(.ProseMirror td) {
  border: 1px solid #eaeaea;
  padding: 8px 12px;
  text-align: left;
}

:global(.dark) .editor :deep(.ProseMirror th),
:global(.dark) .editor :deep(.ProseMirror td) {
  border-color: #3e3e42;
}

.editor :deep(.ProseMirror th) {
  background: #fafafa;
  font-weight: 600;
}

:global(.dark) .editor :deep(.ProseMirror th) {
  background: #2d2d2d;
}

.source-editor {
  width: 100%;
  height: 100%;
  max-width: 800px;
  margin: 0 auto;
  padding: 32px 48px;
  border: 1px solid var(--ant-color-border);
  border-radius: 8px;
  background: var(--ant-color-bg-container);
  color: var(--ant-color-text);
  font-family: "Fira Code", Consolas, Monaco, monospace;
  font-size: 14px;
  line-height: 1.8;
  resize: none;
  outline: none;
}
</style>