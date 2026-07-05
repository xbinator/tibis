<!--
  @file PageSetter.vue
  @description Widget页面默认Widget设置面板，承载基础属性与运行脚本配置。
-->
<template>
  <ATabs class="page-setter">
    <ATabPane key="basic" tab="属性">
      <BSectionBlock title="基础">
        <BSectionItem label="名称" label-min-width="60">
          <AInput v-model:value="widgetName" placeholder="组件名称" />
        </BSectionItem>
        <BSectionItem label="使用说明" direction="vertical">
          <ATextarea
            v-model:value="widgetDescription"
            :auto-size="{ minRows: 3, maxRows: 6 }"
            placeholder="描述这个小组件能做什么、适合什么场景，帮助 AI 判断何时展示"
          />
        </BSectionItem>
      </BSectionBlock>

      <BSectionBlock title="运行脚本">
        <template #extra>
          <BButton icon="lucide:code-xml" size="mini" type="secondary" @click="emitEditCode">编辑</BButton>
        </template>
        <div class="method-summary">
          <pre class="method-summary__code"><code class="method-summary__code-content"><span
            v-for="line in highlightedMethodPreviewLines"
            :key="line.index"
            class="method-summary__line"
          ><span
            v-for="(token, tokenIndex) in line.tokens"
            :key="tokenIndex"
            :class="token.className"
          >{{ token.text }}</span></span></code></pre>
        </div>
      </BSectionBlock>
    </ATabPane>
  </ATabs>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { castArray, flatten, isString, split } from 'lodash-es';
import { common, createLowlight } from 'lowlight';
import type { WidgetData } from '@/components/BWidget/types';
import { readWidgetExecuteMethod } from '@/components/BWidget/utils/widgetExecuteMethod';
import { WIDGET_INTERACTION_SCRIPT_HIGHLIGHT_LANGUAGE } from '../constants/pageSetter';

/** JS 脚本摘要 Lowlight 实例。 */
const methodSummaryLowlight = createLowlight(common);

const dataItem = defineModel<WidgetData>('value', { required: true });
const emit = defineEmits<{
  /** 打开 Widget JS 脚本代码编辑器 */
  'edit-code': [];
}>();

/**
 * 向当前 Widget 数据写入配置变更。
 * @param patch - Widget 配置增量
 */
function updateWidgetDataConfig(patch: Partial<Pick<WidgetData, 'description' | 'name'>>): void {
  dataItem.value = { ...dataItem.value, ...patch };
}

/** 当前 Widget 能力名称。 */
const widgetName = computed<string>({
  /**
   * 读取 Widget 能力名称。
   * @returns 能力名称
   */
  get: (): string => dataItem.value.name,
  /**
   * 写入 Widget 能力名称。
   * @param value - 新能力名称
   */
  set: (value: string): void => {
    updateWidgetDataConfig({ name: value });
  }
});

/** 当前 Widget AI 使用说明。 */
const widgetDescription = computed<string>({
  /**
   * 读取 Widget AI 使用说明。
   * @returns AI 使用说明
   */
  get: (): string => dataItem.value.description,
  /**
   * 写入 Widget AI 使用说明。
   * @param value - 新 AI 使用说明
   */
  set: (value: string): void => {
    updateWidgetDataConfig({ description: value });
  }
});

/** 当前JS 脚本代码。 */
const interactionScriptCode = computed<string>((): string => readWidgetExecuteMethod(dataItem.value.execute).code);

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
  children?: Array<LowlightElementNode | LowlightTextNode>;
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
 * JS 脚本代码摘要 token。
 */
interface MethodSummaryToken {
  /** token 文本 */
  text: string;
  /** 安全 CSS 类名 */
  className?: string;
}

/**
 * JS 脚本代码摘要行。
 */
interface MethodSummaryLine {
  /** 行索引 */
  index: number;
  /** 行内 token */
  tokens: MethodSummaryToken[];
}

/**
 * 将纯文本转为摘要 token。
 * @param text - 代码文本
 * @returns 摘要 token
 */
function textToMethodSummaryTokens(text: string): MethodSummaryToken[] {
  return text ? [{ text }] : [];
}

/**
 * 读取 Lowlight 元素节点的安全类名。
 * @param node - Lowlight 元素节点
 * @returns 安全类名
 */
function getLowlightClassNames(node: LowlightElementNode): string[] {
  const rawClassName = node.properties?.className;
  const classNameItems = rawClassName ? castArray(rawClassName) : [];
  const classNames = flatten(classNameItems.map((item: string | string[]): string[] => (isString(item) ? split(item, /\s+/u) : item)));

  return classNames.filter((className: string): boolean => className.startsWith('hljs-'));
}

/**
 * 将 Lowlight 节点拍平成摘要 token。
 * @param node - Lowlight 节点
 * @param activeClassNames - 父级继承的高亮类名
 * @returns 摘要 token
 */
function lowlightNodeToMethodSummaryTokens(node: LowlightNode, activeClassNames: readonly string[] = []): MethodSummaryToken[] {
  if (node.type === 'text') {
    if (!node.value) {
      return [];
    }

    const className = activeClassNames.join(' ');

    return [{ text: node.value, className: className || undefined }];
  }

  const mergedClassNames = [...new Set([...activeClassNames, ...getLowlightClassNames(node)])];

  return node.children?.flatMap((child: LowlightNode): MethodSummaryToken[] => lowlightNodeToMethodSummaryTokens(child, mergedClassNames)) ?? [];
}

/**
 * 高亮JS 脚本代码。
 * @param code - JS 脚本代码
 * @returns 高亮 token
 */
function highlightMethodCode(code: string): MethodSummaryToken[] {
  if (!methodSummaryLowlight.registered(WIDGET_INTERACTION_SCRIPT_HIGHLIGHT_LANGUAGE)) {
    return textToMethodSummaryTokens(code);
  }

  try {
    const tree = methodSummaryLowlight.highlight(WIDGET_INTERACTION_SCRIPT_HIGHLIGHT_LANGUAGE, code) as LowlightNode;

    return lowlightNodeToMethodSummaryTokens(tree);
  } catch {
    return textToMethodSummaryTokens(code);
  }
}

/**
 * 将高亮 token 按真实换行拆成预览行。
 * @param tokens - 高亮 token
 * @returns 预览行列表
 */
function splitMethodSummaryTokensIntoLines(tokens: MethodSummaryToken[]): MethodSummaryLine[] {
  const lines: MethodSummaryLine[] = [{ index: 0, tokens: [] }];

  tokens.forEach((token: MethodSummaryToken): void => {
    const parts = token.text.split('\n');

    parts.forEach((part: string, partIndex: number): void => {
      if (part) {
        lines[lines.length - 1].tokens.push({ ...token, text: part });
      }

      if (partIndex < parts.length - 1) {
        lines.push({ index: lines.length, tokens: [] });
      }
    });
  });

  return lines;
}

/** 高亮后的JS 脚本摘要代码行。 */
const highlightedMethodPreviewLines = computed<MethodSummaryLine[]>(() => splitMethodSummaryTokensIntoLines(highlightMethodCode(interactionScriptCode.value)));

/**
 * 触发打开JS 脚本代码编辑器。
 */
function emitEditCode(): void {
  emit('edit-code');
}
</script>

<style lang="less" scoped>
@import url('@/assets/styles/markdown.less');

.page-setter {
  width: 100%;
}

.method-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}

.method-summary__code {
  --code-text: #24292f;
  --code-keyword: #cf222e;
  --code-string: #0a3069;
  --code-number: #0550ae;
  --code-comment: #6e7781;
  --code-function: #8250df;
  --code-variable: #953800;
  --code-tag: #116329;
  --code-attr-name: #953800;
  --code-attr-value: #0a3069;
  --code-builtin: #0550ae;
  --code-class: #953800;
  --code-constant: #0550ae;

  max-height: 220px;
  padding: 8px 10px;
  margin: 0;
  overflow: auto;
  font-family: var(--font-family-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace);
  font-size: 12px;
  line-height: 1.7;
  color: var(--code-text);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: var(--bg-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 4px;
  .code-highlight();
}

.method-summary__line {
  display: block;
  min-height: 1.7em;
}
</style>
