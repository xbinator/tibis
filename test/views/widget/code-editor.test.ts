/**
 * @file code-editor.test.ts
 * @description 验证 Widget JS 脚本当前页代码编辑器。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { WidgetData, WidgetSchemaObject } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import CodeEditor from '@/views/widget/components/CodeEditor.vue';

/** TypeScript 类型推导测试用最小基础类型声明。 */
const TYPESCRIPT_TEST_BASE_LIB = `
interface Boolean {}
interface Function {}
interface IArguments {}
interface Number {}
interface Object {}
interface RegExp {}
interface String {}
interface ThisType<T> {}
interface Array<T> {
  length: number
  [index: number]: T
}
interface Promise<T> {}
type Record<K extends string | number | symbol, T> = {
  [P in K]: T
}
`;

/** 已移除的旧根变量名。 */
const REMOVED_LEGACY_ROOT = ['last', 'Result'].join('');

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
    /** 是否自动换行 */
    wordWrap?: boolean;
    /** 是否启用搜索 */
    search?: boolean;
    /** 是否启用粘性标题 */
    stickyScroll?: boolean;
    /** TypeScript 编译选项 */
    typescriptCompilerOptions?: {
      /** 语言库 */
      lib?: string[];
      /** 是否禁止隐式 this */
      noImplicitThis?: boolean;
    };
  };
  /** 当前代码文本 */
  value?: string;
}

/**
 * 判断对象自身是否存在指定 key。
 * @param value - 对象值
 * @param key - 字段名
 * @returns 是否存在自有字段
 */
function hasOwnKey<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * 使用 TypeScript 编译器检查内存中的源码。
 * @param files - 文件名到源码的映射
 * @returns 诊断信息
 */
function getTypeScriptDiagnostics(files: Record<string, string>): readonly ts.Diagnostic[] {
  const compilerOptions: ts.CompilerOptions = {
    noEmit: true,
    noImplicitThis: true,
    noLib: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2020,
    typeRoots: [],
    types: []
  };
  const compilerHost = ts.createCompilerHost(compilerOptions);

  compilerHost.getSourceFile = (fileName: string, languageVersion: ts.ScriptTarget): ts.SourceFile | undefined => {
    if (!hasOwnKey(files, fileName)) {
      return undefined;
    }

    return ts.createSourceFile(fileName, files[fileName], languageVersion, true, ts.ScriptKind.TS);
  };
  compilerHost.fileExists = (fileName: string): boolean => hasOwnKey(files, fileName);
  compilerHost.readFile = (fileName: string): string | undefined => files[fileName];
  compilerHost.writeFile = (): void => undefined;
  compilerHost.getDefaultLibFileName = (): string => 'lib.d.ts';

  return ts.getPreEmitDiagnostics(ts.createProgram(Object.keys(files), compilerOptions, compilerHost));
}

/**
 * 将 TypeScript 诊断格式化为便于断言的文本。
 * @param diagnostics - 诊断信息
 * @returns 诊断文本
 */
function formatTypeScriptDiagnostics(diagnostics: readonly ts.Diagnostic[]): string[] {
  return diagnostics.map((diagnostic: ts.Diagnostic): string => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

/**
 * 创建 BButton 测试替身。
 * @returns BButton 测试替身
 */
function createBButtonStub(): ReturnType<typeof defineComponent> {
  return defineComponent({
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
    template: '<button class="b-button-stub" :data-icon="icon" :data-size="size" :data-type="type" @click="handleClick"><slot></slot></button>'
  });
}

/**
 * 创建 BMonaco 测试替身。
 * @returns BMonaco 测试替身
 */
function createBMonacoStub(): ReturnType<typeof defineComponent> {
  return defineComponent({
    name: 'BMonacoStub',
    props: {
      editorState: {
        type: Object,
        default: (): Record<string, unknown> => ({})
      },
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
       * 将 textarea 输入转换为 Monaco value 更新。
       * @param event - 原生输入事件
       */
      function handleInput(event: Event): void {
        if (event.target instanceof HTMLTextAreaElement) {
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
    template: '<textarea class="widget-code-monaco-stub" :value="value" @input="handleInput"></textarea>'
  });
}

/**
 * 创建测试用天气入参 schema。
 * @returns 天气入参 schema
 */
function createWeatherInputSchema(): WidgetSchemaObject {
  return {
    type: 'object',
    description: '查询天气入参',
    properties: {
      city: {
        type: 'string',
        description: '城市名称，例如上海'
      },
      date: {
        type: 'string',
        description: '查询日期，例如今天或明天'
      },
      unit: {
        type: 'string',
        description: '温度单位，celsius 或 fahrenheit'
      }
    },
    required: ['city']
  };
}

/**
 * 创建测试 Widget 数据。
 * @returns Widget 数据
 */
function createWidgetData(): WidgetData {
  return {
    ...createDefaultWidgetData(),
    inputSchema: createWeatherInputSchema()
  };
}

/**
 * 挂载 Widget 代码编辑器。
 * @param value - Widget 数据
 * @returns 测试包装器
 */
function mountCodeEditor(value: WidgetData = createWidgetData(), active = true): VueWrapper {
  return mount(CodeEditor, {
    props: {
      active,
      value
    },
    global: {
      stubs: {
        BButton: createBButtonStub(),
        BMonaco: createBMonacoStub(),
        Icon: true
      }
    }
  });
}

/**
 * 读取 Monaco 测试替身属性。
 * @param wrapper - 页面包装器
 * @returns Monaco 属性
 */
function readMonacoProps(wrapper: VueWrapper): BMonacoStubProps {
  return wrapper.findComponent({ name: 'BMonacoStub' }).props() as BMonacoStubProps;
}

/**
 * 查找关闭按钮。
 * @param wrapper - 页面包装器
 * @returns 按钮包装器
 */
function findCloseButton(wrapper: VueWrapper): VueWrapper {
  const button = wrapper.findAllComponents({ name: 'BButtonStub' }).find((item: VueWrapper): boolean => (item.props() as { icon?: string }).icon === 'lucide:x');
  if (!button) {
    throw new Error('未找到关闭按钮');
  }

  return button;
}

describe('CodeEditor', (): void => {
  it('loads current script and updates widget data through value model', async (): Promise<void> => {
    const initialCode = ['Widget({', '  async mounted() {', "    this.$setData('ready', true)", '  }', '})'].join('\n');
    const nextCode = [
      'Widget({',
      '  methods: {',
      '    async confirm() {',
      "      await this.$sendMessage({ content: [{ type: 'text', text: '确认下单' }] })",
      '    }',
      '  }',
      '})'
    ].join('\n');
    const widgetData = {
      ...createWidgetData(),
      execute: {
        enabled: false,
        description: '已有脚本说明',
        code: initialCode
      }
    };
    const wrapper = mountCodeEditor(widgetData);

    expect(wrapper.find('.widget-code-page__toolbar').exists()).toBe(true);
    expect(wrapper.find('.widget-code-page__title').text()).toBe('运行代码');
    expect(wrapper.findAllComponents({ name: 'BButtonStub' })).toHaveLength(1);
    expect((findCloseButton(wrapper).props() as { icon?: string }).icon).toBe('lucide:x');
    expect(readMonacoProps(wrapper).language).toBe('typescript');
    expect(readMonacoProps(wrapper).options?.wordWrap).toBe(true);
    expect(readMonacoProps(wrapper).options?.search).toBe(true);
    expect(readMonacoProps(wrapper).options?.stickyScroll).toBe(true);
    expect(readMonacoProps(wrapper).options?.typescriptCompilerOptions?.lib).toEqual(['es2020']);
    expect(readMonacoProps(wrapper).options?.typescriptCompilerOptions?.noImplicitThis).toBe(true);
    expect(readMonacoProps(wrapper).value).toBe(initialCode);

    await wrapper.find('.widget-code-monaco-stub').setValue(nextCode);
    await nextTick();

    expect(wrapper.emitted<WidgetData[]>('update:value')?.[0]?.[0].execute).toEqual({
      enabled: false,
      description: '已有脚本说明',
      code: nextCode
    });
    wrapper.unmount();
  });

  it('emits close without mutating the current model by itself', async (): Promise<void> => {
    const wrapper = mountCodeEditor({
      ...createWidgetData(),
      execute: {
        code: 'Widget({})'
      }
    });

    await findCloseButton(wrapper).trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('update:value')).toBeUndefined();
    wrapper.unmount();
  });

  it('syncs draft from the latest model when activated again', async (): Promise<void> => {
    const initialCode = 'Widget({ mounted() {} })';
    const wrapper = mountCodeEditor(
      {
        ...createWidgetData(),
        execute: {
          code: initialCode
        }
      },
      true
    );
    const nextWidgetData = {
      ...createWidgetData(),
      execute: {
        code: 'Widget({ methods: { latest() {} } })'
      }
    };

    await wrapper.find('.widget-code-monaco-stub').setValue('Widget({ methods: { draft() {} } })');
    await wrapper.setProps({ active: false });
    await wrapper.setProps({ value: nextWidgetData });
    await wrapper.setProps({ active: true });
    await nextTick();

    expect(readMonacoProps(wrapper).value).toBe(nextWidgetData.execute.code);
    wrapper.unmount();
  });

  it('keeps an empty script when syncing from the latest model', async (): Promise<void> => {
    const wrapper = mountCodeEditor(
      {
        ...createWidgetData(),
        execute: {
          code: 'Widget({ mounted() {} })'
        }
      },
      false
    );
    const nextWidgetData = {
      ...createWidgetData(),
      execute: {
        code: ''
      }
    };

    await wrapper.setProps({ value: nextWidgetData });
    await wrapper.setProps({ active: true });
    await nextTick();

    expect(readMonacoProps(wrapper).value).toBe('');
    wrapper.unmount();
  });

  it('creates editor type hints for nested, array and non-identifier input schema fields', (): void => {
    const wrapper = mountCodeEditor({
      ...createWidgetData(),
      inputSchema: {
        type: 'object',
        properties: {
          weather: {
            type: 'object',
            description: '天气对象',
            properties: {
              alerts: {
                type: 'array',
                description: '天气预警',
                items: {
                  type: 'string'
                }
              }
            },
            required: ['alerts']
          },
          'temperature.celsius': {
            type: 'number',
            description: '摄氏温度'
          }
        },
        required: ['weather', 'temperature.celsius']
      }
    });
    const extraLibContent = readMonacoProps(wrapper).extraLibs?.[0]?.content ?? '';

    expect(extraLibContent).toContain('/** 天气对象 */\n  weather: {');
    expect(extraLibContent).toContain('/** 天气预警 */\n    alerts: Array<string>');
    expect(extraLibContent).toContain('/** 摄氏温度 */\n  "temperature.celsius": number');
    wrapper.unmount();
  });

  it('creates data type hints from interaction script setData calls', (): void => {
    const wrapper = mountCodeEditor({
      ...createWidgetData(),
      execute: {
        code: ['Widget({', '  async mounted() {', '    // 初始化天气数据。', "    this.$setData('weather.temperature', 28)", '  }', '})'].join('\n')
      }
    });
    const extraLibContent = readMonacoProps(wrapper).extraLibs?.[0]?.content ?? '';

    expect(extraLibContent).toContain('declare interface WidgetData');
    expect(extraLibContent).toContain('weather?: {');
    expect(extraLibContent).toContain('temperature?: number');
    expect(extraLibContent).toContain('$data: WidgetData');
    expect(
      formatTypeScriptDiagnostics(
        getTypeScriptDiagnostics({
          'lib.d.ts': TYPESCRIPT_TEST_BASE_LIB,
          'widget-env.d.ts': extraLibContent,
          'widget-test.ts': [
            'Widget({',
            '  mounted() {',
            '    const city: string = this.$input.city',
            '    const temperature: number | undefined = this.$data.weather?.temperature',
            '    this.$setData("last.temperature", temperature)',
            '  },',
            '  methods: {',
            '    confirm() {',
            "      this.$sendMessage({ content: [{ type: 'text', text: this.$input.city }] })",
            '    }',
            '  }',
            '})'
          ].join('\n')
        })
      )
    ).toEqual([]);
    expect(extraLibContent).not.toContain(REMOVED_LEGACY_ROOT);
    wrapper.unmount();
  });

  it('updates data type hints from the interaction script draft before confirming', async (): Promise<void> => {
    const wrapper = mountCodeEditor({
      ...createWidgetData(),
      execute: {
        code: ['Widget({', '  async mounted() {', '    // 暂无数据写入。', '  }', '})'].join('\n')
      }
    });

    expect(readMonacoProps(wrapper).extraLibs?.[0]?.content).not.toContain('draft?: {');

    await wrapper
      .find('.widget-code-monaco-stub')
      .setValue(['Widget({', '  async mounted() {', "    this.$setData('draft.city', this.$input.city)", '  }', '})'].join('\n'));
    await nextTick();

    const extraLibContent = readMonacoProps(wrapper).extraLibs?.[0]?.content ?? '';

    expect(extraLibContent).toContain('draft?: {');
    expect(extraLibContent).toContain('city?: string');
    expect(
      formatTypeScriptDiagnostics(
        getTypeScriptDiagnostics({
          'lib.d.ts': TYPESCRIPT_TEST_BASE_LIB,
          'widget-env.d.ts': extraLibContent,
          'widget-test.ts': 'Widget({ mounted() { const city: string | undefined = this.$data.draft?.city } })'
        })
      )
    ).toEqual([]);
    wrapper.unmount();
  });
});
