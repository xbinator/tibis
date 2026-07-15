/**
 * @file index.test.ts
 * @description Skill 设置列表批量懒加载测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillEntry } from '@/ai/skill';
import { useSkillStore } from '@/stores/ai/skill';
import SkillSettingsPage from '@/views/settings/tools/skill/index.vue';

/** 路由替换 mock。 */
const routerReplaceMock = vi.hoisted(() => vi.fn<(_location: unknown) => Promise<void>>());

/** 可由测试控制完成时机的 Promise。 */
interface Deferred<T> {
  /** 等待完成的 Promise。 */
  promise: Promise<T>;
  /** 完成 Promise。 */
  resolve: (value: T) => void;
}

/**
 * 创建可控 Promise。
 * @returns 可控 Promise
 */
function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = (): void => undefined;
  const promise = new Promise<T>((resolve: (value: T) => void): void => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: routerReplaceMock })
}));

/** 设置页测试替身。 */
const SettingsPageStub = defineComponent({
  name: 'SettingsPage',
  props: { title: { type: String, required: true } },
  template: '<main><slot name="extra" /><slot /></main>'
});

/** 设置区块测试替身。 */
const SettingsSectionStub = defineComponent({
  name: 'SettingsSection',
  props: { title: { type: String, required: true } },
  template: '<section><slot /></section>'
});

/** Skill 行测试替身。 */
const SkillItemRowStub = defineComponent({
  name: 'SkillItemRow',
  props: { skill: { type: Object, required: true } },
  template: '<div class="skill-row-stub">{{ skill.definition?.name || skill.id }}</div>'
});

/**
 * 挂载 Skill 设置列表。
 * @returns 页面包装器
 */
function mountSkillPage(): VueWrapper {
  return mount(SkillSettingsPage, {
    global: {
      stubs: {
        BButton: true,
        SettingsPage: SettingsPageStub,
        SettingsSection: SettingsSectionStub,
        SettingsPagination: true,
        SkillCreator: true,
        SkillItemRow: SkillItemRowStub
      }
    }
  });
}

describe('SkillSettingsPage', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
    routerReplaceMock.mockReset().mockResolvedValue(undefined);
  });

  it('loads all directory entries when the list is mounted', async (): Promise<void> => {
    const store = useSkillStore();
    store.handleSkillDirectory('add', '/Users/test/.agents/skills/weather');
    const getSkills = vi.spyOn(store, 'getSkills').mockImplementation(async (): Promise<SkillEntry[]> => {
      const entry = store.updateSkillContent(
        'weather',
        ['---', 'name: weather-name', 'description: Weather instructions', '---', 'Use the weather service.'].join('\n')
      );
      if (!entry) {
        throw new Error('Skill entry missing');
      }
      return [entry];
    });

    const wrapper = mountSkillPage();
    await flushPromises();

    expect(getSkills).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('weather-name');
  });

  it('waits for Store initialization before loading directory entries', async (): Promise<void> => {
    const store = useSkillStore();
    store.handleSkillDirectory('add', '/Users/test/.agents/skills/weather');
    const deferred = createDeferred<void>();
    const waitForInit = vi.spyOn(store, 'waitForInit').mockReturnValue(deferred.promise);
    const getSkills = vi.spyOn(store, 'getSkills').mockResolvedValue([]);

    mountSkillPage();
    await flushPromises();

    expect(waitForInit).toHaveBeenCalledOnce();
    expect(getSkills).not.toHaveBeenCalled();
    deferred.resolve(undefined);
    await flushPromises();
    expect(getSkills).toHaveBeenCalledOnce();
  });
});
