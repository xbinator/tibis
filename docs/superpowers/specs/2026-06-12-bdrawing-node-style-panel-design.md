# 2026-06-12 BDrawing Node Style Panel Design

## Goal

在 `src/components/BDrawing` 中新增左侧节点样式配置面板。用户单选一个 shape/text 节点后，可修改填充色、边框色、文字色、边框粗细和透明度；修改结果立即反映到 SVG 节点，并进入现有撤销/重做历史。

## Scope

- 仅支持单选 `DrawingShapeElement`。
- 多选、未选中、选中 connector 时显示空状态。
- 样式字段复用现有 `DrawingElementStyle`：`fill`、`stroke`、`strokeWidth`、`color`、`opacity`。
- 首版不处理连线样式、文字字号、圆角和多选批量编辑。

## Design

- 在 `boardTransforms.ts` 新增 `updateDrawingElementStyle`，复制元素列表后合并 style，并通过 `withHistory` 记录为一次可撤销操作。
- 在 `useDrawingBoard.ts` 暴露 `updateElementStyle` 命令。
- 新增 `components/DrawingStylePanel.vue`，接收当前选中的 shape 元素，使用 color input、number input 和 range input 修改样式。
- 在 `index.vue` 根据当前 selection 计算 `selectedShapeElement`，把样式面板固定在左侧，并把 panel emit 转给 board 命令。
- 在 `DrawingNode.vue` 将节点 style 转换为 SVG presentation attributes，默认值继续来自 CSS 变量。

## Testing

- `board-transforms.test.ts` 覆盖样式更新、历史记录、未知元素错误。
- `drawing-canvas.component.test.ts` 覆盖选中节点后显示样式面板，以及修改填充色后 SVG 节点更新。

