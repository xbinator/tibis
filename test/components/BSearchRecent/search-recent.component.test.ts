/**
 * @file search-recent.component.test.ts
 * @description 验证最近记录搜索弹窗的紧凑结果项图标展示。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file -- 测试文件内定义轻量组件替身。 */
import { readFileSync } from 'node:fs';
import { defineComponent, nextTick } from 'vue';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BSearchRecent from '@/components/BSearchRecent/index.vue';
import type { RecentRecord } from '@/shared/storage';

/**
 * 最近记录 store 测试替身。
 */
interface RecentStoreMock {
  /** 最近记录列表。 */
  recentRecords: RecentRecord[];
  /** 确保最近记录已加载。 */
  ensureLoaded: ReturnType<typeof vi.fn>;
  /** 删除最近记录。 */
  removeFile: ReturnType<typeof vi.fn>;
}

const routeMock = vi.hoisted(() => ({
  name: 'editor',
  params: {
    id: 'file-1'
  }
}));
const recentStoreMock = vi.hoisted<RecentStoreMock>(() => ({
  recentRecords: [],
  ensureLoaded: vi.fn(),
  removeFile: vi.fn()
}));
const getPathStatusMock = vi.hoisted(() => vi.fn<(_path: string) => Promise<{ exists: boolean; isFile: boolean }>>());

vi.mock('vue-router', () => ({
  useRoute: () => routeMock
}));

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: () => ({
    openWebview: vi.fn()
  })
}));

vi.mock('@/hooks/useOpenFile', () => ({
  useOpenFile: () => ({
    openFile: vi.fn(),
    openFileByPath: vi.fn()
  })
}));

vi.mock('@/shared/platform', () => ({
  native: {
    getPathStatus: getPathStatusMock
  }
}));

vi.mock('@/stores/workspace/recent', () => ({
  useRecentStore: () => recentStoreMock
}));

vi.mock('@/stores/workspace/tabs', () => ({
  useTabsStore: () => ({
    removeTab: vi.fn()
  })
}));

/** BModal 测试替身，仅在 open=true 时渲染默认插槽。 */
const BModalStub = defineComponent({
  name: 'BModal',
  props: {
    open: {
      type: Boolean,
      default: false
    }
  },
  template: '<div v-if="open" class="b-modal-stub"><slot /></div>'
});

/** BScrollbar 测试替身，直接渲染默认插槽。 */
const BScrollbarStub = defineComponent({
  name: 'BScrollbar',
  template: '<div class="b-scrollbar-stub"><slot /></div>'
});

/** AInput 测试替身，保留 value 双向绑定和 keydown 事件。 */
const AInputStub = defineComponent({
  name: 'AInput',
  props: {
    value: {
      type: String,
      default: ''
    }
  },
  emits: ['update:value', 'keydown'],
  setup(_props, { emit }) {
    /**
     * 将原生 input 事件转换为 AInput 的 value 更新事件。
     * @param event - 原生输入事件
     */
    function handleInput(event: Event): void {
      const target = event.target as HTMLInputElement | null;

      emit('update:value', target?.value ?? '');
    }

    return {
      handleInput
    };
  },
  template: `
    <input
      class="a-input-stub"
      :value="value"
      @input="handleInput"
      @keydown="$emit('keydown', $event)"
    />
  `
});

/** BIcon 测试替身，将 icon 名称暴露给断言。 */
const BIconStub = defineComponent({
  name: 'BIcon',
  props: {
    icon: {
      type: String,
      required: true
    }
  },
  template: '<i class="b-icon-stub" :data-icon="icon"></i>'
});

/**
 * 创建文件最近记录。
 * @param overrides - 需要覆盖的字段
 * @returns 文件最近记录
 */
function createFileRecord(overrides: Partial<Extract<RecentRecord, { type: 'file' }>> = {}): Extract<RecentRecord, { type: 'file' }> {
  return {
    type: 'file',
    id: 'file-1',
    path: '/tmp/example.ts',
    content: '',
    name: 'example',
    ext: 'ts',
    ...overrides
  };
}

/**
 * 创建 WebView 最近记录。
 * @returns WebView 最近记录
 */
function createWebviewRecord(): Extract<RecentRecord, { type: 'webview' }> {
  return {
    type: 'webview',
    id: 'web-1',
    url: 'https://example.com/docs',
    title: 'Example Docs',
    createdAt: 1,
    openedAt: 2
  };
}

/**
 * 挂载最近搜索弹窗。
 * @returns 组件包装器
 */
function mountSearchRecent(): VueWrapper {
  return mount(BSearchRecent, {
    props: {
      visible: true
    },
    global: {
      stubs: {
        AInput: AInputStub,
        BIcon: BIconStub,
        BModal: BModalStub,
        BScrollbar: BScrollbarStub
      }
    }
  });
}

/**
 * 读取最近记录搜索组件源码。
 * @returns Vue 单文件组件源码
 */
function readSearchRecentSource(): string {
  return readFileSync('src/components/BSearchRecent/index.vue', 'utf8');
}

/**
 * 提取指定选择器的首个样式块内容。
 * @param source - 样式源码
 * @param selector - CSS 选择器
 * @returns 样式块内容
 */
function extractRuleBlock(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(source);

  return match?.[1] ?? '';
}

describe('BSearchRecent result icons', (): void => {
  beforeEach((): void => {
    routeMock.name = 'editor';
    routeMock.params.id = 'file-1';
    recentStoreMock.recentRecords = [createFileRecord(), createWebviewRecord()];
    recentStoreMock.ensureLoaded.mockClear();
    recentStoreMock.removeFile.mockClear();
    getPathStatusMock.mockReset();
    getPathStatusMock.mockResolvedValue({ exists: false, isFile: false });
  });

  it('renders file type and webview icons for recent records', (): void => {
    const wrapper = mountSearchRecent();
    const icons = wrapper
      .findAll('.b-search-recent__item-icon.b-icon-stub')
      .map((iconWrapper: DOMWrapper<Element>): string | undefined => iconWrapper.attributes('data-icon'));

    expect(icons).toContain('vscode-icons:file-type-typescript-official');
    expect(icons).toContain('vscode-icons:file-type-geojson');
  });

  it('renders candidate icons for URL and absolute path input', async (): Promise<void> => {
    const wrapper = mountSearchRecent();
    const input = wrapper.find('input.a-input-stub');

    await input.setValue('https://openai.com/docs');
    await nextTick();

    expect(wrapper.find('.b-search-recent__item-icon.b-icon-stub').attributes('data-icon')).toBe('vscode-icons:file-type-geojson');

    getPathStatusMock.mockResolvedValue({ exists: true, isFile: true });
    await input.setValue('/tmp/sketch.md');
    await flushPromises();

    expect(wrapper.find('.b-search-recent__item-icon.b-icon-stub').attributes('data-icon')).toBe('vscode-icons:file-type-markdown');
  });

  it('renders the standard vscode json icon for json records', (): void => {
    recentStoreMock.recentRecords = [createFileRecord({ ext: 'json', name: 'config', path: '/tmp/config.json' })];
    const wrapper = mountSearchRecent();

    expect(wrapper.find('.b-search-recent__item-icon.b-icon-stub').attributes('data-icon')).toBe('vscode-icons:file-type-json');
  });

  it('renders json icons for tibis recent records and path candidates', async (): Promise<void> => {
    recentStoreMock.recentRecords = [createFileRecord({ ext: 'tibis', name: 'sketch', path: '/tmp/sketch.tibis' })];
    const wrapper = mountSearchRecent();
    const input = wrapper.find('input.a-input-stub');

    expect(wrapper.find('.b-search-recent__item-icon.b-icon-stub').attributes('data-icon')).toBe('vscode-icons:file-type-json');

    getPathStatusMock.mockResolvedValue({ exists: true, isFile: true });
    await input.setValue('/tmp/board.tibis');
    await flushPromises();

    expect(wrapper.find('.b-search-recent__item-icon.b-icon-stub').attributes('data-icon')).toBe('vscode-icons:file-type-json');
  });

  it('renders npm package icons for package.json records and path candidates', async (): Promise<void> => {
    recentStoreMock.recentRecords = [createFileRecord({ ext: 'json', name: 'package', path: '/tmp/package.json' })];
    const wrapper = mountSearchRecent();
    const input = wrapper.find('input.a-input-stub');

    expect(wrapper.find('.b-search-recent__item-icon.b-icon-stub').attributes('data-icon')).toBe('vscode-icons:file-type-npm');

    getPathStatusMock.mockResolvedValue({ exists: true, isFile: true });
    await input.setValue('/tmp/package.json');
    await flushPromises();

    expect(wrapper.find('.b-search-recent__item-icon.b-icon-stub').attributes('data-icon')).toBe('vscode-icons:file-type-npm');
  });

  it('keeps icon, title and path in one horizontal row', (): void => {
    const source = readSearchRecentSource();
    const itemMainRule = extractRuleBlock(source, '.b-search-recent__item-main');

    expect(itemMainRule).toMatch(/flex-direction:\s*row;/);
    expect(itemMainRule).not.toMatch(/flex-direction:\s*column;/);
  });

  it('uses compact row sizing with smaller result icons', (): void => {
    const source = readSearchRecentSource();
    const itemRule = extractRuleBlock(source, '.b-search-recent__item');
    const iconRule = extractRuleBlock(source, '.b-search-recent__item-icon');
    const pathRule = extractRuleBlock(source, '.b-search-recent__item-path');

    expect(itemRule).toMatch(/height:\s*32px;/);
    expect(itemRule).toMatch(/padding:\s*0 6px;/);
    expect(iconRule).toMatch(/width:\s*14px;/);
    expect(iconRule).toMatch(/height:\s*14px;/);
    expect(iconRule).toMatch(/margin-right:\s*8px;/);
    expect(pathRule).toMatch(/margin-left:\s*6px;/);
  });

  it('uses one icon style without a web-specific modifier', (): void => {
    const source = readSearchRecentSource();

    expect(source).not.toContain('iconTone');
    expect(source).not.toContain('item-icon--web');
  });

  it('hides the delete action until the row is hovered', (): void => {
    const source = readSearchRecentSource();
    const deleteRule = extractRuleBlock(source, '.b-search-recent__item-delete');
    const hoverDeleteRule = extractRuleBlock(source, '.b-search-recent__item:hover .b-search-recent__item-delete');

    expect(deleteRule).toMatch(/display:\s*none;/);
    expect(deleteRule).toMatch(/width:\s*18px;/);
    expect(deleteRule).toMatch(/height:\s*18px;/);
    expect(hoverDeleteRule).toMatch(/display:\s*flex;/);
  });
});
