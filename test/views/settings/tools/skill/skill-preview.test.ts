/**
 * @file skill-preview.test.ts
 * @description Skill 预览优先使用并跟随 Store 入口内容缓存。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import SkillPreview from '@/views/settings/tools/skill/components/SkillPreview.vue';

/** 原生文件读取 mock。 */
const readFileMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/platform', () => ({
  native: {
    readFile: readFileMock
  }
}));

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({ clipboard: vi.fn() })
}));

/** 文件树测试替身，挂载后报告入口文件已发现。 */
const SkillFileTreeStub = defineComponent({
  name: 'SkillFileTree',
  emits: ['loaded', 'select-file'],
  /** 通知预览选择初始入口文件。 */
  mounted(): void {
    this.$emit('loaded', 1);
  },
  template: '<div></div>'
});

/**
 * 挂载 Skill 预览。
 * @param initialContent - Store 初始入口内容
 * @returns 组件包装器
 */
function mountPreview(initialContent: string): VueWrapper {
  return mount(SkillPreview, {
    props: {
      rootPath: '/Users/test/.agents/skills/weather',
      initialFilePath: '/Users/test/.agents/skills/weather/SKILL.md',
      initialContent
    },
    global: {
      stubs: {
        BButton: true,
        BPanelSplitter: { template: '<div><slot /></div>' },
        BScrollbar: { template: '<div><slot /></div>' },
        SkillFileTree: SkillFileTreeStub
      }
    }
  });
}

describe('SkillPreview', (): void => {
  it('updates the selected entry preview when Store content changes', async (): Promise<void> => {
    const wrapper = mountPreview('# first');
    await flushPromises();

    expect(wrapper.text()).toContain('# first');
    expect(readFileMock).not.toHaveBeenCalled();

    await wrapper.setProps({ initialContent: '# second' });

    expect(wrapper.text()).toContain('# second');
    expect(readFileMock).not.toHaveBeenCalled();
  });
});
