/**
 * @file page-setter.test.ts
 * @description 验证画图页面默认画布设置面板会展示画板概览。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent, nextTick, ref } from 'vue';
import type { ComponentPublicInstance, Ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { DrawingData, DrawingElement, DrawingMetadata } from '@/components/BDrawing/types';
import { createDefaultDrawingData } from '@/components/BDrawing/utils/drawingData';
import PageSetter from '@/views/drawing/components/PageSetter.vue';

const globalStubs = {
  ATabs: defineComponent({
    name: 'ATabsStub',
    template: '<div class="page-setter-tabs"><slot></slot></div>'
  }),
  ATabPane: defineComponent({
    name: 'ATabPaneStub',
    props: {
      tab: {
        type: String,
        required: true
      }
    },
    template: '<section :data-tab="tab"><slot></slot></section>'
  }),
  AInput: defineComponent({
    name: 'AInputStub',
    props: {
      value: {
        type: String,
        default: ''
      }
    },
    emits: ['update:value'],
    setup(_props, { emit }) {
      /**
       * 将原生 input 事件转换为 AInput 的 value 更新事件。
       * @param event - 原生输入事件
       */
      function handleInput(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
          emit('update:value', event.target.value);
        }
      }

      return { handleInput };
    },
    template: '<input :value="value" @input="handleInput" />'
  }),
  ATextarea: defineComponent({
    name: 'ATextareaStub',
    props: {
      value: {
        type: String,
        default: ''
      }
    },
    emits: ['blur', 'update:value'],
    setup(_props, { emit }) {
      /**
       * 将原生 textarea 输入事件转换为 ATextarea 的 value 更新事件。
       * @param event - 原生输入事件
       */
      function handleInput(event: Event): void {
        if (event.target instanceof HTMLTextAreaElement) {
          emit('update:value', event.target.value);
        }
      }

      /**
       * 转发原生 blur 事件给被测组件。
       */
      function handleBlur(): void {
        emit('blur');
      }

      return { handleBlur, handleInput };
    },
    template: '<textarea :value="value" @blur="handleBlur" @input="handleInput"></textarea>'
  }),
  BDrawer: defineComponent({
    name: 'BDrawerStub',
    props: {
      open: {
        type: Boolean,
        default: false
      },
      title: {
        type: String,
        default: ''
      }
    },
    emits: ['update:open'],
    template: '<aside v-if="open" class="schema-help-drawer-stub" :data-title="title"><slot></slot></aside>'
  }),
  BButton: defineComponent({
    name: 'BButtonStub',
    props: {
      icon: {
        type: String,
        default: ''
      },
      size: {
        type: String,
        default: 'middle'
      },
      square: {
        type: Boolean,
        default: false
      },
      tooltip: {
        type: String,
        default: ''
      },
      type: {
        type: String,
        default: 'primary'
      }
    },
    emits: ['click'],
    setup(_props, { emit }) {
      /**
       * 转发按钮点击事件。
       * @param event - 原生鼠标事件
       */
      function handleClick(event: MouseEvent): void {
        emit('click', event);
      }

      return { handleClick };
    },
    template: `
      <button
        class="b-button-stub"
        :data-icon="icon"
        :data-size="size"
        :data-square="square"
        :data-tooltip="tooltip"
        :data-type="type"
        @click="handleClick"
      >
        <slot></slot>
      </button>
    `
  }),
  BIcon: defineComponent({
    name: 'BIconStub',
    props: {
      icon: {
        type: String,
        default: ''
      },
      size: {
        type: Number,
        default: 16
      }
    },
    emits: ['click'],
    setup(_props, { emit }) {
      /**
       * 转发图标点击事件。
       * @param event - 原生鼠标事件
       */
      function handleClick(event: MouseEvent): void {
        emit('click', event);
      }

      return { handleClick };
    },
    template: '<span class="b-icon-stub" :data-icon="icon" :data-size="size" @click="handleClick"><slot></slot></span>'
  }),
  BModal: defineComponent({
    name: 'BModalStub',
    props: {
      open: {
        type: Boolean,
        default: false
      },
      title: {
        type: String,
        default: ''
      },
      width: {
        type: [Number, String],
        default: 500
      }
    },
    emits: ['cancel', 'update:open'],
    setup(_props, { emit }) {
      /**
       * 模拟弹窗取消。
       */
      function handleCancel(): void {
        emit('cancel');
        emit('update:open', false);
      }

      return { handleCancel };
    },
    template: `
      <div v-if="open" class="schema-editor-modal-stub" :data-title="title" :data-width="width">
        <slot></slot>
        <footer><slot name="footer"></slot></footer>
        <button class="schema-editor-modal-stub__cancel" @click="handleCancel"></button>
      </div>
    `
  }),
  BMonaco: defineComponent({
    name: 'BMonacoStub',
    props: {
      value: {
        type: String,
        default: ''
      }
    },
    emits: ['update:value'],
    setup(_props, { emit, expose }) {
      /**
       * 将输入事件转换为 Monaco 的 value 更新事件。
       * @param event - 原生输入事件
       */
      function handleInput(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
          emit('update:value', event.target.value);
        }
      }

      /**
       * 模拟 Monaco 聚焦方法。
       */
      function focusEditor(): void {
        return undefined;
      }

      expose({ focusEditor });

      return { handleInput };
    },
    template: '<input class="schema-editor-monaco-stub" :value="value" @input="handleInput" />'
  }),
  BSectionBlock: defineComponent({
    name: 'BSectionBlockStub',
    props: {
      title: {
        type: String,
        required: true
      }
    },
    template: `
      <section class="section-block-stub">
        <header>
          <div class="section-block-stub__title">
            <h3>{{ title }}</h3>
            <span class="section-block-stub__help">
              <slot name="help"></slot>
            </span>
          </div>
          <div class="section-block-stub__extra">
            <slot name="extra"></slot>
          </div>
        </header>
        <slot></slot>
      </section>
    `
  }),
  BSectionItem: defineComponent({
    name: 'BSectionItemStub',
    props: {
      label: {
        type: String,
        default: ''
      },
      direction: {
        type: String,
        default: 'horizontal'
      }
    },
    template: '<label><span>{{ label }}</span><slot></slot></label>'
  })
};

/**
 * PageSetter 测试宿主公开状态。
 */
interface PageSetterHostVm extends ComponentPublicInstance {
  /** 当前画图数据 */
  drawingData: DrawingData;
}

/**
 * 创建测试画图元素。
 * @param id - 元素 ID
 * @param name - 元素注册名称
 * @returns 测试画图元素
 */
function createDrawingElement(id: string, name: 'rect' | 'text'): DrawingElement {
  return {
    id,
    name,
    label: name === 'text' ? '文本' : '矩形',
    icon: name === 'text' ? 'lucide:type' : 'lucide:square',
    title: name === 'text' ? '文本节点' : '矩形节点',
    position: { x: 12, y: 24 },
    size: { width: 160, height: 64 },
    rotation: 0,
    style: {},
    metadata: {}
  };
}

/**
 * 创建测试画图数据。
 * @returns 测试画图数据
 */
function createDrawingData(): DrawingData {
  return {
    ...createDefaultDrawingData(),
    elements: [createDrawingElement('rect-1', 'rect'), createDrawingElement('text-1', 'text')],
    viewport: {
      center: { x: 12.4, y: 56.6 },
      zoom: 0.75
    }
  };
}

/**
 * 创建测试画板元信息。
 * @returns 测试画板元信息
 */
function createDrawingMetadata(): DrawingMetadata {
  return {};
}

/**
 * 创建带 v-model 回写的 PageSetter 测试宿主。
 * @param initialData - 初始画图数据
 * @returns 测试宿主组件
 */
function createPageSetterHost(initialData: DrawingData): ReturnType<typeof defineComponent> {
  return defineComponent({
    name: 'PageSetterHost',
    components: {
      PageSetter
    },
    setup(): { drawingData: Ref<DrawingData>; metadata: DrawingMetadata } {
      return {
        drawingData: ref(initialData),
        metadata: createDrawingMetadata()
      };
    },
    template: '<PageSetter v-model:value="drawingData" :metadata="metadata" />'
  });
}

/**
 * 挂载带 v-model 回写的 PageSetter 测试宿主。
 * @param initialData - 初始画图数据
 * @returns 测试包装器
 */
function mountPageSetterHost(initialData: DrawingData): VueWrapper<PageSetterHostVm> {
  return mount(createPageSetterHost(initialData), {
    global: {
      stubs: globalStubs
    }
  }) as VueWrapper<PageSetterHostVm>;
}

/**
 * 查找 PageSetter 内的指定标题区块。
 * @param wrapper - PageSetter 测试包装器
 * @param title - 区块标题
 * @returns 区块包装器
 */
function findSectionBlock(wrapper: VueWrapper<PageSetterHostVm>, title: string): VueWrapper {
  const section = wrapper.findAllComponents({ name: 'BSectionBlockStub' }).find((item: VueWrapper): boolean => {
    const props = item.props() as { title?: string };

    return props.title === title;
  });
  if (!section) {
    throw new Error(`未找到区块：${title}`);
  }

  return section;
}

/**
 * 查找指定区块内的编辑按钮。
 * @param wrapper - PageSetter 测试包装器
 * @param title - 区块标题
 * @returns 按钮包装器
 */
function findSectionEditButton(wrapper: VueWrapper<PageSetterHostVm>, title: string): VueWrapper {
  const section = findSectionBlock(wrapper, title);
  const button = section.findAllComponents({ name: 'BButtonStub' }).find((item: VueWrapper): boolean => item.text() === '编辑');
  if (!button) {
    throw new Error(`区块缺少编辑按钮：${title}`);
  }

  return button;
}

/**
 * 查找指定区块标题旁边的说明图标。
 * @param wrapper - PageSetter 测试包装器
 * @param title - 区块标题
 * @returns 图标包装器
 */
function findSectionHelpIcon(wrapper: VueWrapper<PageSetterHostVm>, title: string): VueWrapper {
  const section = findSectionBlock(wrapper, title);
  const icon = section
    .find('.section-block-stub__help')
    .findAllComponents({ name: 'BIconStub' })
    .find((item: VueWrapper): boolean => {
      const props = item.props() as { icon?: string };

      return props.icon === 'lucide:circle-alert';
    });
  if (!icon) {
    throw new Error(`区块缺少说明图标：${title}`);
  }

  return icon;
}

describe('PageSetter', (): void => {
  it('edits drawing name and description on the selected page', async (): Promise<void> => {
    const drawingData = createDrawingData();
    const wrapper = mountPageSetterHost(drawingData);
    const inputs = wrapper.findAll('input');
    const descriptionEditor = wrapper.findComponent({ name: 'ATextareaStub' });

    await inputs[0]?.setValue('profile_card');
    await descriptionEditor.find('textarea').setValue('根据用户资料生成卡片节点');

    expect(wrapper.text()).toContain('名称');
    expect(wrapper.text()).not.toContain('标识符');
    expect(wrapper.html()).not.toContain(['data', 'testid'].join('-'));
    expect(wrapper.vm.drawingData.name).toBe('profile_card');
    expect(wrapper.vm.drawingData.description).toBe('根据用户资料生成卡片节点');
    wrapper.unmount();
  });

  it('shows schemas as preview blocks and opens an input schema dialog for editing', async (): Promise<void> => {
    const drawingData = createDrawingData();
    const wrapper = mountPageSetterHost(drawingData);

    expect(wrapper.findAllComponents({ name: 'ATextareaStub' })).toHaveLength(1);
    expect(wrapper.findAll('.schema-body > span')).toHaveLength(0);
    expect(wrapper.text()).toContain('入参');
    expect(wrapper.text()).toContain('出参');
    expect(wrapper.text()).not.toContain('inputSchema');
    expect(wrapper.text()).not.toContain('outputSchema');
    expect(wrapper.find('.schema-preview').text()).toContain('"type": "object"');

    const editButton = findSectionEditButton(wrapper, '入参');
    expect((editButton.props() as { size?: string }).size).toBe('mini');
    expect(findSectionBlock(wrapper, '入参').find('.section-block-stub__help').findComponent({ name: 'BIconStub' }).exists()).toBe(true);
    expect(findSectionBlock(wrapper, '入参').find('.section-block-stub__extra').text()).toContain('编辑');
    expect(findSectionBlock(wrapper, '入参').find('.section-block-stub__extra').findComponent({ name: 'BIconStub' }).exists()).toBe(false);
    await editButton.trigger('click');
    expect(wrapper.find('.schema-editor-modal-stub').attributes('data-title')).toBe('编辑入参');

    await wrapper.find('.schema-editor-monaco-stub').setValue(
      JSON.stringify({
        type: 'object',
        properties: {
          userName: {
            type: 'string',
            description: '用户名'
          }
        },
        required: ['userName']
      })
    );
    await wrapper
      .findAllComponents({ name: 'BButtonStub' })
      .find((button: VueWrapper): boolean => button.text() === '保存')
      ?.trigger('click');

    expect(wrapper.vm.drawingData.inputSchema.properties.userName).toEqual({
      type: 'string',
      description: '用户名'
    });
    expect(wrapper.vm.drawingData.inputSchema.required).toEqual(['userName']);
    expect(wrapper.find('.schema-editor-modal-stub').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens an output schema dialog for editing', async (): Promise<void> => {
    const drawingData = createDrawingData();
    const wrapper = mountPageSetterHost(drawingData);

    const editButton = findSectionEditButton(wrapper, '出参');
    expect((editButton.props() as { size?: string }).size).toBe('mini');
    expect(findSectionBlock(wrapper, '出参').find('.section-block-stub__help').findComponent({ name: 'BIconStub' }).exists()).toBe(true);
    expect(findSectionBlock(wrapper, '出参').find('.section-block-stub__extra').text()).toContain('编辑');
    expect(findSectionBlock(wrapper, '出参').find('.section-block-stub__extra').findComponent({ name: 'BIconStub' }).exists()).toBe(false);
    await editButton.trigger('click');
    expect(wrapper.find('.schema-editor-modal-stub').attributes('data-title')).toBe('编辑出参');

    await wrapper.find('.schema-editor-monaco-stub').setValue(
      JSON.stringify({
        type: 'object',
        properties: {
          cardId: {
            type: 'string',
            description: '生成的卡片 ID'
          }
        },
        required: ['cardId']
      })
    );
    await wrapper
      .findAllComponents({ name: 'BButtonStub' })
      .find((button: VueWrapper): boolean => button.text() === '保存')
      ?.trigger('click');

    expect(wrapper.vm.drawingData.outputSchema.properties.cardId).toEqual({
      type: 'string',
      description: '生成的卡片 ID'
    });
    expect(wrapper.vm.drawingData.outputSchema.required).toEqual(['cardId']);
    wrapper.unmount();
  });

  it('restores the weather output schema when saving an empty output schema dialog', async (): Promise<void> => {
    const drawingData = createDrawingData();
    const wrapper = mountPageSetterHost(drawingData);

    await findSectionEditButton(wrapper, '出参').trigger('click');
    await wrapper.find('.schema-editor-monaco-stub').setValue('   ');
    await wrapper
      .findAllComponents({ name: 'BButtonStub' })
      .find((button: VueWrapper): boolean => button.text() === '保存')
      ?.trigger('click');

    expect(wrapper.vm.drawingData.outputSchema.properties.condition).toEqual({
      type: 'string',
      description: '天气概况'
    });
    expect(wrapper.vm.drawingData.outputSchema.properties.temperatureCelsius).toEqual({
      type: 'number',
      description: '摄氏温度'
    });
    expect(wrapper.vm.drawingData.outputSchema.required).toEqual(['condition', 'temperatureCelsius']);
    wrapper.unmount();
  });

  it('keeps previous schema and shows dialog validation feedback for invalid schema JSON', async (): Promise<void> => {
    const drawingData = createDrawingData();
    drawingData.inputSchema = {
      type: 'object',
      properties: {
        query: {
          type: 'string'
        }
      },
      required: ['query']
    };
    const previousInputSchema = drawingData.inputSchema;
    const wrapper = mountPageSetterHost(drawingData);

    await findSectionEditButton(wrapper, '入参').trigger('click');
    await wrapper.find('.schema-editor-monaco-stub').setValue('{broken');
    await wrapper
      .findAllComponents({ name: 'BButtonStub' })
      .find((button: VueWrapper): boolean => button.text() === '保存')
      ?.trigger('click');

    expect(wrapper.vm.drawingData.inputSchema).toEqual(previousInputSchema);
    expect(wrapper.find('.schema-editor__error').text()).toContain('Schema 必须是合法 JSON 对象');
    expect(wrapper.find('.schema-editor-modal-stub').exists()).toBe(true);
    wrapper.unmount();
  });

  it('opens schema guidance drawers from the input and output help icons', async (): Promise<void> => {
    const wrapper = mountPageSetterHost(createDrawingData());
    const inputHelpIcon = findSectionHelpIcon(wrapper, '入参');

    expect((inputHelpIcon.props() as { icon?: string }).icon).toBe('lucide:circle-alert');
    expect((inputHelpIcon.props() as { size?: number }).size).toBe(14);
    expect(
      findSectionBlock(wrapper, '入参')
        .findAllComponents({ name: 'BButtonStub' })
        .some((button: VueWrapper): boolean => {
          const props = button.props() as { icon?: string };

          return props.icon === 'lucide:circle-alert';
        })
    ).toBe(false);

    await inputHelpIcon.trigger('click');
    expect(wrapper.find('.schema-help-drawer-stub').attributes('data-title')).toBe('入参填写说明');
    expect(wrapper.find('.schema-help-drawer-stub').text()).toContain('调用组件前需要提供的数据');
    expect(wrapper.find('.schema-help-drawer-stub').find('.schema-help__field-list').exists()).toBe(true);
    expect(wrapper.find('.schema-help-drawer-stub').findAll('.schema-help__field-item')).toHaveLength(3);
    expect(wrapper.find('.schema-help-drawer-stub').find('.schema-help__type').text()).toBe('string');
    expect(wrapper.find('.schema-help-drawer-stub').text()).toContain('必填');
    expect(wrapper.find('.schema-help-drawer-stub').text()).toContain('city');
    expect(wrapper.find('.schema-help-drawer-stub').text()).toContain('城市名称');
    expect(wrapper.find('.schema-help-drawer-stub').text()).toContain('查天气');

    await findSectionHelpIcon(wrapper, '出参').trigger('click');
    expect(wrapper.find('.schema-help-drawer-stub').attributes('data-title')).toBe('出参填写说明');
    expect(wrapper.find('.schema-help-drawer-stub').text()).toContain('组件执行后会返回的数据');
    expect(wrapper.find('.schema-help-drawer-stub').text()).toContain('temperatureCelsius');
    expect(wrapper.find('.schema-help-drawer-stub').text()).toContain('摄氏温度');
    wrapper.unmount();
  });

  it('expands the JSON schema example inline from the guidance drawer', async (): Promise<void> => {
    const wrapper = mountPageSetterHost(createDrawingData());

    await findSectionHelpIcon(wrapper, '入参').trigger('click');
    expect(wrapper.find('.schema-help__example').classes()).not.toContain('is-expanded');

    await wrapper.find('.schema-help__expand').trigger('click');

    expect(wrapper.find('.schema-help__example').classes()).toContain('is-expanded');
    expect(wrapper.find('.schema-help__expand').attributes('data-icon')).toBe('lucide:minimize-2');
    expect(wrapper.find('.schema-help__expand').attributes('data-tooltip')).toBe('收起查看');
    expect(wrapper.find('.schema-editor-modal-stub').exists()).toBe(false);
    expect(wrapper.find('.schema-help__example').text()).toContain('"required": ["city"]');
    expect(wrapper.find('.schema-help__example').text()).toContain('"description": "城市名称，例如上海"');
    wrapper.unmount();
  });

  it('resets the JSON schema example expanded state after closing the guidance drawer', async (): Promise<void> => {
    const wrapper = mountPageSetterHost(createDrawingData());

    await findSectionHelpIcon(wrapper, '入参').trigger('click');
    await wrapper.find('.schema-help__expand').trigger('click');
    expect(wrapper.find('.schema-help__example').classes()).toContain('is-expanded');

    wrapper.findComponent({ name: 'BDrawerStub' }).vm.$emit('update:open', false);
    await nextTick();
    expect(wrapper.find('.schema-help-drawer-stub').exists()).toBe(false);

    await findSectionHelpIcon(wrapper, '入参').trigger('click');

    expect(wrapper.find('.schema-help__example').classes()).not.toContain('is-expanded');
    expect(wrapper.find('.schema-help__expand').attributes('data-icon')).toBe('lucide:maximize-2');
    wrapper.unmount();
  });
});
