<template>
  <ADropdown
    overlay-class-name="b-dropdown-overlay"
    :get-popup-container="getPopupContainer"
    :disabled="disabled"
    :placement="placement as 'topLeft'"
    :align="align"
  >
    <slot></slot>

    <template #overlay>
      <div>
        <slot name="overlay"></slot>
      </div>
    </template>
  </ADropdown>
</template>

<script lang="ts" setup>
import type { BDropdownProps } from './type';

withDefaults(defineProps<BDropdownProps>(), {
  disabled: false,
  placement: 'bottomLeft',
  align: undefined,
  getPopupContainer: undefined
});
</script>

<style scoped>
.b-dropdown-overlay {
  padding: 4px;
  outline: none;
  background-color: var(--dropdown-bg);
  border: 1px solid var(--dropdown-border);
  border-radius: 8px;
}
</style>
