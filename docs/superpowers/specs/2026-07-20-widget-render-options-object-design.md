# BWidget 渲染参数对象化设计

## 背景

文本设计态尺寸修复为几何测量链路新增了 `renderContext` 与 `renderOptions`，当前多个函数把二者作为连续位置参数传递。调用点可读性较差，继续扩展时也容易增加更多位置参数。

## 目标

- 将本次渲染与内容测量链路中的 `renderContext`、`renderOptions` 统一收口为一个 options 对象。
- 同一个 options 对象沿几何、schema 测量、文本测量和模板展示链路透传。
- 保持设计态、运行态、内容驱动尺寸及模板表达式行为不变。
- 同步改造本次涉及的测试辅助函数和调用断言，不扩大到无关旧 API。

## 公共类型

新增独立类型模块，避免 `src/components/BWidget/types.ts` 与 `types/widget.d.ts` 产生反向类型依赖：

```ts
export interface WidgetRenderEvaluationOptions {
  renderContext?: WidgetRenderContext;
  renderOptions?: WidgetRenderContextOptions;
}
```

## API 形态

生产代码统一采用“主要业务参数 + 一个 options 对象”：

```ts
getWidgetShapeRenderSize(element, options)
renderSize.measureContent(element, options)
resolveWidgetDisplayValue(value, options)
resolveWidgetTemplateFieldText(metadata, fieldName, options)
```

调用示例：

```ts
getWidgetShapeRenderSize(element, {
  renderContext,
  renderOptions
});
```

无渲染参数的调用继续省略第二个参数。运行态尺寸测量显式传入：

```ts
getWidgetShapeRenderSize(element, {
  renderContext,
  renderOptions: { mode: 'runtime' }
});
```

## 范围

改造以下链路及其调用点：

- `src/components/BWidget/utils/widgetGeometry.ts`
- `src/components/BWidget/elements/types.ts`
- `src/components/BWidget/utils/widgetTextMetrics.ts`
- `src/components/BWidget/utils/widgetBindings.ts`
- `src/components/BWidget/hooks/useElementValue.ts`
- `src/components/BWidget/renderers/WidgetNode.vue`
- `src/components/BWidget/components/MoveableLayer.vue`
- `src/components/BWidget/utils/widgetRuntime/layout.ts`
- 相关 BWidget 测试与测试挂载辅助函数

不修改 `evaluateWidgetBindingExpression`、`resolveWidgetBindingTemplate`、`createWidgetRuntimeLayout` 等现有且职责不同的 API。

## 默认行为

- options 默认值为 `{}`。
- `renderOptions` 缺省时仍按 `{ mode: 'design' }` 处理。
- `renderContext` 缺省时保持现有未绑定展示和测量语义。
- 中间层不重新组装多个位置参数，直接传递 options 对象。

## 验证

- 先修改测试调用为对象形式，确认 TypeScript 或测试因旧签名失败。
- 修改生产接口与全部调用点后，运行 BWidget 几何、循环、运行布局、Moveable、元素值和元素视图测试。
- 运行 TypeScript、ESLint、Stylelint 与 `git diff --check`。
- 不暂存、不提交代码。
