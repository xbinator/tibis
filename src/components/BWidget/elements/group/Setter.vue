<!--
  @file Setter.vue
  @description BWidget 组合元素专属属性设置面板。
-->
<template>
  <BSectionBlock title="组合">
    <BSectionItem icon="lucide:ungroup">
      <BButton class="widget-group-setter__ungroup" type="secondary" size="small" @click="emit('command', 'ungroup')"> 取消合并 </BButton>
    </BSectionItem>
  </BSectionBlock>
</template>

<script setup lang="ts">
import type { WidgetElement } from '../../types';

/** 接收右侧面板传入的当前组合元素。 */
defineModel<WidgetElement>('element', { required: true });

const emit = defineEmits<{
  /** 触发组合元素快捷命令 */
  command: [command: 'ungroup'];
}>();
</script>
