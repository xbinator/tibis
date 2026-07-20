/**
 * @file index.test.ts
 * @description 验证 BInputNumber 组件的 v-model 绑定、归一化输出和自由输入行为。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BInputNumber from '@/components/BInputNumber/index.vue';

/** AInputNumber 测试替身的 props 列表。 */
const STUB_PROPS = [
  'value',
  'placeholder',
  'disabled',
  'controls',
  'min',
  'max',
  'step',
  'precision',
  'size',
  'defaultValue',
  'decimalPrecision',
  'stringMode'
];

/** AInputNumber 测试替身模板。 */
const STUB_TEMPLATE = '<div class="ant-input-number-stub"><input class="stub-input" :value="value" /></div>';

/**
 * 挂载 BInputNumber 组件。
 * @param props - 传入的 props
 * @returns Vue Test Utils 包装器
 */
function mountInputNumber(props: Record<string, unknown> = {}): VueWrapper {
  return mount(BInputNumber, {
    props,
    global: {
      stubs: {
        AInputNumber: {
          name: 'AInputNumber',
          props: STUB_PROPS,
          template: STUB_TEMPLATE,
          emits: ['update:value', 'change', 'blur']
        }
      }
    }
  });
}

/**
 * 创建带 v-model 的宿主组件并挂载。
 * @param options - 附加 props
 * @returns Vue Test Utils 包装器
 */
function mountWithVModel(options: Record<string, unknown> = {}): VueWrapper {
  const Host = defineComponent({
    components: { BInputNumber },
    setup(): Record<string, unknown> {
      const value = ref<number | undefined>(options.value as number | undefined);

      return { value, ...options };
    },
    template: `<BInputNumber v-model:value="value" ${Object.keys(options)
      .filter((key): boolean => key !== 'value')
      .map((key): string => `:${key}="${key}"`)
      .join(' ')} />`
  });

  return mount(Host, {
    global: {
      stubs: {
        AInputNumber: {
          name: 'AInputNumber',
          props: STUB_PROPS,
          template: STUB_TEMPLATE,
          emits: ['update:value', 'change', 'blur']
        }
      }
    }
  });
}

describe('BInputNumber', (): void => {
  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('渲染 AInputNumber 并传递默认 controls=false', (): void => {
    const wrapper = mountInputNumber();

    const stub = wrapper.findComponent({ name: 'AInputNumber' });
    expect(stub.props('controls')).toBe(false);
  });

  it('传递 value 到 AInputNumber', (): void => {
    const wrapper = mountInputNumber({ value: 42 });

    const stub = wrapper.findComponent({ name: 'AInputNumber' });
    expect(stub.props('value')).toBe(42);
  });

  it('传递 placeholder 和其他 props', (): void => {
    const wrapper = mountInputNumber({
      value: 10,
      placeholder: '请输入',
      min: 0,
      max: 100
    });

    const stub = wrapper.findComponent({ name: 'AInputNumber' });
    expect(stub.props('placeholder')).toBe('请输入');
    expect(stub.props('min')).toBe(0);
    expect(stub.props('max')).toBe(100);
  });

  describe('自由输入与归一化输出', (): void => {
    it('update:value 立即归一化向外 emit', async (): Promise<void> => {
      const wrapper = mountInputNumber({ value: 10, defaultValue: 0, decimalPrecision: 2 });

      const stub = wrapper.findComponent({ name: 'AInputNumber' });

      // 模拟用户输入
      await stub.vm.$emit('update:value', 3.14159);

      // 应该立即 emit 归一化后的值
      const emitted = wrapper.emitted('update:value');
      expect(emitted).toBeDefined();
      expect(emitted![0]).toEqual([3.14]);
    });

    it('update:value 时本地展示值保持原始输入，不被归一化覆盖', async (): Promise<void> => {
      const wrapper = mountInputNumber({ value: 10, defaultValue: 0, decimalPrecision: 2 });

      const stub = wrapper.findComponent({ name: 'AInputNumber' });

      // 模拟用户输入中间状态
      await stub.vm.$emit('update:value', '3.141');

      // 本地展示值应该保持用户输入的原始值
      expect(stub.props('value')).toBe('3.141');
    });

    it('update:value 时空值使用 defaultValue 兜底', async (): Promise<void> => {
      const wrapper = mountInputNumber({ value: 10, defaultValue: 0, decimalPrecision: 2 });

      const stub = wrapper.findComponent({ name: 'AInputNumber' });

      // 模拟清空输入
      await stub.vm.$emit('update:value', null);

      const emitted = wrapper.emitted('update:value');
      expect(emitted).toBeDefined();
      expect(emitted![0]).toEqual([0]);
    });

    it('连续输入不会因 watch 反馈而覆盖中间状态', async (): Promise<void> => {
      const wrapper = mountInputNumber({ value: 0, defaultValue: 0, decimalPrecision: 2 });

      const stub = wrapper.findComponent({ name: 'AInputNumber' });

      // 模拟连续输入 3.14
      await stub.vm.$emit('update:value', '3');
      expect(stub.props('value')).toBe('3');

      await stub.vm.$emit('update:value', '3.1');
      expect(stub.props('value')).toBe('3.1');

      await stub.vm.$emit('update:value', '3.14');
      expect(stub.props('value')).toBe('3.14');

      // 外部 modelValue 应该收到归一化值
      const emitted = wrapper.emitted('update:value');
      expect(emitted).toBeDefined();
      expect(emitted![2]).toEqual([3.14]);
    });
  });

  describe('v-model 双向绑定', (): void => {
    it('update:value 更新外部 v-model 值', async (): Promise<void> => {
      const wrapper = mountWithVModel({ value: 5, defaultValue: 0 });

      const stub = wrapper.findComponent({ name: 'AInputNumber' });

      // 触发 update:value 事件
      await stub.vm.$emit('update:value', 99);
      await nextTick();

      // 宿主组件的值应该已更新为归一化值
      expect((wrapper.vm as unknown as { value: number | undefined }).value).toBe(99);
    });
  });

  describe('外部值变化同步', (): void => {
    it('外部 value 变化时同步到 AInputNumber 展示', async (): Promise<void> => {
      const wrapper = mountInputNumber({ value: 10 });

      const stub = wrapper.findComponent({ name: 'AInputNumber' });
      expect(stub.props('value')).toBe(10);

      // 模拟外部值变化
      await wrapper.setProps({ value: 20 });
      await nextTick();

      expect(stub.props('value')).toBe(20);
    });
  });

  describe('defaultValue 显示兜底', (): void => {
    it('初始 value 为 undefined 时，展示值兜底为 defaultValue', (): void => {
      const wrapper = mountInputNumber({ defaultValue: 1 });

      const stub = wrapper.findComponent({ name: 'AInputNumber' });
      // 初始渲染就应显示 defaultValue，而非 undefined
      expect(stub.props('value')).toBe(1);
    });

    it('外部把 value 置为 undefined 时，展示值兜底为 defaultValue', async (): Promise<void> => {
      const wrapper = mountInputNumber({ value: 10, defaultValue: 1 });

      // 模拟外部把值清空
      await wrapper.setProps({ value: undefined });
      await nextTick();

      const stub = wrapper.findComponent({ name: 'AInputNumber' });
      // 外部置空后展示值应回退到 defaultValue
      expect(stub.props('value')).toBe(1);
    });
  });

  describe('blur 同步展示值', (): void => {
    it('清空后 blur 时把展示值同步回 modelValue（带 defaultValue 兜底）', async (): Promise<void> => {
      const wrapper = mountInputNumber({ value: 10, defaultValue: 1 });

      const stub = wrapper.findComponent({ name: 'AInputNumber' });

      // 用户清空输入：此时 inputValue 为 undefined（UI 显示空），modelValue 已写入 1
      await stub.vm.$emit('update:value', null);
      expect(stub.props('value')).toBeUndefined();

      // 模拟失焦
      await stub.vm.$emit('blur');

      // blur 后展示值应同步到 modelValue（即 defaultValue 1）
      expect(stub.props('value')).toBe(1);
    });

    it('未配置 defaultValue 时 blur 不改变空展示值', async (): Promise<void> => {
      const wrapper = mountInputNumber({ value: 10 });

      const stub = wrapper.findComponent({ name: 'AInputNumber' });

      // 用户清空输入
      await stub.vm.$emit('update:value', null);
      expect(stub.props('value')).toBeUndefined();

      // 模拟失焦
      await stub.vm.$emit('blur');

      // 未配置 defaultValue，blur 后展示值仍为 undefined
      expect(stub.props('value')).toBeUndefined();
    });
  });

  describe('无归一化配置时透传原生行为', (): void => {
    it('update:value 原样传递值', async (): Promise<void> => {
      const wrapper = mountInputNumber({ value: 10 });

      const stub = wrapper.findComponent({ name: 'AInputNumber' });

      await stub.vm.$emit('update:value', 42);

      const emitted = wrapper.emitted('update:value');
      expect(emitted).toBeDefined();
      expect(emitted![0]).toEqual([42]);
    });

    it('update:value null 转为 undefined', async (): Promise<void> => {
      const wrapper = mountInputNumber({ value: 10 });

      const stub = wrapper.findComponent({ name: 'AInputNumber' });

      await stub.vm.$emit('update:value', null);

      const emitted = wrapper.emitted('update:value');
      expect(emitted).toBeDefined();
      expect(emitted![0]).toEqual([undefined]);
    });
  });
});
