import type { EditorFile } from '../types';
import type { Ref } from 'vue';
import { computed, ref, onMounted, nextTick } from 'vue';
import { Modal } from 'ant-design-vue';
import { customAlphabet } from 'nanoid';
import type { Props as ToolbarProps } from '@/components/Toolbar.vue';
import { native } from '@/utils/native';
import { indexedDB, StoredFile } from '@/utils/storage';

interface UseFileActiveOptions {
  // 暂停自动保存
  pause: () => void;
  // 恢复自动保存
  resume: () => void;
}

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 6);

export function useFileActive(fileState: Ref<EditorFile>, options: UseFileActiveOptions) {
  const canSave = computed(() => fileState.value.path !== undefined);

  const recentFiles = ref<{ missing: EditorFile[]; list: EditorFile[] }>({ missing: [], list: [] });

  async function loadRecentFiles() {
    const files = await indexedDB.getAllRecentFiles();

    recentFiles.value = { missing: files.filter((file) => !file.path), list: files };
  }

  function setFileState(file: EditorFile): void {
    options.pause();

    fileState.value = file;
    file.id && indexedDB.setCurrentFile(file.id);

    native.setWindowTitle(`${file.name || '未命名文件'}.${file.ext || 'md'}`);

    nextTick(() => options.resume());
  }

  async function restoreCurrentFile(): Promise<void> {
    const currentId = await indexedDB.getCurrentFileId();
    if (currentId) {
      const stored = await indexedDB.getRecentFile(currentId);
      stored && setFileState(stored);
    }

    if (!fileState.value.id) {
      const _file = { path: '', name: '', ext: 'md', content: '', id: nanoid(6) };
      await indexedDB.addRecentFile(_file as StoredFile);

      setFileState(_file);
    }

    loadRecentFiles();
  }

  onMounted(() => {
    restoreCurrentFile();
  });

  const toolbarMenuOptions = computed<ToolbarProps['options']>(() => [
    {
      value: 'new',
      label: '新建',
      shortcut: 'Ctrl+N',
      onClick: async () => {
        // 移除所有未保存的文件
        const ids = recentFiles.value.list.map((file) => file.id);
        await indexedDB.removeRecentFile(...ids);

        const _file = { path: '', name: '', ext: 'md', content: '', id: nanoid(6) };
        await indexedDB.addRecentFile(_file as StoredFile);

        setFileState(_file);
        loadRecentFiles();
      }
    },
    { type: 'divider' },
    {
      value: 'open',
      label: '打开',
      shortcut: 'Ctrl+O',
      onClick: async () => {
        const file = await native.openFile();
        if (!file.path) return;

        const _file = { ...file, id: nanoid(6) };
        await indexedDB.addRecentFile(_file as StoredFile);

        loadRecentFiles();
        setFileState(_file);
      }
    },
    {
      value: 'recent',
      label: '打开最近的文件',
      disabled: !recentFiles.value.missing.length,
      children: [
        ...recentFiles.value.missing.map((file) => ({
          value: file.id,
          label: file.name,
          onClick: async () => {
            const stored = await indexedDB.getRecentFile(file.id);

            if (!stored) return;

            setFileState(stored);
          }
        })),
        { type: 'divider' as const },
        {
          value: 'clear-recent',
          label: '清除最近打开记录',
          onClick: async () => {
            Modal.confirm({
              title: '确认清除最近打开记录吗？',
              centered: true,
              content: '此操作将删除所有最近打开的文件记录，是否继续？',
              okText: '删除',
              cancelText: '取消',
              maskClosable: true,
              okButtonProps: { danger: true, type: 'primary' },
              autoFocusButton: null,
              onOk: async () => {
                await indexedDB.clearRecentFiles();

                await loadRecentFiles();
              }
            });
          }
        }
      ]
    },
    { type: 'divider' },
    {
      value: 'save',
      label: '保存',
      shortcut: 'Ctrl+S',
      onClick: async () => {
        //
      }
    },
    {
      value: 'saveAs',
      label: '另存为',
      shortcut: 'Ctrl+Shift+S',
      disabled: !canSave.value,
      onClick: async () => {
        //
      }
    }
  ]);

  return { toolbarMenuOptions, loadRecentFiles };
}
