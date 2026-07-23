/**
 * @file icon.test.ts
 * @description 验证最近记录图标组件统一处理文件图标、WebView favicon 与回退图标。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BRecentIcon from '@/components/BRecent/Icon.vue';
import type { RecentRecord } from '@/shared/storage';

/** BIcon 测试替身，将 icon 名称暴露给断言。 */
const BIconStub = defineComponent({
  name: 'BIcon',
  props: {
    icon: {
      type: String,
      required: true
    },
    size: {
      type: [Number, String],
      default: ''
    }
  },
  template: '<i class="b-icon-stub" :data-icon="icon" :data-size="size"></i>'
});

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
 * 创建聊天最近记录。
 * @param overrides - 需要覆盖的字段
 * @returns 聊天最近记录
 */
function createChatRecord(overrides: Partial<Extract<RecentRecord, { type: 'chat' }>> = {}): Extract<RecentRecord, { type: 'chat' }> {
  return {
    type: 'chat',
    id: 'chat:session-a',
    sessionId: 'session-a',
    title: '会话 A',
    createdAt: 1,
    openedAt: 2,
    ...overrides
  };
}

/**
 * 挂载最近记录图标组件。
 * @param props - 组件属性
 * @returns 组件包装器
 */
function mountRecentRecordIcon(props: Record<string, unknown>): VueWrapper {
  return mount(BRecentIcon, {
    props,
    global: {
      stubs: {
        BIcon: BIconStub
      }
    }
  });
}

describe('BRecentIcon', (): void => {
  it('renders a webview favicon before the fallback icon', (): void => {
    const wrapper = mountRecentRecordIcon({
      record: createWebviewRecord({ favicon: 'https://example.com/favicon.ico' }),
      size: 14
    });

    expect(wrapper.find('img.b-recent-icon').attributes('src')).toBe('https://example.com/favicon.ico');
    expect(wrapper.find('.b-icon-stub').exists()).toBe(false);
  });

  it('falls back to the webview icon after favicon load failure', async (): Promise<void> => {
    const wrapper = mountRecentRecordIcon({
      record: createWebviewRecord({ favicon: 'https://example.com/favicon.ico' }),
      size: 14
    });

    await wrapper.find('img.b-recent-icon').trigger('error');

    expect(wrapper.find('img.b-recent-icon').exists()).toBe(false);
    expect(wrapper.find('.b-icon-stub').attributes('data-icon')).toBe('vscode-icons:file-type-geojson');
  });

  it('resolves file record icons through the shared file icon map', (): void => {
    const wrapper = mountRecentRecordIcon({
      record: createFileRecord({ ext: 'json', name: 'package', path: '/tmp/package.json' }),
      size: 14
    });

    expect(wrapper.find('.b-icon-stub').attributes('data-icon')).toBe('vscode-icons:file-type-npm');
  });

  it('uses the chat icon for chat records', (): void => {
    const wrapper = mountRecentRecordIcon({
      record: createChatRecord(),
      size: 14
    });

    expect(wrapper.find('.b-icon-stub').attributes('data-icon')).toBe('lucide:message-circle');
  });

  it('resolves standalone file names through the shared file icon map', (): void => {
    const wrapper = mountRecentRecordIcon({
      fileName: 'board.json',
      size: 14
    });

    expect(wrapper.find('.b-icon-stub').attributes('data-icon')).toBe('vscode-icons:file-type-json');
  });

  it('uses explicit icons for non-record candidates', (): void => {
    const wrapper = mountRecentRecordIcon({
      icon: 'vscode-icons:file-type-geojson',
      size: 14
    });

    expect(wrapper.find('.b-icon-stub').attributes('data-icon')).toBe('vscode-icons:file-type-geojson');
  });
});
