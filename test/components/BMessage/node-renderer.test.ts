/**
 * @file node-renderer.test.ts
 * @description BMessage BlockNode / InlineNode 渲染测试。
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BMessage from '@/components/BMessage/index.vue';

const navigateLinkMock = vi.hoisted(() =>
  vi.fn((event: MouseEvent) => {
    event.preventDefault();
  })
);
const previewImageMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: () => ({
    onLink: navigateLinkMock
  })
}));

vi.mock('@/hooks/useImagePreview', () => ({
  useImagePreview: () => ({
    previewImage: previewImageMock
  })
}));

/**
 * 等待一帧 rAF 渲染。
 */
async function waitAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  await nextTick();
}

describe('BMessage node renderer', () => {
  it('renders markdown through BlockNode and InlineNode components', async (): Promise<void> => {
    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: '# Title\n\nHello **bold** and `code`.'
      }
    });

    await nextTick();

    expect(wrapper.findComponent({ name: 'BlockNode' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'InlineNode' }).exists()).toBe(true);
    expect(wrapper.find('h1').text()).toBe('Title');
    expect(wrapper.find('strong').text()).toBe('bold');
    expect(wrapper.find('code').text()).toBe('code');
  });

  it('renders unsafe raw html as text rather than injected elements', async (): Promise<void> => {
    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: '<script data-raw-html="1">unsafe</script>'
      }
    });

    await nextTick();

    expect(wrapper.find('[data-raw-html="1"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('<script data-raw-html="1">unsafe</script>');
  });

  it('renders extended markdown and safe inline html tags', async (): Promise<void> => {
    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: 'Use ==highlight==, X^2^, H~2~O, <u>under</u>, <kbd>Ctrl</kbd>, <abbr title="HyperText Markup Language">HTML</abbr>.'
      }
    });

    await nextTick();

    expect(wrapper.find('mark').text()).toBe('highlight');
    expect(wrapper.find('sup').text()).toBe('2');
    expect(wrapper.find('sub').text()).toBe('2');
    expect(wrapper.find('u').text()).toBe('under');
    expect(wrapper.find('kbd').text()).toBe('Ctrl');
    expect(wrapper.find('abbr').attributes('title')).toBe('HyperText Markup Language');
  });

  it('renders inline formatting inside list items', async (): Promise<void> => {
    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: '- **粗体**\n- *斜体*\n- ~~删除线~~\n- ==高亮==\n- `行内代码`\n- X^2^ and H~2~O'
      }
    });

    await nextTick();

    expect(wrapper.find('li strong').text()).toBe('粗体');
    expect(wrapper.find('li em').text()).toBe('斜体');
    expect(wrapper.find('li del').text()).toBe('删除线');
    expect(wrapper.find('li mark').text()).toBe('高亮');
    expect(wrapper.find('li code').text()).toBe('行内代码');
    expect(wrapper.find('li sup').text()).toBe('2');
    expect(wrapper.find('li sub').text()).toBe('2');
  });

  it('renders unordered and ordered list elements', async (): Promise<void> => {
    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: '- 项目一\n- 项目二\n\n1. 第一项\n2. 第二项'
      }
    });

    await nextTick();

    expect(wrapper.find('ul').exists()).toBe(true);
    expect(wrapper.find('ol').exists()).toBe(true);
    expect(wrapper.findAll('ul > li')).toHaveLength(2);
    expect(wrapper.findAll('ol > li')).toHaveLength(2);
    expect(wrapper.find('ul > li').text()).toContain('项目一');
    expect(wrapper.find('ol > li').text()).toContain('第一项');
  });

  it('renders mixed nested list elements', async (): Promise<void> => {
    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: '1. 第一步\n   - 注意事项 A\n   - 注意事项 B\n2. 第二步\n   - 注意事项 C\n     1. 子步骤 i\n     2. 子步骤 ii'
      }
    });

    await nextTick();

    const topOrderedItems = Array.from(wrapper.find('ol').element.children).filter((element) => element.tagName === 'LI');

    expect(wrapper.find('ol').exists()).toBe(true);
    expect(wrapper.find('ol ul').exists()).toBe(true);
    expect(wrapper.find('ol ul ol').exists()).toBe(true);
    expect(topOrderedItems).toHaveLength(2);
    expect(wrapper.findAll('ol ul > li').length).toBeGreaterThanOrEqual(3);
    expect(wrapper.find('ol ul ol > li').text()).toContain('子步骤 i');
  });

  it('renders task list checkboxes including nested task items', async (): Promise<void> => {
    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: '- [x] 已完成任务\n- [ ] 未完成任务\n  - [x] 嵌套已完成\n  - [ ] 嵌套未完成'
      }
    });

    await nextTick();

    const checkboxes = wrapper.findAll('li > input[type="checkbox"]');

    expect(checkboxes).toHaveLength(4);
    expect((checkboxes[0].element as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1].element as HTMLInputElement).checked).toBe(false);
    expect((checkboxes[2].element as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[3].element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.text()).not.toContain('[x]');
    expect(wrapper.text()).not.toContain('[ ]');
  });

  it('decodes markdown html entities when rendering text nodes', async (): Promise<void> => {
    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: 'Fish &amp; chips &lt;ok&gt; &#x26; more'
      }
    });

    await nextTick();

    expect(wrapper.text()).toContain('Fish & chips <ok> & more');
    expect(wrapper.text()).not.toContain('&amp;');
  });

  it('preserves plain text whitespace through the node path', async (): Promise<void> => {
    const wrapper = mount(BMessage, {
      props: {
        type: 'text',
        content: '**not bold**\n  indented',
        loading: true
      }
    });

    await waitAnimationFrame();

    expect(wrapper.findComponent({ name: 'BlockNode' }).exists()).toBe(true);
    expect(wrapper.find('strong').exists()).toBe(false);
    expect(wrapper.find('.b-message__text').text()).toContain('**not bold**');
    expect(wrapper.find('.b-message__cursor').exists()).toBe(true);
  });

  it('routes link clicks through injected navigation', async (): Promise<void> => {
    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: '[Open](https://example.com)'
      }
    });

    await nextTick();

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    wrapper.find('a').element.dispatchEvent(clickEvent);

    expect(navigateLinkMock).toHaveBeenCalledWith(clickEvent);
  });
});
