/**
 * @file bubble-part-user-input.test.ts
 * @description 用户输入气泡 content 展示测试。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BubblePartUserInput from '@/components/BChat/components/MessageBubble/BubblePartUserInput.vue';

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: vi.fn(() => ({
    openFile: vi.fn()
  }))
}));

/** 最近记录图标测试替身，保留文件名与尺寸用于断言。 */
const BRecentIconStub = defineComponent({
  name: 'BRecentIcon',
  props: {
    fileName: {
      type: String,
      default: ''
    },
    size: {
      type: [Number, String],
      default: ''
    }
  },
  template: '<i class="b-recent-icon-stub" :data-file-name="fileName" :data-size="size"></i>'
});

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

  it('renders file reference chips with the shared recent icon component', (): void => {
    const wrapper = mount(BubblePartUserInput, {
      props: {
        part: {
          type: 'text',
          text: 'read {{#package.json}}'
        }
      },
      global: {
        stubs: {
          BRecentIcon: BRecentIconStub
        }
      }
    });

    const icon = wrapper.find('.b-recent-icon-stub');

    expect(icon.attributes('data-file-name')).toBe('package.json');
    expect(icon.attributes('data-size')).toBe('14');
  });
});
