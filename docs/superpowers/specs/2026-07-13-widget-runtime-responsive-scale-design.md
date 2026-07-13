# BWidget 运行态双向响应式缩放设计

## 目标

`BWidgetRuntime` 应根据宿主容器的实时可用宽度，对完整 Widget 内容进行受限的双向等比缩放：

- 宿主容器变窄时，内容同步缩小。
- 宿主容器重新变宽时，内容同步放大回设定尺寸。
- 宿主空间充足时，保持 metadata 声明的运行态显示尺寸，不继续放大。
- 展示高度根据当前宽度和基础展示比例自动计算。
- 节点位置、节点尺寸、字体、图片与间距保持统一比例，不产生拉伸变形。

`metadata.width` 和 `metadata.height` 用于描述 Widget 的理想运行态展示盒子，并作为配置尺寸下的最大显示尺寸。

## 当前问题

当前 `src/components/BWidget/Runtime.vue` 同时使用根节点完成两件事：

1. 通过 `ResizeObserver` 测量宿主可用宽度。
2. 通过内联 `width` 写入经过宿主约束后的实际展示宽度。

当配置了 `metadata.width` 或 `metadata.height` 时，宿主变窄会使根节点内联宽度同步变小。宿主随后变宽时，根节点仍保留较小的内联宽度，尺寸观察结果无法恢复到宿主真实可用宽度，内容因而只能缩小而不能重新放大。

## 方案选择

采用“外层负责测量，内层负责展示”的结构：

- 运行态根节点始终占满宿主可用宽度，作为稳定的尺寸测量边界。
- 根节点不再写入根据布局结果计算出的固定像素宽度。
- 舞台裁剪容器在宿主空间充足时使用基础展示尺寸，空间不足时使用按宿主宽度等比缩小后的尺寸。
- 内容舞台继续通过统一的 `transform: scale(...)` 等比缩放。

不直接监听父元素。组件只依赖自己的根节点，避免对父级 DOM 结构、嵌套关系和挂载位置产生额外耦合。

## 基础展示盒子

`src/components/BWidget/hooks/useRuntimeLayout.ts` 先根据内容边界和 metadata 计算基础展示盒子：

- 未配置宽高：基础展示盒子使用内容边界尺寸。
- 仅配置宽度：以配置宽度为基础宽度，高度按内容宽高比计算。
- 仅配置高度：以配置高度为基础高度，宽度按内容宽高比计算。
- 同时配置宽高：基础展示盒子使用配置宽高；内容按 `contain` 规则置于盒子内并保持居中。

metadata 中非有限数、零或负数继续视为无效配置。

## 响应式布局计算

存在有效内容且宿主宽度大于零时：

1. 计算基础展示盒子。
2. 使用 `宿主宽度 / 基础展示盒子宽度` 得到宿主比例。
3. 配置了有效 metadata 尺寸时，响应式比例取 `min(宿主比例, 1)`；未配置时继续按宿主比例填满可用宽度。
4. 实际展示宽度等于 `基础展示盒子宽度 × 响应式比例`。
5. 实际展示高度等于 `基础展示盒子高度 × 响应式比例`。
6. 内容缩放比例和舞台偏移同时乘以响应式比例。

配置 metadata 尺寸时，比例不超过 `1`，因此同一 Widget 可以随宿主宽度缩小并恢复到设定尺寸，但不会超过设定尺寸。例如基础展示盒子为 `320 × 180` 时：

- 宿主宽度为 `160px`，实际展示尺寸为 `160 × 90`。
- 宿主宽度恢复为 `320px`，实际展示尺寸恢复为 `320 × 180`。
- 宿主宽度为 `640px`，实际展示尺寸仍为 `320 × 180`。

当尚未获得有效宿主宽度时，保留基础展示盒子尺寸作为首帧回退值，避免产生非法比例。

## 组件职责

### `useRuntimeLayout`

负责纯布局计算：

- 归一化 metadata 宽高。
- 创建基础展示盒子。
- 根据宿主宽度计算受基础尺寸上限约束的展示尺寸、内容缩放和舞台偏移。

内部实现保持三层结构，避免为了单个计算步骤创建过多短函数：

1. `readRuntimeDisplaySize`：读取 metadata 宽高并完成有效性判断。
2. `createRuntimeDisplayLayout`：按“基础尺寸、基础缩放、宿主约束、结果组装”的顺序线性完成全部纯布局计算。
3. `useRuntimeLayout`：只负责创建并返回响应式 computed。

删除仅用于转发单个步骤的 `normalizeRuntimeDisplaySizeValue`、`createCenteredStageOffset`、`createRuntimeBaseLayout`、`createResponsiveRuntimeDisplayLayout` 和中间类型 `WidgetRuntimeBaseLayout`。`createRuntimeDisplayLayout` 可以保留约 35～45 行的连续计算，通过阶段注释表达意图，不再通过多层 helper 跳转阅读。

该结构调整不改变公开类型、Hook 入参、Hook 返回值或任何尺寸计算结果。

### `Runtime.vue`

负责 DOM 结构和样式绑定：

- 根节点保持 `width: 100%`，仅写入计算后的高度。
- 舞台裁剪容器使用响应式展示宽高。
- 内容舞台继续使用布局结果中的偏移和缩放。
- 内容边界变化后继续主动同步视口尺寸，保证异步循环内容能够使用最新宽度重新计算高度。

现有 Widget 脚本 Session、运行态 patch、本地快照和事件提交链路不做调整。

## 异常与边界处理

- 没有可渲染元素时，不创建无意义缩放，展示高度沿用空内容布局结果。
- 内容宽度或高度为零时，不执行除零计算。
- `ResizeObserver` 重复上报相同宽度时，布局结果保持稳定。
- 宿主宽度快速连续变化时，Vue 计算属性始终基于最新宽度派生样式，不引入额外异步任务队列。
- 同时配置 metadata 宽高时，保留原有 `contain` 和居中留白语义，仅让整个基础展示盒子跟随宿主宽度双向缩放。

## 测试策略

扩展 `test/components/BWidget/widget-runtime-view.component.test.ts` 的 `ResizeObserver` 测试替身，使测试可以在挂载后主动发送新的尺寸：

- 验证未配置 metadata 时，内容随容器宽度变化等比缩放。
- 验证配置 `metadata.width` 和 `metadata.height` 后，容器按 `504 → 160 → 640` 变化时，展示盒子从设定尺寸缩小后再恢复到设定尺寸，且不超过设定尺寸。
- 验证每次变化后高度都按比例自动计算。
- 验证节点自身尺寸和位置不被改写，视觉变化仍由舞台统一缩放完成。
- 保留同时配置宽高时的 `contain`、居中和无变形断言。

新增 `test/components/BWidget/use-runtime-layout.test.ts`，通过轻量 Hook 挂载器验证 `useRuntimeLayout` 的纯布局结果，覆盖小于、等于和大于基础展示宽度的宿主宽度。

## 预计修改文件

- `src/components/BWidget/Runtime.vue`
- `src/components/BWidget/hooks/useRuntimeLayout.ts`
- `test/components/BWidget/widget-runtime-view.component.test.ts`
- `test/components/BWidget/use-runtime-layout.test.ts`
- `changelog/2026-07-13.md`

## 非目标

- 不根据宿主高度独立拉伸或裁剪内容。
- 不在尺寸变化时重新排列普通节点。
- 不改变循环元素的列数计算规则。
- 不修改 Widget 数据、metadata 或运行态持久化状态。
- 不改变脚本生命周期、交互方法和消息发送行为。
