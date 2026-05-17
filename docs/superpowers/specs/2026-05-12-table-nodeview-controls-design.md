# 表格 NodeView 增删控件设计

## 背景

当前 `BMarkdown` 富文本模式使用 TipTap 的 `Table` 扩展渲染表格，已经具备基础的表格编辑能力，但缺少贴近可视化编辑器的表格结构操作入口。用户希望在鼠标悬浮到表格分割线时，直接看到新增行列的高亮与按钮；同时在悬浮到整行或整列内容区域时，看到删除入口并直接执行删除动作。

这类交互如果继续放在全局编辑器 overlay 中，会让坐标换算、滚动同步、事件清理和后续功能扩展逐步变复杂。因此本次设计将表格升级为自定义 `Table NodeView`，把表格专属的 hover、按钮和命令入口收敛到单一边界内。

## 目标

- 为富文本模式表格提供可视化的新增行列入口。
- 为富文本模式表格提供可视化的删除行列入口。
- 悬浮分割线时高亮当前分割线，并在靠近边缘的位置显示小号 `+` 按钮。
- 悬浮整行或整列内容区域时，在对应内容区中间显示删除入口。
- 支持最外边框和内部边框的新增入口。
- 为后续表格工具扩展预留稳定 NodeView 边界。

## 非目标

- 本次不为源码模式 Markdown 表格提供同类 hover 控件。
- 本次不实现列宽拖拽、批量选中、表格菜单或单元格级工具条。
- 本次不改变 ProseMirror 表格节点结构和 Markdown 序列化策略。
- 本次不引入新的全局编辑器 overlay 宿主。

## 总体方案

采用“完全接管宿主结构的 `Table NodeView`”方案。

- ProseMirror 的 `table` 节点仍作为数据源。
- NodeView 自己创建表格宿主、滚动层和两套 overlay。
- `contentDOM` 只承载真正的 `table` 内容。
- 新增入口和删除入口分属两套命中与定位体系，不共用同一按钮位。

这样可以把表格专属交互从 `PaneRichEditor` 全局层中抽离出来，避免未来继续添加删除、拖拽、菜单时出现逻辑散落。

## NodeView 结构

建议 DOM 结构如下：

```text
div.b-table-node-view
└── div.b-table-node-view__scroller
    ├── table                       <- contentDOM
    ├── div.b-table-node-view__line-overlay
    │   ├── div.b-table-node-view__line-highlight
    │   └── button.b-table-node-view__add-button
    └── div.b-table-node-view__segment-overlay
        └── button.b-table-node-view__remove-button
```

结构约定如下：

- `b-table-node-view` 作为统一定位宿主。
- `b-table-node-view__scroller` 承接原有 `.tableWrapper` 的横向滚动语义。
- 两套 overlay 都放在 `scroller` 内部，与 `table` 同级，保证横向滚动时天然跟随表格内容移动，而不是依赖外层坐标补偿。
- `contentDOM` 指向内部 `table`，由 ProseMirror 继续管理行列与单元格内容。
- `line-overlay` 只服务“新增”交互。
- `segment-overlay` 只服务“删除”交互。

采用这套结构后，滚动处理规则需要进一步明确：

- NodeView 仍需监听 `scroller` 的 `scroll` 事件，用于重新计算 hover 命中结果。
- 但 overlay 本身不需要做额外的横向位移补偿，因为它与 `table` 处于同一滚动坐标系。
- 为避免频繁同步引发抖动，`scroll` 触发后的 hover 重算建议收敛到 `requestAnimationFrame` 中执行。

## 状态模型

NodeView 内维护两套 hover 状态。

```ts
interface HoveredDivider {
  type: 'row' | 'column'
  index: number
  edge: 'leading' | 'inner' | 'trailing'
  lineRect: DOMRectLike
}

interface HoveredSegment {
  type: 'row' | 'column'
  index: number
  segmentRect: DOMRectLike
}
```

状态语义如下：

- `HoveredDivider`
  - 表示当前命中的新增分割线。
  - `edge` 用于区分最外边框和内部边框。
  - `index` 表示命中的目标行列索引。
- `HoveredSegment`
  - 表示当前命中的删除目标实体。
  - `index` 直接表示将要删除的行或列。

其中 `DOMRectLike` 为纯数据矩形结构，而不是直接持有实时 DOM 对象，建议定义为：

```ts
interface DOMRectLike {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}
```

按钮位置不进入 hover 状态模型，而是在渲染层根据 `lineRect` 或 `segmentRect` 实时派生。这样可以把“命中几何”和“按钮视觉偏移”解耦，避免后续调整按钮位置时反向污染命中逻辑。

## 命中规则

NodeView 使用单一 `mousemove` 驱动两类命中计算。

### 分割线命中

分割线命中负责新增入口。

- 竖向分割线：
  - 计算所有列的左外边框、内部右边界和最右外边框。
  - 鼠标进入某条竖线附近阈值带时，命中列新增入口。
- 横向分割线：
  - 计算所有行的上外边框、内部下边界和最下外边框。
  - 鼠标进入某条横线附近阈值带时，命中行新增入口。
- 命中后：
  - 高亮整条分割线。
  - 在靠近边缘的位置显示 `+` 按钮。

阈值规则需要明确如下：

- 内部分割线以分割线中心为基准，向两侧各扩展固定阈值，建议每侧 `6px`。
- 最外边框只向表格内部一侧扩展固定阈值，避免表格外部空白区域也被判定为新增入口。
- 实际 `1px` 边框宽度只作为视觉线条存在，命中带应独立于边框宽度定义。

这样可以避免“看起来难命中”或“表格外大片空白都能命中”这两类极端情况。

### 区块命中

区块命中负责删除入口。

- 列删除：
  - 聚合同一列所有单元格的横向可见区域。
  - 在这一整列内容区中间显示删除入口。
- 行删除：
  - 以整行矩形为准。
  - 在这一整行内容区中间显示删除入口。

### 优先级

当两类命中可能同时成立时，采用以下优先级：

1. 分割线新增
2. 行列区块删除

这样当鼠标更靠近边界时，始终优先出现“新增” affordance，不会和“删除”入口竞争同一视觉焦点。

还需要补充两个边界规则：

- 当鼠标落在横向和纵向分割线交叉点附近时，优先命中与鼠标距离更近的那条分割线；若距离相同，优先竖向分割线。
- 删除入口只在鼠标落在区块主体区域、且不落在任何分割线阈值带内时显示。这样删除按钮不会被新增入口永久压制，但在边界附近仍以新增为准。

## 操作行为

### 新增行为

支持最外边框和内部边框新增。

- 最左外边框：前插一列。
- 内部竖向分割线：只支持在当前分割线右侧插入一列。
- 最右外边框：后插一列。
- 最上外边框：前插一行。
- 内部横向分割线：只支持在当前分割线下方插入一行。
- 最下外边框：后插一行。

这里需要明确，本次不实现“同一条内部分割线可前插也可后插”的双向插入语义。内部分割线一律按你之前确认的产品规则处理：

- 竖向内部分割线：点击后在右侧新增。
- 横向内部分割线：点击后在下方新增。

这意味着 `HoveredDivider.index` 的语义是“命中目标分割线”，不是“插入后的目标列索引”。

### 删除行为

- 悬浮整列内容区时，可删除当前列。
- 悬浮整行内容区时，可删除当前行。

### 选区定位策略

TipTap 表格命令依赖当前 selection 位于目标表格内部，因此点击按钮时需要先做“隐式选区定位”，再执行表格命令。

建议流程如下：

1. 根据命中的目标行或列，找到一个代表单元格。
2. 将 selection 设置到该单元格内容内部。
3. 调用对应 TipTap 表格命令。

命令映射建议如下：

- 左外边框新增列：`addColumnBefore`
- 内部竖向分割线或右外边框新增列：先把 selection 定位到分割线左侧的代表列，再执行 `addColumnAfter`
- 上外边框新增行：`addRowBefore`
- 内部横向分割线或下外边框新增行：先把 selection 定位到分割线上方的代表行，再执行 `addRowAfter`
- 删除列：`deleteColumn`
- 删除行：`deleteRow`

代表单元格的选择规则也需要固定：

- 左外边框：使用第一列中的代表单元格执行 `addColumnBefore`
- 右外边框：使用最后一列中的代表单元格执行 `addColumnAfter`
- 内部竖向分割线：使用该分割线左侧列中的代表单元格执行 `addColumnAfter`
- 上外边框：使用第一行中的代表单元格执行 `addRowBefore`
- 下外边框：使用最后一行中的代表单元格执行 `addRowAfter`
- 内部横向分割线：使用该分割线上方行中的代表单元格执行 `addRowAfter`

## 编辑态与可见性规则

- 仅在富文本编辑器 `editable = true` 时显示所有表格控件。
- 鼠标离开表格宿主时，隐藏新增高亮、`+` 按钮和删除入口。
- `scroller` 触发 `scroll` 事件时，应在同一滚动坐标系内重新计算命中和按钮位置。
- 当表格处于无法继续删除的极限状态时，隐藏对应删除入口。
  - 例如只剩一列时不显示删列。
  - 只剩一行时不显示删行。

## 样式与视觉约定

建议维持轻量但明确的编辑器视觉语言。

- 新增按钮：
  - 小号圆形按钮。
  - 内部显示 `+`。
  - 靠近目标边缘，不压住主要编辑内容。
- 新增高亮：
  - 覆盖整条目标分割线。
  - 颜色与编辑器强调色保持一致，但透明度适中。
- 删除按钮：
  - 显示在整行或整列内容区中部。
  - 与新增按钮做视觉区分，避免被误认为新增。

首版只要求视觉上清晰可操作，不引入复杂动画。

## 文件落点

建议改动边界如下：

```text
src/components/BMarkdown/hooks/useExtensions.ts
src/components/BMarkdown/components/PaneRichEditor.vue
src/components/BMarkdown/extensions/
  ├── tableNodeView.ts
  ├── tableControlsGeometry.ts
  └── tableControlsCommands.ts
```

职责划分如下：

- `useExtensions.ts`
  - 注册带自定义 NodeView 的 `MarkdownTable`。
- `tableNodeView.ts`
  - 实现 NodeView 生命周期、DOM 宿主、事件绑定和状态切换。
- `tableControlsGeometry.ts`
  - 维护分割线与区块命中的纯计算逻辑。
  - 只接收从 DOM 提取出的矩形数据、滚动偏移和鼠标坐标，不直接依赖 DOM 元素本身。
- `tableControlsCommands.ts`
  - 负责根据命中结果执行选区定位和增删命令。
- `PaneRichEditor.vue`
  - 迁移表格样式选择器，移除对旧 `.tableWrapper` 结构的耦合。

## 测试策略

建议覆盖三层验证。

### 纯函数测试

针对几何与命中逻辑编写单元测试，至少覆盖：

- 内部分割线命中。
- 最外边框命中。
- 行列交叉区域的优先级。
- 横向滚动后的坐标换算。
- 删除入口目标区块计算。

### NodeView 交互测试

针对富文本表格交互编写组件级测试，至少覆盖：

- hover 分割线时显示高亮和 `+`。
- hover 行内容区时显示删行入口。
- hover 列内容区时显示删列入口。
- hover 分割线交叉点时按预期优先级显示正确入口。
- 鼠标移出后隐藏控件。
- `editable = false` 时不显示控件。
- 横向滚动后 hover 分割线，高亮和按钮位置仍然准确。

### 操作命令测试

验证具体结构操作：

- 左外边框新增列。
- 右外边框新增列。
- 上外边框新增行。
- 下外边框新增行。
- 中间分割线新增列或行。
- 删除当前列。
- 删除当前行。
- 删除边缘行或列后，selection 仍落在有效单元格内。

## 风险与约束

- TipTap 表格命令依赖 selection，上层必须保证命令前的隐式定位正确。
- 合并单元格如果未来启用，会显著增加“行列区块”与“分割线”的几何复杂度。
  - 本次设计默认当前表格交互基于普通矩形网格。
- NodeView 需要妥善处理事件解绑和重新渲染，避免编辑器多实例下的悬浮状态泄漏。
- 表格样式从旧 `.tableWrapper` 向 NodeView 宿主迁移时，需要确认现有外观不倒退。

## 结论

本次表格增强采用自定义 `Table NodeView`，一次性收敛新增和删除两类交互入口。

- 新增依附分割线并支持最外边框。
- 删除依附整行或整列内容区。
- NodeView 完全接管表格宿主与 overlay，为未来继续扩展表格交互提供清晰边界。

这套设计能够在不改变表格文档模型的前提下，为 `BMarkdown` 富文本表格提供接近可视化编辑器的结构操作体验。
