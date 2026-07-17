/**
 * @file bubble-part-user-input.test.ts
 * @description 用户输入气泡 content 展示测试。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BubblePartUserInput from '@/components/BChat/components/MessageBubble/BubblePartUserInput/index.vue';

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
        part: { id: 'text-file-range', type: 'text', text: 'fix {{@src/foo.ts#L10-20}} please' }
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
        part: { id: 'text-file', type: 'text', text: 'read {{@package.json}}' }
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

  it('renders unencoded file references with spaces as chips', (): void => {
    const wrapper = mount(BubblePartUserInput, {
      props: {
        part: {
          id: 'text-file-spaces',
          type: 'text',
          text: 'read {{@/Users/zhangbin/Desktop/Markdown 语法全量渲染测试.md}}'
        }
      },
      global: {
        stubs: {
          BRecentIcon: BRecentIconStub
        }
      }
    });

    const icon = wrapper.find('.b-recent-icon-stub');

    expect(wrapper.text()).toContain('Markdown 语法全量渲染测试.md');
    expect(icon.attributes('data-file-name')).toBe('Markdown 语法全量渲染测试.md');
  });

  it('renders skill tokens with the shared iconless reference style', (): void => {
    const wrapper = mount(BubblePartUserInput, {
      props: {
        part: { id: 'text-skill-reference', type: 'text', text: '使用 {{$天气}} 查询上海' }
      }
    });

    expect(wrapper.find('.b-skill-reference').exists()).toBe(true);
    expect(wrapper.find('.b-skill-reference__icon').exists()).toBe(false);
    expect(wrapper.find('.b-skill-reference__name').text()).toBe('天气');
    expect(wrapper.text()).toBe('使用 天气 查询上海');
    expect(wrapper.text()).not.toContain('$');
  });
});
