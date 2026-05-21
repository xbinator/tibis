import { nextTick } from 'vue';
import type { Directive, DirectiveBinding } from 'vue';

interface FocusOptions {
  selectAll?: boolean;
}

/**
 * 用 WeakMap 按元素存储 timer id，避免全局变量污染。
 * 元素 GC 后自动回收，无需手动清空。
 */
const timerMap = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

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

  const shouldSelectAll = typeof binding.value === 'boolean' ? binding.value : binding.value?.selectAll;

  /* 清掉这个元素上一次还没执行的定时器，防止短时间内多次触发堆积 */
  clearTimeout(timerMap.get(el));

  const id = setTimeout(() => {
    timerMap.delete(el);
    target.focus();
    /* select() 须在 focus() 之后调用，否则无效 */
    if (shouldSelectAll && target.select) {
      target.select();
    }
  }, 100);

  timerMap.set(el, id);
}

export const vFocus: Directive<HTMLElement, FocusOptions | boolean> = {
  mounted(el, binding) {
    /* 延迟到下一帧，确保组件内部 DOM（如 AInput 的原生 input）已渲染 */
    nextTick(() => handleFocus(el, binding));
  },
  updated(el, binding) {
    /* 只在 binding value 实际变化时才重新 focus，避免组件任意更新都触发 */
    if (binding.value !== binding.oldValue) {
      handleFocus(el, binding);
    }
  },
  unmounted(el) {
    /* 元素卸载时兜底清理，防止回调在 unmount 后执行 */
    clearTimeout(timerMap.get(el));
    timerMap.delete(el);
  }
};
