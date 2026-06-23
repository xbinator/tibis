/**
 * @file message-bubble.component.test.ts
 * @description BChat MessageBubble 工具栏交互测试。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import MessageBubble from '@/components/BChat/components/MessageBubble.vue';
import { create } from '@/components/BChat/utils/messageHelper';
import type { Message } from '@/components/BChat/utils/types';

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: vi.fn(() => ({
    clipboard: vi.fn()
  }))
}));

vi.mock('@/hooks/useImagePreview', () => ({
  useImagePreview: vi.fn(() => ({
    previewImage: vi.fn()
  }))
}));

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: vi.fn(() => ({
    openFile: vi.fn(),
    openWebview: vi.fn()
  }))
}));

/** BBubble 测试替身，保留默认插槽用于渲染消息内容。 */
const BBubbleStub = defineComponent({
  name: 'BBubble',
  template: '<div class="b-bubble-stub"><slot name="header" /><slot /></div>'
});

/** BButton 测试替身，暴露 icon 属性便于断言按钮是否存在。 */
const BButtonStub = defineComponent({
  name: 'BButton',
  props: {
    icon: {
      type: String,
      default: ''
    }
  },
  emits: ['click'],
  template: '<button class="b-button-stub" :data-icon="icon" @click="$emit(\'click\', $event)"><slot /></button>'
});

/** Markdown 消息测试替身，直接渲染文本内容。 */
const BMessageStub = defineComponent({
  name: 'BMessage',
  props: {
    content: {
      type: String,
      default: ''
    }
  },
  template: '<div class="b-message-stub">{{ content }}</div>'
});

/**
 * 创建助手消息。
 * @param overrides - 消息覆盖字段
 * @returns 助手消息
 */
function createAssistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'assistant content',
    parts: [{ type: 'text', text: 'assistant content' }],
    createdAt: '2026-06-23T00:00:00.000Z',
    loading: false,
    finished: true,
    ...overrides
  };
}

/**
 * 挂载消息气泡。
 * @param message - 待渲染消息
 * @returns 组件包装器
 */
function mountMessageBubble(message: Message): VueWrapper {
  return mount(MessageBubble, {
    props: { message },
    global: {
      stubs: {
        BBubble: BBubbleStub,
        BButton: BButtonStub,
        BIcon: true,
        BMessage: BMessageStub
      }
    }
  });
}

describe('MessageBubble', (): void => {
  it('shows regenerate for finished assistant text messages', (): void => {
    const wrapper = mountMessageBubble(createAssistantMessage());

    expect(wrapper.find('[data-icon="lucide:refresh-cw"]').exists()).toBe(true);
  });

  it('does not show regenerate for runtime error messages', (): void => {
    const wrapper = mountMessageBubble(create.errorMessage('模型调用失败'));

    expect(wrapper.find('[data-icon="lucide:refresh-cw"]').exists()).toBe(false);
    expect(wrapper.emitted('regenerate')).toBeUndefined();
  });

  it('shows regenerate for assistant messages that contain an error part', async (): Promise<void> => {
    const wrapper = mountMessageBubble(
      createAssistantMessage({
        content: '模型调用失败',
        parts: [{ type: 'error', text: '模型调用失败' }]
      })
    );

    const regenerateButton = wrapper.get('[data-icon="lucide:refresh-cw"]');
    await regenerateButton.trigger('click');

    expect(wrapper.emitted('regenerate')?.[0]?.[0]).toMatchObject({
      role: 'assistant',
      content: '模型调用失败'
    });
  });

  it('shows skipped compression messages as a friendly neutral notice', (): void => {
    const wrapper = mountMessageBubble({
      id: 'compression-skipped-1',
      role: 'compression',
      content: '内容较少，无需压缩',
      parts: [{ type: 'text', text: '内容较少，无需压缩' }],
      createdAt: '2026-06-23T00:00:00.000Z',
      loading: false,
      finished: true,
      compression: {
        status: 'skipped',
        recordText: '内容较少，无需压缩'
      }
    });

    expect(wrapper.text()).toContain('无需压缩');
    expect(wrapper.text()).not.toContain('上下文已压缩');
    expect(wrapper.text()).not.toContain('压缩失败');
    expect(wrapper.find('.status-node__error').exists()).toBe(false);
  });

  it('renders assistant compaction parts as inline compression status', (): void => {
    const wrapper = mountMessageBubble(
      createAssistantMessage({
        content: '',
        parts: [
          {
            type: 'compaction',
            auto: true,
            reason: 'auto',
            status: 'success',
            recordId: 'record-1',
            recordText: 'COMPRESSED_CONTEXT',
            coveredUntilMessageId: 'assistant-previous'
          }
        ]
      })
    );

    expect(wrapper.text()).toContain('上下文已压缩');
    expect(wrapper.text()).not.toContain('压缩失败');
  });
});
