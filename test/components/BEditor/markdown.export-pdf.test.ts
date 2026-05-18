/**
 * @file markdown.export-pdf.test.ts
 * @description Markdown 编辑器 PDF 导出测试，验证富文本与源码模式会导出不同内容。
 */
/* @vitest-environment jsdom */

import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectronExportPdfOptions } from 'types/electron-api';
import Markdown from '@/components/BEditor/Markdown.vue';
import { PDF_FILE_FILTER } from '@/constants/extensions';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';

const storage = new Map<string, string>();
const { exportPdfMock } = vi.hoisted(() => ({
  exportPdfMock: vi.fn<(options: ElectronExportPdfOptions) => Promise<string | null>>()
}));

vi.mock('@/shared/platform', () => ({
  native: {
    updateMenuItem: vi.fn(),
    exportPdf: exportPdfMock
  }
}));

vi.stubGlobal('localStorage', {
  getItem(key: string): string | null {
    return storage.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    storage.set(key, value);
  },
  removeItem(key: string): void {
    storage.delete(key);
  },
  clear(): void {
    storage.clear();
  }
});

/**
 * 快捷操作桩组件。
 * 用按钮主动触发 export-pdf 事件，模拟用户点击菜单动作。
 */
const QuickActionsStub = defineComponent({
  name: 'QuickActions',
  emits: ['export-pdf'],
  template: '<button type="button" class="quick-actions-export" @click="$emit(\'export-pdf\')">导出 PDF</button>'
});

/**
 * 富文本编辑器桩组件。
 * 渲染稳定的 HTML 片段，便于验证导出结果是否包含富文本内容。
 */
const PaneRichEditorStub = defineComponent({
  name: 'PaneRichEditor',
  template: `
    <div class="pane-rich-editor-stub">
      <div class="b-markdown-rich__content">
        <h1>Rich Title</h1>
        <p><strong>Rich Body</strong></p>
      </div>
    </div>
  `
});

/**
 * 源码编辑器桩组件。
 */
const PaneSourceEditorStub = defineComponent({
  name: 'PaneSourceEditor',
  template: '<div class="pane-source-editor-stub"></div>'
});

/**
 * 挂载 Markdown 组件。
 * @returns 组件挂载结果
 */
function mountMarkdown(): VueWrapper<InstanceType<typeof Markdown>> {
  return mount(Markdown, {
    props: {
      editorState: {
        id: 'doc-1',
        name: 'Doc',
        content: '# Title\n\n<script>alert(1)</script>',
        ext: 'md',
        path: '/tmp/doc.md'
      },
      content: '# Title\n\n<script>alert(1)</script>',
      editable: true,
      'onUpdate:content': () => {
        // noop
      },
      'onUpdate:outlineContent': () => {
        // noop
      }
    },
    global: {
      stubs: {
        BScrollbar: {
          name: 'BScrollbar',
          template: '<div class="scrollbar-stub"><slot /></div>'
        },
        Sidebar: true,
        QuickActions: QuickActionsStub,
        FindBar: true,
        SelectionAIInput: true,
        SelectionToolbarRich: true,
        SelectionToolbarSource: true,
        PaneRichEditor: PaneRichEditorStub,
        PaneSourceEditor: PaneSourceEditorStub
      }
    }
  });
}

describe('Markdown export pdf', () => {
  beforeEach(() => {
    storage.clear();
    exportPdfMock.mockReset();
    exportPdfMock.mockResolvedValue('/tmp/doc.pdf');
    document.head.innerHTML = '';
    setActivePinia(createPinia());
  });

  it('exports rendered rich content when current mode is rich', async () => {
    const editorPreferencesStore = useEditorPreferencesStore();
    editorPreferencesStore.setViewMode('rich');

    const styleElement = document.createElement('style');
    styleElement.textContent = `
      .b-markdown-rich__content { padding: 20px 40px 90px; line-height: 1.74; }
      .b-markdown-rich__content h1 { font-size: 24px; color: rgb(31, 35, 41); }
    `;
    document.head.appendChild(styleElement);

    const wrapper = mountMarkdown();
    await wrapper.get('.quick-actions-export').trigger('click');
    await flushPromises();

    expect(exportPdfMock).toHaveBeenCalledTimes(1);
    expect(exportPdfMock).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: '/tmp/doc.pdf',
        filters: [PDF_FILE_FILTER]
      })
    );
    expect(exportPdfMock.mock.calls[0]?.[0].html).toContain('Rich Title');
    expect(exportPdfMock.mock.calls[0]?.[0].html).toContain('<strong');
    expect(exportPdfMock.mock.calls[0]?.[0].html).toContain('b-markdown-rich__content');
    expect(exportPdfMock.mock.calls[0]?.[0].html).toContain('style=');
    expect(exportPdfMock.mock.calls[0]?.[0].html).toContain('font-size: 24px;');
    expect(exportPdfMock.mock.calls[0]?.[0].html).toContain('padding: 20px 40px 90px;');
  });

  it('exports escaped source text when current mode is source', async () => {
    const editorPreferencesStore = useEditorPreferencesStore();
    editorPreferencesStore.setViewMode('source');

    const wrapper = mountMarkdown();
    await wrapper.get('.quick-actions-export').trigger('click');
    await flushPromises();

    expect(exportPdfMock).toHaveBeenCalledTimes(1);
    expect(exportPdfMock.mock.calls[0]?.[0].html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(exportPdfMock.mock.calls[0]?.[0].html).toContain('b-markdown-export__source');
  });
});
