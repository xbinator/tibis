# BWidget 文本编辑态尺寸测量修复设计

## 背景

`src/components/BWidget/elements/Text` 在设计态会隐藏 `{{ ... }}` 变量占位，只展示静态文本片段；但文本元素的尺寸测量仍会解析预览上下文或回退到原始模板源码。两条链路得到的内容不同，使纯变量文本虽然显示为空，选区仍被表达式文本计算出的最小高度撑开。用户缩放后，`model-min-content` 再次归一化尺寸，于是选区回到旧高度。

## 目标

- 文本尺寸始终以当前渲染模式下实际显示的内容为准。
- 设计态移除变量占位后，纯变量文本按空内容测量；混合文本只按剩余静态片段测量。
- 运行态继续按变量解析后的真实展示值测量。
- 保留现有 `model-min-content` 语义，避免可见文本被小于内容的高度裁切。

## 方案

将 Widget 渲染模式传入统一尺寸测量链路，而不是在 Moveable 事件中增加特例。

1. 扩展元素内容尺寸测量参数，使 `getWidgetShapeRenderSize` 和 schema `measureContent` 能接收 `design` / `runtime` 渲染选项。
2. 文本测量复用与文本视图一致的字段展示规则：
   - `design`：移除模板绑定，只保留静态片段。
   - `runtime`：按渲染上下文解析变量，并格式化最终展示值。
3. `WidgetNode` 与 `MoveableLayer` 从 `useRenderContext` 同时传递上下文和模式，保证节点、控制框、缩放开始尺寸与缩放提交尺寸一致。
4. 非 Vue 的运行态布局显式使用 `runtime` 模式；未传模式的设计工具保持默认 `design`，避免改变编辑器、缩略图和初始视口的语义。

## 数据流

`WidgetRenderContextState` 提供当前模式与变量上下文，`WidgetNode`、`MoveableLayer` 或运行态布局将二者交给 `getWidgetShapeRenderSize`。该工具转交元素 schema，文本 schema 根据模式生成实际展示文本，再用现有字体、换行、内边距和最大行数规则测量尺寸。最终渲染节点与 Moveable 控制框使用同一结果。

## 错误与兼容性

- 无渲染上下文的运行态模板继续按现有规则回退原始模板，避免静默丢失不可解析内容。
- 非文本元素不依赖内容测量模式，行为保持不变。
- 不改变保存格式，也不迁移已有 Widget 数据。

## 测试

- 添加失败回归测试：设计态纯变量文本的选框尺寸不再由原始表达式撑高。
- 覆盖设计态混合静态文本只按静态片段测量。
- 覆盖运行态仍按解析后的变量值测量。
- 运行 Moveable、WidgetNode、文本尺寸、Widget 几何和运行态布局相关测试，并执行 TypeScript、ESLint 与 Stylelint 检查。
