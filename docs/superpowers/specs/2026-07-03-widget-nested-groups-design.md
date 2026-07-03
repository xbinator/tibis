# Widget 嵌套组合数据设计

## 背景

Widget 编辑器当前通过元素 `metadata.groupId` 表达组合关系。这个模型会把组合关系散落在多个元素上，图层面板、选区扩展、复制粘贴、循环渲染等逻辑都需要反查同一个 `groupId` 的元素集合。用户希望重构为真实嵌套关系：组合本身是一个元素，子元素直接存在组合元素内部。

本设计直接改造 `WidgetData.elements` 的持久化契约，不兼容旧的 `metadata.groupId` 组合数据，也不提供旧数据迁移层。

## 目标

- 将 `WidgetData.elements` 从扁平数组改为递归元素树。
- 保留现有 `WidgetElement` 命名，不引入 `kind` 字段，也不引入额外的 shape 或 frame 类型概念。
- 使用 `name: 'group'` 表示组合元素。
- 组合元素拥有自己的 `position`、`size`、`rotation`、`style`、`metadata` 和 `children`。
- 组内子元素的 `position` 始终是相对直接父组合左上角的坐标。
- 支持多层嵌套组合。
- 支持组合作为卡片、面板、画框等可见容器使用；无可见样式时也可作为纯组合容器使用。
- 组合、拆组、移动、缩放、复制、删除、排序都基于树结构完成。

## 非目标

- 不迁移旧 `metadata.groupId` 文件数据。
- 不保留 `metadata.groupId` 作为新组合主逻辑。
- 不引入 `kind` 字段。
- 不新增独立的 shape 或 frame 类型。
- 第一阶段不支持跨父级组合。
- 第一阶段不支持图层拖拽跨父级移动节点。
- 不重做 Widget 元素注册体系；普通元素仍通过现有 `name` 查注册配置和属性面板。

## 数据结构

`WidgetElement` 保持一个统一接口，新增可选 `children` 字段。普通元素没有 `children`；组合元素使用 `name: 'group'` 并拥有 `children`。

```ts
interface WidgetElement {
  /** 真实元素 ID */
  id: string;
  /** 元素注册名称，组合固定为 group */
  name: string;
  /** 元素显示名称 */
  label: string;
  /** 元素图标 */
  icon: string;
  /** 用户自定义名称 */
  title: string;
  /** 相对直接父级的坐标；顶层元素相对画布 */
  position: WidgetPoint;
  /** 元素尺寸 */
  size: WidgetSize;
  /** 旋转角度，单位为度 */
  rotation: number;
  /** 元素样式，group 可用来表现背景、边框、圆角等 */
  style: WidgetElementStyle;
  /** 组件自定义元数据 */
  metadata: WidgetMetadata;
  /** 子元素，仅 group 使用 */
  children?: WidgetElement[];
}
```

`WidgetData.elements` 继续保留字段名，但语义变为顶层元素树：

```ts
interface WidgetData {
  elements: WidgetElement[];
}
```

示例：

```json
{
  "elements": [
    {
      "id": "group-1",
      "name": "group",
      "label": "组合",
      "icon": "lucide:group",
      "title": "卡片",
      "position": { "x": 100, "y": 80 },
      "size": { "width": 320, "height": 200 },
      "rotation": 0,
      "style": {
        "backgroundColor": "#fff",
        "borderColor": "#ddd",
        "borderRadius": 8
      },
      "metadata": {},
      "children": [
        {
          "id": "text-1",
          "name": "text",
          "label": "文本",
          "icon": "lucide:type",
          "title": "标题",
          "position": { "x": 16, "y": 16 },
          "size": { "width": 120, "height": 36 },
          "rotation": 0,
          "style": {},
          "metadata": {}
        }
      ]
    }
  ]
}
```

## 坐标规则

顶层元素的 `position` 是画布坐标。组合内子元素的 `position` 是相对直接父组合左上角的坐标。多层嵌套时，渲染和命中检测通过路径上的父级坐标累加得到画布绝对坐标。

如果 `group.position = { x: 100, y: 80 }`，`child.position = { x: 16, y: 16 }`，那么画布绝对位置是 `{ x: 116, y: 96 }`。拖动子元素时只更新 `child.position`，不会把子元素提升到全局坐标，也不会写入绝对坐标。

所有编辑操作都发生在节点的直接父级坐标系中：

- 移动顶层元素：更新顶层元素画布坐标。
- 移动组合：更新组合自己的 `position`，`children` 不变。
- 移动组合内子元素：更新子元素相对直接父组合的 `position`。
- 多层嵌套子元素移动：仍只更新直接父级坐标系下的 `position`。

## 树工具

新增树工具模块，集中处理递归查找和更新，避免业务代码直接手写深层遍历。建议位置为 `src/components/BWidget/utils/widgetTree.ts`。

核心工具：

- 根据 ID 或路径查找节点。
- 读取节点直接父级和同级列表。
- 判断多个节点是否属于同一父级。
- 在同一父级中插入、删除、替换、排序节点。
- 递归复制子树并生成新 ID。
- 扁平化树为渲染快照。
- 将局部坐标转换为画布绝对坐标。
- 将画布绝对坐标转换为某个父级内的局部坐标。
- 计算一个节点或一组同父级节点的外接框。

扁平化渲染快照可使用如下结构：

```ts
interface WidgetRenderNode {
  /** 原始元素 */
  element: WidgetElement;
  /** 直接父元素 ID，顶层为 null */
  parentId: string | null;
  /** 从顶层到当前节点的 ID 路径 */
  path: string[];
  /** 嵌套深度，顶层为 0 */
  depth: number;
  /** 画布绝对坐标 */
  absolutePosition: WidgetPoint;
}
```

## 渲染与命中检测

渲染层不再直接假设 `elements` 是扁平数组，而是先从元素树创建渲染快照。

渲染规则：

- 顶层 `elements` 仍按从底层到顶层存储。
- 每个 `group.children` 也按从底层到顶层存储。
- 渲染快照按树的层级顺序输出，并保留每个节点的绝对坐标。
- `group` 自己参与渲染、命中检测和选区展示。
- `group` 有背景、边框、圆角、透明度等样式时，运行时渲染为可见容器。
- `group` 没有可见样式时，运行时只作为坐标上下文，编辑态选中时显示选框。
- 子元素渲染使用渲染快照里的绝对坐标，但保存数据时仍保留局部坐标。

点击普通元素选中该元素。点击组合容器选中该组合。双击组合或通过图层面板选择子元素时，可以激活组内子元素编辑，避免选中组合后无法操作内部元素。

## 选区模型

内部选区仍使用 `selection: string[]` 存储选中 ID。涉及树操作时，必须通过树工具解析节点路径和父级关系，不能只在顶层数组里查找 ID。

规则：

- 选择组合时，选区只包含组合 ID，不自动展开为全部子元素 ID。
- 删除组合时删除整棵子树。
- 移动组合时只移动组合本身。
- 进入组内编辑时，激活目标记录为子元素 ID 或路径，设置面板展示子元素属性。
- 多选操作第一阶段要求所有选中节点属于同一直接父级。
- 不同父级的多选可以展示选中状态，但禁用组合、批量布局、同父级排序等需要同父级语义的操作。

## 编辑操作

### 创建组合

组合只支持同一直接父级下的多个节点。创建时：

1. 读取选中节点在其父级内的顺序。
2. 计算这些节点在父级坐标系下的外接框。
3. 创建 `name: 'group'` 的新元素，`position` 为外接框左上角，`size` 为外接框尺寸。
4. 将选中节点从父级列表中移入 `group.children`。
5. 每个 child 的 `position` 减去 group 的外接框左上角，转为组内局部坐标。
6. 新 group 插入到原选中节点所在层级位置。

### 拆组

拆组把 `group.children` 提升到 group 的直接父级：

1. 读取 group 的直接父级和当前位置。
2. 将每个 child 的局部坐标转换为 group 父级坐标系下的坐标。
3. 用转换后的 children 替换原 group。
4. 拆组后选中被提升的 children。

### 移动

移动操作接收节点 ID 和目标局部坐标。树工具根据节点直接父级更新该节点的 `position`。

- 移动 group 不改 children。
- 移动 child 不改父 group。
- 渲染层可以使用绝对坐标预览，但提交变更前必须转换回直接父级局部坐标。

### 缩放

缩放普通元素时继续更新该元素 `position` 和 `size`。

缩放 group 时更新 group 的 `position` 和 `size`，并按比例同步缩放 children：

- child.position.x 按 `nextWidth / currentWidth` 缩放。
- child.position.y 按 `nextHeight / currentHeight` 缩放。
- child.size.width 和 child.size.height 按相同比例缩放。
- 嵌套 group 的 `position` 和 `size` 同样缩放；其内部 children 保持相对该嵌套 group 的局部结构。

### 复制粘贴

复制节点时复制完整子树。粘贴时：

- 递归生成新的元素 ID。
- 粘贴到当前激活父级内；没有激活父级时粘贴到顶层。
- 保持子树内部相对坐标不变。
- 粘贴根节点按目标落点或默认偏移调整 `position`。

### 删除

删除选中节点时，从直接父级列表移除该节点。删除 group 会连同 children 一起删除。

### 层级排序

层级排序只在同一父级列表内执行：

- 顶层排序修改 `WidgetData.elements`。
- 组内排序修改对应 `group.children`。
- 第一阶段图层拖拽不跨父级移动节点。

## 图层面板

`src/views/widget/components/SidebarLayer.vue` 改为直接展示元素树，不再根据 `metadata.groupId` 临时拼装组合行。

行为：

- 每个 `name: 'group'` 元素展示为可展开行。
- children 递归缩进展示。
- 组合行可选中、复制、删除、排序。
- 普通元素行可选中、复制、删除、排序。
- 拖拽排序第一阶段只允许同父级内排序。
- 跨父级拖拽先禁用或回退，不修改数据。
- 折叠状态以 group ID 记录。

## 属性面板

`src/views/widget/components/PanelSettings.vue` 继续根据当前选中目标调度设置面板。

行为：

- 普通元素继续使用 `getWidgetElementSetter(select.name)` 查找专属属性面板。
- `name: 'group'` 使用通用设计与样式面板，可以编辑标题、位置、尺寸、背景、边框、圆角、透明度等。
- group 如果没有设置可见样式，运行时表现为透明容器；编辑态仍显示选框和图层行。
- 多选面板只对同一直接父级的选中节点开放组合、批量布局和层级操作。
- 不同父级多选时展示限制提示，并禁用需要同父级语义的操作。

## 循环渲染

循环配置继续写在元素 `metadata` 中。树结构下不再通过 `groupId` 收集组合模板。

规则：

- 如果启用循环的是普通元素，则重复渲染该元素。
- 如果启用循环的是 `name: 'group'`，则以整棵 group 子树作为模板重复渲染。
- 循环展开只影响运行态临时渲染结果，不回写 `WidgetData.elements`。
- 每次循环复制完整子树，保留内部相对坐标。
- 循环生成的临时节点仍需要渲染快照提供绝对坐标。
- 嵌套 group 模板按树结构递归展开。

## 文件与模块影响

主要改动区域：

- `src/components/BWidget/types.ts`：调整 `WidgetElement`，新增 `children?: WidgetElement[]`，移除新逻辑对 `WidgetShapeElement` 扁平别名的依赖。
- `src/components/BWidget/utils/widgetTree.ts`：新增树查找、更新、坐标转换、扁平化、外接框工具。
- `src/components/BWidget/utils/widgetGroups.ts`：删除或收缩为 group 元素判断工具，不再读取 `metadata.groupId`。
- `src/components/BWidget/utils/boardTransforms.ts`：重写组合、拆组、移动、缩放、复制粘贴、删除、排序逻辑为树操作。
- `src/components/BWidget/hooks/useWidgetBoard.ts`：创建 group ID、调度树变换、处理同父级限制。
- `src/components/BWidget/hooks/useModelSync.ts`：同步树结构快照。
- `src/components/BWidget/index.vue`：选区、命中、移动、缩放、上下文菜单改为基于树路径和渲染快照。
- `src/components/BWidget/utils/widgetGeometry.ts`：支持渲染快照与绝对坐标命中。
- `src/components/BWidget/utils/widgetLoop.ts`：循环模板从 group 子树读取。
- `src/views/widget/index.vue`：侧栏复制、删除、排序、多选布局等改为树操作。
- `src/views/widget/components/SidebarLayer.vue`：递归展示元素树。
- `src/views/widget/components/PanelSettings.vue`：支持 group 作为真实选中目标。
- `src/views/widget/components/BatchSetter.vue`：限制同父级多选操作。
- `test/components/BWidget/*` 和 `test/views/widget/*`：更新模型、变换、渲染、面板测试。

## 错误和边界

- `name: 'group'` 但缺失 `children` 时按空数组处理。
- 普通元素如果存在 `children`，规范化时应移除该字段；只有 `name: 'group'` 的元素可以作为容器。
- group 尺寸不能小于最小元素尺寸。
- 缩放 group 时如果原宽高为 `0`，按比例 `1` 处理，避免除零。
- 组合操作要求同一直接父级；否则返回原状态并记录错误。
- 图层跨父级拖拽第一阶段不生效。
- 旧 `metadata.groupId` 数据不会转换成 group，旧文件里的这些字段只作为普通 metadata 保留或被规范化清理。

## 测试计划

新增或更新以下测试：

- 创建 group 时把同父级选中节点移入 `children`，并转成相对坐标。
- 拆组时把 children 提升回父级，并转成父级局部坐标。
- 移动 group 只更新 group.position，不修改 children。
- 移动 group 内 child 只更新 child 相对父级的 position。
- 多层嵌套 child 移动只更新直接父级坐标系。
- 缩放 group 会缩放 children 的 position 和 size。
- 复制 group 会复制完整子树并递归生成新 ID。
- 删除 group 会删除整棵子树。
- 同父级排序只修改对应父级列表。
- 不同父级组合和排序被拒绝。
- 渲染快照能为嵌套元素计算正确绝对坐标。
- 图层面板递归展示 group.children。
- 属性面板选中 group 时展示通用设计和样式设置。
- group 循环渲染会复制整棵子树。
- 旧 `metadata.groupId` 不再触发组合行为。
