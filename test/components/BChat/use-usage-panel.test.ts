/**
 * @file use-usage-panel.test.ts
 * @description BChat 用量面板状态 hook 测试。
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useUsagePanel } from '@/components/BChat/hooks/useUsagePanel';

const chatStoreMock = vi.hoisted(() => ({
  getSessionUsage: vi.fn()
}));

const settingStoreMock = vi.hoisted(() => ({
  chatSidebarActiveSessionId: undefined as string | undefined
}));

vi.mock('@/stores/chat/session', () => ({
  useChatSessionStore: vi.fn(() => chatStoreMock)
}));

vi.mock('@/stores/ui/setting', () => ({
  useSettingStore: vi.fn(() => settingStoreMock)
}));

describe('useUsagePanel', (): void => {
  beforeEach((): void => {
    chatStoreMock.getSessionUsage.mockReset();
    settingStoreMock.chatSidebarActiveSessionId = undefined;
  });

  it('loads usage with the provided current session id when sidebar active id is unavailable', async (): Promise<void> => {
    chatStoreMock.getSessionUsage.mockResolvedValue({ inputTokens: 3, outputTokens: 4, totalTokens: 7 });
    const usagePanel = useUsagePanel();

    await usagePanel.openPanel('session-fallback');

    expect(chatStoreMock.getSessionUsage).toHaveBeenCalledWith('session-fallback');
    expect(usagePanel.loading.value).toBe(false);
    expect(usagePanel.usage.value).toEqual({ inputTokens: 3, outputTokens: 4, totalTokens: 7 });
  });
});
