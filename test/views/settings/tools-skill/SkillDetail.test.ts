/**
 * @file SkillDetail.test.ts
 * @description 验证 Skill 只读详情面板的文件树加载与文件内容预览行为。
 */
/* @vitest-environment jsdom */

import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillDefinition } from '@/ai/skill/types';
import SkillDetail from '@/views/settings/tools/skill/components/SkillDetail.vue';

const nativeMocks = vi.hoisted(() => ({
  readWorkspaceDirectory: vi.fn(),
  readFile: vi.fn()
}));

vi.mock('@/shared/platform', () => ({
  native: nativeMocks
}));

/**
 * 创建测试用 Skill 定义。
 * @returns Skill 定义
 */
function createSkill(): SkillDefinition {
  return {
    name: 'writer',
    description: 'Write better drafts',
    content: 'Use this skill for writing.',
    filePath: '/workspace/.agents/skills/writer/SKILL.md',
    dirPath: '/workspace/.agents/skills/writer',
    source: 'project',
    enabled: true,
    parsedAt: 1710000000000
  };
}

describe('SkillDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeMocks.readWorkspaceDirectory.mockImplementation(async ({ directoryPath }: { directoryPath: string }) => {
      if (directoryPath === '/workspace/.agents/skills/writer') {
        return {
          path: directoryPath,
          entries: [
            { name: 'SKILL.md', path: '/workspace/.agents/skills/writer/SKILL.md', type: 'file' },
            { name: 'scripts', path: '/workspace/.agents/skills/writer/scripts', type: 'directory' }
          ]
        };
      }

      return {
        path: directoryPath,
        entries: [{ name: 'draft.ts', path: '/workspace/.agents/skills/writer/scripts/draft.ts', type: 'file' }]
      };
    });
    nativeMocks.readFile.mockImplementation(async (filePath: string) => ({
      content: filePath.endsWith('draft.ts') ? 'export const draft = true;' : '# Writer\n\nRead-only instructions.',
      name: filePath.split('/').at(-1) ?? '',
      ext: filePath.split('.').at(-1) ?? ''
    }));
  });

  it('loads the skill tree and previews SKILL.md as read-only content by default', async () => {
    const wrapper = mount(SkillDetail, {
      props: {
        skill: createSkill()
      },
      global: {
        stubs: {
          Icon: { template: '<i />', props: ['icon', 'width'] }
        }
      }
    });

    await flushPromises();

    expect(nativeMocks.readWorkspaceDirectory).toHaveBeenCalledWith({ directoryPath: '/workspace/.agents/skills/writer' });
    expect(nativeMocks.readFile).toHaveBeenCalledWith('/workspace/.agents/skills/writer/SKILL.md');
    expect(wrapper.text()).toContain('writer');
    expect(wrapper.text()).toContain('SKILL.md');
    expect(wrapper.text()).toContain('scripts');
    expect(wrapper.text()).toContain('Read-only instructions.');
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.find('input').exists()).toBe(false);
  });

  it('previews a nested file when the user selects it from the tree', async () => {
    const wrapper = mount(SkillDetail, {
      props: {
        skill: createSkill()
      },
      global: {
        stubs: {
          Icon: { template: '<i />', props: ['icon', 'width'] }
        }
      }
    });

    await flushPromises();
    await wrapper.get('[data-test="skill-file-/workspace/.agents/skills/writer/scripts/draft.ts"]').trigger('click');
    await flushPromises();

    expect(nativeMocks.readFile).toHaveBeenLastCalledWith('/workspace/.agents/skills/writer/scripts/draft.ts');
    expect(wrapper.text()).toContain('export const draft = true;');
  });

  it('emits close when the close button is clicked', async () => {
    const wrapper = mount(SkillDetail, {
      props: {
        skill: createSkill()
      },
      global: {
        stubs: {
          BButton: { template: '<button class="close-stub"><slot /></button>', props: ['square', 'type', 'title'] },
          Icon: { template: '<i />', props: ['icon', 'width'] }
        }
      }
    });

    await wrapper.get('[data-test="skill-detail-close"]').trigger('click');

    expect(wrapper.emitted('close')).toEqual([[]]);
  });

  it('renders an empty state without reading files when no skill is selected', async () => {
    const wrapper = mount(SkillDetail, {
      props: {
        skill: null
      },
      global: {
        stubs: {
          Icon: { template: '<i />', props: ['icon', 'width'] }
        }
      }
    });

    await flushPromises();

    expect(wrapper.text()).toContain('选择一个 Skill 查看详情');
    expect(nativeMocks.readWorkspaceDirectory).not.toHaveBeenCalled();
    expect(nativeMocks.readFile).not.toHaveBeenCalled();
  });
});
