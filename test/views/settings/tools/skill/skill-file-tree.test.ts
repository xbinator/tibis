/**
 * @file skill-file-tree.test.ts
 * @description Skill 文件树图标渲染测试。
 * @vitest-environment jsdom
 */
import { flushPromises, mount, type VueWrapper, type DOMWrapper } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import SkillFileTree from '@/views/settings/tools/skill/components/SkillFileTree.vue';

vi.mock('@iconify/vue', () => ({
  Icon: {
    name: 'Icon',
    props: {
      icon: { type: String, required: true },
      width: { type: Number, default: 16 }
    },
    template: '<i class="icon-stub" :data-icon="icon" :data-width="width"></i>'
  }
}));

/**
 * 挂载虚拟文件树。
 * @param virtualPaths - 虚拟文件路径列表
 * @returns 文件树组件包装器
 */
async function mountSkillFileTree(virtualPaths: string[]): Promise<VueWrapper> {
  const wrapper = mount(SkillFileTree, {
    props: {
      selectedFilePath: '',
      virtualPaths
    }
  });

  await flushPromises();

  return wrapper;
}

/**
 * 按文件名查找对应节点。
 * @param wrapper - 文件树组件包装器
 * @param fileName - 文件名
 * @returns 文件节点包装器
 */
function findNodeByName(wrapper: VueWrapper, fileName: string): DOMWrapper<Element> {
  const node = wrapper.findAll('.skill-file-tree__node').find((item) => item.text().includes(fileName));

  if (!node) {
    throw new Error(`未找到文件节点：${fileName}`);
  }

  return node;
}

/**
 * 读取文件节点图标名。
 * @param wrapper - 文件树组件包装器
 * @param fileName - 文件名
 * @returns Iconify 图标名
 */
function getIconByFileName(wrapper: VueWrapper, fileName: string): string | undefined {
  return findNodeByName(wrapper, fileName).find('.skill-file-tree__icon').attributes('data-icon');
}

/**
 * 读取当前渲染的文件树节点名称。
 * @param wrapper - 文件树组件包装器
 * @returns 文件树节点名称列表
 */
function getRenderedNodeNames(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.skill-file-tree__node').map((item) => item.text().trim());
}

describe('SkillFileTree', (): void => {
  it('uses filename-specific icons for special markdown files', async (): Promise<void> => {
    const wrapper = await mountSkillFileTree(['SKILL.md', 'agents.md', 'README.md']);

    expect(getIconByFileName(wrapper, 'SKILL.md')).toBe('vscode-icons:file-type-light-skill');
    expect(getIconByFileName(wrapper, 'agents.md')).toBe('vscode-icons:file-type-light-agents');
    expect(getIconByFileName(wrapper, 'README.md')).toBe('vscode-icons:file-type-markdown');
  });

  it('renders virtual paths in the same hierarchy order as a real skill directory', async (): Promise<void> => {
    const wrapper = await mountSkillFileTree([
      'SKILL.md',
      'references/widget-format.md',
      'references/runtime-api.md',
      'references/elements-and-bindings.md',
      'agents/openai.yaml',
      'scripts/validate-widget.js',
      'assets/widget-template/widget.json'
    ]);

    expect(getRenderedNodeNames(wrapper)).toEqual([
      'agents',
      'openai.yaml',
      'assets',
      'widget-template',
      'widget.json',
      'references',
      'elements-and-bindings.md',
      'runtime-api.md',
      'widget-format.md',
      'scripts',
      'validate-widget.js',
      'SKILL.md'
    ]);
  });
});
