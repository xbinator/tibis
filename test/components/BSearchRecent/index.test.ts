/**
 * @file index.test.ts
 * @description 验证最近文件搜索支持绝对路径候选项与回车直开。
 */
/* @vitest-environment jsdom */

import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BSearchRecent from '@/components/BSearchRecent/index.vue';
import type { StoredFile } from '@/shared/storage';

/**
 * 路径状态查询 mock。
 */
const getPathStatusMock = vi.hoisted(() => vi.fn());

/**
 * 按路径打开文件 mock。
 */
const openFileByPathMock = vi.hoisted(() => vi.fn());

/**
 * 最近文件 store mock。
 */
const filesStoreMock = vi.hoisted(() => ({
  recentRecords: [] as StoredFile[],
  recentFiles: [] as StoredFile[],
  ensureLoaded: vi.fn(async () => undefined),
  removeFile: vi.fn(async () => undefined)
}));

/**
 * 标签页 store mock。
 */
const tabsStoreMock = vi.hoisted(() => ({
  removeTab: vi.fn()
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({
    name: 'editor',
    params: {
      id: 'file_a'
    }
  }),
  useRouter: () => ({
    push: vi.fn()
  })
}));

vi.mock('@/shared/platform', () => ({
  native: {
    getPathStatus: getPathStatusMock
  }
}));

vi.mock('@/hooks/useOpenFile', () => ({
  useOpenFile: () => ({
    openFile: vi.fn(async () => undefined),
    openFileByPath: openFileByPathMock
  })
}));

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: () => ({
    openWebview: vi.fn(),
    openFile: vi.fn(),
    onLink: vi.fn()
  })
}));

vi.mock('@/stores/workspace/recent', () => ({
  useRecentStore: () => filesStoreMock
}));

vi.mock('@/stores/workspace/tabs', () => ({
  useTabsStore: () => tabsStoreMock
}));

/**
 * BModal 占位组件，渲染默认插槽。
 */
const BModalStub = defineComponent({
  name: 'BModal',
  props: {
    open: { type: Boolean, default: false }
  },
  emits: ['update:open'],
  template: '<div v-if="open" class="modal-stub"><slot /></div>'
});

/**
 * BScrollbar 占位组件。
 */
const BScrollbarStub = defineComponent({
  name: 'BScrollbar',
  template: '<div class="scrollbar-stub"><slot /></div>'
});

/**
 * AInput 占位组件，复用原生 input 触发 v-model 与键盘事件。
 */
const AInputStub = defineComponent({
  name: 'AInput',
  props: {
    value: { type: String, default: '' },
    placeholder: { type: String, default: '' }
  },
  emits: ['update:value', 'keydown'],
  methods: {
    /**
     * 同步 input 的值变更。
     * @param event - 原生输入事件
     */
    handleInput(event: Event): void {
      this.$emit('update:value', (event.target as HTMLInputElement).value);
    }
  },
  template: `
    <input
      :value="value"
      :placeholder="placeholder"
      @input="handleInput"
      @keydown="$emit('keydown', $event)"
    />
  `
});

/**
 * 挂载最近文件搜索组件。
 * @returns 组件包装器
 */
function mountSearchRecent() {
  return mount(BSearchRecent, {
    props: {
      visible: true
    },
    global: {
      stubs: {
        BModal: BModalStub,
        BScrollbar: BScrollbarStub,
        AInput: AInputStub,
        Icon: true
      }
    }
  });
}

/**
 * 创建测试最近文件。
 * @param overrides - 覆盖字段
 * @returns 最近文件记录
 */
function createStoredFile(overrides: Partial<StoredFile> = {}): StoredFile {
  return {
    type: 'file',
    id: overrides.id ?? 'file_a',
    path: overrides.path === undefined ? '/workspace/demo.md' : overrides.path,
    name: overrides.name ?? 'demo',
    ext: overrides.ext ?? 'md',
    content: overrides.content ?? '# demo',
    savedContent: overrides.savedContent ?? overrides.content ?? '# demo',
    createdAt: overrides.createdAt ?? 1,
    openedAt: overrides.openedAt ?? 1,
    savedAt: overrides.savedAt ?? 1
  };
}

describe('BSearchRecent absolute path search', () => {
  beforeEach(() => {
    filesStoreMock.recentRecords = [createStoredFile()];
    filesStoreMock.recentFiles = [createStoredFile()];
    filesStoreMock.ensureLoaded.mockClear();
    filesStoreMock.removeFile.mockClear();
    tabsStoreMock.removeTab.mockClear();
    getPathStatusMock.mockReset();
    openFileByPathMock.mockReset();
  });

  it('renders an absolute-path candidate when the input points to an existing file', async () => {
    getPathStatusMock.mockResolvedValue({
      exists: true,
      isFile: true,
      isDirectory: false
    });

    const wrapper = mountSearchRecent();

    await wrapper.find('input').setValue('/tmp/demo.md');
    await nextTick();
    await nextTick();

    expect(wrapper.text()).toContain('demo.md');
    expect(wrapper.text()).toContain('/tmp/demo.md');
  });

  it('opens the absolute-path candidate first when pressing enter', async () => {
    getPathStatusMock.mockResolvedValue({
      exists: true,
      isFile: true,
      isDirectory: false
    });
    openFileByPathMock.mockResolvedValue(null);

    const wrapper = mountSearchRecent();

    await wrapper.find('input').setValue('/tmp/demo.md');
    await nextTick();
    await nextTick();
    await wrapper.find('input').trigger('keydown.enter');

    expect(openFileByPathMock).toHaveBeenCalledWith('/tmp/demo.md');
  });

  it('renders recent file titles with file extensions', async () => {
    filesStoreMock.recentFiles = [createStoredFile({ name: 'demo', ext: 'md', content: '# Custom Title' })];

    const wrapper = mountSearchRecent();

    await nextTick();

    expect(wrapper.text()).toContain('demo.md');
    expect(wrapper.text()).not.toContain('Custom Title');
  });
});
