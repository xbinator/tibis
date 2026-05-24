/**
 * @file SkillItemRow.test.ts
 * @description 验证 Skill 列表项点击打开详情与开关切换行为互不干扰。
 */
/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { SkillDefinition } from '@/ai/skill/types';
import SkillItemRow from '@/views/settings/tools/skill/components/SkillItemRow.vue';

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
    source: 'global',
    enabled: true,
    parsedAt: 1710000000000
  };
}

describe('SkillItemRow', () => {
  it('emits open when the row is clicked', async () => {
    const wrapper = mount(SkillItemRow, {
      props: {
        skill: createSkill()
      },
      global: {
        stubs: {
          Icon: { template: '<i />', props: ['icon', 'width'] },
          ASwitch: { template: '<button class="switch-stub" @click="$emit(\'change\')" />', props: ['checked', 'disabled', 'size'] }
        }
      }
    });

    await wrapper.get('.skill-settings__item-row').trigger('click');

    expect(wrapper.emitted('open')).toEqual([['writer']]);
  });

  it('emits toggle without opening the row when the switch changes', async () => {
    const wrapper = mount(SkillItemRow, {
      props: {
        skill: createSkill()
      },
      global: {
        stubs: {
          Icon: { template: '<i />', props: ['icon', 'width'] },
          ASwitch: { template: '<button class="switch-stub" @click="$emit(\'change\')" />', props: ['checked', 'disabled', 'size'] }
        }
      }
    });

    await wrapper.get('.switch-stub').trigger('click');

    expect(wrapper.emitted('toggle')).toEqual([['writer']]);
    expect(wrapper.emitted('open')).toBeUndefined();
  });
});
