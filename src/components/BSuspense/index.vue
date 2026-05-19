<template>
  <div v-if="hasBeenActive" v-show="active">
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import type { BSuspenseProps } from './types';
import { watch, ref } from 'vue';

defineOptions({ name: 'BSuspense' });

const props = withDefaults(defineProps<BSuspenseProps>(), {
  active: false
});

const hasBeenActive = ref(props.active);

watch(
  () => props.active,
  (val) => {
    val && (hasBeenActive.value = true);
  },
  { immediate: true }
);
</script>
