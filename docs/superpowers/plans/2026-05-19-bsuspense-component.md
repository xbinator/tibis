# BSuspense 条件挂载包裹器 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 BSuspense 元件，在不可见时完全不挂载子组件（v-if 语义），替代 CodeBlock 中 BJsonViewer 的 v-show。

**Architecture:** 单一 SFC 元件（types.ts + index.vue），通过 `active` prop 控制 default slot 挂载/卸载，利用 Vue fallthrough attributes 透传 class/style 到根元素。

**Tech Stack:** Vue 3 SFC + TypeScript + `createNamespace` BEM

---

### Task 1: 创建类型定义

**Files:**
- Create: `src/components/BSuspense/types.ts`

- [ ] **Step 1: 写入 BSuspenseProps 类型**

```typescript
/**
 * @file types.ts
 * @description BSuspense 元件类型定义
 */

/**
 * BSuspense 元件入参
 */
export interface BSuspenseProps {
  /** 是否挂载默认插槽内容；false 时仅占位，不渲染 default slot */
  active?: boolean
  /** 未激活时容器最小高度，用于防止布局抖动 */
  minHeight?: number | string
  /** CSS 过渡动画名称，非空时使用 <Transition> 包裹 content 区域 */
  transition?: string
}
```

---

### Task 2: 创建 BSuspense 元件

**Files:**
- Create: `src/components/BSuspense/index.vue`

- [ ] **Step 1: 写入元件模板与脚本**

```vue
<!--
  @file index.vue
  @description BSuspense 条件挂载包裹器，控制子组件挂载时机并提供骨架屏占位。
-->
<template>
  <div :class="name" :style="containerStyle">
    <Transition :name="activeTransition">
      <div v-if="active" :class="bem('content')">
        <slot />
      </div>
    </Transition>
    <div v-if="!active" :class="bem('placeholder')">
      <slot name="skeleton" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BSuspenseProps } from './types';
import { computed } from 'vue';
import { createNamespace } from '@/utils/namespace';

defineOptions({ name: 'BSuspense' });

const props = withDefaults(defineProps<BSuspenseProps>(), {
  active: true,
  minHeight: 0,
  transition: ''
});

const [name, bem] = createNamespace('suspense');

/** 容器内联样式，根据 minHeight 动态计算 */
const containerStyle = computed<Record<string, string>>(() => {
  if (!props.active && props.minHeight) {
    const minH = typeof props.minHeight === 'number' ? `${props.minHeight}px` : props.minHeight;

    return { minHeight: minH };
  }

  return {};
});

/** 传给 Transition 的 name，空字符串表示不使用 transition */
const activeTransition = computed<string>(() => props.transition || '');
</script>

<style lang="less" scoped>
.b-suspense {
  width: 100%;
}

.b-suspense__content {
  width: 100%;
  height: 100%;
}

.b-suspense__placeholder {
  width: 100%;
}
</style>
```

- [ ] **Step 2: 验证编译**

```bash
npx eslint src/components/BSuspense/**/*.ts src/components/BSuspense/**/*.vue
```

---

### Task 3: 编写元件测试

**Files:**
- Create: `test/components/BSuspense/index.test.ts`

- [ ] **Step 1: 写入测试文件**

```typescript
/**
 * @file index.test.ts
 * @description BSuspense 元件测试
 */
import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import BSuspense from '@/components/BSuspense/index.vue';

describe('BSuspense', () => {
  it('active 为 true 时渲染默认插槽内容', () => {
    const wrapper = mount(BSuspense, {
      props: { active: true },
      slots: { default: '<div class="child">content</div>' }
    });

    expect(wrapper.find('.child').exists()).toBe(true);
  });

  it('active 为 false 时不渲染默认插槽内容', () => {
    const wrapper = mount(BSuspense, {
      props: { active: false },
      slots: { default: '<div class="child">content</div>' }
    });

    expect(wrapper.find('.child').exists()).toBe(false);
  });

  it('active 为 true 时默认插槽已挂载', async () => {
    const active = ref(false);
    const wrapper = mount(BSuspense, {
      props: { active: active.value },
      slots: { default: '<div class="child">content</div>' }
    });

    expect(wrapper.find('.child').exists()).toBe(false);

    active.value = true;
    await nextTick();

    expect(wrapper.find('.child').exists()).toBe(true);
  });

  it('active 为 false 时渲染 skeleton 插槽', () => {
    const wrapper = mount(BSuspense, {
      props: { active: false },
      slots: {
        default: '<div class="child">content</div>',
        skeleton: '<div class="skeleton">loading...</div>'
      }
    });

    expect(wrapper.find('.skeleton').exists()).toBe(true);
  });

  it('active 为 true 且 transition 非空时包裹 Transition', () => {
    const wrapper = mount(BSuspense, {
      props: { active: true, transition: 'fade' },
      slots: { default: '<div class="child">content</div>' }
    });

    expect(wrapper.find('.child').exists()).toBe(true);
  });

  it('通过 class 属性透传到根元素', () => {
    const wrapper = mount(BSuspense, {
      props: { active: true },
      attrs: { class: 'external-class' },
      slots: { default: '<div>content</div>' }
    });

    expect(wrapper.classes()).toContain('external-class');
  });

  it('minHeight 在 active 为 false 时生效', () => {
    const wrapper = mount(BSuspense, {
      props: { active: false, minHeight: 200 }
    });

    expect(wrapper.attributes('style')).toContain('min-height: 200px');
  });

  it('minHeight 字符串形式在 active 为 false 时生效', () => {
    const wrapper = mount(BSuspense, {
      props: { active: false, minHeight: '50vh' }
    });

    expect(wrapper.attributes('style')).toContain('min-height: 50vh');
  });
});
```

- [ ] **Step 2: 运行测试验证**

```bash
npx vitest run test/components/BSuspense/index.test.ts
```

Expected: 所有 8 个测试通过。

---

### Task 4: 集成到 CodeBlock——替换 BJsonViewer 的 v-show

**Files:**
- Modify: `src/components/BEditor/components/CodeBlock.vue:49-51`

- [ ] **Step 1: 将 v-show div 替换为 BSuspense**

定位 `src/components/BEditor/components/CodeBlock.vue` 第 49 行附近的 JSON 预览区域：

```vue
<!-- 旧代码 -->
      <div v-show="isJsonPreviewVisible" :class="bem('json-preview')" contenteditable="false">
        <BJsonViewer :content="codeContent" />
      </div>
```

替换为：

```vue
      <BSuspense :active="isJsonPreviewVisible" :class="bem('json-preview')" contenteditable="false">
        <BJsonViewer :content="codeContent" />
      </BSuspense>
```

- [ ] **Step 2: 运行 lint 检查**

```bash
npx eslint src/components/BEditor/components/CodeBlock.vue
```

Expected: 无错误。

---

### Task 5: 运行完整测试套件

- [ ] **Step 1: 运行全量测试**

```bash
pnpm test
```

Expected: 全部通过（包括已有的 CodeBlock 相关测试）。

- [ ] **Step 2: 运行 lint 全量检查**

```bash
npx eslint src/components/BSuspense/
```

