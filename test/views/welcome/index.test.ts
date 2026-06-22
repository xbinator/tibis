/**
 * @file index.test.ts
 * @description 验证欢迎页快捷入口导航行为。
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecentRecord } from '@/shared/storage';
import WelcomePage from '@/views/welcome/index.vue';

const routerPushMock = vi.hoisted(() => vi.fn<(_location: unknown) => Promise<void>>().mockResolvedValue(undefined));
const createNewDrawingFileMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'drawing-1' }));
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
    createNewDrawingFile: createNewDrawingFileMock,
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

/**
 * 读取欢迎页源码。
 * @returns 欢迎页 Vue 单文件组件源码
 */
function readWelcomePageSource(): string {
  return readFileSync('src/views/welcome/index.vue', 'utf8');
}

describe('WelcomePage', (): void => {
  beforeEach((): void => {
    routerPushMock.mockClear();
    createNewDrawingFileMock.mockClear();
    ensureLoadedMock.mockClear();
    topRecentRecordsMock.value = [];
  });

  it('creates a drawing file from the quick action entry', async (): Promise<void> => {
    const wrapper = shallowMount(WelcomePage, {
      global: {
        stubs: {
          BSearchRecent: true,
          DropZone: {
            template: '<div><slot /></div>'
          },
          Icon: IconStub
        }
      }
    });

    await wrapper.find('[data-testid="welcome-open-drawing"]').trigger('click');

    expect(createNewDrawingFileMock).toHaveBeenCalledTimes(1);
    expect(routerPushMock).not.toHaveBeenCalledWith({ name: 'drawing' });
  });

  it('uses the unified file icon helper for recent file records', (): void => {
    const source = readWelcomePageSource();

    expect(source).toContain("import { getFileIconByName } from '@/utils/file/icons';");
    expect(source).toContain('return getFileIconByName(resolveFileTitle(record));');
    expect(source).not.toContain("record.ext === 'tibis' ? 'lucide:pen-line' : 'lucide:file-text'");
  });

  it('uses the same geojson icon for webview recent records', (): void => {
    const source = readWelcomePageSource();

    expect(source).toContain("return 'vscode-icons:file-type-geojson';");
    expect(source).not.toContain("return 'lucide:globe';");
  });
});
