<!--
  @file BlockNode.vue
  @description BMessage 块级节点渲染组件。
-->
<template>
  <p v-if="node.type === 'paragraph'">
    <InlineNode v-for="(child, index) in node.children" :key="index" :node="child" />
  </p>

  <component :is="headingTag" v-else-if="node.type === 'heading'">
    <InlineNode v-for="(child, index) in node.children" :key="index" :node="child" />
  </component>

  <component :is="node.ordered ? 'ol' : 'ul'" v-else-if="node.type === 'list'" :start="node.ordered ? node.start || undefined : undefined">
    <li v-for="item in node.items" :key="item.id">
      <input v-if="item.task" type="checkbox" disabled :checked="item.checked" />
      <BlockNode v-for="child in item.children" :key="child.id" :node="child" />
    </li>
  </component>

  <blockquote v-else-if="node.type === 'blockquote'">
    <BlockNode v-for="child in node.children" :key="child.id" :node="child" />
  </blockquote>

  <pre v-else-if="node.type === 'code'"><code :class="node.lang ? `language-${node.lang}` : undefined">{{ node.text }}</code></pre>

  <table v-else-if="node.type === 'table'">
    <thead>
      <tr>
        <th v-for="cell in node.header" :key="cell.id" :style="{ textAlign: cell.align || undefined }">
          <InlineNode v-for="(child, index) in cell.children" :key="index" :node="child" />
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, rowIndex) in node.rows" :key="rowIndex">
        <td v-for="cell in row" :key="cell.id" :style="{ textAlign: cell.align || undefined }">
          <InlineNode v-for="(child, index) in cell.children" :key="index" :node="child" />
        </td>
      </tr>
    </tbody>
  </table>

  <hr v-else-if="node.type === 'hr'" />

  <div v-else-if="node.type === 'component'" class="b-message__component-placeholder">
    {{ node.componentName }}
  </div>

  <span v-else-if="node.type === 'cursor'" class="b-message__cursor" aria-hidden="true"></span>
</template>

<script setup lang="ts">
import type { BlockNode } from '../types';
import { computed } from 'vue';
import InlineNode from './InlineNode.vue';

defineOptions({ name: 'BlockNode' });

interface Props {
  /** 待渲染的块级节点 */
  node: BlockNode;
}

const props = defineProps<Props>();

const headingTag = computed<string>(() => (props.node.type === 'heading' ? `h${props.node.depth}` : 'h1'));
</script>
