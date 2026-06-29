/**
 * @file index.test.ts
 * @description 验证欢迎页快捷入口导航行为。
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { createPinia, setActivePinia } from 'pinia';
import { shallowMount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecentRecord } from '@/shared/storage';
import WelcomePage from '@/views/welcome/index.vue';

const routerPushMock = vi.hoisted(() => vi.fn<(_location: unknown) => Promise<void>>().mockResolvedValue(undefined));
const createNewWidgetFileMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'widget-1' }));
const topRecentRecordsMock = vi.hoisted<{ value: RecentRecord[] }>(() => ({ value: [] }));
const ensureLoadedMock = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPushMock
  })
}));

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: () => ({
    openWebview: vi.fn()
  })
}));

vi.mock('@/hooks/useOpenFile', () => ({
  useOpenFile: () => ({
    createNewFile: vi.fn(),
    createNewWidgetFile: createNewWidgetFileMock,
    openFileById: vi.fn(),
    openNativeFile: vi.fn()
  })
}));

vi.mock('@/stores/workspace/recent', () => ({
  useRecentStore: () => ({
    ensureLoaded: ensureLoadedMock,
    get topRecentRecords() {
      return topRecentRecordsMock.value;
    }
  })
}));

/** Iconify 测试替身，保留 icon 属性便于断言。 */
const IconStub = {
  name: 'Icon',
  props: {
    icon: {
      type: String,
      required: true
    }
  },
  template: '<i class="icon-stub" :data-icon="icon"></i>'
};

/** 最近记录图标测试替身，保留 record 属性便于断言。 */
const BRecentIconStub = {
  name: 'BRecentIcon',
  props: {
    record: {
      type: Object,
      required: true
    },
    size: {
      type: [Number, String],
      default: ''
    }
  },
  template: '<i class="recent-record-icon-stub" :data-record-id="record.id" :data-size="size"></i>'
};

/**
 * 读取欢迎页源码。
 * @returns 欢迎页 Vue 单文件组件源码
 */
function readWelcomePageSource(): string {
  return readFileSync('src/views/welcome/index.vue', 'utf8');
}

/**
 * 创建 WebView 最近记录。
 * @param overrides - 需要覆盖的字段
 * @returns WebView 最近记录
 */
function createWebviewRecord(overrides: Partial<Extract<RecentRecord, { type: 'webview' }>> = {}): Extract<RecentRecord, { type: 'webview' }> {
  return {
    type: 'webview',
    id: 'web-1',
    url: 'https://example.com',
    title: 'Example Domain',
    createdAt: 1,
    openedAt: 2,
    ...overrides
  };
}

/**
 * 挂载欢迎页。
 * @returns Vue Test Utils 包装器
 */
function mountWelcomePage(): VueWrapper {
  return shallowMount(WelcomePage, {
    global: {
      stubs: {
        BRecent: true,
        BRecentIcon: BRecentIconStub,
        DropZone: {
          template: '<div><slot /></div>'
        },
        Icon: IconStub
      }
    }
  });
}

describe('WelcomePage', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    routerPushMock.mockClear();
    createNewWidgetFileMock.mockClear();
    ensureLoadedMock.mockClear();
    topRecentRecordsMock.value = [];
  });

  it('creates a widget file from the quick action entry', async (): Promise<void> => {
    const wrapper = mountWelcomePage();

    await wrapper.find('[data-testid="welcome-open-widget"]').trigger('click');

    expect(createNewWidgetFileMock).toHaveBeenCalledTimes(1);
    expect(routerPushMock).not.toHaveBeenCalledWith({ name: 'widget' });
  });

  it('delegates recent record icon rendering to BRecentIcon', (): void => {
    const source = readWelcomePageSource();

    expect(source).toContain('<BRecentIcon :record="record" :size="14" />');
    expect(source).not.toContain("import { getFileIconByName } from '@/utils/file/icons';");
    expect(source).not.toContain('getRecentRecordFavicon');
    expect(source).not.toContain('getRecentRecordIcon');
    expect(source).not.toContain("record.ext === 'tibis' ? 'lucide:pen-line' : 'lucide:file-text'");
  });

  it('passes recent records to the shared icon component', (): void => {
    topRecentRecordsMock.value = [
      createWebviewRecord({
        favicon: 'https://example.com/favicon.ico'
      })
    ];
    const wrapper = mountWelcomePage();
    const recentItem = wrapper.find('.recent-file-item');

    expect(recentItem.find('.recent-record-icon-stub').attributes('data-record-id')).toBe('web-1');
    expect(recentItem.find('.recent-record-icon-stub').attributes('data-size')).toBe('14');
  });
});
