# Widget 侧栏元素分类展示设计

## 背景

`src/views/widget/components/SidebarTools.vue` 当前直接遍历 `WIDGET_ELEMENT_SCHEMAS`，将所有可创建元素放在同一个两列网格中。随着元素类型增加，单层列表会降低查找效率，也无法表达元素用途。

本次调整将元素按用途分类展示，同时保持现有拖拽创建交互、元素注册顺序和两列网格样式。

## 目标

- 工具侧栏使用分组标题展示元素。
- 所有分组默认展开，不增加折叠状态或标签切换。
- 当前提供两个分类：`基础` 和 `交互`。
- 矩形、文本和图片归入 `基础`；按钮归入 `交互`。
- 元素在自身 Schema 中声明分类，新增元素时无需修改侧栏分类映射。
- 保持当前拖拽创建行为不变。

## 非目标

- 不增加分组折叠、展开或状态持久化。
- 不增加元素搜索、收藏或最近使用功能。
- 不允许用户自定义分类或分类顺序。
- 不修改元素的创建、渲染、设置器或运行时行为。

## 方案比较

### 方案一：分类定义表与 Schema 分类键

集中定义分类键、显示名称和顺序，每个元素 Schema 只声明所属分类。侧栏根据 Schema 分类键分组，再按照分类定义表渲染。

优点：分类顺序和文案集中管理；Schema 是元素归属的唯一事实来源；新增元素扩展路径清晰。

缺点：需要同时增加分类类型和分类定义表。

### 方案二：Schema 直接保存分类显示名称

每个 Schema 直接保存 `基础` 或 `交互`，侧栏按照字符串分组。

优点：实现改动较少。

缺点：分类名称重复；重命名需要修改多个 Schema；分类顺序只能依赖额外逻辑或元素首次出现顺序。

### 方案三：侧栏维护完整分组数组

`SidebarTools.vue` 自行声明各分组及其元素名称。

优点：展示结构集中在视图文件中。

缺点：元素注册和侧栏分组形成两份数据源，新增元素时容易遗漏，且元素领域信息泄漏到页面组件。

采用方案一。

## 类型与注册设计

在 `src/components/BWidget/elements/roles.ts` 中集中定义有序分类，并从常量派生分类键和分类定义类型：

```typescript
export const WIDGET_ELEMENT_ROLES = [
  { key: 'basic', label: '基础' },
  { key: 'interaction', label: '交互' }
] as const;

export type WidgetElementRole = (typeof WIDGET_ELEMENT_ROLES)[number]['key'];
export type WidgetElementRoleDefinition = (typeof WIDGET_ELEMENT_ROLES)[number];
```

分类定义常量是唯一事实来源。新增分类必须先加入该常量，分类键类型会随之自动扩展，避免合法 `role` 缺少可渲染分类定义而导致元素静默消失。

`WidgetElementSchema` 增加必填的 `role` 字段，用于声明元素在工具侧栏中的分类角色：

```typescript
export interface WidgetElementSchema<TMetadata extends WidgetMetadata = WidgetMetadata> {
  /** 元素所属工具分类 */
  role: WidgetElementRole;
  // 其他现有字段保持不变
}
```

`src/components/BWidget/elements/types.ts` 通过类型导入消费 `WidgetElementRole`；需要角色常量或角色类型的模块直接从 `src/components/BWidget/elements/roles.ts` 导入。`src/components/BWidget/elements/index.ts` 只负责 Schema、View 和 Setter 注册，不重复转出角色定义。角色定义数组顺序仍是分类显示顺序的唯一来源，元素在分类内保持 `WIDGET_ELEMENT_SCHEMAS` 中的注册顺序。

各元素 Schema 的分类归属如下：

| 元素 | Schema 名称 | 分类键 | 显示分组 |
| --- | --- | --- | --- |
| 矩形 | `rect` | `basic` | 基础 |
| 文本 | `text` | `basic` | 基础 |
| 图片 | `image` | `basic` | 基础 |
| 按钮 | `button` | `interaction` | 交互 |

## 侧栏展示设计

`src/views/widget/components/SidebarTools.vue` 使用 `lodash-es` 的 `groupBy` 对 `WIDGET_ELEMENT_SCHEMAS` 分组，遵循项目工具库规范，不手写数组分组函数。

侧栏仍保留外层 `SidebarPanel`。内容区依次渲染非空分类，每个分类包含标题和原有两列工具网格：

```text
基础
[ 矩形 ] [ 文本 ]
[ 图片 ]

交互
[ 按钮 ]
```

分类标题只负责信息分隔，不提供点击事件，也不表现为可折叠控件。空分类不渲染标题和网格，避免出现无内容分区。

工具项继续调用现有 `handleToolPointerdown(schema, event)`，不修改拖拽控制器、事件参数或 `drag-start` 通知。

## 组件数据流

```text
元素 schema.role
        │
        ▼
WIDGET_ELEMENT_SCHEMAS
        │
        ├── groupBy(role)
        │
        ▼
WIDGET_ELEMENT_ROLES（决定标题与顺序）
        │
        ▼
SidebarTools 分组标题 + 两列工具网格
        │
        ▼
现有 handleToolPointerdown 拖拽创建
```

分类仅影响工具侧栏的展示。创建元素时仍将完整 Schema 传给拖拽控制器，后续画布创建链路不读取分类字段。

## 样式设计

- 分类容器纵向排列，分类之间保留明显但紧凑的间距。
- 分类标题使用次级文本颜色和较小字号，视觉层级低于 `SidebarPanel` 的“组件”主标题。
- 每个分类内部沿用现有两列网格及工具项样式。
- 新增样式选择器使用完整类名，不使用 `&__element` 生成 BEM 子类名。
- 不引入动画、折叠箭头或额外图标。

建议类名：

- `sidebar-tools__categories`
- `sidebar-tools__category`
- `sidebar-tools__category-title`
- `sidebar-tools__tool-grid`
- `sidebar-tools__tool-item`

现有 `sidebar-panel__tool-grid` 和 `sidebar-panel__tool-item` 属于页面局部样式，可在本次调整中改为 `sidebar-tools` 前缀，使类名职责与组件文件一致。

## 异常与兼容处理

- `WidgetElementSchema.role` 为必填联合类型，仓库内注册元素无法使用未知分类角色通过类型检查。
- 分类定义存在但没有元素时，侧栏跳过该分类。
- 该字段只存在于代码注册 Schema 中，不写入 Widget 元素持久化数据，因此不会改变现有 Widget 文件协议，也不需要数据迁移。
- 原有 `WIDGET_ELEMENT_SCHEMAS` 导出和查询函数保持兼容。

## 测试设计

### 元素注册测试

扩展 `test/components/BWidget/widget-elements-registry.test.ts`：

- 验证分类定义顺序为 `basic`、`interaction`。
- 验证矩形、文本、图片属于 `basic`。
- 验证按钮属于 `interaction`。

### 侧栏组件测试

扩展 `test/views/widget/sidebar-tools-drag.test.ts` 或增加聚焦分类展示的测试：

- 渲染“基础”和“交互”两个标题。
- 基础分组包含矩形、文本和图片。
- 交互分组包含按钮。
- 分类顺序固定为基础在前、交互在后。
- 指针按下后仍将对应 Schema 传入拖拽控制器，并继续触发 `drag-start`。

### 静态检查

实现后执行：

```bash
pnpm exec vitest run test/components/BWidget/widget-elements-registry.test.ts test/views/widget/sidebar-tools-drag.test.ts
pnpm exec eslint src/components/BWidget/elements src/views/widget/components/SidebarTools.vue --ext .vue,.ts
pnpm exec stylelint 'src/views/widget/components/SidebarTools.vue'
pnpm exec tsc --noEmit
```

## 验收标准

- 组件侧栏显示“基础”和“交互”两个非空分组标题。
- 矩形、文本、图片显示在基础分组，按钮显示在交互分组。
- 所有分组默认展示全部内容，没有折叠交互。
- 元素拖拽创建行为与调整前一致。
- 新增元素只需在 Schema 中填写合法分类键，即可进入相应分组。
- 分类展示和注册相关测试通过，ESLint、Stylelint 和 TypeScript 检查通过。
