/**
 * @file use-tab-close-guard.test.ts
 * @description 顶部标签关闭前置确认与聊天 Runtime 终止测试。
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTabCloseGuard } from '@/layouts/default/hooks/useTabCloseGuard';
import { useChatTabStore } from '@/stores/chat/tab';
import type { TabClosePlan } from '@/stores/workspace/tabs';

const modalConfirmMock = vi.hoisted(() => vi.fn<(title: string, content: string) => Promise<[boolean, boolean]>>());
const messageErrorMock = vi.hoisted(() => vi.fn<(content: string) => void>());

vi.mock('@/utils/modal', () => ({
  Modal: {
    confirm: modalConfirmMock
  }
}));

vi.mock('ant-design-vue', () => ({
  message: {
    error: messageErrorMock
  }
}));

/**
 * 创建标签关闭计划。
 * @param overrides - 需要覆盖的关闭字段
 * @returns 完整关闭计划
 */
function createPlan(overrides: Partial<TabClosePlan> = {}): TabClosePlan {
  return {
    action: 'close',
    anchorTabId: 'chat:session-a',
    activeTabId: null,
    allowCloseLastTab: true,
    disabled: false,
    targetTabIds: [],
    dirtyTabIds: [],
    requiresConfirm: false,
    requiresNavigation: false,
    nextActivePath: null,
    ...overrides
  };
}

describe('useTabCloseGuard', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
    modalConfirmMock.mockReset();
    modalConfirmMock.mockResolvedValue([false, true]);
    messageErrorMock.mockReset();
  });

  it('rejects a disabled close plan without prompting', async (): Promise<void> => {
    await expect(useTabCloseGuard().canClose(createPlan({ disabled: true }))).resolves.toBe(false);
    expect(modalConfirmMock).not.toHaveBeenCalled();
  });

  it('aborts an active runtime before allowing close', async (): Promise<void> => {
    const runtimeStore = useChatTabStore();
    const abort = vi.fn<() => Promise<void>>().mockResolvedValue();
    runtimeStore.registerController('chat:session-a', { abort });
    runtimeStore.setStatus('chat:session-a', 'running');

    await expect(useTabCloseGuard().canClose(createPlan({ targetTabIds: ['chat:session-a'] }))).resolves.toBe(true);
    expect(modalConfirmMock).toHaveBeenCalledWith('终止并关闭聊天', '当前聊天仍在运行，关闭前需要先终止任务。确认继续吗？');
    expect(abort).toHaveBeenCalledOnce();
  });

  it('confirms and aborts an active batch once', async (): Promise<void> => {
    const runtimeStore = useChatTabStore();
    const abortA = vi.fn<() => Promise<void>>().mockResolvedValue();
    const abortB = vi.fn<() => Promise<void>>().mockResolvedValue();
    runtimeStore.registerController('chat:session-a', { abort: abortA });
    runtimeStore.registerController('chat:session-b', { abort: abortB });
    runtimeStore.setStatus('chat:session-a', 'running');
    runtimeStore.setStatus('chat:session-b', 'waiting');

    await expect(useTabCloseGuard().canClose(createPlan({ action: 'closeAll', targetTabIds: ['chat:session-a', 'chat:session-b'] }))).resolves.toBe(true);
    expect(modalConfirmMock).toHaveBeenCalledTimes(1);
    expect(abortA).toHaveBeenCalledOnce();
    expect(abortB).toHaveBeenCalledOnce();
  });

  it('keeps the plan when runtime confirmation is cancelled', async (): Promise<void> => {
    const runtimeStore = useChatTabStore();
    const abort = vi.fn<() => Promise<void>>().mockResolvedValue();
    runtimeStore.registerController('chat:session-a', { abort });
    runtimeStore.setStatus('chat:session-a', 'running');
    modalConfirmMock.mockResolvedValue([true, false]);

    await expect(useTabCloseGuard().canClose(createPlan({ targetTabIds: ['chat:session-a'] }))).resolves.toBe(false);
    expect(abort).not.toHaveBeenCalled();
  });

  it('reports an abort failure and keeps the close plan', async (): Promise<void> => {
    const runtimeStore = useChatTabStore();
    runtimeStore.registerController('chat:session-a', { abort: vi.fn<() => Promise<void>>().mockRejectedValue(new Error('abort failed')) });
    runtimeStore.setStatus('chat:session-a', 'running');

    await expect(useTabCloseGuard().canClose(createPlan({ targetTabIds: ['chat:session-a'] }))).resolves.toBe(false);
    expect(messageErrorMock).toHaveBeenCalledWith('终止聊天失败：abort failed');
  });

  it('retains the existing dirty confirmation result', async (): Promise<void> => {
    modalConfirmMock.mockResolvedValue([true, false]);

    await expect(useTabCloseGuard().canClose(createPlan({ requiresConfirm: true, dirtyTabIds: ['editor-a'] }))).resolves.toBe(false);
    expect(modalConfirmMock).toHaveBeenCalledWith('关闭标签', '当前标签有未保存更改，确认关闭吗？');
  });

  it('cleans runtime records after tabs have closed', (): void => {
    const runtimeStore = useChatTabStore();
    runtimeStore.ensureTab('chat:session-a', 'session-a');
    runtimeStore.registerController('chat:session-a', { abort: vi.fn<() => Promise<void>>().mockResolvedValue() });

    useTabCloseGuard().cleanupClosedTabs(['chat:session-a', 'editor-a']);

    expect(runtimeStore.records['chat:session-a']).toBeUndefined();
    expect(runtimeStore.controllers.has('chat:session-a')).toBe(false);
  });
});
