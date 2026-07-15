/**
 * @file detail.test.ts
 * @description Skill 详情页 Store 内容缓存集成测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillEntry } from '@/ai/skill';
import { useSkillStore } from '@/stores/ai/skill';
import SkillDetailPage from '@/views/settings/tools/skill/detail.vue';

/** 路由参数 mock。 */
const routeMock = vi.hoisted(() => ({ params: { id: 'weather' } }));
/** 路由跳转 mock。 */
const routerPushMock = vi.hoisted(() => vi.fn<(_location: unknown) => Promise<void>>());
/** 剪贴板 mock。 */
const clipboardMock = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: routerPushMock })
}));

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({ clipboard: clipboardMock })
}));

vi.mock('@iconify/vue', () => ({
  Icon: { name: 'Icon', template: '<i></i>' }
}));

/** 设置页测试替身。 */
const SettingsPageStub = defineComponent({
  name: 'SettingsPage',
  props: { title: { type: String, required: true } },
  template: '<main><slot name="title" /><slot name="extra" /><slot /></main>'
});

/** Skill 预览测试替身。 */
const SkillPreviewStub = defineComponent({
  name: 'SkillPreview',
  props: {
    rootPath: { type: String, default: '' },
    initialFilePath: { type: String, default: '' },
    initialContent: { type: String, default: undefined }
  },
  template: '<div class="skill-preview-stub"></div>'
});

/**
 * 挂载 Skill 详情页。
 * @returns 页面包装器
 */
function mountDetailPage(): VueWrapper {
  return mount(SkillDetailPage, {
    global: {
      stubs: {
        ASwitch: true,
        BButton: true,
        SettingsPage: SettingsPageStub,
        SkillPreview: SkillPreviewStub
      }
    }
  });
}

describe('SkillDetailPage', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
    routeMock.params.id = 'weather';
    routerPushMock.mockReset().mockResolvedValue(undefined);
    clipboardMock.mockReset();
  });

  it('gets by directory ID and previews the cached entry content', async (): Promise<void> => {
    const store = useSkillStore();
    const sourceContent = ['---', 'name: weather-name', 'description: Weather instructions', '---', 'Use the weather service.'].join('\n');
    store.handleSkillDirectory('add', '/Users/test/.agents/skills/weather');
    const getSkill = vi.spyOn(store, 'getSkill').mockImplementation(async (id: string): Promise<SkillEntry | undefined> => {
      const entry = store.updateSkillContent(id, sourceContent);
      if (!entry) {
        throw new Error('Skill entry missing');
      }
      return entry;
    });

    const wrapper = mountDetailPage();
    await flushPromises();

    expect(getSkill).toHaveBeenCalledWith('weather');
    expect(wrapper.text()).toContain('Weather instructions');
    expect(wrapper.findComponent(SkillPreviewStub).props('initialContent')).toBe(sourceContent);
  });

  it('waits for directory initialization before resolving a deep-linked Skill', async (): Promise<void> => {
    const store = useSkillStore();
    const sourceContent = ['---', 'name: weather-name', 'description: Weather instructions', '---', 'Use the weather service.'].join('\n');
    store.handleSkillDirectory('add', '/Users/test/.agents/skills/weather');
    store.prepareInitialization();
    const getSkill = vi.spyOn(store, 'getSkill').mockImplementation(async (id: string): Promise<SkillEntry | undefined> => {
      const entry = store.updateSkillContent(id, sourceContent);
      if (!entry) {
        throw new Error('Skill entry missing');
      }
      return entry;
    });

    const wrapper = mountDetailPage();
    await flushPromises();

    expect(getSkill).not.toHaveBeenCalled();
    expect(wrapper.findComponent(SkillPreviewStub).exists()).toBe(false);
    store.finishInitialization();
    await flushPromises();

    expect(getSkill).toHaveBeenCalledWith('weather');
    expect(wrapper.findComponent(SkillPreviewStub).props('initialContent')).toBe(sourceContent);
  });
});
