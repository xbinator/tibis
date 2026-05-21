import { nextTick } from 'vue';
import type { Directive, DirectiveBinding } from 'vue';

interface FocusOptions {
  selectAll?: boolean;
}

/**
 * 从指令宿主节点中获取可聚焦的原生 input/textarea。
 * 若宿主本身即为原生表单元素则直接返回，否则向下查找第一个。
 */
function resolveFocusTarget(el: HTMLElement): HTMLInputElement | HTMLTextAreaElement | null {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el;
  }
  return el.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
}

function handleFocus(el: HTMLElement, binding: DirectiveBinding<FocusOptions | boolean>): void {
  const target = resolveFocusTarget(el);
  if (!target) return;

  target.focus();

  const shouldSelectAll = typeof binding.value === 'boolean' ? binding.value : binding.value?.selectAll;

  if (shouldSelectAll && target.select) {
    target.select();
  }
}

export const vFocus: Directive<HTMLElement, FocusOptions | boolean> = {
  mounted(el, binding) {
    /* 延迟到下一帧，确保组件内部 DOM（如 AInput 的原生 input）已渲染 */
    nextTick(() => handleFocus(el, binding));
  },
  updated(el, binding) {
    handleFocus(el, binding);
  }
};
