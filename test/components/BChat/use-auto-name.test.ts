/**
 * @file use-auto-name.test.ts
 * @description useAutoName Hook 单元测试，覆盖快照采集、防抖调度、chat 模型复用与标题持久化。
 */
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useAutoName } from '@/components/BChatSidebar/hooks/useAutoName';

/** mock agent.invoke */
const mockInvoke = vi.hoisted(() => vi.fn());

/** mock serviceModelStore.getAvailableServiceConfig */
const mockGetAvailableServiceConfig = vi.hoisted(() => vi.fn());

/** mock chatStore.updateSessionTitle */
const mockUpdateSessionTitle = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useChat', () => ({
  useChat: () => ({
    agent: { invoke: mockInvoke }
  })
}));

vi.mock('@/stores/ai/serviceModel', () => ({
  useServiceModelStore: () => ({
    getAvailableServiceConfig: mockGetAvailableServiceConfig
  })
}));

vi.mock('@/stores/chat/session', () => ({
  useChatSessionStore: () => ({
    updateSessionTitle: mockUpdateSessionTitle
  })
}));

/** 固定定时器，便于精确控制防抖 */
vi.useFakeTimers();

/**
 * 构造最小 options，模拟调用方提供的上下文。
 * @param overrides - 可选覆盖项
 * @returns AutoNameOptions
 */
function createOptions(overrides?: {
  currentSession?: { id: string; title: string };
  onTitlePersisted?: (sessionId: string, title: string) => Promise<void> | void;
}) {
  return {
    getCurrentSession: () => overrides?.currentSession,
    getFirstRoundContent: (message: { content: string }) => ({
      userMessage: '用户首条消息',
      aiResponse: message.content
    }),
    onTitlePersisted: overrides?.onTitlePersisted
  };
}

describe('useAutoName', () => {
  beforeEach((): void => {
    mockInvoke.mockReset();
    mockGetAvailableServiceConfig.mockReset();
    mockUpdateSessionTitle.mockReset();
  });

  // ─── captureSnapshot ───

  describe('captureSnapshot', () => {
    it('returns null when sessionId is null', (): void => {
      const { captureSnapshot } = useAutoName(createOptions());
      expect(captureSnapshot({ content: 'hi' }, null)).toBeNull();
    });

    it('returns null when getFirstRoundContent returns null', (): void => {
      const { captureSnapshot } = useAutoName({
        ...createOptions(),
        getFirstRoundContent: () => null
      });
      expect(captureSnapshot({ content: 'hi' }, 'session-1')).toBeNull();
    });

    it('returns snapshot with sessionId and first-round content', (): void => {
      const { captureSnapshot } = useAutoName(createOptions());
      const snap = captureSnapshot({ content: 'AI回复内容' }, 'session-1');
      expect(snap).toEqual({
        sessionId: 'session-1',
        userMessage: '用户首条消息',
        aiResponse: 'AI回复内容'
      });
    });
  });

  // ─── scheduleAutoName → doAutoName ───

  describe('doAutoName (via scheduleAutoName)', () => {
    it('uses chat service config instead of autoname', async (): Promise<void> => {
      mockGetAvailableServiceConfig.mockResolvedValue({
        providerId: 'provider-chat',
        modelId: 'model-chat'
      });
      mockInvoke.mockResolvedValue([null, { text: '聊天话题' }]);
      mockUpdateSessionTitle.mockResolvedValue(undefined);

      const { captureSnapshot, scheduleAutoName } = useAutoName(createOptions());
      const snap = captureSnapshot({ content: 'AI回复' }, 'session-1')!;
      scheduleAutoName(snap, () => false);

      await vi.advanceTimersByTimeAsync(300);

      // 验证读取的是 chat 配置
      expect(mockGetAvailableServiceConfig).toHaveBeenCalledWith('chat');
    });

    it('skips naming when chat config is unavailable', async (): Promise<void> => {
      mockGetAvailableServiceConfig.mockResolvedValue(null);

      const { captureSnapshot, scheduleAutoName } = useAutoName(createOptions());
      const snap = captureSnapshot({ content: 'AI回复' }, 'session-1')!;
      scheduleAutoName(snap, () => false);

      await vi.advanceTimersByTimeAsync(300);

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(mockUpdateSessionTitle).not.toHaveBeenCalled();
    });

    it('persists title and updates current session UI', async (): Promise<void> => {
      mockGetAvailableServiceConfig.mockResolvedValue({
        providerId: 'provider-chat',
        modelId: 'model-chat'
      });
      mockInvoke.mockResolvedValue([null, { text: 'Vue组件设计' }]);
      mockUpdateSessionTitle.mockResolvedValue(undefined);

      const currentSession = { id: 'session-1', title: '旧标题' };
      const { captureSnapshot, scheduleAutoName } = useAutoName(createOptions({ currentSession }));
      const snap = captureSnapshot({ content: 'AI回复' }, 'session-1')!;
      scheduleAutoName(snap, () => false);

      await vi.advanceTimersByTimeAsync(300);

      expect(mockUpdateSessionTitle).toHaveBeenCalledWith('session-1', 'Vue组件设计');
      expect(currentSession.title).toBe('Vue组件设计');
    });

    it('does not update UI when current session differs', async (): Promise<void> => {
      mockGetAvailableServiceConfig.mockResolvedValue({
        providerId: 'provider-chat',
        modelId: 'model-chat'
      });
      mockInvoke.mockResolvedValue([null, { text: '其他话题' }]);
      mockUpdateSessionTitle.mockResolvedValue(undefined);

      const currentSession = { id: 'session-other', title: '旧标题' };
      const { captureSnapshot, scheduleAutoName } = useAutoName(createOptions({ currentSession }));
      const snap = captureSnapshot({ content: 'AI回复' }, 'session-1')!;
      scheduleAutoName(snap, () => false);

      await vi.advanceTimersByTimeAsync(300);

      // 持久化仍执行（写入 session-1）
      expect(mockUpdateSessionTitle).toHaveBeenCalledWith('session-1', '其他话题');
      // 但当前 UI 会话标题不变
      expect(currentSession.title).toBe('旧标题');
    });

    it('strips quotes from LLM output', async (): Promise<void> => {
      mockGetAvailableServiceConfig.mockResolvedValue({
        providerId: 'provider-chat',
        modelId: 'model-chat'
      });
      mockInvoke.mockResolvedValue([null, { text: '"带引号的标题"' }]);
      mockUpdateSessionTitle.mockResolvedValue(undefined);

      const { captureSnapshot, scheduleAutoName } = useAutoName(createOptions());
      const snap = captureSnapshot({ content: 'AI回复' }, 'session-1')!;
      scheduleAutoName(snap, () => false);

      await vi.advanceTimersByTimeAsync(300);

      expect(mockUpdateSessionTitle).toHaveBeenCalledWith('session-1', '带引号的标题');
    });

    it('skips naming when LLM returns empty text', async (): Promise<void> => {
      mockGetAvailableServiceConfig.mockResolvedValue({
        providerId: 'provider-chat',
        modelId: 'model-chat'
      });
      mockInvoke.mockResolvedValue([null, { text: '' }]);

      const { captureSnapshot, scheduleAutoName } = useAutoName(createOptions());
      const snap = captureSnapshot({ content: 'AI回复' }, 'session-1')!;
      scheduleAutoName(snap, () => false);

      await vi.advanceTimersByTimeAsync(300);

      expect(mockUpdateSessionTitle).not.toHaveBeenCalled();
    });

    it('skips naming when LLM invoke fails', async (): Promise<void> => {
      mockGetAvailableServiceConfig.mockResolvedValue({
        providerId: 'provider-chat',
        modelId: 'model-chat'
      });
      mockInvoke.mockResolvedValue([{ message: '网络错误' }, undefined]);

      const { captureSnapshot, scheduleAutoName } = useAutoName(createOptions());
      const snap = captureSnapshot({ content: 'AI回复' }, 'session-1')!;
      scheduleAutoName(snap, () => false);

      await vi.advanceTimersByTimeAsync(300);

      expect(mockUpdateSessionTitle).not.toHaveBeenCalled();
    });

    it('does not rename the same session twice', async (): Promise<void> => {
      mockGetAvailableServiceConfig.mockResolvedValue({
        providerId: 'provider-chat',
        modelId: 'model-chat'
      });
      mockInvoke.mockResolvedValue([null, { text: '首次标题' }]);
      mockUpdateSessionTitle.mockResolvedValue(undefined);

      const { captureSnapshot, scheduleAutoName } = useAutoName(createOptions());

      // 第一次命名
      const snap1 = captureSnapshot({ content: 'AI回复' }, 'session-1')!;
      scheduleAutoName(snap1, () => false);
      await vi.advanceTimersByTimeAsync(300);

      expect(mockUpdateSessionTitle).toHaveBeenCalledTimes(1);

      // 第二次对同一 session 触发，应跳过
      const snap2 = captureSnapshot({ content: 'AI回复2' }, 'session-1')!;
      scheduleAutoName(snap2, () => false);
      await vi.advanceTimersByTimeAsync(300);

      expect(mockUpdateSessionTitle).toHaveBeenCalledTimes(1);
    });

    it('calls onTitlePersisted after successful naming', async (): Promise<void> => {
      mockGetAvailableServiceConfig.mockResolvedValue({
        providerId: 'provider-chat',
        modelId: 'model-chat'
      });
      mockInvoke.mockResolvedValue([null, { text: '持久化测试' }]);
      mockUpdateSessionTitle.mockResolvedValue(undefined);

      const onTitlePersisted = vi.fn();
      const { captureSnapshot, scheduleAutoName } = useAutoName(createOptions({ onTitlePersisted }));
      const snap = captureSnapshot({ content: 'AI回复' }, 'session-1')!;
      scheduleAutoName(snap, () => false);

      await vi.advanceTimersByTimeAsync(300);

      expect(onTitlePersisted).toHaveBeenCalledWith('session-1', '持久化测试');
    });

    it('still persists title when onTitlePersisted throws', async (): Promise<void> => {
      mockGetAvailableServiceConfig.mockResolvedValue({
        providerId: 'provider-chat',
        modelId: 'model-chat'
      });
      mockInvoke.mockResolvedValue([null, { text: '异常回调' }]);
      mockUpdateSessionTitle.mockResolvedValue(undefined);

      const onTitlePersisted = vi.fn().mockRejectedValue(new Error('回调异常'));
      const { captureSnapshot, scheduleAutoName } = useAutoName(createOptions({ onTitlePersisted }));
      const snap = captureSnapshot({ content: 'AI回复' }, 'session-1')!;
      scheduleAutoName(snap, () => false);

      await vi.advanceTimersByTimeAsync(300);

      // 持久化已成功，回调异常不影响
      expect(mockUpdateSessionTitle).toHaveBeenCalledWith('session-1', '异常回调');
    });
  });

  // ─── 防抖调度 ───

  describe('debounce scheduling', () => {
    it('delays naming by 300ms', async (): Promise<void> => {
      mockGetAvailableServiceConfig.mockResolvedValue({
        providerId: 'provider-chat',
        modelId: 'model-chat'
      });
      mockInvoke.mockResolvedValue([null, { text: '延迟标题' }]);
      mockUpdateSessionTitle.mockResolvedValue(undefined);

      const { captureSnapshot, scheduleAutoName } = useAutoName(createOptions());
      const snap = captureSnapshot({ content: 'AI回复' }, 'session-1')!;
      scheduleAutoName(snap, () => false);

      // 299ms 时还未执行
      await vi.advanceTimersByTimeAsync(299);
      expect(mockInvoke).not.toHaveBeenCalled();

      // 300ms 时执行
      await vi.advanceTimersByTimeAsync(1);
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it('resets debounce timer when scheduling again for the same session', async (): Promise<void> => {
      mockGetAvailableServiceConfig.mockResolvedValue({
        providerId: 'provider-chat',
        modelId: 'model-chat'
      });
      mockInvoke.mockResolvedValue([null, { text: '最终标题' }]);
      mockUpdateSessionTitle.mockResolvedValue(undefined);

      const { captureSnapshot, scheduleAutoName } = useAutoName(createOptions());

      // 第一次调度
      const snap1 = captureSnapshot({ content: 'AI回复1' }, 'session-1')!;
      scheduleAutoName(snap1, () => false);
      await vi.advanceTimersByTimeAsync(200);

      // 第二次调度，重置定时器
      const snap2 = captureSnapshot({ content: 'AI回复2' }, 'session-1')!;
      scheduleAutoName(snap2, () => false);
      await vi.advanceTimersByTimeAsync(200);

      // 第二次调度后只过了 200ms，还没到 300ms
      expect(mockInvoke).not.toHaveBeenCalled();

      // 再过 100ms，达到 300ms
      await vi.advanceTimersByTimeAsync(100);
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it('reschedules when isLoading is true at debounce expiry', async (): Promise<void> => {
      mockGetAvailableServiceConfig.mockResolvedValue({
        providerId: 'provider-chat',
        modelId: 'model-chat'
      });
      mockInvoke.mockResolvedValue([null, { text: '加载后标题' }]);
      mockUpdateSessionTitle.mockResolvedValue(undefined);

      const { captureSnapshot, scheduleAutoName } = useAutoName(createOptions());
      const isLoading: Mock<() => boolean> = vi.fn().mockReturnValue(true);

      const snap = captureSnapshot({ content: 'AI回复' }, 'session-1')!;
      scheduleAutoName(snap, isLoading);

      // 300ms 后 isLoading 仍为 true，应重新调度
      await vi.advanceTimersByTimeAsync(300);
      expect(mockInvoke).not.toHaveBeenCalled();

      // isLoading 变为 false
      isLoading.mockReturnValue(false);
      await vi.advanceTimersByTimeAsync(300);
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it('handles independent sessions concurrently', async (): Promise<void> => {
      mockGetAvailableServiceConfig.mockResolvedValue({
        providerId: 'provider-chat',
        modelId: 'model-chat'
      });
      mockInvoke.mockResolvedValue([null, { text: '并发标题' }]);
      mockUpdateSessionTitle.mockResolvedValue(undefined);

      const { captureSnapshot, scheduleAutoName } = useAutoName(createOptions());

      const snapA = captureSnapshot({ content: 'A回复' }, 'session-A')!;
      const snapB = captureSnapshot({ content: 'B回复' }, 'session-B')!;
      scheduleAutoName(snapA, () => false);
      scheduleAutoName(snapB, () => false);

      await vi.advanceTimersByTimeAsync(300);

      // 两个会话各自独立命名
      expect(mockInvoke).toHaveBeenCalledTimes(2);
      expect(mockUpdateSessionTitle).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Prompt 构建 ───

  describe('prompt construction', () => {
    it('replaces USER_MESSAGE and AI_RESPONSE variables in prompt', async (): Promise<void> => {
      mockGetAvailableServiceConfig.mockResolvedValue({
        providerId: 'provider-chat',
        modelId: 'model-chat'
      });
      mockInvoke.mockResolvedValue([null, { text: '变量测试标题' }]);
      mockUpdateSessionTitle.mockResolvedValue(undefined);

      const { captureSnapshot, scheduleAutoName } = useAutoName(createOptions());
      const snap = captureSnapshot({ content: 'AI的回复内容' }, 'session-1')!;
      scheduleAutoName(snap, () => false);

      await vi.advanceTimersByTimeAsync(300);

      const invokePayload = mockInvoke.mock.calls[0][0];
      expect(invokePayload.prompt).toContain('用户首条消息');
      expect(invokePayload.prompt).toContain('AI的回复内容');
      expect(invokePayload.prompt).not.toContain('{{USER_MESSAGE}}');
      expect(invokePayload.prompt).not.toContain('{{AI_RESPONSE}}');
    });
  });
});
