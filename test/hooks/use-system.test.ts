/**
 * @file use-system.test.ts
 * @description 系统级事件监听启动行为测试。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSystem } from '@/hooks/useSystem';

/** Electron 打开文件监听取消函数 mock。 */
const unregisterOpenFileListenerMock = vi.hoisted(() => vi.fn<() => void>());
/** Electron 打开文件监听注册 mock。 */
const onOpenFileMock = vi.hoisted(() => vi.fn<() => () => void>(() => unregisterOpenFileListenerMock));
/** 打开文件能力 mock。 */
const openFileByPathMock = vi.hoisted(() => vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined));
/** 记忆加载 mock。 */
const loadMemoryMock = vi.hoisted(() => vi.fn<() => Promise<void>>().mockResolvedValue(undefined));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: () => ({
    onOpenFile: onOpenFileMock
  })
}));

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: () => ({
    openFileByPath: openFileByPathMock
  })
}));

vi.mock('@/stores/ai/memory', () => ({
  useMemoryStore: () => ({
    loadMemory: loadMemoryMock
  })
}));

/** useSystem 测试宿主组件。 */
const UseSystemHost = defineComponent({
  name: 'UseSystemHost',
  setup() {
    useSystem();
    return () => null;
  }
});

describe('useSystem', (): void => {
  beforeEach((): void => {
    unregisterOpenFileListenerMock.mockClear();
    onOpenFileMock.mockClear();
    openFileByPathMock.mockClear();
    loadMemoryMock.mockClear();
  });

  it('registers system file listeners without loading memory during app startup', (): void => {
    const wrapper = mount(UseSystemHost);

    expect(onOpenFileMock).toHaveBeenCalledTimes(1);
    expect(loadMemoryMock).not.toHaveBeenCalled();

    wrapper.unmount();
    expect(unregisterOpenFileListenerMock).toHaveBeenCalledTimes(1);
  });
});
