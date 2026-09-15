/**
 * @file selection-input-ime.test.ts
 * @description 选区 AI 与评论输入框的输入法回车行为测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file -- 测试文件内定义轻量输入组件替身。 */
import type { SelectionAssistantAdapter, SelectionAssistantRange } from '@/components/BEditor/adapters/selectionAssistant';
import { defineComponent } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SelectionAIInput from '@/components/BEditor/shared/SelectionAIInput.vue';
import SelectionCommentInput from '@/components/BEditor/shared/SelectionCommentInput.vue';

const streamMock = vi.hoisted(() => vi.fn());
const abortMock = vi.hoisted(() => vi.fn());
const getModelConfigMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useChat', () => ({
  useChat: () => ({
    agent: {
      stream: streamMock,
      abort: abortMock
    }
  })
}));

vi.mock('@/hooks/useScroller', () => ({
  useScroller: () => ({
    getBoundingClientRect: () => ({ top: 0, right: 0, bottom: 800, left: 0, width: 0, height: 800 }),
    scrollInfo: { height: 800 },
    scrollToElement: vi.fn()
  })
}));

vi.mock('@/hooks/useShortcuts', () => ({
  useShortcuts: () => ({
    registerShortcut: () => (): void => undefined
  })
}));

vi.mock('@/stores/ai/serviceModel', () => ({
  useServiceModelStore: () => ({
    getAvailableServiceConfig: getModelConfigMock
  })
}));

/**
 * Ant Design 输入框测试替身，保留 v-model 与原生键盘事件。
 */
const AInputStub = defineComponent({
  name: 'AInput',
  inheritAttrs: false,
  props: {
    /** 当前输入值。 */
    value: { type: String, default: '' },
    /** 是否禁用输入。 */
    disabled: { type: Boolean, default: false },
    /** Ant Design 输入框尺寸，仅用于避免透传给原生 input。 */
    size: { type: String, default: '' }
  },
  emits: ['update:value'],
  setup(_props, { emit, attrs }) {
    /**
     * 转发输入值更新。
     * @param event - 原生输入事件
     */
    function handleInput(event: Event): void {
      emit('update:value', (event.target as HTMLInputElement).value);
    }

    return { attrs, handleInput };
  },
  template: '<input v-bind="attrs" :value="value" :disabled="disabled" @input="handleInput" />'
});

/**
 * 创建输入法确认候选产生的 Enter 事件。
 * @param legacyKeyCode - 是否模拟仍使用 229 的旧式组合输入事件
 * @returns 输入法组合态键盘事件
 */
function createImeEnter(legacyKeyCode = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
    isComposing: !legacyKeyCode
  });

  if (legacyKeyCode) {
    Object.defineProperty(event, 'keyCode', { configurable: true, value: 229 });
  }

  return event;
}

/**
 * 挂载评论输入框。
 * @returns 评论输入框包装器
 */
function mountCommentInput(): VueWrapper {
  return mount(SelectionCommentInput, {
    props: { visible: true },
    global: {
      stubs: { AInput: AInputStub }
    }
  });
}

/**
 * 挂载 AI 输入框。
 * @returns AI 输入框包装器
 */
function mountAIInput(): VueWrapper {
  const adapter = { restoreSelection: vi.fn() } as unknown as SelectionAssistantAdapter;
  const selectionRange: SelectionAssistantRange = {
    from: 1,
    to: 5,
    text: '原文',
    docVersion: 10
  };

  return mount(SelectionAIInput, {
    props: {
      visible: true,
      adapter,
      selectionRange
    },
    global: {
      stubs: {
        AInput: AInputStub,
        BButton: true,
        BIcon: true,
        BMessage: true
      }
    }
  });
}

describe('SelectionCommentInput IME handling', (): void => {
  it('does not submit when Enter confirms an input method candidate', async (): Promise<void> => {
    const wrapper = mountCommentInput();
    const input = wrapper.get<HTMLInputElement>('input');
    await input.setValue('candidate');

    input.element.dispatchEvent(createImeEnter());
    await flushPromises();

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(input.element.value).toBe('candidate');
  });

  it('does not submit legacy keyCode 229 composition events', async (): Promise<void> => {
    const wrapper = mountCommentInput();
    const input = wrapper.get<HTMLInputElement>('input');
    await input.setValue('candidate');

    input.element.dispatchEvent(createImeEnter(true));
    await flushPromises();

    expect(wrapper.emitted('submit')).toBeUndefined();
  });
});

describe('SelectionAIInput IME handling', (): void => {
  beforeEach((): void => {
    streamMock.mockReset();
    abortMock.mockReset();
    getModelConfigMock.mockReset();
    getModelConfigMock.mockResolvedValue({ providerId: 'provider-a', modelId: 'model-a' });
  });

  it('does not send when Enter confirms an input method candidate', async (): Promise<void> => {
    const wrapper = mountAIInput();
    await flushPromises();
    const input = wrapper.get<HTMLInputElement>('input');
    await input.setValue('rewrite this');

    input.element.dispatchEvent(createImeEnter());
    await flushPromises();

    expect(streamMock).not.toHaveBeenCalled();
    expect(input.element.value).toBe('rewrite this');
  });

  it('sends a completed instruction on an ordinary Enter', async (): Promise<void> => {
    const wrapper = mountAIInput();
    await flushPromises();
    const input = wrapper.get<HTMLInputElement>('input');
    await input.setValue('rewrite this');

    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await flushPromises();

    expect(streamMock).toHaveBeenCalledOnce();
  });
});
