/**
 * @file bubble-part-user-input.test.ts
 * @description 用户输入气泡 content 展示测试。
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BubblePartUserInput from '@/components/BChat/components/MessageBubble/BubblePartUserInput.vue';

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: vi.fn(() => ({
    openFile: vi.fn()
  }))
}));

describe('BubblePartUserInput', (): void => {
  it('renders content text and file reference chips from the original user input', (): void => {
    const wrapper = mount(BubblePartUserInput, {
      props: {
        part: {
          type: 'text',
          text: 'fix {{#src/foo.ts 10-20}} please'
        }
      }
    });

    expect(wrapper.text()).toContain('fix');
    expect(wrapper.text()).toContain('foo.ts');
    expect(wrapper.text()).toContain('10-20');
    expect(wrapper.text()).toContain('please');
  });
});
