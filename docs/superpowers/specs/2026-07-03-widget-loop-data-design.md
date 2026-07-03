# Widget 循环数据设计

## 背景

Widget 编辑器已经支持通过 schema 描述 `input` 和运行态 `data`，文本元素也可以用 `{{ input.city }}`、`{{ weather.temperature }}` 这类模板表达式读取运行态上下文。当前缺口是列表类 UI：用户可以设计一个元素或一组元素作为模板，但运行态还不能按数组数据重复渲染它们。

本设计为 `src/views/widget/components/PanelSettings.vue` 增加“高级”页签中的循环数据能力。循环配置写在元素 `metadata` 上，带配置的元素作为循环主元素。运行态根据主元素和同组元素生成临时渲染节点，不改写持久化的 `WidgetData.elements`。

## 目标

- 支持单个文本、矩形等元素按数组数据循环渲染。
- 支持组合按数组数据循环渲染，组合内元素保持相对位置。
- 循环数据源可来自 `input` 或 `data` 中的数组路径。
- 循环布局采用网格，支持配置每行数量、横向间距和纵向间距。
- 循环模板支持可配置迭代项变量名和索引变量名，默认是 `item` 和 `index`。
- 设计期画布只展示真实模板元素，不展开循环结果。
- 数组为空、路径不存在或路径值不是数组时，运行态不渲染该循环目标。

## 非目标

- 不新增容器元素或父子元素模型。
- 不让循环展开结果参与设计期选中、拖拽、图层排序或文件保存。
- 不实现设计期画布循环预览。
- 不实现空状态文案配置。
- 不支持嵌套循环。
- 不改变现有非循环元素的绑定语义。

## 数据结构

循环配置写入元素 `metadata.loop`。建议新增类型定义和读写工具，避免业务代码直接操作裸对象。

```ts
interface WidgetElementLoopConfig {
  /** 是否启用循环渲染 */
  enabled: boolean;
  /** 数组数据源路径，例如 input.items 或 products */
  source: string;
  /** 每行渲染数量 */
  columns: number;
  /** 横向间距 */
  columnGap: number;
  /** 纵向间距 */
  rowGap: number;
  /** 迭代项变量名 */
  itemName: string;
  /** 索引变量名 */
  indexName: string;
}
```

默认值：

- `enabled`: `false`
- `source`: `''`
- `columns`: `1`
- `columnGap`: `12`
- `rowGap`: `12`
- `itemName`: `'item'`
- `indexName`: `'index'`

单元素循环时，带 `metadata.loop` 的元素就是模板。组合循环时，如果循环主元素存在 `groupId`，运行态收集同一个 `groupId` 的所有元素作为模板。同一个组合内如果多个元素都有启用的循环配置，按 `elements` 数组顺序取第一个启用配置作为主元素，其余启用配置在运行态忽略。

## 高级页签

`src/views/widget/components/PanelSettings.vue` 的单元素设置面板新增“高级”页签，放置循环数据配置。建议实现为独立组件，例如 `src/views/widget/components/AdvancedSetter.vue`，内部再拆出循环配置逻辑，避免继续扩大 `PanelSettings.vue`。

单元素选中时：

- “高级”页签直接编辑该元素的 `metadata.loop`。
- 如果该元素属于组合，页签说明当前循环会作用于整个组合。

组合选中时：

- 图层面板点组合行后，当前是 `select === null` 且 `selectedElementIds` 为多个元素。
- 多选设置面板需要支持“高级”页签，识别这些元素是否属于同一组合。
- 如果是同一组合，编辑该组合的循环主元素配置。
- 如果组合里没有循环主元素，默认选择组合内按 `elements` 数组顺序出现的第一个元素作为循环主元素写入配置。
- 如果当前多选不是同一组合，高级页签不展示循环配置，保持普通多选设置。

高级页签字段：

- 启用循环：开关。
- 数据源：只列出 `input` 和 `data` schema 中的数组路径。
- 迭代变量名：文本输入，默认 `item`。
- 索引变量名：文本输入，默认 `index`。
- 每行数量：数字输入，最小值为 `1`。
- 横向间距：数字输入，最小值为 `0`。
- 纵向间距：数字输入，最小值为 `0`。

当没有可选数组路径时，数据源下拉显示空选项状态。本阶段不支持手动输入路径，只做 schema 数组路径选择，保证配置来源可控；手动路径输入可作为后续增强。

## 数据源路径

需要新增数组路径收集工具。输入是 `WidgetData.inputSchema` 和由执行脚本推导出的 data schema，输出下拉选项。

路径规则沿用现有绑定习惯：

- `input` 数组字段使用显式根，例如 `input.items`、`input.order.items`。
- `data` 数组字段使用直接路径，例如 `products`、`order.items`。
- 非标识符字段沿用括号格式，例如 `input["order-items"]`。

运行态读取路径时复用或抽取 `src/components/BWidget/utils/widgetBindings.ts` 中的安全路径解析逻辑，避免另写不一致的字符串解析器。

data 数组路径依赖脚本推导出的 data schema，因此只会列出能被 `buildWidgetDataSchema` 识别到的数组字段。动态拼接、远端响应直接透传等无法静态推导的数组字段不会出现在本阶段的数据源下拉中；用户需要在 `Widget({ data })` 或可推导的 `this.xxx = []` 写法中声明数组结构。

## 运行态展开

`src/components/BWidget/Runtime.vue` 在调用运行态布局前先执行循环展开。建议新增独立工具，例如 `src/components/BWidget/utils/widgetLoop.ts`，负责把真实元素和渲染上下文转换为运行态可渲染元素。

展开流程：

1. 扫描 `elements`，找出启用 `metadata.loop` 的循环主元素。
2. 为每个循环目标建立模板元素集合：单元素循环取主元素自身；组合循环取同组所有元素。
3. 被模板元素集合覆盖的真实元素不再作为普通元素渲染。单元素循环会排除主元素本身；组合循环会排除同组所有模板元素，避免同时出现模板本体和展开副本。
4. 根据 `source` 从 `renderContext.input` 或 `renderContext.data` 读取数组。
5. 若读取结果不是数组或数组为空，返回空模板结果。
6. 为每个数组项创建一次迭代上下文，同一次迭代中的模板元素共享相同的迭代项和索引值。
7. 在当前迭代上下文下计算模板外接框：
   - 单元素循环使用该元素通过 `getWidgetShapeRenderSize(element, renderContext)` 重新计算后的运行态渲染尺寸。
   - 组合循环使用组内所有元素的外接框，外接框计算复用运行态布局中的视觉边界逻辑，包含旋转元素的边界处理。
   - 组合外接框原点记为 `{ x: templateMinX, y: templateMinY }`，后续用于把组内元素转换为相对坐标。
8. 对每个数组项生成一份临时元素：
   - 临时 ID 使用稳定格式，例如 `${originId}__loop_${itemIndex}`。
   - 复制元素的样式、标题、模型尺寸、旋转和 metadata；运行态布局仍会基于该临时元素和它的迭代上下文重新调用 `getWidgetShapeRenderSize(...)`。
   - 网格位置按 `column = index % columns`，`row = Math.floor(index / columns)` 计算。
   - 网格单元原点为 `{ x: templateMinX + column * (templateWidth + columnGap), y: templateMinY + row * (templateHeight + rowGap) }`。
   - 单元素循环的临时元素位置为 `{ x: originPosition.x + column * (templateWidth + columnGap), y: originPosition.y + row * (templateHeight + rowGap) }`。
   - 组合循环的临时元素位置为 `{ x: originPosition.x - templateMinX + cellOrigin.x, y: originPosition.y - templateMinY + cellOrigin.y }`，确保组内元素相对位置保持不变，且第一轮循环保留组合模板的原始画布位置。
9. 每个临时元素携带自己的局部循环上下文；同一次迭代生成的所有组合临时元素共享同一个局部上下文对象。

循环展开结果只用于运行态渲染和运行态内容边界计算，不回写 `WidgetData.elements`。

## 绑定上下文

运行态内部为每个临时元素提供派生上下文，公开的 `types/widget.d.ts` 中 `WidgetRenderContext` 仍保持 `input` 与 `data` 两个字段。局部循环变量只存在于 BWidget 渲染内部，不进入跨层协议。

目标行为：

- `{{ item.name }}` 从当前循环项读取。
- `{{ index }}` 从当前循环下标读取。
- 用户把变量名改成 `record` 和 `rowIndex` 后，模板使用 `{{ record.name }}` 和 `{{ rowIndex }}`。
- 现有 `{{ input.city }}` 和 `{{ weather.temperature }}` 继续按原语义解析。

`src/components/BWidget/utils/widgetBindings.ts` 当前只支持 `input` 根和默认 `data` 路径。它需要支持一组动态局部根：

- 表达式首段命中局部根时，从局部上下文读取。
- 表达式显式命中 `input` 时，从 `renderContext.input` 读取。
- 其他表达式仍从 `renderContext.data` 读取。

为了避免变量名冲突，局部根优先级高于 data 直接字段。也就是说，如果循环变量名是 `item`，`{{ item.name }}` 优先读取循环项；需要读取 data 中的 `item` 字段时，用户应避免把迭代变量命名为 `item`，或改用其他迭代变量名。

## 渲染上下文传递

当前 `WidgetNode.vue` 通过 provide/inject 读取全局 `renderContext`。循环展开后，每个临时元素需要自己的局部上下文。实现方式固定为：

- 在运行态渲染项结构中保存 `renderContext`，`Runtime.vue` 渲染 `WidgetNode` 时把上下文作为 prop 传入。
- `WidgetNode.vue` 为单个节点 provide 对应上下文；没有传入节点级上下文时继续使用上层全局上下文。
- 普通非循环元素继续使用全局上下文。

这能保持元素视图和 `useElementContent` 的使用方式不变，让文本元素仍通过 `useRenderContext()` 解析模板。

## 错误和边界

- `columns` 小于 `1` 时按 `1` 处理。
- `columnGap` 和 `rowGap` 小于 `0` 时按 `0` 处理。
- `itemName` 和 `indexName` 为空时回退到 `item` 和 `index`。
- `itemName` 和 `indexName` 相同，索引变量覆盖风险较高；设置面板应阻止保存相同名称。
- 循环数据不是数组时不渲染循环目标。
- 组合循环中模板元素层级顺序保持原始 `elements` 顺序。
- 循环展开产生的临时 ID 不能与真实元素 ID 混淆，不参与运行态脚本数据 patch。

## 实现区域

- `src/components/BWidget/types.ts`：新增循环配置类型。
- `src/components/BWidget/utils/widgetLoop.ts`：新增循环配置读写、数据源路径收集、运行态展开工具。
- `src/components/BWidget/utils/widgetBindings.ts`：支持局部循环变量根。
- `src/components/BWidget/hooks/useElementVariables.ts`：在循环配置存在时为 Setter 变量候选加入迭代项和索引变量。
- `src/components/BWidget/Runtime.vue`：布局前使用循环展开结果，并为每个运行态节点提供元素级上下文。
- `src/components/BWidget/renderers/WidgetNode.vue`：支持节点级渲染上下文覆盖。
- `src/views/widget/components/PanelSettings.vue`：新增“高级”页签调度。
- `src/views/widget/components/AdvancedSetter.vue`：新增循环设置 UI。
- `test/components/BWidget/*` 和 `test/views/widget/*`：补充工具、运行态、绑定和设置面板测试。
- `changelog/2026-07-03.md`：记录循环数据功能。

## 测试计划

新增或更新以下测试：

- 单元素循环按数组长度生成临时节点。
- 单元素循环按 `columns`、`columnGap`、`rowGap` 生成网格位置。
- 组合循环按组合外接框生成网格位置，并保持组内元素相对位置。
- 空数组、缺失路径、非数组数据不渲染循环目标。
- 同一组合多个循环主元素时只使用第一个启用配置。
- `{{ item.name }}`、`{{ index }}` 和自定义变量名能解析。
- 现有 `{{ input.city }}`、`{{ weather.temperature }}` 解析不回退。
- 高级页签在单元素选中时展示并写回 `metadata.loop`。
- 高级页签在同一组合多选时展示并写回循环主元素。
- 非同组多选不展示组合循环配置。
