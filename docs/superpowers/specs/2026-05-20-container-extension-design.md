# BEditor 容器扩展设计

## 背景

`src/components/BEditor` 当前已经具备以下基础能力：

- Rich 模式使用 TipTap，并通过 `src/components/BEditor/hooks/useExtensions.ts` 接管 Markdown 的解析与序列化
- Source 模式使用 CodeMirror，直接编辑原始 Markdown
- 两种模式共享同一份文档内容，并允许在模式间来回切换

现有批注设计文档（`docs/superpowers/specs/2026-05-07-bmarkdown-comment-design.md`）提出了 `:::comment{...}` 块级批注语法，但尚未实现。本设计文档旨在实现通用的 `:::` 容器扩展，支持批注、提示、警告等多种容器类型。

## 目标

1. 为 `BEditor` 增加通用的 `:::` 容器语法支持
2. 第一版实现 `:::comment` 批注容器
3. 预留 `:::tip`、`:::warning`、`:::danger`、`:::info` 等扩展能力
4. Rich / Source 模式都能查看、编辑并保留容器语法
5. 在模式切换与序列化往返中保持容器结构稳定，不吞内容、不改语义

## 非目标

1. 本次不实现容器嵌套（容器内包含容器）
2. 本次不实现自定义容器类型注册机制
3. 本次不实现容器的拖拽、排序等高级交互
4. 本次不保证第三方 Markdown 渲染器能理解该语法，只保证 Tibis 内部完整读写

## 设计结论

采用"自定义 Markdown 语法 + Rich/Source 双模式共用同一份文档内容"的方案：

- 容器使用 `:::type{attrs}...:::` 语法
- Rich 模式映射为 TipTap `Node`
- Source 模式直接编辑原始 Markdown，同时补充语法高亮

## 语法设计

### 批注容器（第一版实现）

```md
:::comment{commentText="这里要补背景" id="comment-1"}
被批注的块内容

- 列表项
- 列表项
:::
```

语义说明：

- `:::comment` 声明一个批注容器
- `commentText="..."` 保存批注正文（避免与 TipTap schema 的 `content` 字段冲突）
- `id="..."` 提供稳定唯一标识
- 容器内部承载真正被批注的块内容

### 未来扩展容器（预留设计）

```md
:::tip{title="提示"}
这是一个提示框
:::

:::warning{title="警告"}
这是一个警告框
:::

:::danger
这是一个危险框（无标题）
:::

:::info{title="信息"}
这是一个信息框
:::
```

### 属性模型

第一版统一预留以下属性模型：

- `type`: 容器类型（comment、tip、warning、danger、info）
- `id`: 稳定唯一标识，用于后续定位、跳转、删除
- `title`: 容器标题（可选，仅 tip/warning/danger/info 类型）
- `commentText`: 批注正文（仅 comment 类型，避免与 TipTap schema 的 `content` 字段冲突）
- `resolved`: 预留字段，第一版不暴露完整 UI，但解析层允许未来扩展

## 数据模型

```ts
/**
 * 容器基础属性
 */
interface ContainerAttrs {
  /** 容器类型：comment、tip、warning、danger、info */
  type: string;
  /** 容器唯一标识 */
  id?: string;
  /** 容器标题（可选） */
  title?: string;
  /** 批注正文（仅 comment 类型，避免与 TipTap schema 的 content 字段冲突） */
  commentText?: string;
  /** 是否已解决（仅 comment 类型） */
  resolved?: boolean;
  /** 源码起始行号 */
  sourceLineStart?: number | null;
  /** 源码结束行号 */
  sourceLineEnd?: number | null;
}

/**
 * 容器节点定义
 */
interface ContainerNode extends JSONContent {
  type: 'container';
  attrs: ContainerAttrs;
  content: JSONContent[]; // TipTap schema 字段，描述该节点能包含什么子节点
}
```

## Rich 模式设计

### 容器节点扩展

在 `src/components/BEditor/extensions/container.ts` 中新增 `Container` 扩展：

- 表示一个承载块内容的容器节点
- attrs 包含 `type`、`id`、`title`、`content`、`resolved`
- `content` schema 允许嵌套段落、列表、引用、代码块等 block 节点
- 负责：
  - 解析 Markdown 容器语法
  - 将节点渲染回 Markdown
  - 在编辑器内提供容器样式与交互能力

### Markdown 解析器

```typescript
parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult => {
  // 1. 解析容器类型和属性
  const match = token.text?.match(/^:::(\w+)(?:\{([^}]*)\})?/);
  if (!match) return [];
  
  const type = match[1]; // comment、tip、warning 等
  const attrsStr = match[2] || '';
  const attrs = parseContainerAttrs(attrsStr); // 解析 {content="..." id="..."}
  
  // 2. 解析容器内部内容
  const content = helpers.parse(token.tokens || []);
  
  // 3. 创建容器节点
  return helpers.createNode('container', { 
    type, 
    ...attrs,
    ...createSourceLineNodeAttrs(token)
  }, content);
}
```

### Markdown 渲染器

```typescript
renderMarkdown: (node: JSONContent, helpers: { renderChildren: (content: JSONContent | JSONContent[]) => string }): string => {
  const { type, id, title, commentText, resolved } = node.attrs;
  
  // 1. 构建属性字符串（固定顺序，确保 round-trip 字符串级稳定）
  const attrsArr: string[] = [];
  if (id) attrsArr.push(`id="${id}"`);
  if (title) attrsArr.push(`title="${title}"`);
  if (commentText) attrsArr.push(`commentText="${commentText}"`);
  if (resolved !== undefined) attrsArr.push(`resolved="${resolved}"`);
  
  const attrsStr = attrsArr.length > 0 ? `{${attrsArr.join(' ')}}` : '';
  
  // 2. 渲染内部内容
  const innerContent = helpers.renderChildren(node);
  
  // 3. 拼接完整语法
  return `:::${type}${attrsStr}\n${innerContent}\n:::`;
}
```

### Vue 渲染组件

在 `src/components/BEditor/components/ContainerView.vue` 中实现容器渲染：

```vue
<template>
  <node-view-wrapper :class="['b-container', `b-container-${type}`]" :data-container-id="id">
    <!-- 批注类型：显示批注内容 -->
    <div v-if="type === 'comment'" class="b-container-comment-card">
      <div class="b-container-comment-header">
        <span class="b-container-comment-icon">💬</span>
        <span class="b-container-comment-label">批注</span>
        <span v-if="resolved" class="b-container-resolved">已解决</span>
      </div>
      <div class="b-container-comment-content">{{ commentText }}</div>
    </div>
    
    <!-- 其他类型：显示标题 -->
    <div v-else-if="title" class="b-container-title">
      <span :class="['b-container-icon', `b-container-icon-${type}`]">
        {{ getContainerIcon(type) }}
      </span>
      <span class="b-container-title-text">{{ title }}</span>
    </div>
    
    <!-- 容器内容（使用 TipTap 的 NodeViewContent 渲染子节点） -->
    <div class="b-container-body">
      <node-view-content />
    </div>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3';
import { computed } from 'vue';

const props = defineProps<NodeViewProps>();

const type = computed(() => props.node.attrs.type);
const id = computed(() => props.node.attrs.id);
const title = computed(() => props.node.attrs.title);
const commentText = computed(() => props.node.attrs.commentText);
const resolved = computed(() => props.node.attrs.resolved);

/**
 * 根据容器类型获取图标。
 * @param containerType - 容器类型
 * @returns 图标字符
 */
function getContainerIcon(containerType: string): string {
  const iconMap: Record<string, string> = {
    tip: '💡',
    warning: '⚠️',
    danger: '🔥',
    info: 'ℹ️'
  };
  return iconMap[containerType] || '📦';
}
</script>
```

**关键点**：
- 使用 `<node-view-wrapper>` 作为根元素，而非普通 `<div>`
- 使用 `<node-view-content />` 渲染子节点，而非 `<slot />`
- `<node-view-content />` 是 TipTap 提供的正确方式，确保子节点可编辑、可交互

### 交互建议

1. 用户在当前块内聚焦
2. 从当前块菜单或专用入口触发"添加批注"
3. 以"包裹当前块"的方式生成 `Container` 节点
4. 弹出输入面板填写批注内容
5. 保存后将当前块包成 `Container` 节点

第一版不处理"跨多个顶层块拖选后一次性包裹"的复杂选择逻辑。

## Source 模式设计

Source 模式以原始 Markdown 为准，不试图把容器"可视化成富文本块"，但需要补齐以下能力：

1. 对容器语法做显式高亮
2. 允许通过选区工具或上下文入口快速插入容器语法
3. 保证用户手改语法后，Rich 模式仍能正确还原

### 语法高亮

建议在 `src/components/BEditor/adapters/sourceEditorMarkdownHighlight.ts` 中新增容器范围识别：

- 容器开始行的 `:::type{...}` 高亮
- 容器结束行的 `:::` 高亮
- 属性部分的高亮

高亮目标是增强可读性，不是替代真实文本，因此源码中仍完整展示容器语法。

### 快捷插入

建议为 Source 模式新增两个动作：

- 当前行或当前块"包裹为批注容器"
- 当前行或当前块"包裹为提示/警告/危险容器"

这两个动作本质上都是对原始 Markdown 的文本变换，不需要额外维护隐藏结构。

## Markdown 解析与序列化

这是本次设计的核心风险区，建议把实现边界明确到 `useExtensions.ts`：

### 解析流程

1. `marked` 解析 Markdown 文本，生成 token 树
2. 遇到 `:::type{...}` token 时，触发自定义解析器
3. 解析容器类型和属性
4. 递归解析容器内部内容
5. 创建 `Container` 节点

### 序列化流程

1. 遍历 TipTap 文档树
2. 遇到 `Container` 节点时，触发自定义渲染器
3. 构建容器开始行 `:::type{attrs}`
4. 递归渲染容器内部内容
5. 添加容器结束行 `:::`

### Round-trip 稳定性

必须确保：

- Markdown 导入到 Rich 不丢属性
- Rich 再导出 Markdown 不重排语法
- Source 手改后再切回 Rich 仍可被识别
- 属性顺序可以变化，但语义必须一致
- 缺失属性使用默认值

## 样式设计

### 批注容器

```less
.b-container-comment {
  border-left: 3px solid #1890ff;
  background: #f0f7ff;
  padding: 12px;
  margin: 8px 0;
  border-radius: 4px;
  
  .b-container-comment-card {
    margin-bottom: 8px;
    padding: 8px;
    background: white;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }
  
  .b-container-comment-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    font-size: 14px;
    font-weight: 500;
    color: #1890ff;
  }
  
  .b-container-comment-content {
    font-size: 14px;
    color: #595959;
    line-height: 1.6;
  }
  
  .b-container-resolved {
    font-size: 12px;
    padding: 2px 6px;
    background: #52c41a;
    color: white;
    border-radius: 2px;
  }
}
```

### 提示容器

```less
.b-container-tip {
  border-left: 3px solid #52c41a;
  background: #f6ffed;
  padding: 12px;
  margin: 8px 0;
  border-radius: 4px;
  
  .b-container-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #52c41a;
  }
}
```

### 警告容器

```less
.b-container-warning {
  border-left: 3px solid #faad14;
  background: #fffbe6;
  padding: 12px;
  margin: 8px 0;
  border-radius: 4px;
  
  .b-container-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #faad14;
  }
}
```

### 危险容器

```less
.b-container-danger {
  border-left: 3px solid #ff4d4f;
  background: #fff2f0;
  padding: 12px;
  margin: 8px 0;
  border-radius: 4px;
  
  .b-container-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #ff4d4f;
  }
}
```

### 信息容器

```less
.b-container-info {
  border-left: 3px solid #722ed1;
  background: #f9f0ff;
  padding: 12px;
  margin: 8px 0;
  border-radius: 4px;
  
  .b-container-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #722ed1;
  }
}
```

## 文件与模块改动建议

建议改动集中在以下区域：

- `src/components/BEditor/extensions/container.ts`
  - 新增容器扩展定义
  - 实现 Markdown 解析与渲染
- `src/components/BEditor/components/ContainerView.vue`
  - 新增容器渲染组件
- `src/components/BEditor/hooks/useExtensions.ts`
  - 注册容器扩展
- `src/components/BEditor/styles/container.less`
  - 新增容器样式
- `src/components/BEditor/adapters/sourceEditorMarkdownHighlight.ts`
  - 增加容器语法高亮（可选，Phase 2）
- `test/components/BEditor/containerExtension.test.ts`
  - 新增容器扩展测试

## 风险与约束

### 风险 1：自定义 Markdown 语法的 round-trip 稳定性

这是最高风险项。需要确保：

- Markdown 导入到 Rich 不丢属性
- Rich 再导出 Markdown 不重排语法
- Source 手改后再切回 Rich 仍可被识别

**缓解措施**：
- 编写完整的 round-trip 测试用例
- 使用稳定的属性序列化顺序
- 为缺失属性提供默认值

### 风险 2：容器与复杂块内容嵌套

容器内部若包含：

- 列表
- 引用
- 代码块
- 表格

则序列化必须复用现有子节点的 Markdown 渲染逻辑，而不是自己手拼。

**缓解措施**：
- 使用 `helpers.renderChildren()` 复用现有渲染逻辑
- 编写嵌套内容测试用例

### 风险 3：marked 解析器的兼容性

`marked` 默认不支持 `:::` 容器语法，需要自定义 tokenizer。这是本次实现的**核心难点**。

**具体实现策略**：

1. **使用 marked 的 extensions 机制**

```typescript
const containerExtension = {
  name: 'container',
  level: 'block',
  start(src: string) {
    // 匹配 :::type{...} 的开始位置
    return src.match(/^:::\w+(?:\{[^}]*\})?\n/)?.index ?? -1;
  },
  tokenizer(src: string) {
    // 1. 匹配容器开始行
    const startMatch = src.match(/^:::(\w+)(?:\{([^}]*)\})?\n/);
    if (!startMatch) return undefined;
    
    const type = startMatch[1];
    const attrsStr = startMatch[2] || '';
    
    // 2. 查找容器结束行 :::（需要处理嵌套代码块等特殊情况）
    let depth = 1;
    let endIndex = startMatch[0].length;
    let inCodeBlock = false;
    
    while (endIndex < src.length && depth > 0) {
      const remaining = src.slice(endIndex);
      
      // 检测代码块围栏 ```（避免与容器围栏混淆）
      const codeBlockMatch = remaining.match(/^```/);
      if (codeBlockMatch) {
        inCodeBlock = !inCodeBlock;
        endIndex += codeBlockMatch[0].length;
        continue;
      }
      
      // 如果不在代码块内，检测容器围栏
      if (!inCodeBlock) {
        const containerStart = remaining.match(/^:::\w+/);
        const containerEnd = remaining.match(/^:::\s*$/);
        
        if (containerStart) {
          depth++;
          endIndex += containerStart[0].length;
        } else if (containerEnd) {
          depth--;
          endIndex += containerEnd[0].length;
        } else {
          endIndex++;
        }
      } else {
        endIndex++;
      }
    }
    
    // 3. 提取容器内部内容
    const innerContent = src.slice(startMatch[0].length, endIndex - 4); // -4 是去掉结束的 :::\n
    
    return {
      type: 'container',
      raw: src.slice(0, endIndex),
      text: startMatch[0],
      tokens: this.lexer.blockTokens(innerContent, [])
    };
  }
};
```

2. **处理嵌套代码块的边界情况**

容器内可能包含代码块（`\`\`\``），两种围栏语法会相互干扰。解决方案：
- 在 tokenizer 中维护 `inCodeBlock` 状态
- 遇到 `\`\`\`` 时切换状态，不处理容器围栏
- 确保代码块内的 `:::` 不会被误认为容器结束

3. **测试策略**

必须覆盖以下场景：
- 容器内包含代码块
- 代码块内包含 `:::` 文本
- 容器嵌套（Phase 2）
- 多个连续容器
- 容器内包含表格、列表等复杂块

**缓解措施**：
- 使用上述具体的 tokenizer 实现策略
- 编写完整的边界测试用例
- 在 marked 扩展中明确处理代码块围栏的特殊情况

## 测试策略

至少覆盖以下场景：

1. 批注容器 Markdown -> Rich -> Markdown round-trip
2. 提示容器 Markdown -> Rich -> Markdown round-trip
3. 警告容器 Markdown -> Rich -> Markdown round-trip
4. 危险容器 Markdown -> Rich -> Markdown round-trip
5. Source 模式手写容器后切换到 Rich 仍能识别
6. 删除容器时保留原正文内容
7. 容器包裹列表、引用、代码块时不丢结构
8. 普通文档在无容器时完全不受影响
9. 容器属性缺失时使用默认值
10. 容器属性顺序变化时语义不变

### 测试用例示例

```typescript
describe('Container Extension', () => {
  test('parses comment container', () => {
    const md = ':::comment{commentText="test"}\ncontent\n:::';
    const editor = createMarkdownEditor();
    editor.commands.setContent(md, { contentType: 'markdown' });
    
    const doc = editor.state.doc;
    expect(doc.firstChild?.type.name).toBe('container');
    expect(doc.firstChild?.attrs.type).toBe('comment');
    expect(doc.firstChild?.attrs.commentText).toBe('test');
    
    editor.destroy();
  });
  
  test('round-trip stable for comment', () => {
    const md = ':::comment{commentText="test" id="c1"}\ncontent\n:::';
    const editor = createMarkdownEditor();
    editor.commands.setContent(md, { contentType: 'markdown' });
    const exported = editor.getMarkdown();
    // 由于固定了属性序列化顺序，可以期望字符串完全一致
    expect(exported).toBe(md);
    editor.destroy();
  });
  
  test('supports nested blocks', () => {
    const md = `:::comment{commentText="test"}
- item1
- item2

\`\`\`js
code
\`\`\`
:::`;
    const editor = createMarkdownEditor();
    editor.commands.setContent(md, { contentType: 'markdown' });
    
    const doc = editor.state.doc;
    const container = doc.firstChild;
    expect(container?.type.name).toBe('container');
    expect(container?.content.childCount).toBe(2); // list + codeBlock
    
    const exported = editor.getMarkdown();
    expect(exported).toContain('- item1');
    expect(exported).toContain('```js');
    
    editor.destroy();
  });
  
  test('preserves content when unwrapping container', () => {
    const md = ':::comment{commentText="test"}\noriginal content\n:::';
    const editor = createMarkdownEditor();
    editor.commands.setContent(md, { contentType: 'markdown' });
    
    // 使用专门的 unwrapContainer 命令，而非 clearNodes()
    editor.chain().focus().unwrapContainer().run();
    
    const exported = editor.getMarkdown();
    expect(exported).toContain('original content');
    expect(exported).not.toContain(':::comment');
    
    editor.destroy();
  });
  
  test('handles code block inside container', () => {
    const md = `:::comment{commentText="test"}
\`\`\`js
const x = 1;
\`\`\`
:::`;
    const editor = createMarkdownEditor();
    editor.commands.setContent(md, { contentType: 'markdown' });
    
    const doc = editor.state.doc;
    const container = doc.firstChild;
    expect(container?.type.name).toBe('container');
    expect(container?.content.firstChild?.type.name).toBe('codeBlock');
    
    const exported = editor.getMarkdown();
    expect(exported).toBe(md);
    
    editor.destroy();
  });
});
```

**关键测试点**：
- 使用 `unwrapContainer()` 命令而非 `clearNodes()`，确保只移除容器外壳，保留内部结构
- 测试容器内包含代码块的特殊情况
- Round-trip 测试使用字符串全等比较（因为固定了属性序列化顺序）

## 分阶段建议

### Phase 1（当前实现）

- 批注容器 `:::comment{...}` 语法支持
- Rich 批注容器创建 / 编辑 / 删除
- **Source 批注容器基础高亮**（必须，影响可用性）
- Source 批注容器快捷插入
- 基础样式实现
- `unwrapContainer()` 命令实现

### Phase 2（未来扩展）

- 提示容器 `:::tip{...}` 支持
- 警告容器 `:::warning{...}` 支持
- 危险容器 `:::danger{...}` 支持
- 信息容器 `:::info{...}` 支持
- 扩展样式库
- Source 模式高级高亮（属性高亮、类型着色等）

### Phase 3（高级功能）

- 容器嵌套支持
- 自定义容器类型注册机制
- 容器拖拽、排序等高级交互
- 容器导出为 HTML 时的样式保留

## 最终结论

`BEditor` 的容器扩展应当建立在"自定义 Markdown 语法即唯一真实来源"的前提上：

- 容器实现为 TipTap `Node`
- Source 模式始终保留原始语法，只补充高亮与快捷编辑
- 第一版先把批注容器语法、round-trip 稳定性与基础交互做扎实
- 预留其他容器类型的扩展能力，但不急于实现

通过这个设计，我们为批注功能提供了稳定的语法载体，同时为未来的提示框、警告框等容器类型预留了扩展空间。
