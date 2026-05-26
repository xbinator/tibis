<template>
  <Transition
    :name="name"
    @before-enter="onBeforeEnter"
    @enter="onEnter"
    @after-enter="onAfterEnter"
    @before-leave="onBeforeLeave"
    @leave="onLeave"
    @after-leave="onAfterLeave"
  >
    <slot></slot>
  </Transition>
</template>

<script setup lang="ts">
import type { RendererElement } from 'vue';
import { createNamespace } from '@/utils/namespace';

defineOptions({ name: 'BCollapseTransition' });

const [name] = createNamespace('collapse-transition');

/**
 * 进入前：将元素初始状态设为高度和 padding 均为 0
 * @param el - 过渡元素
 */
function onBeforeEnter(el: RendererElement): void {
  el.style.height = '0';
  el.style.paddingTop = '0';
  el.style.paddingBottom = '0';
}

/**
 * 进入时：将高度过渡到元素的实际内容高度，恢复 padding
 * @param el - 过渡元素
 */
function onEnter(el: RendererElement): void {
  if (el.scrollHeight !== 0) {
    el.style.height = `${el.scrollHeight}px`;
  } else {
    el.style.height = '';
  }
  el.style.paddingTop = '';
  el.style.paddingBottom = '';
  el.style.overflow = 'hidden';
}

/**
 * 进入后：清除内联样式，恢复元素自适应高度
 * @param el - 过渡元素
 */
function onAfterEnter(el: RendererElement): void {
  el.style.height = '';
  el.style.overflow = '';
}

/**
 * 离开前：锁定当前高度，隐藏溢出
 * @param el - 过渡元素
 */
function onBeforeLeave(el: RendererElement): void {
  el.style.height = `${el.scrollHeight}px`;
  el.style.overflow = 'hidden';
}

/**
 * 离开时：将高度和 padding 过渡到 0
 * @param el - 过渡元素
 */
function onLeave(el: RendererElement): void {
  if (el.scrollHeight !== 0) {
    el.style.height = '0';
    el.style.paddingTop = '0';
    el.style.paddingBottom = '0';
  }
}

/**
 * 离开后：清除所有内联样式
 * @param el - 过渡元素
 */
function onAfterLeave(el: RendererElement): void {
  el.style.height = '';
  el.style.overflow = '';
  el.style.paddingTop = '';
  el.style.paddingBottom = '';
}
</script>

<style lang="less">
.b-collapse-transition-enter-active {
  box-sizing: content-box;
}

.b-collapse-transition-leave-active,
.b-collapse-transition-enter-active {
  transition: 0.3s height ease-in-out, 0.3s padding-top ease-in-out, 0.3s padding-bottom ease-in-out;
}
</style>
