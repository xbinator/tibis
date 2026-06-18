<!--
  @file CodeBlockNode.vue
  @description BMessage Markdown 代码块渲染组件，支持语法高亮与复制。
-->
<template>
  <div :class="bem('code-block')">
    <div :class="bem('code-header')">
      <span :class="bem('code-language')">{{ displayLanguage }}</span>
      <button type="button" :class="bem('code-copy')" title="复制代码" aria-label="复制代码" @click="handleCopyClick">
        <BIcon icon="lucide:copy" :size="14" />
      </button>
    </div>
    <div v-if="isMermaidPreviewVisible" :class="bem('mermaid-preview')">
      <div v-if="mermaidError" :class="bem('mermaid-error')">
        <BIcon icon="lucide:alert-circle" />
        <span>{{ mermaidError }}</span>
      </div>
      <div v-else ref="mermaidPreviewRef" :class="bem('mermaid-diagram')"></div>
    </div>
    <pre v-else :class="bem('code-pre')"><code :class="[bem('code-content'), codeClassName]"><CodeHighlightNode
      v-for="(child, index) in highlightedNodes"
      :key="index"
      :node="child"
    /></code></pre>
  </div>
</template>

<script setup lang="ts">
/* eslint-disable no-use-before-define -- 代码高亮节点是递归结构，类型与组件渲染存在自然递归。 */
import type { CodeBlockNode as MessageCodeBlockNode } from '../types';
import type { PropType, VNodeChild } from 'vue';
import { computed, defineComponent, h, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { common, createLowlight } from 'lowlight';
import { useClipboard } from '@/hooks/useClipboard';
import { createNamespace } from '@/utils/namespace';
import { createMessageMermaidRenderId } from '../utils';

defineOptions({ name: 'CodeBlockNode' });

const [, bem] = createNamespace('message');
const lowlight = createLowlight(common);
let mermaidInitialized = false;
let mermaidCurrentTheme = '';
let mermaidModule: typeof import('mermaid').default | null = null;

/**
 * Lowlight 文本节点。
 */
interface LowlightTextNode {
  /** 节点类型 */
  type: 'text';
  /** 文本内容 */
  value: string;
}

/**
 * Lowlight 元素节点。
 */
interface LowlightElementNode {
  /** 节点类型 */
  type: 'element' | 'root';
  /** 子节点 */
  children?: LowlightNode[];
  /** 节点属性 */
  properties?: {
    /** CSS 类名 */
    className?: string[] | string;
  };
}

/**
 * Lowlight 节点。
 */
type LowlightNode = LowlightElementNode | LowlightTextNode;

/**
 * 代码高亮文本渲染节点。
 */
interface CodeHighlightTextNode {
  /** 节点类型 */
  type: 'text';
  /** 文本内容 */
  value: string;
}

/**
 * 代码高亮元素渲染节点。
 */
interface CodeHighlightElementNode {
  /** 节点类型 */
  type: 'element';
  /** 安全 CSS 类名 */
  className: string;
  /** 子节点 */
  children: CodeHighlightRenderNode[];
}

/**
 * 代码高亮渲染节点。
 */
type CodeHighlightRenderNode = CodeHighlightElementNode | CodeHighlightTextNode;

/**
 * CodeBlockNode 组件属性。
 */
interface Props {
  /** 待渲染的代码块节点 */
  node: MessageCodeBlockNode;
}

const props = defineProps<Props>();
const { clipboard } = useClipboard();
const mermaidPreviewRef = ref<HTMLElement | null>(null);
const mermaidError = ref<string | null>(null);
let mermaidRenderIndex = 0;

/**
 * Markdown 代码围栏语言别名。
 */
const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  bash: 'shell',
  cjs: 'javascript',
  htm: 'xml',
  html: 'xml',
  js: 'javascript',
  jsx: 'javascript',
  md: 'markdown',
  plaintext: 'plaintext',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'shell',
  shellscript: 'shell',
  text: 'plaintext',
  ts: 'typescript',
  tsx: 'typescript',
  vue: 'xml',
  yml: 'yaml'
};

/**
 * 代码高亮节点递归渲染组件。
 */
const CodeHighlightNode = defineComponent({
  name: 'CodeHighlightNode',
  props: {
    node: {
      type: Object as PropType<CodeHighlightRenderNode>,
      required: true
    }
  },
  setup(componentProps): () => VNodeChild {
    return () => {
      if (componentProps.node.type === 'text') {
        return componentProps.node.value;
      }

      return h(
        'span',
        { class: componentProps.node.className || undefined },
        componentProps.node.children.map((child: CodeHighlightRenderNode) => h(CodeHighlightNode, { node: child }))
      );
    };
  }
});

const rawLanguage = computed(() => props.node.lang?.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? '');
const displayLanguage = computed(() => formatDisplayLanguage(rawLanguage.value || 'text'));
const highlightLanguage = computed(() => {
  const language = LANGUAGE_ALIASES[rawLanguage.value] ?? rawLanguage.value;
  return language && lowlight.registered(language) ? language : '';
});
const codeClassName = computed(() => (rawLanguage.value ? `language-${rawLanguage.value}` : undefined));
const isMermaidLanguage = computed(() => rawLanguage.value === 'mermaid');
const hasCode = computed(() => props.node.text.trim().length > 0);
const isMermaidPreviewVisible = computed(() => isMermaidLanguage.value && hasCode.value && props.node.complete);
const highlightedNodes = computed<CodeHighlightRenderNode[]>(() => {
  if (!highlightLanguage.value) {
    return textToHighlightNodes(props.node.text);
  }

  try {
    const tree = lowlight.highlight(highlightLanguage.value, props.node.text) as LowlightNode;
    return lowlightNodeToHighlightNodes(tree);
  } catch {
    return textToHighlightNodes(props.node.text);
  }
});

/**
 * 初始化 Mermaid 渲染实例。
 * @returns Mermaid 默认导出实例
 */
async function initMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidModule) {
    const module = await import('mermaid');
    mermaidModule = module.default;
  }

  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
  const theme = isDark ? 'dark' : 'default';

  if (mermaidInitialized && mermaidCurrentTheme === theme) {
    return mermaidModule;
  }

  mermaidModule.initialize({
    startOnLoad: false,
    theme,
    securityLevel: 'loose',
    fontFamily: 'inherit',
    suppressErrorRendering: true
  });

  mermaidInitialized = true;
  mermaidCurrentTheme = theme;

  return mermaidModule;
}

/**
 * 渲染 Mermaid 图表。
 */
async function renderMermaid(): Promise<void> {
  if (!isMermaidPreviewVisible.value) return;

  const renderIndex = ++mermaidRenderIndex;
  const code = props.node.text.trim();

  mermaidError.value = null;
  await nextTick();

  if (!mermaidPreviewRef.value || renderIndex !== mermaidRenderIndex || !isMermaidPreviewVisible.value) return;

  try {
    const mermaid = await initMermaid();
    const { svg } = await mermaid.render(createMessageMermaidRenderId(), code);

    if (!mermaidPreviewRef.value || renderIndex !== mermaidRenderIndex) return;

    mermaidPreviewRef.value.innerHTML = svg;
  } catch (error: unknown) {
    if (renderIndex !== mermaidRenderIndex) return;

    mermaidError.value = error instanceof Error ? error.message : '渲染失败';

    if (mermaidPreviewRef.value) {
      mermaidPreviewRef.value.innerHTML = '';
    }
  }
}

/**
 * 将纯文本转为代码高亮文本节点。
 * @param text - 代码文本
 * @returns 高亮渲染节点列表
 */
function textToHighlightNodes(text: string): CodeHighlightRenderNode[] {
  return text ? [{ type: 'text', value: text }] : [];
}

/**
 * 格式化代码块语言展示名称。
 * @param language - 代码块语言
 * @returns 首字母大写后的展示名称
 */
function formatDisplayLanguage(language: string): string {
  return language.charAt(0).toUpperCase() + language.slice(1);
}

/**
 * 读取 Lowlight 元素节点的安全类名。
 * @param node - Lowlight 元素节点
 * @returns 安全类名
 */
function getSafeClassName(node: LowlightElementNode): string {
  const rawClassName = node.properties?.className;
  const classNames = Array.isArray(rawClassName) ? rawClassName : rawClassName?.split(/\s+/) ?? [];

  return classNames.filter((className: string) => className.startsWith('hljs-')).join(' ');
}

/**
 * 将 Lowlight 节点转为可控的 Vue 渲染节点。
 * @param node - Lowlight 节点
 * @returns 高亮渲染节点列表
 */
function lowlightNodeToHighlightNodes(node: LowlightNode): CodeHighlightRenderNode[] {
  if (node.type === 'text') {
    return textToHighlightNodes(node.value);
  }

  const children = node.children?.flatMap((child: LowlightNode) => lowlightNodeToHighlightNodes(child)) ?? [];

  if (node.type === 'root') {
    return children;
  }

  return [
    {
      type: 'element',
      className: getSafeClassName(node),
      children
    }
  ];
}

/**
 * 复制代码块原始文本。
 */
async function handleCopyClick(): Promise<void> {
  await clipboard(props.node.text, {
    successMessage: '代码已复制',
    trim: false
  });
}

watch(
  () => [isMermaidPreviewVisible.value, props.node.text] as const,
  () => {
    renderMermaid();
  }
);

onMounted(() => {
  renderMermaid();
});

onUnmounted(() => {
  mermaidRenderIndex += 1;
});
</script>

<style scoped lang="less">
@import url('@/assets/styles/markdown.less');

.b-message__code-block {
  margin: 0.6em 0;
  overflow: hidden;
  background: var(--bg-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
}

.b-message__code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 6px 8px 6px 12px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-secondary);
}

.b-message__code-language {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1;
}

.b-message__code-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  color: var(--code-text);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.b-message__code-copy:hover,
.b-message__code-copy:focus-visible {
  color: var(--code-text);
  background: var(--code-line-bg);
}

.b-message__code-pre {
  padding: 0;
  margin: 0;
  overflow: auto;
  background: transparent;
  border: 0;
  border-radius: 0;
}

.b-message__code-content {
  display: block;
  padding: 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.65;
  white-space: pre;
  background: transparent;
  border-radius: 0;
  .code-highlight();
}

.b-message__mermaid-preview {
  padding: 20px;
  overflow: auto;
  background: var(--bg-primary);
}

.b-message__mermaid-diagram {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100px;
}

.b-message__mermaid-diagram :deep(svg) {
  max-width: 100%;
  height: auto;
}

.b-message__mermaid-error {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 100px;
  font-size: 14px;
  color: var(--color-error);
  text-align: center;
}
</style>
