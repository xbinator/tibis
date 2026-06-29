/**
 * @file page-setter.test.ts
 * @description 验证画图页面默认画布设置面板会展示画板概览。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { readFileSync } from 'node:fs';
import { defineComponent, nextTick, ref } from 'vue';
import type { ComponentPublicInstance, Ref } from 'vue';
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { DrawingData, DrawingElement } from '@/components/BDrawing/types';
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
      size: {
        type: String,
        default: undefined
      },
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
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
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
  ACheckbox: defineComponent({
    name: 'ACheckboxStub',
    props: {
      checked: {
        type: Boolean,
        default: false
      }
    },
    emits: ['change', 'update:checked'],
    setup(_props, { emit }) {
      /**
       * 将原生 checkbox 事件转换为 ACheckbox 的 checked 更新事件。
       * @param event - 原生变更事件
       */
      function handleChange(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
          emit('update:checked', event.target.checked);
          emit('change', event.target.checked);
        }
      }

      return { handleChange };
    },
    template: '<label class="a-checkbox-stub"><input type="checkbox" :checked="checked" @change="handleChange" /><slot></slot></label>'
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
    emits: ['cancel', 'close', 'update:open'],
    setup(_props, { emit }) {
      /**
       * 模拟弹窗取消。
       */
      function handleCancel(): void {
        emit('cancel');
        emit('close');
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
      extraLibs: {
        type: Array,
        default: (): unknown[] => []
      },
      language: {
        type: String,
        default: ''
      },
      options: {
        type: Object,
        default: (): Record<string, unknown> => ({})
      },
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
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
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
    template: '<textarea class="schema-editor-monaco-stub" :value="value" @input="handleInput"></textarea>'
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
  }),
  BSelect: defineComponent({
    name: 'BSelectStub',
    props: {
      options: {
        type: Array,
        default: (): unknown[] => []
      },
      value: {
        type: String,
        default: ''
      }
    },
    emits: ['change', 'update:value'],
    setup(_props, { emit }) {
      /**
       * 将原生 select 事件转换为 BSelect 的 value 更新事件。
       * @param event - 原生变更事件
       */
      function handleChange(event: Event): void {
        if (event.target instanceof HTMLSelectElement) {
          emit('update:value', event.target.value);
          emit('change', event.target.value);
        }
      }

      return { handleChange };
    },
    template: `
      <select class="b-select-stub" :data-options="options.map((option) => option.label).join('|')" :value="value" @change="handleChange">
        <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    `
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
 * Monaco 测试替身属性。
 */
interface BMonacoStubProps {
  /** 编辑器语言 */
  language?: string;
  /** 类型提示声明 */
  extraLibs?: Array<{ content: string; filePath?: string }>;
  /** 编辑器配置 */
  options?: {
    wordWrap?: boolean;
    typescriptCompilerOptions?: {
      lib?: string[];
    };
  };
  /** 当前代码文本 */
  value?: string;
}

/**
 * 设置面板区块标题快照。
 */
interface SectionBlockTitleSnapshot {
  /** 区块标题 */
  title: string;
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
    setup(): { drawingData: Ref<DrawingData> } {
      return {
        drawingData: ref(initialData)
      };
    },
    template: '<PageSetter v-model:value="drawingData" />'
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
 * 读取设置面板所有区块标题。
 * @param wrapper - PageSetter 测试包装器
 * @returns 区块标题列表
 */
function readSectionBlockTitles(wrapper: VueWrapper<PageSetterHostVm>): string[] {
  return wrapper.findAllComponents({ name: 'BSectionBlockStub' }).map((item: VueWrapper): string => {
    const props = item.props() as SectionBlockTitleSnapshot;

    return props.title;
  });
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
 * 查找指定区块内的 Schema 编辑按钮。
 * @param wrapper - PageSetter 测试包装器
 * @param title - 区块标题
 * @returns 按钮包装器
 */
function findSectionSchemaEditButton(wrapper: VueWrapper<PageSetterHostVm>, title: string): VueWrapper {
  const section = findSectionBlock(wrapper, title);
  const button = section.findAllComponents({ name: 'BButtonStub' }).find((item: VueWrapper): boolean => item.text() === '编辑');
  if (!button) {
    throw new Error(`区块缺少编辑 Schema 按钮：${title}`);
  }

  return button;
}

/**
 * 查找指定区块内的添加字段按钮。
 * @param wrapper - PageSetter 测试包装器
 * @param title - 区块标题
 * @returns 按钮包装器
 */
function findSectionAddFieldButton(wrapper: VueWrapper<PageSetterHostVm>, title: string): VueWrapper {
  const section = findSectionBlock(wrapper, title);
  const button = section.findAllComponents({ name: 'BButtonStub' }).find((item: VueWrapper): boolean => {
    const props = item.props() as { icon?: string; tooltip?: string };

    return props.icon === 'lucide:plus' && props.tooltip === '添加字段';
  });
  if (!button) {
    throw new Error(`区块缺少添加字段按钮：${title}`);
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

/**
 * 查找指定字段名对应的 schema 字段行。
 * @param section - Schema 所在区块
 * @param name - schema 字段名
 * @returns 字段行包装器
 */
function findSchemaRow(section: VueWrapper, name: string): DOMWrapper<Element> {
  const row = section.findAll('.schema-editor__row').find((item: DOMWrapper<Element>): boolean => {
    const input = item.find('.schema-editor__name-input input');

    return input.exists() && (input.element as HTMLInputElement).value === name;
  });
  if (!row) {
    throw new Error(`未找到 Schema 字段行：${name}`);
  }

  return row;
}

/**
 * 判断指定字段名对应的 schema 字段行是否存在。
 * @param section - Schema 所在区块
 * @param name - schema 字段名
 * @returns 字段行是否存在
 */
function hasSchemaRow(section: VueWrapper, name: string): boolean {
  return section.findAll('.schema-editor__row').some((item: DOMWrapper<Element>): boolean => {
    const input = item.find('.schema-editor__name-input input');

    return input.exists() && (input.element as HTMLInputElement).value === name;
  });
}

/**
 * 读取指定 CSS 选择器对应的首个样式块。
 * @param source - Vue 文件源码
 * @param selector - CSS 选择器
 * @returns 样式块内容
 */
function readStyleBlock(source: string, selector: string): string {
  const blockStart = source.indexOf(`${selector} {`);
  if (blockStart < 0) {
    return '';
  }

  const openingBraceIndex = source.indexOf('{', blockStart);
  let blockDepth = 0;
  let blockEnd = source.length;

  for (let index = openingBraceIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') {
      blockDepth += 1;
    }

    if (character === '}') {
      blockDepth -= 1;
      if (blockDepth === 0) {
        blockEnd = index + 1;
        break;
      }
    }
  }

  return source.slice(blockStart, blockEnd);
}

describe('PageSetter', (): void => {
  it('keeps the schema editor row layout flexible without grid columns', (): void => {
    const source = readFileSync('src/views/drawing/components/PageSetter/SchemaTreeEditor.vue', 'utf-8');
    const rowStyle = readStyleBlock(source, '.schema-editor__row');

    expect(rowStyle).toContain('display: flex;');
    expect(rowStyle).not.toContain('display: grid;');
    expect(rowStyle).not.toContain('grid-template-columns');
  });

  it('aligns schema header and rows on shared flex columns without is-fill', (): void => {
    const source = readFileSync('src/views/drawing/components/PageSetter/SchemaTreeEditor.vue', 'utf-8');

    expect(source).not.toContain('is-fill');
    expect(readStyleBlock(source, '.schema-editor__header')).toContain('display: flex;');
    expect(readStyleBlock(source, '.schema-editor__header')).not.toContain('grid-template-columns');
    expect(readStyleBlock(source, '.schema-editor__header-name')).toContain('flex: 1 1 132px;');
    expect(readStyleBlock(source, '.schema-editor__name-cell')).toContain('flex: 1 1 132px;');
    expect(readStyleBlock(source, '.schema-editor')).toContain('--schema-editor-type-width: 100px;');
    expect(readStyleBlock(source, '.schema-editor__header-type')).toContain('width: var(--schema-editor-type-width);');
    expect(readStyleBlock(source, '.schema-editor__header-type')).not.toContain('flex: 0 1 220px;');
    expect(readStyleBlock(source, '.schema-editor__type-select')).not.toContain('flex: 0 1 220px;');
    expect(readStyleBlock(source, '.schema-editor__type-select')).toContain('width: var(--schema-editor-type-width);');
    expect(readStyleBlock(source, '.schema-editor__header-controls')).toContain('flex: 0 0 60px;');
    expect(readStyleBlock(source, '.schema-editor__header-controls')).toContain('grid-template-columns: 28px 28px;');
    expect(readStyleBlock(source, '.schema-editor__header-controls')).toContain('grid-template-columns: 28px 28px 28px;');
    expect(readStyleBlock(source, '.schema-editor__controls')).toContain('flex: 0 0 60px;');
    expect(readStyleBlock(source, '.schema-editor__controls')).toContain('grid-template-columns: 28px 28px;');
    expect(readStyleBlock(source, '.schema-editor__controls')).toContain('grid-template-columns: 28px 28px 28px;');
    expect(readStyleBlock(source, '.schema-editor__header-controls')).not.toContain('40px');
    expect(readStyleBlock(source, '.schema-editor__controls')).not.toContain('40px');
    expect(source).not.toContain('schema-editor__required');
    expect(source).not.toContain('schema-editor__action');
    expect(source).not.toContain('schema-editor__action-placeholder');
    expect(source).not.toContain('schema-editor__header-name-label');
  });

  it('keeps schema input and type selector text at 12px', (): void => {
    const source = readFileSync('src/views/drawing/components/PageSetter/SchemaTreeEditor.vue', 'utf-8');

    const typeSelectorFontSizePattern = new RegExp(
      [
        String.raw`\.schema-editor__type-select :deep\(\.b-select\),`,
        String.raw`\s*\.schema-editor__type-select :deep\(\.ant-select-selector\),`,
        String.raw`\s*\.schema-editor__type-select :deep\(\.ant-select-selection-item\),`,
        String.raw`\s*\.schema-editor__type-select :deep\(select\) \{[^}]*font-size: 12px;`
      ].join(''),
      'u'
    );

    expect(source).toMatch(/\.schema-editor__name-input :deep\(\.ant-input\),\s*\.schema-editor__name-input :deep\(input\) \{[^}]*font-size: 12px;/);
    expect(source).toMatch(typeSelectorFontSizePattern);
  });

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

  it('shows schemas as inline tree editors and opens an input schema dialog for advanced editing', async (): Promise<void> => {
    const drawingData = createDrawingData();
    const wrapper = mountPageSetterHost(drawingData);
    const inputSection = findSectionBlock(wrapper, '入参');
    const outputSection = findSectionBlock(wrapper, '出参');

    expect(wrapper.findAllComponents({ name: 'ATextareaStub' })).toHaveLength(3);
    expect(findSectionBlock(wrapper, '动态预览').exists()).toBe(true);
    expect(wrapper.find('.schema-preview').exists()).toBe(false);
    expect(inputSection.find('.schema-editor').exists()).toBe(true);
    expect(outputSection.find('.schema-editor').exists()).toBe(true);
    expect(inputSection.find('.schema-editor').html()).not.toContain('data-schema');
    expect(inputSection.findAll('.schema-editor__row')).toHaveLength(3);
    expect(outputSection.findAll('.schema-editor__row')).toHaveLength(3);
    expect(findSchemaRow(inputSection, 'city').find('.schema-editor__name-input input').element).toHaveProperty('value', 'city');
    expect(findSchemaRow(inputSection, 'city').find('.schema-editor__name-input').classes()).not.toContain('is-fill');
    expect(findSchemaRow(inputSection, 'city').find('.schema-editor__type-select select').attributes('data-options')).toBe(
      'String|Number|Boolean|Object|Array'
    );
    expect(findSchemaRow(inputSection, 'city').find('.schema-editor__toggle-placeholder').exists()).toBe(false);
    expect(findSchemaRow(inputSection, 'city').find('[data-tooltip="添加子字段"]').exists()).toBe(false);
    expect(findSchemaRow(inputSection, 'city').find('.schema-editor__action-spacer').exists()).toBe(false);
    expect(findSchemaRow(inputSection, 'city').find('.schema-editor__controls').exists()).toBe(true);
    expect(findSchemaRow(inputSection, 'city').findAll('.schema-editor__control-cell')).toHaveLength(2);
    expect(inputSection.find('.schema-editor__footer').exists()).toBe(false);
    expect(wrapper.text()).toContain('入参');
    expect(wrapper.text()).toContain('出参');
    expect(wrapper.text()).not.toContain('inputSchema');
    expect(wrapper.text()).not.toContain('outputSchema');

    const addButton = findSectionAddFieldButton(wrapper, '入参');
    const editButton = findSectionSchemaEditButton(wrapper, '入参');
    expect((addButton.props() as { icon?: string; size?: string }).icon).toBe('lucide:plus');
    expect((addButton.props() as { size?: string }).size).toBe('mini');
    expect((editButton.props() as { icon?: string; size?: string }).icon).toBe('lucide:file-json');
    expect((editButton.props() as { size?: string }).size).toBe('mini');
    expect(findSectionBlock(wrapper, '入参').find('.section-block-stub__help').findComponent({ name: 'BIconStub' }).exists()).toBe(true);
    expect(findSectionBlock(wrapper, '入参').find('.section-block-stub__extra').text()).not.toContain('添加字段');
    expect(findSectionBlock(wrapper, '入参').find('.section-block-stub__extra').find('[data-tooltip="添加字段"]').exists()).toBe(true);
    expect(findSectionBlock(wrapper, '入参').find('.section-block-stub__extra').text()).toContain('编辑');
    expect(findSectionBlock(wrapper, '入参').find('.section-block-stub__extra').text()).not.toContain('JSON导入');
    expect(findSectionBlock(wrapper, '入参').find('.section-block-stub__extra').findComponent({ name: 'BIconStub' }).exists()).toBe(false);
    await editButton.trigger('click');
    expect(wrapper.find('.schema-editor-modal-stub').attributes('data-title')).toBe('编辑入参');

    await wrapper.find('.schema-editor-modal-stub .schema-editor-monaco-stub').setValue(
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
    await nextTick();
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

  it('edits schema fields inline from the page setter tree editor', async (): Promise<void> => {
    const drawingData = createDrawingData();
    const wrapper = mountPageSetterHost(drawingData);
    const inputSection = findSectionBlock(wrapper, '入参');

    await findSchemaRow(inputSection, 'city').find('.schema-editor__name-input input').setValue('location');

    expect(wrapper.vm.drawingData.inputSchema.properties.city).toBeUndefined();
    expect(wrapper.vm.drawingData.inputSchema.properties.location).toEqual({
      type: 'string',
      description: '城市名称，例如上海'
    });
    expect(wrapper.vm.drawingData.inputSchema.required).toEqual(['location']);

    const locationRequiredInput = findSchemaRow(inputSection, 'location').findAll('.schema-editor__control-cell')[0]?.find('input');
    if (!locationRequiredInput || !locationRequiredInput.exists()) {
      throw new Error('缺少必填勾选框');
    }
    (locationRequiredInput.element as HTMLInputElement).checked = false;
    await locationRequiredInput.trigger('change');

    expect(wrapper.vm.drawingData.inputSchema.required).toEqual([]);

    await findSchemaRow(inputSection, 'date').find('.schema-editor__type-select select').setValue('object');

    expect(wrapper.vm.drawingData.inputSchema.properties.date).toEqual({
      type: 'object',
      description: '查询日期，例如今天或明天',
      properties: {},
      required: []
    });
    expect(findSchemaRow(inputSection, 'date').classes()).toContain('is-object');
    expect(findSchemaRow(inputSection, 'date').find('.schema-editor__toggle').exists()).toBe(false);
    expect(findSchemaRow(inputSection, 'location').find('.schema-editor__toggle-placeholder').exists()).toBe(false);
    expect(findSchemaRow(inputSection, 'date').findAll('.schema-editor__control-cell')).toHaveLength(3);
    expect(findSchemaRow(inputSection, 'date').find('[data-tooltip="添加子字段"]').attributes('data-icon')).toBe('lucide:git-branch-plus');

    await findSchemaRow(inputSection, 'date').find('[data-tooltip="添加子字段"]').trigger('click');

    expect(wrapper.vm.drawingData.inputSchema.properties.date.properties?.field).toEqual({
      type: 'string'
    });
    expect(findSchemaRow(inputSection, 'field').exists()).toBe(true);
    expect(findSchemaRow(inputSection, 'date').find('.schema-editor__toggle').exists()).toBe(true);
    expect(findSchemaRow(inputSection, 'location').find('.schema-editor__toggle-placeholder').exists()).toBe(true);
    expect(inputSection.find('.schema-editor__header-toggle-placeholder').exists()).toBe(true);
    expect(inputSection.find('.schema-editor__header-name').text()).toBe('变量名');

    await findSchemaRow(inputSection, 'date').find('.schema-editor__toggle').trigger('click');

    expect(hasSchemaRow(inputSection, 'field')).toBe(false);

    await findSchemaRow(inputSection, 'date').find('.schema-editor__toggle').trigger('click');
    await findSchemaRow(inputSection, 'field').find('[data-tooltip="删除字段"]').trigger('click');

    expect(wrapper.vm.drawingData.inputSchema.properties.date.properties?.field).toBeUndefined();

    await findSectionAddFieldButton(wrapper, '入参').trigger('click');

    expect(wrapper.vm.drawingData.inputSchema.properties.field).toEqual({
      type: 'string'
    });
    wrapper.unmount();
  });

  it('keeps dotted schema field names editable as a single path segment', async (): Promise<void> => {
    const drawingData = createDrawingData();
    drawingData.inputSchema = {
      type: 'object',
      properties: {
        'temperature.celsius': {
          type: 'object',
          properties: {},
          required: []
        }
      },
      required: []
    };
    const wrapper = mountPageSetterHost(drawingData);
    const inputSection = findSectionBlock(wrapper, '入参');

    await findSchemaRow(inputSection, 'temperature.celsius').find('[data-tooltip="添加子字段"]').trigger('click');

    expect(wrapper.vm.drawingData.inputSchema.properties['temperature.celsius'].properties?.field).toEqual({
      type: 'string'
    });
    expect(findSchemaRow(inputSection, 'field').exists()).toBe(true);
    wrapper.unmount();
  });

  it('edits the design preview input and state context', async (): Promise<void> => {
    const drawingData = createDrawingData();
    const wrapper = mountPageSetterHost(drawingData);
    const previewSection = findSectionBlock(wrapper, '动态预览');
    const previewEditors = previewSection.findAll('textarea');

    await previewEditors[0]?.setValue('{ "city": "上海" }');
    await previewEditors[0]?.trigger('blur');
    await previewEditors[1]?.setValue('{ "weather": { "temperature": 28 } }');
    await previewEditors[1]?.trigger('blur');

    expect(wrapper.vm.drawingData.metadata.previewContext).toEqual({
      input: {
        city: '上海'
      },
      state: {
        weather: {
          temperature: 28
        }
      }
    });
    wrapper.unmount();
  });

  it('opens an execution script dialog above output schema and saves execute method code', async (): Promise<void> => {
    const drawingData = createDrawingData();
    const wrapper = mountPageSetterHost(drawingData);
    const sectionTitles = readSectionBlockTitles(wrapper);
    const methodSection = findSectionBlock(wrapper, '执行方法');
    const nextCode = [
      'export async function execute(ctx: DrawingSkillContext): Promise<ExecutionResult> {',
      '  return ctx.result.success(ctx.input)',
      '}'
    ].join('\n');

    expect(sectionTitles.indexOf('执行方法')).toBeGreaterThan(sectionTitles.indexOf('入参'));
    expect(sectionTitles.indexOf('执行方法')).toBeLessThan(sectionTitles.indexOf('出参'));
    expect(methodSection.text()).toContain('触发这个画布时，会执行这里配置的方法');
    expect(methodSection.text()).not.toContain('export async function execute(ctx)');
    expect(
      wrapper.findAllComponents({ name: 'ATabPaneStub' }).map((pane: VueWrapper): string | undefined => (pane.props() as { tab?: string }).tab)
    ).not.toContain('方法');

    const editButton = findSectionEditButton(wrapper, '执行方法');
    expect((editButton.props() as { size?: string }).size).toBe('mini');
    await editButton.trigger('click');
    expect(wrapper.find('.schema-editor-modal-stub').attributes('data-title')).toBe('编辑执行方法');
    expect(wrapper.find('.method-editor__summary').text()).toContain('代码中可以使用 ctx.input、ctx.state、ctx.setState 和 ctx.result');
    expect(wrapper.find('.method-editor__summary').text()).not.toContain('export async function execute(ctx)');

    const methodEditor = wrapper.findComponent({ name: 'BMonacoStub' });
    const editorProps = methodEditor.props() as BMonacoStubProps;
    expect(editorProps.language).toBe('typescript');
    expect(editorProps.options?.wordWrap).toBe(true);
    expect(editorProps.options?.typescriptCompilerOptions?.lib).toEqual(['es2020']);
    expect(editorProps.value).toContain('export async function execute(ctx: DrawingSkillContext): Promise<ExecutionResult>');
    expect(editorProps.extraLibs?.[0]?.content).toContain('interface DrawingSkillContext');
    expect(editorProps.extraLibs?.[0]?.content).toContain('调用画布时 AI 提取到的入参');
    expect(editorProps.extraLibs?.[0]?.content).toContain('setState(path: string, value: unknown): void');
    expect(editorProps.extraLibs?.[0]?.content).toContain('标记方法执行成功，并把 data 作为执行结果返回');

    await methodEditor.find('textarea').setValue(nextCode);
    await nextTick();
    expect(wrapper.vm.drawingData.metadata.skill).toBeUndefined();
    await wrapper
      .findAllComponents({ name: 'BButtonStub' })
      .find((button: VueWrapper): boolean => button.text() === '保存')
      ?.trigger('click');

    expect(wrapper.vm.drawingData.metadata.skill).toEqual({
      methods: {
        execute: {
          enabled: true,
          description: '',
          timeout: 10000,
          code: nextCode
        }
      }
    });
    expect(wrapper.find('.schema-editor-modal-stub').exists()).toBe(false);
    wrapper.unmount();
  });

  it('clears stale preview JSON errors after preview context is synced from metadata', async (): Promise<void> => {
    const drawingData = createDrawingData();
    const wrapper = mountPageSetterHost(drawingData);
    const previewSection = findSectionBlock(wrapper, '动态预览');
    const previewEditors = previewSection.findAll('textarea');

    await previewEditors[0]?.setValue('{broken');
    await previewEditors[0]?.trigger('blur');
    expect(wrapper.text()).toContain('input 必须是合法 JSON');

    await previewEditors[1]?.setValue('{ "weather": { "temperature": 28 } }');
    await previewEditors[1]?.trigger('blur');
    await nextTick();

    expect(wrapper.text()).not.toContain('input 必须是合法 JSON');
    wrapper.unmount();
  });

  it('opens an output schema dialog for editing', async (): Promise<void> => {
    const drawingData = createDrawingData();
    const wrapper = mountPageSetterHost(drawingData);

    const editButton = findSectionSchemaEditButton(wrapper, '出参');
    expect((editButton.props() as { icon?: string; size?: string }).icon).toBe('lucide:file-json');
    expect((editButton.props() as { size?: string }).size).toBe('mini');
    expect(findSectionBlock(wrapper, '出参').find('.section-block-stub__help').findComponent({ name: 'BIconStub' }).exists()).toBe(true);
    expect(findSectionBlock(wrapper, '出参').find('.section-block-stub__extra').text()).not.toContain('JSON导入');
    expect(findSectionBlock(wrapper, '出参').find('.section-block-stub__extra').text()).toContain('编辑');
    expect(findSectionBlock(wrapper, '出参').find('.section-block-stub__extra').find('[data-tooltip="添加字段"]').exists()).toBe(true);
    expect(findSectionBlock(wrapper, '出参').find('.section-block-stub__extra').findComponent({ name: 'BIconStub' }).exists()).toBe(false);
    await editButton.trigger('click');
    expect(wrapper.find('.schema-editor-modal-stub').attributes('data-title')).toBe('编辑出参');

    await wrapper.find('.schema-editor-modal-stub .schema-editor-monaco-stub').setValue(
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
    await nextTick();
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

    await findSectionSchemaEditButton(wrapper, '出参').trigger('click');
    await wrapper.find('.schema-editor-modal-stub .schema-editor-monaco-stub').setValue('   ');
    await nextTick();
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

    await findSectionSchemaEditButton(wrapper, '入参').trigger('click');
    await wrapper.find('.schema-editor-modal-stub .schema-editor-monaco-stub').setValue('{broken');
    await nextTick();
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
