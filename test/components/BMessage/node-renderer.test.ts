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

  it('renders raw html as text rather than injected elements', async (): Promise<void> => {
    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: '<span data-raw-html="1">unsafe</span>'
      }
    });

    await nextTick();

    expect(wrapper.find('[data-raw-html="1"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('<span data-raw-html="1">unsafe</span>');
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
