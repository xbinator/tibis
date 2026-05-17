·# BMarkdown 批注功能设计

## 背景

`src/components/BMarkdown` 当前已经具备以下基础能力：

- Rich 模式使用 TipTap，并通过 `src/components/BMarkdown/hooks/useExtensions.ts` 接管 Markdown 的解析与序列化
- Source 模式使用 CodeMirror，直接编辑原始 Markdown
- 两种模式共享同一份文档内容，并允许在模式间来回切换

这意味着“批注”如果要长期稳定，最合适的落点不是额外的本地侧存储，也不是只存在于富文本视图里的装饰层，而是直接成为 Markdown 文档的一部分。这样才能同时满足：

1. Rich / Source 两种模式使用同一份真实数据
2. 文件复制、导出、同步时不丢批注
3. 后续扩展 resolved、author、id 等属性时有稳定语法载体

## 目标

1. 为 `BMarkdown` 增加可写回 Markdown 的批注能力
2. 同时支持行内批注和块级批注
3. Rich / Source 模式都能查看、编辑并保留批注语法
4. 在模式切换与序列化往返中保持批注结构稳定，不吞内容、不改语义
5. 第一版控制范围，只覆盖单条批注的创建、编辑、删除和展示

## 非目标

1. 本次不实现评论线程、回复、@提及、多人协作
2. 本次不实现批注列表页或全局批注面板
3. 本次不实现 resolved 历史、审阅时间线等审稿工作流
4. 本次不支持跨多个不连续区域的复合批注
5. 本次不保证第三方 Markdown 渲染器能理解该语法，只保证 Tibis 内部完整读写

## 设计结论

采用“自定义 Markdown 语法 + Rich/Source 双模式共用同一份文档内容”的方案：

- 行内批注使用自定义行内属性标记
- 块级批注使用自定义容器语法
- Rich 模式分别映射为 TipTap `Mark` 与 `Node`
- Source 模式直接编辑原始 Markdown，同时补充语法高亮与快捷操作

不采用“批注元数据单独存数据库”的方案，因为它会引入正文与批注锚点双写、一致性收敛和导出丢失问题。

## 语法设计

### 行内批注

```md
[需要改写]{comment="语气太硬"}
```

语义说明：

- `[]` 内是被批注的正文内容
- `comment="..."` 是批注正文
- 第一版要求 `[]` 内必须有内容，不支持空范围批注

### 块级批注

```md
:::comment{content="这里要补背景"}
这里是一整段被批注的内容

- 列表
- 引用
- 代码块
:::
```

语义说明：

- `:::comment` 声明一个块级批注容器
- `content="..."` 保存批注正文
- 容器内部承载真正被批注的块内容

### 属性扩展

第一版统一预留以下属性模型：

- `id`: 稳定唯一标识，用于后续定位、跳转、删除、resolved 状态扩展
- `content`: 批注正文
- `resolved`: 预留字段，第一版不暴露完整 UI，但解析层允许未来扩展

Markdown 中第一版的最小稳定写法建议为：

```md
[需要改写]{comment="语气太硬" id="comment-xxx"}
```

```md
:::comment{content="这里要补背景" id="comment-yyy"}
被批注的块内容
:::
```

如果旧文档缺少 `id`，编辑器在首次编辑该批注时再补齐，不要求导入时立即重写整篇文档。

## 数据模型

建议新增统一批注模型，供 Rich / Source 共享：

```ts
interface EditorCommentAttrs {
  id: string;
  content: string;
  resolved?: boolean;
}

interface InlineComment extends EditorCommentAttrs {
  type: 'inline';
}

interface BlockComment extends EditorCommentAttrs {
  type: 'block';
}
```

Rich 模式不额外维护独立批注仓库，而是把这些属性直接挂在 TipTap 节点或 mark 上。Source 模式也不单独解析为外部 store，而是按需从当前源码中识别。

## Rich 模式设计

### 行内批注

在 `src/components/BMarkdown/hooks/useExtensions.ts` 中新增 `InlineCommentMark`：

- 表示一段被批注的内联文本
- attrs 至少包含 `id`、`content`、`resolved`
- 负责：
  - 解析 Markdown 行内语法
  - 将 mark 渲染回 Markdown
  - 在编辑器内提供高亮样式与点击命中能力

交互建议：

1. 用户选中文本
2. 选区工具栏出现“批注”按钮
3. 弹出输入面板填写批注内容
4. 保存后将当前选区包成 `InlineCommentMark`

### 块级批注

在 `src/components/BMarkdown/hooks/useExtensions.ts` 中新增 `BlockCommentNode`：

- 表示一个承载块内容的 comment 容器
- attrs 至少包含 `id`、`content`、`resolved`
- `content` schema 允许嵌套段落、列表、引用、代码块等 block 节点

交互建议：

1. 用户在当前块内聚焦
2. 从当前块菜单或专用入口触发“添加块批注”
3. 以“包裹当前块”的方式生成 `BlockCommentNode`

第一版不处理“跨多个顶层块拖选后一次性包裹”的复杂选择逻辑，避免同时改动 ProseMirror 选区切块与 Source 行号映射。

### 展示方式

- 行内批注：使用淡色底高亮或带下划线的审阅样式
- 块级批注：使用带边框或左侧标识条的容器样式
- 点击批注后显示浮层卡片，支持查看、编辑、删除

第一版优先使用浮层卡片，不引入新的右侧批注面板，避免和现有大纲、聊天侧边栏形成布局竞争。

## Source 模式设计

Source 模式以原始 Markdown 为准，不试图把批注“可视化成富文本块”，但需要补齐以下能力：

1. 对批注语法做显式高亮
2. 允许通过选区工具或上下文入口快速插入批注语法
3. 保证用户手改语法后，Rich 模式仍能正确还原

### 语法高亮

建议在 `src/components/BMarkdown/adapters/sourceEditorMarkdownHighlight.ts` 中新增批注范围识别：

- 行内批注的 `[]{comment="..."}` 结构高亮
- 块级批注的 `:::comment{...}` 与结束 `:::` 高亮

高亮目标是增强可读性，不是替代真实文本，因此源码中仍完整展示批注语法。

### 快捷插入

建议为 Source 模式新增两个动作：

- 选中文本后“添加行内批注”
- 当前行或当前块“包裹为块级批注”

这两个动作本质上都是对原始 Markdown 的文本变换，不需要额外维护隐藏结构。

## Markdown 解析与序列化

这是本次设计的核心风险区，建议把实现边界明确到 `useExtensions.ts`：

### 行内批注

需要新增自定义 inline parse / render 规则，使：

```md
[需要改写]{comment="语气太硬" id="comment-1"}
```

能够解析为普通文本内容加 `InlineCommentMark`，并在 `editor.getMarkdown()` 时按原语法写回。

实现上不建议滥用 HTML 占位节点再回退，因为这会让 Source 与 Rich 间的 round-trip 变脆弱。

### 块级批注

需要新增自定义 block parse / render 规则，使：

```md
:::comment{content="这里要补背景" id="comment-2"}
正文
:::
```

能够解析为 `BlockCommentNode`，其内部继续使用现有 paragraph / list / codeBlock 等块解析逻辑。

序列化时要求：

1. 容器开始行和结束行完整写回
2. 容器内部内容按现有 Markdown 渲染逻辑输出
3. 不因为切换到 Rich 模式就改写批注内部普通块内容的语义

## UI 交互设计

### 创建

- Rich 选中文本后，选区工具栏新增“批注”按钮，用于创建行内批注
- Rich 当前块菜单新增“块批注”按钮，用于包裹当前块
- Source 选区工具入口新增“批注”按钮，根据当前上下文决定生成行内或块级语法

### 查看与编辑

- 点击现有批注高亮区域，显示浮层卡片
- 卡片展示：
  - 批注正文
  - 编辑入口
  - 删除入口

第一版不做多卡片并排、不做固定停靠面板。

### 删除

- 删除行内批注时，仅移除批注包装，保留正文文本
- 删除块级批注时，仅移除 comment 容器，保留内部块内容

## 文件与模块改动建议

建议改动集中在以下区域：

- `src/components/BMarkdown/hooks/useExtensions.ts`
  - 新增批注语法的 parse / render 支持
- `src/components/BMarkdown/components/PaneRichEditor.vue`
  - 接入批注入口与点击批注后的浮层
- `src/components/BMarkdown/components/PaneSourceEditor.vue`
  - 接入 Source 模式批注插入动作
- `src/components/BMarkdown/adapters/sourceEditorMarkdownHighlight.ts`
  - 增加批注语法高亮
- `src/components/BMarkdown/adapters/types.ts`
  - 为编辑器控制器增加批注相关方法
- `src/components/BMarkdown/components`
  - 新增批注输入/展示浮层组件

## 风险与约束

### 风险 1：自定义 Markdown 语法的 round-trip 稳定性

这是最高风险项。需要确保：

- Markdown 导入到 Rich 不丢属性
- Rich 再导出 Markdown 不重排语法
- Source 手改后再切回 Rich 仍可被识别

### 风险 2：块级批注与复杂块内容嵌套

块级批注内部若包含：

- 列表
- 引用
- 代码块
- 表格

则序列化必须复用现有子节点的 Markdown 渲染逻辑，而不是自己手拼。

### 风险 3：第一版跨块选择的复杂度

跨多个顶层块进行一次性包裹，会同时影响：

- Rich 选区切块
- Source 文本包裹
- 行号映射
- 大纲与滚动定位

因此第一版明确只支持“当前块包裹”，不做任意跨块范围包裹。

## 测试策略

至少覆盖以下场景：

1. 行内批注 Markdown -> Rich -> Markdown round-trip
2. 块级批注 Markdown -> Rich -> Markdown round-trip
3. Source 模式手写批注后切换到 Rich 仍能识别
4. 删除批注时保留原正文内容
5. 块级批注包裹列表、引用、代码块时不丢结构
6. 普通文档在无批注时完全不受影响
7. 批注高亮点击、编辑、删除的组件测试

## 分阶段建议

### Phase 1

- 行内批注 Markdown 语法支持
- Rich 行内批注创建 / 编辑 / 删除
- Source 行内批注高亮与插入

### Phase 2

- 块级批注 Markdown 语法支持
- Rich 块级批注包裹 / 编辑 / 删除
- Source 块级批注高亮与插入

### Phase 3

- `resolved` 状态
- 批注跳转 / 定位
- 批注列表或审阅面板

## 最终结论

`BMarkdown` 的批注功能应当建立在“自定义 Markdown 语法即唯一真实来源”的前提上：

- 行内批注实现为 TipTap `Mark`
- 块级批注实现为 TipTap `Node`
- Source 模式始终保留原始语法，只补充高亮与快捷编辑

第一版先把语法、round-trip 稳定性与基础交互做扎实，再逐步扩展 resolved、批注列表和更复杂的审阅工作流。
