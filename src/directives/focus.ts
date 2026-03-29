import type { Directive, DirectiveBinding } from 'vue';

interface FocusOptions {
  selectAll?: boolean;
}

function handleFocus(el: HTMLInputElement | HTMLTextAreaElement, binding: DirectiveBinding<FocusOptions | boolean>): void {
  el.focus();

  const shouldSelectAll = typeof binding.value === 'boolean' ? binding.value : binding.value?.selectAll;

  if (shouldSelectAll && el.select) {
    el.select();
  }
}

export const vFocus: Directive<HTMLInputElement | HTMLTextAreaElement, FocusOptions | boolean> = {
  mounted(el, binding) {
    handleFocus(el, binding);
  },
  updated(el, binding) {
    handleFocus(el, binding);
  }
};
