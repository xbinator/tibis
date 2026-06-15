/**
 * @file index.test.ts
 * @description 验证欢迎页快捷入口导航行为。
 * @vitest-environment jsdom
 */
import { shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WelcomePage from '@/views/welcome/index.vue';

const routerPushMock = vi.hoisted(() => vi.fn<(_location: unknown) => Promise<void>>().mockResolvedValue(undefined));
const createNewDrawingFileMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'drawing-1' }));

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
    ensureLoaded: vi.fn(),
    topRecentRecords: []
  })
}));

describe('WelcomePage', (): void => {
  beforeEach((): void => {
    routerPushMock.mockClear();
    createNewDrawingFileMock.mockClear();
  });

  it('creates a drawing file from the quick action entry', async (): Promise<void> => {
    const wrapper = shallowMount(WelcomePage, {
      global: {
        stubs: {
          BSearchRecent: true,
          DropZone: {
            template: '<div><slot /></div>'
          },
          Icon: true
        }
      }
    });

    await wrapper.find('[data-testid="welcome-open-drawing"]').trigger('click');

    expect(createNewDrawingFileMock).toHaveBeenCalledTimes(1);
    expect(routerPushMock).not.toHaveBeenCalledWith({ name: 'drawing' });
  });
});
