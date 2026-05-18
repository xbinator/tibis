/**
 * @file ServerEditorModal.test.ts
 * @description 验证 MCP Server 编辑弹窗的回填、校验与确认行为。
 */
/* @vitest-environment jsdom */
/* eslint-disable vue/one-component-per-file */

import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const monacoMocks = vi.hoisted(() => {
  /**
   * 最近一次渲染到 BMonaco 的文本。
   */
  let latestValue = '';

  /**
   * 记录最近一次写入到编辑器的文本。
   * @param value - 编辑器文本
   */
  function setLatestValue(value: string): void {
    latestValue = value;
  }

  /**
   * 读取最近一次编辑器文本。
   * @returns 编辑器文本
   */
  function getLatestValue(): string {
    return latestValue;
  }

  return {
    getLatestValue,
    setLatestValue
  };
});

vi.mock('@/components/BMonaco/index.vue', () => ({
  default: defineComponent({
    name: 'BMonaco',
    props: {
      value: { type: String, default: '' },
      language: { type: String, default: '' },
      editable: { type: Boolean, default: true },
      editorState: { type: Object, required: true }
    },
    emits: ['update:value'],
    watch: {
      value: {
        immediate: true,
        handler(value: string): void {
          monacoMocks.setLatestValue(value);
        }
      }
    },
    methods: {
      /**
       * 透传输入框变更。
       * @param event - 输入事件
       */
      handleInput(event: Event): void {
        this.$emit('update:value', (event.target as HTMLTextAreaElement).value);
      }
    },
    template: `
      <div class="b-monaco-stub">
        <div class="b-monaco-stub__language">{{ language }}</div>
        <textarea
          class="b-monaco-stub__textarea"
          :value="value"
          @input="handleInput"
        ></textarea>
      </div>
    `
  })
}));

/**
 * BModal 占位组件。
 */
const BModalStub = defineComponent({
  name: 'BModal',
  props: {
    open: { type: Boolean, default: false },
    title: { type: String, default: '' },
    width: { type: Number, default: 0 }
  },
  emits: ['update:open', 'cancel'],
  template: `
    <div v-if="open" class="modal-stub">
      <div class="modal-stub__title">{{ title }}</div>
      <div class="modal-stub__body"><slot /></div>
      <div class="modal-stub__footer"><slot name="footer" /></div>
    </div>
  `
});

/**
 * BButton 占位组件。
 */
const BButtonStub = defineComponent({
  name: 'BButton',
  props: {
    disabled: { type: Boolean, default: false }
  },
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
});

describe('ServerEditorModal', () => {
  beforeEach(() => {
    monacoMocks.setLatestValue('');
  });

  /**
   * 挂载弹窗组件。
   * @param props - 组件属性
   * @returns 包装器
   */
  async function mountModal(props: Record<string, unknown> = {}) {
    const { default: ServerEditorModal } = await import('@/views/settings/tools/mcp/components/ServerEditorModal.vue');
    const wrapper = mount(ServerEditorModal, {
      props: {
        open: true,
        ...props
      },
      global: {
        stubs: {
          BModal: BModalStub,
          BButton: BButtonStub
        }
      }
    });

    await nextTick();
    return wrapper;
  }

  it('fills placeholder JSON in create mode and emits parsed draft on confirm', async () => {
    const wrapper = await mountModal();
    const monaco = wrapper.getComponent({ name: 'BMonaco' });

    expect(monaco.props('language')).toBe('json');
    expect(monacoMocks.getLatestValue()).toContain('"command": "npx"');
    expect(wrapper.text()).toContain('添加 MCP Server');

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeDefined();
    await saveButton!.trigger('click');

    expect(wrapper.emitted('confirm')?.[0]?.[0]).toMatchObject({
      name: 'filesystem',
      command: 'npx',
      toolCallTimeoutMs: 30000
    });
  });

  it('hydrates editor content from existing server when opened in edit mode', async () => {
    const wrapper = await mountModal({
      server: {
        id: 'server-1',
        name: 'Filesystem',
        enabled: true,
        transport: 'stdio',
        command: 'uvx',
        args: ['mcp-server-filesystem'],
        env: { ROOT: '/tmp' },
        toolAllowlist: ['list_directory'],
        connectTimeoutMs: 45000,
        toolCallTimeoutMs: 15000
      }
    });

    expect(wrapper.text()).toContain('编辑 MCP Server');
    expect(monacoMocks.getLatestValue()).toContain('"command": "uvx"');
    expect(monacoMocks.getLatestValue()).not.toContain('"enabled"');
  });

  it('shows parse error and blocks confirm when JSON is invalid', async () => {
    const wrapper = await mountModal();
    await wrapper.get('.b-monaco-stub__textarea').setValue('{"name": "broken"');
    await nextTick();

    expect(wrapper.text()).toContain('Expected');

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton?.attributes('disabled')).toBeDefined();
    await saveButton!.trigger('click');

    expect(wrapper.emitted('confirm')).toBeUndefined();
  });
});
