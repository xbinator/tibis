# BSuspense 条件挂载包裹器设计

## 概述

BSuspense 是一个条件挂载通用包裹器组件，解决编辑器中重型子组件（BJsonViewer、Mermaid 等）在不可见时仍被 `v-show` 挂载的问题。同时作为通用异步组件包裹器，提供骨架屏占位和过渡动画能力。

## 动机

当前 CodeBlock 中通过 `v-show` 控制子组件显隐，但 `v-show` 只是 `display:none`，子组件（如使用 VueFlow 的 BJsonViewer）仍会被完整初始化。BSuspense 内部使用 `v-if` 语义，在不可见时完全不创建子组件，真正延迟挂载。

## 文件结构

```
src/components/BSuspense/
├── index.vue        # 主组件
└── types.ts         # 类型定义
```

## API 设计

### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `active` | `boolean` | `true` | 是否挂载默认插槽内容；`false` 时仅占位，不渲染 default slot |
| `minHeight` | `number \| string` | `0` | 未激活时容器最小高度，用于防止布局抖动 |
| `transition` | `string` | `''` | 非空时使用 `<Transition>` 包裹内容，值为 CSS transition name |

### Slots

| 插槽名 | 说明 |
|--------|------|
| `default` | 主内容（仅在 `active` 为 true 时挂载） |
| `skeleton` | 占位内容（可选），`active` 为 false 时显示；未提供时仅渲染透明容器 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `mounted` | — | 主内容首次挂载完成时触发 |
| `unmounted` | — | 主内容卸载后触发 |

## 内部实现

```
┌─────────────────────────────────┐
│  外层容器 (始终渲染, minHeight)   │
│  ┌─────────────────────────────┐│
│  │ <Transition> (可选)          ││
│  │  ┌─────────────────────┐    ││
│  │  │ v-if="active"        │    ││
│  │  │   <slot />           │    ││
│  │  └─────────────────────┘    ││
│  │  v-else (skeleton fallback) ││
│  │   <slot name="skeleton" />  ││
│  │   或空占位                  ││
│  └─────────────────────────────┘│
└─────────────────────────────────┘
```

- **外层容器**：BEM 类名 `b-suspense`，始终渲染以维持布局；`minHeight` 通过 `style` 绑定
- **class/style 透传**：利用 Vue 的 fallthrough attributes 机制，外层 `class` 和 `style` 自动透传到根元素（与 BEM 类名合并），无需手动处理
- **v-if 切换**：`active` 控制 default slot 的挂载/卸载
- **Skeleton**：`active` 为 false 时渲染 skeleton slot 作为占位（若提供），否则为空状态容器
- **Transition**：仅在 `transition` prop 非空时包裹内容区域，提供挂载/卸载进出动画

## 使用示例

### CodeBlock 中替代 v-show

```vue
<!-- 之前: v-show 始终挂载 BJsonViewer -->
<div v-show="isJsonPreviewVisible" :class="bem('json-preview')">
  <BJsonViewer :content="codeContent" />
</div>

<!-- 之后: BSuspense 仅在可见时挂载 -->
<BSuspense :active="isJsonPreviewVisible" min-height="460px">
  <BJsonViewer :content="codeContent" />
</BSuspense>
```

### 通用异步包裹器

```vue
<BSuspense min-height="300px" transition="fade">
  <HeavyChart :data="chartData" />
  <template #skeleton>
    <div class="my-chart-skeleton">图表加载中...</div>
  </template>
</BSuspense>
```

## 集成计划

1. 创建 `src/components/BSuspense/` 组件
2. 修改 `src/components/BEditor/components/CodeBlock.vue`：将 BJsonViewer 的 `v-show` 替换为 BSuspense
3. （后续考虑）Mermaid 预览迁移，但 Mermaid 当前依赖 ref 直接操作 DOM，迁移需要额外适配

## 与非目标

- **本次包含**：`active` 控制挂载、skeleton 插槽、transition、minHeight 占位
- **后续考虑**：IntersectionObserver 视口触发（`lazy` 模式）、加载超时控制、错误重试按钮
