/**
 * @file current-block-menu.test.ts
 * @description BEditor Rich 当前块菜单元数据入口测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file -- 测试需要内联 BScrollbar 与 BIcon 桩组件。 */
import { defineComponent, nextTick } from 'vue';
import StarterKit from '@tiptap/starter-kit';
import { Editor } from '@tiptap/vue-3';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import CurrentBlockMenu from '@/components/BEditor/components/CurrentBlockMenu.vue';

/**
 * 当前块菜单测试挂载结果。
 */
interface CurrentBlockMenuMountResult {
  /** Tiptap 编辑器容器 */
  editorElement: HTMLElement;
  /** Tiptap 编辑器实例 */
  editor: Editor;
  /** 元数据添加回调 */
  onAddFrontMatter: Mock;
  /** Vue Test Utils 包装器 */
  wrapper: VueWrapper;
}

const wrappers: VueWrapper[] = [];
const editors: Editor[] = [];
const editorElements: HTMLElement[] = [];

/**
 * 创建 BScrollbar 测试替身。
 */
const BScrollbarStub = defineComponent({
  name: 'BScrollbar',
  template: '<div><slot /></div>'
});

/**
 * 创建 BIcon 测试替身。
 */
const BIconStub = defineComponent({
  name: 'BIcon',
  props: {
    icon: {
      type: String,
      default: ''
    }
  },
  template: '<span class="b-icon-stub">{{ icon }}</span>'
});

/**
 * 挂载当前块菜单。
 * @param hasFrontMatter - 当前文档是否已有元数据
 * @returns 当前块菜单测试挂载结果
 */
function mountCurrentBlockMenu(hasFrontMatter: boolean): CurrentBlockMenuMountResult {
  const editorElement = document.createElement('div');
  document.body.appendChild(editorElement);

  const editor = new Editor({
    element: editorElement,
    extensions: [StarterKit],
    content: '<p>正文</p>'
  });
  const onAddFrontMatter = vi.fn();
  const wrapper = mount(CurrentBlockMenu, {
    attachTo: document.body,
    props: {
      editor,
      hasFrontMatter,
      onAddFrontMatter
    },
    global: {
      stubs: {
        BIcon: BIconStub,
        BScrollbar: BScrollbarStub
      }
    }
  });

  wrappers.push(wrapper);
  editors.push(editor);
  editorElements.push(editorElement);

  return { editorElement, editor, onAddFrontMatter, wrapper };
}

/**
 * 打开当前块菜单。
 * @param wrapper - Vue Test Utils 包装器
 * @param editor - Tiptap 编辑器实例
 */
async function openCurrentBlockMenu(wrapper: VueWrapper, editor: Editor): Promise<void> {
  const paragraph = editor.view.dom.querySelector('p');
  if (!(paragraph instanceof HTMLElement)) {
    throw new Error('未找到段落节点');
  }

  paragraph.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 80, clientY: 20 }));
  await nextTick();
  await wrapper.find('.b-markdown-blockmenu__trigger').trigger('mousedown');
  await nextTick();
}

afterEach((): void => {
  wrappers.splice(0).forEach((wrapper: VueWrapper): void => wrapper.unmount());
  editors.splice(0).forEach((editor: Editor): void => editor.destroy());
  editorElements.splice(0).forEach((element: HTMLElement): void => element.remove());
});

describe('CurrentBlockMenu', (): void => {
  it('shows an add metadata action when the document has no front matter', async (): Promise<void> => {
    const { editor, onAddFrontMatter, wrapper } = mountCurrentBlockMenu(false);

    await openCurrentBlockMenu(wrapper, editor);

    const addMetadataItem = wrapper.findAll('.b-markdown-blockmenu__item').find((item) => item.text().includes('添加元数据'));
    expect(addMetadataItem).toBeTruthy();

    await addMetadataItem?.trigger('mousedown');

    expect(onAddFrontMatter).toHaveBeenCalledTimes(1);
  });

  it('hides the add metadata action after front matter exists', async (): Promise<void> => {
    const { editor, wrapper } = mountCurrentBlockMenu(true);

    await openCurrentBlockMenu(wrapper, editor);

    expect(wrapper.text()).not.toContain('添加元数据');
  });
});
