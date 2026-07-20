/**
 * @file file-mention-select.test.ts
 * @description 验证文件提及菜单复用统一最近记录图标组件。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import FileMentionSelect from '@/components/BSmart/components/FileMentionSelect.vue';
import type { FileMentionOption } from '@/components/BSmart/types';

/** 最近记录图标测试替身，暴露 fileName 便于断言。 */
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

/**
 * 创建文件提及选项。
 * @param overrides - 需要覆盖的字段
 * @returns 文件提及选项
 */
function createFileMention(overrides: Partial<FileMentionOption> = {}): FileMentionOption {
  return {
    id: 'file-1',
    name: 'package.json',
    path: '/tmp/package.json',
    ext: 'json',
    ...overrides
  };
}

/**
 * 挂载文件提及菜单。
 * @param files - 文件提及选项
 * @returns Vue Test Utils 包装器
 */
function mountFileMentionSelect(files: FileMentionOption[]): VueWrapper {
  return mount(FileMentionSelect, {
    props: {
      visible: true,
      files
    },
    global: {
      stubs: {
        BRecentIcon: BRecentIconStub
      }
    }
  });
}

describe('FileMentionSelect', (): void => {
  it('passes the full file name to BRecentIcon', (): void => {
    const wrapper = mountFileMentionSelect([createFileMention()]);

    expect(wrapper.find('.b-recent-icon-stub').attributes('data-file-name')).toBe('package.json');
    expect(wrapper.find('.b-recent-icon-stub').attributes('data-size')).toBe('18');
  });
});
