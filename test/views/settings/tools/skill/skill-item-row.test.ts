/**
 * @file skill-item-row.test.ts
 * @description Skill 列表项自闭环编辑、删除与导航交互测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillDefinition } from '@/ai/skill/types';
import type { DropdownOption, DropdownOptionItem } from '@/components/BDropdown/type';
import { useSkillStore } from '@/stores/ai/skill';
import SkillItemRow from '@/views/settings/tools/skill/components/SkillItemRow.vue';

/** 路由跳转 mock。 */
const routerPushMock = vi.hoisted(() => vi.fn<(_location: unknown) => Promise<void>>());
/** 文件打开 mock。 */
const openFileByPathMock = vi.hoisted(() => vi.fn<(path: string) => Promise<{ id: string } | null>>());
/** 删除确认 mock。 */
const deleteConfirmMock = vi.hoisted(() => vi.fn<() => Promise<[boolean, boolean]>>());
/** 原生平台 mock。 */
const nativeMock = vi.hoisted(() => ({
  trashFile: vi.fn<(path: string) => Promise<void>>()
}));
/** 消息反馈 mock。 */
const messageMock = vi.hoisted(() => ({
  error: vi.fn<(content: string) => void>(),
  success: vi.fn<(content: string) => void>(),
  warning: vi.fn<(content: string) => void>()
}));
/** 日志 mock。 */
const loggerMock = vi.hoisted(() => ({
  error: vi.fn<(...args: unknown[]) => void>(),
  warn: vi.fn<(...args: unknown[]) => void>()
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPushMock })
}));

vi.mock('@/hooks/useOpenFile', () => ({
  useOpenFile: () => ({ openFileByPath: openFileByPathMock })
}));

vi.mock('@/shared/platform', () => ({
  native: nativeMock
}));

vi.mock('@/utils/modal', () => ({
  Modal: { delete: deleteConfirmMock }
}));

vi.mock('@/utils/logger', () => ({
  default: loggerMock
}));

vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ant-design-vue')>();
  return { ...actual, message: messageMock };
});

/** Skill 测试定义。 */
const skill: SkillDefinition = {
  name: 'weather',
  description: 'Weather instructions',
  content: 'Use the weather service.',
  filePath: '/Users/test/.agents/skills/weather/SKILL.md',
  dirPath: '/Users/test/.agents/skills/weather',
  source: 'global',
  enabled: true,
  parsedAt: 1
};

/** 直接渲染触发器与浮层的下拉菜单测试替身。 */
const BDropdownStub = defineComponent({
  name: 'BDropdown',
  template: '<div><slot /><slot name="overlay" /></div>'
});

/** 暴露菜单配置的测试替身。 */
const BDropdownMenuStub = defineComponent({
  name: 'BDropdownMenu',
  props: {
    options: { type: Array, required: true }
  },
  template: '<div class="dropdown-menu-stub"></div>'
});

/** 设置按钮测试替身。 */
const BButtonStub = defineComponent({
  name: 'BButton',
  props: {
    disabled: { type: Boolean, default: false },
    icon: { type: String, default: '' },
    size: { type: String, default: '' },
    square: { type: Boolean, default: false },
    type: { type: String, default: '' }
  },
  template: '<button type="button" :disabled="disabled"></button>'
});

/** 启用开关测试替身。 */
const ASwitchStub = defineComponent({
  name: 'ASwitch',
  props: {
    checked: { type: Boolean, required: true },
    disabled: { type: Boolean, default: false }
  },
  emits: ['change'],
  template: '<button type="button" class="switch-stub" @click="$emit(\'change\', !checked)"></button>'
});

/**
 * 可控制完成时机的 Promise。
 */
interface Deferred<T> {
  /** Promise 实例 */
  promise: Promise<T>;
  /** 完成 Promise */
  resolve: (value: T) => void;
}

/**
 * 创建可控制 Promise。
 * @returns 延迟 Promise
 */
function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = (): void => undefined;
  const promise = new Promise<T>((resolve: (value: T) => void): void => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

/**
 * 挂载 Skill 列表项并注册真实 Store 数据。
 * @returns 组件包装器
 */
function mountRow(): VueWrapper {
  useSkillStore().handleSkillChange('add', { ...skill });

  return mount(SkillItemRow, {
    props: { skill },
    global: {
      stubs: {
        ASwitch: ASwitchStub,
        BButton: BButtonStub,
        BDropdown: BDropdownStub,
        BDropdownMenu: BDropdownMenuStub
      }
    }
  });
}

/**
 * 读取非分隔线菜单项。
 * @param wrapper - 组件包装器
 * @returns 菜单项
 */
function readItems(wrapper: VueWrapper): DropdownOptionItem[] {
  const options = wrapper.findComponent({ name: 'BDropdownMenu' }).props('options') as DropdownOption[];

  return options.filter((option: DropdownOption): option is DropdownOptionItem => option.type !== 'divider');
}

describe('SkillItemRow', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
    routerPushMock.mockReset();
    openFileByPathMock.mockReset();
    deleteConfirmMock.mockReset();
    nativeMock.trashFile.mockReset();
    messageMock.error.mockReset();
    messageMock.success.mockReset();
    messageMock.warning.mockReset();
    loggerMock.error.mockReset();
    loggerMock.warn.mockReset();
    routerPushMock.mockResolvedValue(undefined);
    openFileByPathMock.mockResolvedValue({ id: 'skill-weather' });
    deleteConfirmMock.mockResolvedValue([false, true]);
    nativeMock.trashFile.mockResolvedValue(undefined);
  });

  it('handles detail navigation and toggle without parent events', async (): Promise<void> => {
    const wrapper = mountRow();

    await wrapper.trigger('click');
    await wrapper.findComponent({ name: 'ASwitch' }).trigger('click');

    expect(routerPushMock).toHaveBeenCalledWith({ name: 'skill', params: { name: 'weather' } });
    expect(useSkillStore().getSkillByName('weather')?.enabled).toBe(false);
    expect(wrapper.emitted('open')).toBeUndefined();
    expect(wrapper.emitted('toggle')).toBeUndefined();
    expect(wrapper.findComponent({ name: 'BButton' }).props()).toMatchObject({
      icon: 'lucide:settings',
      size: 'small',
      square: true,
      type: 'ghost'
    });
  });

  it('opens SKILL.md from the edit menu without a parent event', async (): Promise<void> => {
    const wrapper = mountRow();
    const [edit] = readItems(wrapper);

    await edit?.onClick?.();

    expect(openFileByPathMock).toHaveBeenCalledWith(skill.filePath);
    expect(wrapper.emitted('edit')).toBeUndefined();
  });

  it('reports when SKILL.md cannot be opened', async (): Promise<void> => {
    openFileByPathMock.mockResolvedValue(null);
    const wrapper = mountRow();
    const [edit] = readItems(wrapper);

    await edit?.onClick?.();

    expect(messageMock.error).toHaveBeenCalledWith('无法打开技能 "weather" 的 SKILL.md');
  });

  it('logs and reports a SKILL.md open failure', async (): Promise<void> => {
    openFileByPathMock.mockRejectedValue(new Error('EACCES'));
    const wrapper = mountRow();
    const [edit] = readItems(wrapper);

    await edit?.onClick?.();

    expect(loggerMock.error).toHaveBeenCalledWith('Open SKILL.md failed:', expect.any(Error));
    expect(messageMock.error).toHaveBeenCalledWith('无法打开技能 "weather" 的 SKILL.md：EACCES');
  });

  it('moves the whole Skill directory to trash and rescans internally', async (): Promise<void> => {
    const wrapper = mountRow();
    const rescan = vi.spyOn(useSkillStore(), 'rescan').mockResolvedValue(undefined);
    const [, remove] = readItems(wrapper);

    await remove?.onClick?.();

    expect(nativeMock.trashFile).toHaveBeenCalledWith(skill.dirPath);
    expect(rescan).toHaveBeenCalledTimes(1);
    expect(messageMock.success).toHaveBeenCalledWith('技能 "weather" 已删除');
    expect(wrapper.emitted('delete')).toBeUndefined();
  });

  it('keeps the Skill when deletion is cancelled', async (): Promise<void> => {
    deleteConfirmMock.mockResolvedValue([true, false]);
    const wrapper = mountRow();
    const [, remove] = readItems(wrapper);

    await remove?.onClick?.();

    expect(nativeMock.trashFile).not.toHaveBeenCalled();
  });

  it('logs and reports a Skill trash failure without rescanning', async (): Promise<void> => {
    nativeMock.trashFile.mockRejectedValue(new Error('EPERM'));
    const wrapper = mountRow();
    const rescan = vi.spyOn(useSkillStore(), 'rescan').mockResolvedValue(undefined);
    const [, remove] = readItems(wrapper);

    await remove?.onClick?.();

    expect(rescan).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalledWith('Delete Skill failed:', expect.any(Error));
    expect(messageMock.error).toHaveBeenCalledWith('删除技能 "weather" 失败：EPERM');
  });

  it('logs and warns when rescan fails after deleting the Skill', async (): Promise<void> => {
    const wrapper = mountRow();
    vi.spyOn(useSkillStore(), 'rescan').mockRejectedValue(new Error('scan failed'));
    const [, remove] = readItems(wrapper);

    await remove?.onClick?.();

    expect(loggerMock.warn).toHaveBeenCalledWith('Refresh skills after deletion failed:', expect.any(Error));
    expect(messageMock.warning).toHaveBeenCalledWith('技能 "weather" 已移入回收站，但列表刷新失败');
  });

  it('executes only one trash operation for repeated delete actions', async (): Promise<void> => {
    const wrapper = mountRow();
    vi.spyOn(useSkillStore(), 'rescan').mockResolvedValue(undefined);
    const [, remove] = readItems(wrapper);

    const firstDeletion = remove?.onClick?.();
    const secondDeletion = remove?.onClick?.();
    await Promise.all([firstDeletion, secondDeletion]);

    expect(deleteConfirmMock).toHaveBeenCalledTimes(1);
    expect(nativeMock.trashFile).toHaveBeenCalledTimes(1);
  });

  it('disables menu actions while deletion confirmation is pending', async (): Promise<void> => {
    const pendingConfirmation = createDeferred<[boolean, boolean]>();
    deleteConfirmMock.mockReturnValue(pendingConfirmation.promise);
    const wrapper = mountRow();
    vi.spyOn(useSkillStore(), 'rescan').mockResolvedValue(undefined);
    const [, remove] = readItems(wrapper);

    const deletion = remove?.onClick?.();
    await flushPromises();

    expect(readItems(wrapper).every((item: DropdownOptionItem): boolean => item.disabled === true)).toBe(true);

    pendingConfirmation.resolve([false, true]);
    await deletion;
  });
});
