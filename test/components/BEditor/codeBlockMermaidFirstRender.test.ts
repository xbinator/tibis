/* @vitest-environment jsdom */
/**
 * @file codeBlockMermaidFirstRender.test.ts
 * @description 验证 CodeBlock Mermaid 首次渲染行为。
 * 核心测试场景：
 * 1. 正常首次挂载 — mermaid.render 被调用且 SVG 写入预览容器
 * 2. 切换预览 — 关闭后重新打开应触发渲染
 * 3. BSuspense 延迟挂载 — 模拟真实浏览器中 ref 延迟就绪的场景（核心 bug 复现）
 */
import type { VueWrapper } from '@vue/test-utils';
import type { ComponentPublicInstance } from 'vue';
import { h, ref, watch } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import PaneRichEditor from '@/components/BEditor/panes/PaneRichEditor.vue';

// ─── Mock ────────────────────────────────────────────────────────────────────

/** 记录 mermaid.render 调用情况，包括调用时容器 ref 的状态 */
const renderCalls: Array<{
  id: string;
  code: string;
  diagramExists: boolean;
  diagramInnerHTML: string;
}> = [];

const MOCK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300"><rect/></svg>';

/**
 * 模拟 mermaid v11 真实 render() 行为：
 * 1. 在 document.body 创建临时 <div>（id 为传入的 id）
 * 2. 将 SVG 渲染到临时元素
 * 3. 从临时元素获取 SVG
 * 4. 移除临时元素
 * 5. 返回 { svg }
 */
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string, code: string) => {
      // 检查当前 .b-markdown-codeblock__mermaid-diagram 的状态
      const diagram = document.querySelector('.b-markdown-codeblock__mermaid-diagram');
      renderCalls.push({
        id,
        code,
        diagramExists: !!diagram,
        diagramInnerHTML: diagram?.innerHTML ?? '(not found)'
      });

      // 模拟 mermaid v11：在 body 创建临时元素
      const temp = document.createElement('div');
      temp.id = id;
      temp.style.position = 'absolute';
      temp.style.left = '-9999px';
      document.body.appendChild(temp);
      temp.innerHTML = MOCK_SVG;

      // 模拟异步渲染延迟
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });

      const svg = temp.innerHTML;
      document.body.removeChild(temp);

      return { svg };
    })
  }
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock('@/stores/files', () => ({
  useFilesStore: () => ({ openFile: vi.fn() })
}));

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: () => ({ onLink: vi.fn() })
}));

vi.mock('localforage', () => ({
  default: {
    config: vi.fn(),
    createInstance: vi.fn(() => ({
      getItem: vi.fn(() => Promise.resolve(null)),
      setItem: vi.fn(() => Promise.resolve()),
      removeItem: vi.fn(() => Promise.resolve()),
      clear: vi.fn(() => Promise.resolve())
    })),
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve())
  }
}));

// ─── 辅助 ────────────────────────────────────────────────────────────────────

type PaneVm = ComponentPublicInstance;

const MERMAID_CODE = `graph TD
    A[用户发送消息] --> B[prompt.ts]
    B --> C[SessionTools.resolve]`;

const MERMAID_MARKDOWN = ['```mermaid', MERMAID_CODE, '```'].join('\n');

/** 等待异步操作排空（微任务 + 宏任务） */
async function flushAsync(ms = 0): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** 挂载富文本编辑器面板 */
function mountPane(value: string, extraStubs?: Record<string, unknown>): VueWrapper<PaneVm> {
  return mount(PaneRichEditor, {
    attachTo: document.body,
    props: {
      value,
      outlineContent: '',
      editable: true,
      editorState: {
        id: 'mermaid-first-render-test',
        name: 'mermaid-first-render-test.md',
        content: value,
        ext: 'md',
        path: null
      }
    },
    global: {
      plugins: [createPinia()],
      stubs: {
        CurrentBlockMenu: true,
        FrontMatterCard: true,
        SelectionAIInput: true,
        SelectionToolbarRich: true,
        ASelect: true,
        ...extraStubs
      }
    }
  });
}

/**
 * 创建延迟挂载的 BSuspense stub。
 * 模拟真实浏览器中 v-if 条件为 true 但 DOM 延迟挂载的场景：
 * 首次渲染时不渲染 slot 内容，延迟 mountDelayMs 后才渲染。
 */
function createDelayedBSuspenseStub(mountDelayMs: number) {
  return {
    name: 'BSuspense',
    props: { active: { type: Boolean, default: false } },
    setup(props: { active: boolean }, { slots }: { slots: Record<string, () => unknown> }) {
      const hasBeenActive = ref(false);

      // 延迟设置 hasBeenActive，模拟真实浏览器中 DOM 延迟挂载
      watch(
        () => props.active,
        (val) => {
          if (val && !hasBeenActive.value) {
            setTimeout(() => {
              hasBeenActive.value = true;
            }, mountDelayMs);
          }
        },
        { immediate: true }
      );

      return () => {
        if (!hasBeenActive.value) return null;
        return h('div', { style: props.active ? undefined : 'display: none;' }, slots.default?.());
      };
    }
  };
}

// ─── 测试 ────────────────────────────────────────────────────────────────────

describe('CodeBlock Mermaid 首次渲染', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    renderCalls.length = 0;
  });

  test('首次挂载时 mermaid.render 应被调用', async () => {
    const wrapper = mountPane(MERMAID_MARKDOWN);
    await flushAsync(50);

    expect(renderCalls.length).toBeGreaterThanOrEqual(1);
    expect(renderCalls[0].code).toBe(MERMAID_CODE);

    wrapper.unmount();
  });

  test('首次挂载时 mermaid.render 调用时预览容器应已存在', async () => {
    const wrapper = mountPane(MERMAID_MARKDOWN);
    await flushAsync(50);

    expect(renderCalls.length).toBeGreaterThanOrEqual(1);
    expect(renderCalls[0].diagramExists).toBe(true);

    wrapper.unmount();
  });

  test('首次挂载后 SVG 应写入预览容器', async () => {
    const wrapper = mountPane(MERMAID_MARKDOWN);
    await flushAsync(50);

    const diagram = wrapper.find('.b-markdown-codeblock__mermaid-diagram');
    expect(diagram.exists()).toBe(true);
    expect(diagram.element.innerHTML).toContain('svg');

    wrapper.unmount();
  });

  test('关闭预览再重新打开应触发渲染', async () => {
    const wrapper = mountPane(MERMAID_MARKDOWN);
    await flushAsync(50);

    expect(renderCalls.length).toBeGreaterThanOrEqual(1);
    renderCalls.length = 0;

    // 第一次点击：关闭预览（activePreview: 'mermaid' → null）
    const previewBtn = wrapper.find('.b-markdown-codeblock__control-btn');
    expect(previewBtn.exists()).toBe(true);
    await previewBtn.trigger('click');
    await flushAsync(50);

    // 关闭预览不应触发新的 render
    expect(renderCalls.length).toBe(0);

    // 第二次点击：重新打开预览（activePreview: null → 'mermaid'）
    await previewBtn.trigger('click');
    await flushAsync(50);

    // 重新打开预览应触发 render
    expect(renderCalls.length).toBeGreaterThanOrEqual(1);
    expect(renderCalls[0].code).toBe(MERMAID_CODE);

    wrapper.unmount();
  });
});

describe('CodeBlock Mermaid 首次渲染 — BSuspense 延迟挂载', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    renderCalls.length = 0;
  });

  /**
   * 核心测试：模拟真实浏览器中 BSuspense 延迟挂载 mermaidPreviewRef 的场景。
   * 当 onMounted 触发 renderMermaid() 时，mermaidPreviewRef 可能为 null，
   * 当前代码直接 return 导致首次渲染被跳过。
   * 修复后应能自动重试，最终成功渲染。
   */
  test('BSuspense 延迟挂载时，Mermaid 应最终成功渲染', async () => {
    // 使用延迟 50ms 的 BSuspense stub
    const delayedStub = createDelayedBSuspenseStub(50);
    const wrapper = mountPane(MERMAID_MARKDOWN, { BSuspense: delayedStub });
    await flushAsync(200);

    // 关键断言：即使 ref 延迟挂载，最终 SVG 也应写入预览容器
    const diagram = wrapper.find('.b-markdown-codeblock__mermaid-diagram');
    expect(diagram.exists()).toBe(true);
    expect(diagram.element.innerHTML).toContain('svg');

    wrapper.unmount();
  });

  test('BSuspense 延迟挂载时，mermaid.render 最终应被成功调用', async () => {
    const delayedStub = createDelayedBSuspenseStub(50);
    const wrapper = mountPane(MERMAID_MARKDOWN, { BSuspense: delayedStub });
    await flushAsync(200);

    // render 应最终被调用（可能首次因 ref 为 null 被跳过，但后续应重试成功）
    expect(renderCalls.length).toBeGreaterThanOrEqual(1);
    expect(renderCalls[renderCalls.length - 1].code).toBe(MERMAID_CODE);

    wrapper.unmount();
  });
});
