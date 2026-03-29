import type { EditorFile } from '../types';
import { Ref, computed, ref, onMounted } from 'vue';
import type { Props as ToolbarProps } from '@/components/Toolbar.vue';
import { native } from '@/utils/native';
import { indexedDBStorage, type StoredFile } from '@/utils/storage';

export function useFileActive(fileState: Ref<Partial<EditorFile>>) {
  const canSave = computed(() => fileState.value.path !== undefined);
  const recentFiles = ref<StoredFile[]>([]);

  async function loadRecentFiles(): Promise<void> {
    recentFiles.value = await indexedDBStorage.getAllRecentFiles();
  }

  onMounted(loadRecentFiles);

  const toolbarMenuOptions = computed<ToolbarProps['options']>(() => [
    {
      value: 'new',
      label: '新建',
      shortcut: 'Ctrl+N',
      onClick: () => {
        //  native.setWindowTitle('新建文件')
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

        await indexedDBStorage.addRecentFile(file as StoredFile);

        loadRecentFiles();

        fileState.value = file;
      }
    },
    {
      value: 'recent',
      label: '打开最近的文件',
      disabled: !recentFiles.value.length,
      children: [
        ...recentFiles.value.map((file) => ({
          value: file.path,
          label: file.path,
          onClick: async () => {
            const stored = await indexedDBStorage.getRecentFile(file.path);

            if (!stored) return;

            fileState.value = stored;
          }
        })),
        { type: 'divider' as const },
        {
          value: 'clear-recent',
          label: '清除最近打开记录',
          onClick: async () => {
            await indexedDBStorage.clearRecentFiles();

            await loadRecentFiles();
          }
        }
      ]
    },
    { type: 'divider' },
    {
      value: 'save',
      label: '保存',
      shortcut: 'Ctrl+S',
      disabled: !canSave.value,
      onClick: () => {
        //
      }
    },
    {
      value: 'saveAs',
      label: '另存为',
      shortcut: 'Ctrl+Shift+S',
      disabled: !canSave.value,
      onClick: () => {
        //
      }
    }
  ]);

  return { toolbarMenuOptions };
}
