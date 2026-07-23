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

const topRecentRecordsMock = vi.hoisted<{ value: RecentRecord[] }>(() => ({ value: [] }));
const ensureLoadedMock = vi.hoisted(() => vi.fn());
const removeRecentMock = vi.hoisted(() => vi.fn<(_id: string) => Promise<void>>(() => Promise.resolve()));
const loadSessionByIdMock = vi.hoisted(() => vi.fn<(_sessionId: string) => Promise<unknown>>(() => Promise.resolve({ id: 'session-a' })));
const routerPushMock = vi.hoisted(() => vi.fn<(path: string) => Promise<void>>(() => Promise.resolve()));

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPushMock
  })
}));

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: () => ({
    createNewFile: vi.fn(),
    openDocument: vi.fn(),
    openNativeFile: vi.fn(),
    openWebview: vi.fn()
  })
}));

vi.mock('@/stores/workspace/recent', () => ({
  useRecentStore: () => ({
    ensureLoaded: ensureLoadedMock,
    removeFile: removeRecentMock,
    get topRecentRecords() {
      return topRecentRecordsMock.value;
    }
  })
}));

vi.mock('@/stores/chat/session', () => ({
  useChatSessionStore: () => ({
    loadSessionById: loadSessionByIdMock
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
 * 创建聊天最近记录。
 * @param overrides - 需要覆盖的字段
 * @returns 聊天最近记录
 */
function createChatRecord(overrides: Partial<Extract<RecentRecord, { type: 'chat' }>> = {}): Extract<RecentRecord, { type: 'chat' }> {
  return {
    type: 'chat',
    id: 'session-a',
    url: '/chat/session-a',
    title: '会话 A',
    description: '聊天会话',
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
        Icon: IconStub
      }
    }
  });
}

describe('WelcomePage', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    ensureLoadedMock.mockClear();
    removeRecentMock.mockClear();
    removeRecentMock.mockResolvedValue(undefined);
    loadSessionByIdMock.mockClear();
    loadSessionByIdMock.mockResolvedValue({ id: 'session-a' });
    routerPushMock.mockClear();
    topRecentRecordsMock.value = [];
  });

  it('does not expose widget creation as a quick action entry', (): void => {
    const source = readWelcomePageSource();

    expect(source).not.toContain('welcome-open-widget');
    expect(source).not.toContain('createNewWidgetFile');
    expect(source).not.toContain('<span class="action-label">小组件</span>');
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

  it('opens the standalone chat page from the quick action entry', async (): Promise<void> => {
    const wrapper = mountWelcomePage();
    const chatEntry = wrapper.find('[data-test-id="welcome-open-chat"]');

    expect(chatEntry.exists()).toBe(true);
    expect(chatEntry.text()).toContain('新对话');
    expect(chatEntry.html()).toContain('lucide:message-circle');

    await chatEntry.trigger('click');

    expect(routerPushMock).toHaveBeenCalledWith('/chat');
  });

  it('opens a chat recent record from its route without reloading the session', async (): Promise<void> => {
    topRecentRecordsMock.value = [createChatRecord()];
    const wrapper = mountWelcomePage();
    const recentItem = wrapper.find('.recent-file-item');

    expect(recentItem.text()).toContain('会话 A');

    await recentItem.trigger('click');

    expect(loadSessionByIdMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith('/chat/session-a');
  });

  it('keeps chat recent record opening route-only when the backing session is absent', async (): Promise<void> => {
    loadSessionByIdMock.mockResolvedValue(undefined);
    topRecentRecordsMock.value = [createChatRecord()];
    const wrapper = mountWelcomePage();

    await wrapper.find('.recent-file-item').trigger('click');

    expect(removeRecentMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith('/chat/session-a');
  });
});
