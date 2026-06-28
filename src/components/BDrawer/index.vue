<!--
  @file index.vue
  @description BDrawer 抽屉组件，基于 ant-design-vue Drawer 二次封装。
    默认从右侧滑出，关闭按钮位于 header 右上角；
    默认渲染到布局注入的 `.b-layout__content__main` 容器中（不遮挡 header 与右侧 ChatSider）。
-->
<template>
  <Drawer
    v-model:open="visible"
    :class="name"
    :placement="placement"
    :width="drawerWidth"
    :height="drawerHeight"
    :mask="mask"
    :mask-closable="maskClosable"
    :root-class-name="bem('root') as string"
    :keyboard="keyboard"
    :get-container="getContainer"
    :z-index="zIndex"
    :footer="null"
    :closable="false"
    :after-close="afterClose"
    @cancel="handleClose"
  >
    <div v-if="title || $slots.title" :class="bem('header')">
      <slot name="title">{{ title }}</slot>

      <div v-if="closable" :class="bem('closable')" @click="handleClose">
        <BIcon icon="lucide:x" />
      </div>
    </div>

    <div :class="[bem('body'), mainClass]" :style="mainStyle">
      <slot></slot>
    </div>

    <div v-if="$slots.footer" :class="bem('footer')">
      <slot name="footer"></slot>
    </div>
  </Drawer>
</template>

<script setup lang="ts">
import type { BDrawerProps as Props } from './types';
import { computed } from 'vue';
import { Drawer } from 'ant-design-vue';
import { addCssUnit } from '@/utils/css';
import { createNamespace } from '@/utils/namespace';

defineOptions({ name: 'BDrawer' });

const props = withDefaults(defineProps<Props>(), {
  open: false,
  title: '',
  width: 378,
  height: 378,
  placement: 'right',
  closable: true,
  mask: true,
  maskClosable: true,
  keyboard: true,
  getContainer: undefined,
  mainClass: '',
  mainStyle: undefined,
  close: undefined,
  afterClose: undefined,
  zIndex: 1000
});

const emit = defineEmits(['update:open', 'close']);

const [name, bem] = createNamespace('drawer');

const visible = defineModel<boolean>('open');

/** 宽度（left/right 生效），统一追加 CSS 单位 */
const drawerWidth = computed(() => addCssUnit(props.width));
/** 高度（top/bottom 生效），统一追加 CSS 单位 */
const drawerHeight = computed(() => addCssUnit(props.height));

/**
 * 触发关闭：依次执行 close 回调、emit close 事件，最后同步 visible 状态。
 */
function handleClose(): void {
  emit('close');
  props.close?.();
  visible.value = false;
}
</script>

<style lang="less">
.b-drawer {
  .ant-drawer-content-wrapper {
    box-shadow: -6px 0 16px rgb(0 0 0 / 8%);
  }

  .ant-drawer-content {
    padding: 0;
  }

  .ant-drawer-body {
    display: flex;
    flex-direction: column;
    padding: 0;
  }
}

.b-drawer__root {
  overflow: hidden;
  border-radius: 8px;
}

.b-drawer__header {
  position: relative;
  display: flex;
  align-items: center;
  padding: 16px 24px;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-secondary);
}

.b-drawer__closable {
  position: absolute;
  top: 50%;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 25px;
  font-size: 18px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
  transform: translateY(-50%);

  &:hover {
    color: var(--text-primary);
    background-color: var(--bg-hover);
  }
}

.b-drawer__body {
  padding: 16px 24px;
  overflow: auto;
}

.b-drawer__footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 12px 24px 16px;
  border-top: 1px solid var(--border-secondary);
}
</style>
