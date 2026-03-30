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
  const recentFiles = ref<EditorFile[]>([]);

  async function loadRecentFiles(): Promise<void> {
    recentFiles.value = await indexedDB.getAllRecentFiles();
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

    if (!currentId) return;

    const stored = await indexedDB.getRecentFile(currentId);

    stored && setFileState(stored);
  }

  onMounted(async () => {
    await loadRecentFiles();
    await restoreCurrentFile();
  });

  const toolbarMenuOptions = computed<ToolbarProps['options']>(() => [
    {
      value: 'new',
      label: '新建',
      shortcut: 'Ctrl+N',
      onClick: () => {
        setFileState({ name: '', ext: 'md', content: '', id: nanoid(6), path: '' });
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
      disabled: !recentFiles.value.length,
      children: [
        ...recentFiles.value.map((file) => ({
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
        const { path, content, name, ext, id = '' } = fileState.value;

        if (content === undefined) return;

        let savedPath: string | null;

        if (path) {
          savedPath = await native.saveFile(content, path);
        } else {
          savedPath = await native.saveFile(content, undefined, { defaultPath: name && ext ? `${name}.${ext}` : 'untitled.md' });
        }

        if (savedPath) {
          const fileName = savedPath.split(/[/\\]/).pop() ?? '';
          const [, newName, newExt] = /^(.+?)(?:\.([^.]+))?$/.exec(fileName) || ['', '', ''];

          const newFile = { path: savedPath, content, name: newName, ext: newExt, id };

          await indexedDB.updateRecentFile(id, newFile);
          loadRecentFiles();
          setFileState(newFile);
        }
      }
    },
    {
      value: 'saveAs',
      label: '另存为',
      shortcut: 'Ctrl+Shift+S',
      disabled: !canSave.value,
      onClick: async () => {
        const { content, name, ext } = fileState.value;

        if (content === undefined) return;

        const savedPath = await native.saveFile(content, undefined, {
          defaultPath: name && ext ? `${name}.${ext}` : 'untitled.md'
        });

        if (savedPath) {
          const fileName = savedPath.split(/[/\\]/).pop() ?? '';
          const [, newName, newExt] = /^(.+?)(?:\.([^.]+))?$/.exec(fileName) || ['', '', ''];

          const newFile = { path: savedPath, content, name: newName, ext: newExt, id: nanoid(6) };

          await indexedDB.addRecentFile(newFile);
          loadRecentFiles();
          setFileState(newFile);
        }
      }
    }
  ]);

  return { toolbarMenuOptions, loadRecentFiles };
}
