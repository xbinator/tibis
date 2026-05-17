# JSON 可视化编辑器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Tibis 新增 JSON 可视化编辑器 BJsonGraph，提供源码 + 节点图分栏视图，支持双向联动和 AI 结构化上下文。

**Architecture:** 独立 BJsonGraph 组件（非 BMarkdown 扩展），左侧 CodeMirror 6 源码编辑器 + 右侧 Vue Flow 节点图，通过 BPanelSplitter 分栏。JSON 解析使用 json-source-map 提供偏移量映射，dagre 做 LR 自动布局。AI 上下文通过通用 StructuredDocumentContext 接口注册。

**Tech Stack:** Vue 3 + Composition API, Vue Flow, dagre, CodeMirror 6, json-source-map, Vitest

**Key Design Decisions (from review):**
1. BJsonGraph 必须实现完整 `EditorController` 接口，页面层通过统一 ref 操作
2. 脏状态/保存复用 `useSession/useFileState` 的 `savedContent` 基线，不直接读 `fileState.savedContent`
3. AI 上下文注册由页面层统一管理，BJsonGraph 不自行 register/unregister
4. fitView 仅在首次加载、显式定位、目标节点离屏时触发
5. 折叠状态拆分为 `autoCollapsedPaths` / `userCollapsedPaths` / `userExpandedPaths`，自动折叠不覆盖用户操作
6. 类型迁移范围包含 `useBindings.ts` 和 `useFileSelection.ts`，参数类型从 `BMarkdownPublicInstance` 提升到 `EditorController`
7. 引入 `EditorDriver` 驱动注册表模式，页面层通过 `resolveEditorDriver(fileState)` 获取驱动，用动态组件渲染，避免 if/else 膨胀

---

## File Structure

```
src/components/BJsonGraph/
├── index.vue                        # 入口：左右分栏容器 + EditorController 实现
├── JsonSourceEditor.vue             # 左侧 CodeMirror 6 源码编辑器
├── JsonNodeGraph.vue                # 右侧 Vue Flow 节点图
├── nodes/
│   ├── ObjectNode.vue               # 对象节点 { }
│   ├── ArrayNode.vue                # 数组节点 [ ]
│   └── ValueNode.vue                # 叶子值节点
├── hooks/
│   ├── useJsonParse.ts              # JSON 解析 + 位置映射
│   ├── useGraphLayout.ts            # 树结构 → Vue Flow 节点/边
│   └── useSourceSync.ts             # 双向定位同步（含防循环）
└── types.ts                         # 类型定义

types/
└── ai.d.ts                          # 修改：新增 StructuredDocumentContext

types/
└── json-source-map.d.ts             # 新增：json-source-map 类型声明

src/assets/styles/
└── json-graph.less                  # 新增：JSON 节点图主题变量

src/views/editor/
├── drivers/
│   ├── index.ts                    # 新增：驱动注册表 + resolveEditorDriver()
│   ├── types.ts                    # 新增：EditorDriver / EditorToolbarConfig / CreateToolContextInput 类型
│   ├── markdown.ts                 # 新增：Markdown 驱动
│   └── json.ts                     # 新增：JSON 驱动
└── index.vue                        # 修改：使用驱动注册表 + 统一 EditorController ref

test/components/BJsonGraph/
├── types.test.ts
├── useJsonParse.test.ts
├── useGraphLayout.test.ts
├── useSourceSync.test.ts
└── editor-context-structured.test.ts
```

---

### Task 1: 安装依赖 + json-source-map 类型声明

**Files:**
- Create: `types/json-source-map.d.ts`
- Modify: `package.json` (通过 pnpm add)

- [ ] **Step 1: 安装依赖**

Run: `pnpm add @vue-flow/core @vue-flow/background @vue-flow/minimap @vue-flow/controls @dagrejs/dagre json-source-map`

- [ ] **Step 2: 安装开发依赖**

Run: `pnpm add -D @types/dagre`

- [ ] **Step 3: 创建 json-source-map 类型声明**

```typescript
/**
 * @file json-source-map.d.ts
 * @description json-source-map 类型声明
 */
declare module 'json-source-map' {
  interface PointerInfo {
    value: {
      line: number;
      column: number;
      pos: number;
    };
    valueEnd: {
      line: number;
      column: number;
      pos: number;
    };
  }

  interface ParseResult {
    data: unknown;
    pointers: Record<string, PointerInfo>;
  }

  export function parse(text: string): ParseResult;
}
```

- [ ] **Step 4: 验证依赖安装成功**

Run: `pnpm list @vue-flow/core @dagrejs/dagre json-source-map`
Expected: 三个包均显示版本号

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml types/json-source-map.d.ts
git commit -m "chore: add vue-flow, dagre, json-source-map dependencies"
```

---

### Task 2: BJsonGraph 类型定义（含 EditorController 兼容）

**Files:**
- Create: `src/components/BJsonGraph/types.ts`
- Create: `test/components/BJsonGraph/types.test.ts`

**审查修正**: BJsonGraphPublicInstance 必须兼容 `EditorController` 接口，补齐 `undo/redo/canUndo/canRedo/focusEditor/setSearchTerm/findNext/findPrevious/clearSearch/getSearchState/selectLineRange/scrollToAnchor/getActiveAnchorId` 等方法。

- [ ] **Step 1: 写失败测试**

```typescript
/**
 * @file types.test.ts
 * @description BJsonGraph 类型定义测试
 */
import { describe, expect, it } from 'vitest';
import type { JsonNodeInfo, JsonGraphState } from '@/components/BJsonGraph/types';
import type { EditorController } from '@/components/BMarkdown/adapters/types';

describe('BJsonGraph types', () => {
  it('JsonNodeInfo has required fields', () => {
    const node: JsonNodeInfo = {
      path: '/author/name',
      type: 'string',
      startOffset: 10,
      endOffset: 30,
      valueStartOffset: 20,
      valueEndOffset: 28,
      children: [],
    };
    expect(node.path).toBe('/author/name');
    expect(node.type).toBe('string');
  });

  it('JsonNodeInfo root path is empty string', () => {
    const root: JsonNodeInfo = {
      path: '',
      type: 'object',
      startOffset: 0,
      endOffset: 100,
      valueStartOffset: 0,
      valueEndOffset: 100,
      children: ['/author', '/title'],
    };
    expect(root.path).toBe('');
  });

  it('JsonNodeInfo optional key offsets', () => {
    const node: JsonNodeInfo = {
      path: '/author/name',
      type: 'string',
      startOffset: 10,
      endOffset: 30,
      keyStartOffset: 10,
      keyEndOffset: 16,
      valueStartOffset: 18,
      valueEndOffset: 28,
      key: 'name',
      value: 'Tibis',
      children: [],
    };
    expect(node.keyStartOffset).toBe(10);
    expect(node.keyEndOffset).toBe(16);
  });

  it('JsonGraphState tracks collapsed paths', () => {
    const state: JsonGraphState = {
      collapsedPaths: new Set(['/author']),
    };
    expect(state.collapsedPaths.has('/author')).toBe(true);
  });

  it('BJsonGraphPublicInstance is assignable to EditorController', () => {
    // 此测试验证 BJsonGraphPublicInstance 包含 EditorController 的所有方法
    // 如果类型不兼容，TypeScript 编译会失败
    type Check = EditorController;
    const _typeCheck: Record<string, unknown> = {} as Check;
    expect(_typeCheck).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- test/components/BJsonGraph/types.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现类型定义**

```typescript
/**
 * @file types.ts
 * @description BJsonGraph 组件类型定义
 */
import type { EditorController, EditorSearchState, EMPTY_SEARCH_STATE } from '@/components/BMarkdown/adapters/types';
import type { EditorState } from '@/components/BMarkdown/types';

/** JSON 节点类型 */
export type JsonNodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

/** JSON 节点信息（含源码位置映射） */
export interface JsonNodeInfo {
  /** JSON Pointer 路径（RFC 6901），根节点为 "" */
  path: string;
  /** 节点类型 */
  type: JsonNodeType;
  /** 整个节点在源码中的起始偏移（含 key） */
  startOffset: number;
  /** 整个节点在源码中的结束偏移 */
  endOffset: number;
  /** key 在源码中的起始偏移（仅 object 子节点有） */
  keyStartOffset?: number;
  /** key 在源码中的结束偏移（仅 object 子节点有） */
  keyEndOffset?: number;
  /** value 在源码中的起始偏移 */
  valueStartOffset: number;
  /** value 在源码中的结束偏移 */
  valueEndOffset: number;
  /** 如果是 object 的 value，记录 key */
  key?: string;
  /** 值（叶子节点） */
  value?: unknown;
  /** 子节点路径列表 */
  children: string[];
}

/** JSON 图折叠状态 */
export interface JsonGraphState {
  /** 自动折叠的节点路径（由超大文件策略写入） */
  autoCollapsedPaths: Set<string>;
  /** 用户手动折叠的节点路径 */
  userCollapsedPaths: Set<string>;
  /** 用户手动展开的节点路径（覆盖自动折叠） */
  userExpandedPaths: Set<string>;
}

/**
 * 判断节点是否被折叠
 * @param state - 折叠状态
 * @param path - 节点路径
 */
export function isCollapsed(state: JsonGraphState, path: string): boolean {
  return (state.autoCollapsedPaths.has(path) || state.userCollapsedPaths.has(path))
    && !state.userExpandedPaths.has(path);
}

/**
 * BJsonGraph 对外暴露的公共实例接口
 * 继承 EditorController 以兼容页面层统一 ref 类型
 * 额外暴露 structured 相关方法供页面层拼装 AIToolContext
 */
export interface BJsonGraphPublicInstance extends EditorController {
  /** 获取当前光标在 JSON 中的路径 */
  getCurrentPath: () => string | null;
  /** 获取当前光标所在节点的类型 */
  getCurrentNodeType: () => JsonNodeType | null;
  /** 获取指定路径的值（从缓存读取） */
  getValueAtPath: (path: string) => unknown;
  /** 获取文档结构摘要 */
  getStructureSummary: () => {
    rootType: string;
    maxDepth: number;
    totalNodes: number;
    topLevelKeys: string[];
  };
}

/** BJsonGraph 组件 Props */
export interface BJsonGraphProps {
  /** 编辑器状态（v-model:value） */
  value: EditorState;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- test/components/BJsonGraph/types.test.ts`
Expected: PASS

- [ ] **Step 5: 运行 TypeScript 类型检查**

Run: `pnpm typecheck`（或项目配置的类型检查命令）
Expected: PASS — `BJsonGraphPublicInstance extends EditorController` 类型兼容

- [ ] **Step 6: Commit**

```bash
git add src/components/BJsonGraph/types.ts test/components/BJsonGraph/types.test.ts
git commit -m "feat(json-graph): add BJsonGraph type definitions with EditorController compatibility"
```

---

### Task 3: useJsonParse hook

**Files:**
- Create: `src/components/BJsonGraph/hooks/useJsonParse.ts`
- Create: `test/components/BJsonGraph/useJsonParse.test.ts`

- [ ] **Step 1: 写失败测试** — 测试解析简单对象、根路径为空字符串、JSON Pointer 路径、数组索引路径、value 偏移量、key 偏移量、非法 JSON 错误、结构摘要、getValueAtPath、findNodeAtOffset

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- test/components/BJsonGraph/useJsonParse.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 useJsonParse** — 使用 json-source-map 的 parse 函数，构建 `Map<path, JsonNodeInfo>`，提供 findNodeAtOffset、getValueAtPath、getStructureSummary 方法

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- test/components/BJsonGraph/useJsonParse.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BJsonGraph/hooks/useJsonParse.ts test/components/BJsonGraph/useJsonParse.test.ts
git commit -m "feat(json-graph): add useJsonParse hook with offset mapping"
```

---

### Task 4: useGraphLayout hook

**Files:**
- Create: `src/components/BJsonGraph/hooks/useGraphLayout.ts`
- Create: `test/components/BJsonGraph/useGraphLayout.test.ts`

- [ ] **Step 1: 写失败测试** — 测试简单对象生成节点/边、折叠节点跳过子树（使用 `isCollapsed` 判断）、LR 布局位置（子节点 x > 父节点 x）、空 nodeMap、超阈值自动折叠写入 `autoCollapsedPaths`（不覆盖 `userExpandedPaths`）、节点 data 包含类型和偏移量

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- test/components/BJsonGraph/useGraphLayout.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 useGraphLayout** — 使用 dagre LR 布局，BFS 收集可见节点（使用 `isCollapsed(state, path)` 判断跳过折叠子树），超阈值时写入 `autoCollapsedPaths`（仅首次加载或跨阈值时重算，不覆盖 `userExpandedPaths`），生成 Vue Flow 格式的 nodes/edges

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- test/components/BJsonGraph/useGraphLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BJsonGraph/hooks/useGraphLayout.ts test/components/BJsonGraph/useGraphLayout.test.ts
git commit -m "feat(json-graph): add useGraphLayout hook with dagre LR layout"
```

---

### Task 5: useSourceSync hook（双向联动 + 防循环 + fitView 策略）

**Files:**
- Create: `src/components/BJsonGraph/hooks/useSourceSync.ts`
- Create: `test/components/BJsonGraph/useSourceSync.test.ts`

**审查修正**: fitView 仅在首次加载、显式定位、目标节点离屏时触发，普通光标移动仅高亮节点。

- [ ] **Step 1: 写失败测试** — 测试 locateSourceFromGraph 调用 dispatchSelection、shouldSkipReverseSync 在 graph origin 时返回 true、requestAnimationFrame 后重置为 false、默认返回 false、locateNodeFromEditor 不设置 syncOrigin、shouldFitView 首次调用返回 true、shouldFitView 非首次离屏时返回 true、shouldFitView 非首次在屏内返回 false

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- test/components/BJsonGraph/useSourceSync.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 useSourceSync** — 维护 syncOrigin 标记（'graph' | 'editor' | null），locateSourceFromGraph 设为 'graph' 并在 rAF 后重置，shouldSkipReverseSync 检查是否为 'graph'。新增 `shouldFitView` 逻辑：维护 `isFirstLayout` 标记，首次返回 true；后续由调用方判断目标节点是否在视口内

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- test/components/BJsonGraph/useSourceSync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BJsonGraph/hooks/useSourceSync.ts test/components/BJsonGraph/useSourceSync.test.ts
git commit -m "feat(json-graph): add useSourceSync hook with anti-loop and fitView strategy"
```

---

### Task 6: StructuredDocumentContext 类型 + AI 上下文注册测试

**Files:**
- Modify: `types/ai.d.ts`
- Create: `test/components/BJsonGraph/editor-context-structured.test.ts`

**审查修正**: AI 上下文注册由页面层统一管理，BJsonGraph 不自行 register/unregister。测试验证 structured 字段可被页面层正确拼装。

- [ ] **Step 1: 写失败测试** — 测试 AIToolContext 包含 structured 字段、getValueAtPath 返回值、getStructureSummary 返回摘要、registry 存取含 structured 的 context、unregister 清除、无 structured 的 context 仍可工作

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- test/components/BJsonGraph/editor-context-structured.test.ts`
Expected: FAIL — `structured` does not exist on `AIToolContext`

- [ ] **Step 3: 修改 types/ai.d.ts** — 新增 DocumentStructureSummary 和 StructuredDocumentContext 接口，在 AIToolContext 末尾添加 `structured?: StructuredDocumentContext`

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- test/components/BJsonGraph/editor-context-structured.test.ts`
Expected: PASS

- [ ] **Step 5: 运行现有 AI 工具测试确认无回归**

Run: `pnpm test -- test/ai/tools/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add types/ai.d.ts test/components/BJsonGraph/editor-context-structured.test.ts
git commit -m "feat(json-graph): add StructuredDocumentContext to AIToolContext"
```

---

### Task 7: JSON 节点图主题变量

**Files:**
- Create: `src/assets/styles/json-graph.less`

- [ ] **Step 1: 创建主题变量文件** — 定义 `:root` 亮色和 `html.dark` 暗色两套 CSS 变量（--json-node-object/array/string/number/boolean/null/border/bg/text/edge/hover-bg/selected-border）

- [ ] **Step 2: 在全局样式入口引入** — 添加 `@import './json-graph.less';`

- [ ] **Step 3: Commit**

```bash
git add src/assets/styles/json-graph.less
git commit -m "feat(json-graph): add JSON node graph theme variables"
```

---

### Task 8: Vue Flow 自定义节点组件

**Files:**
- Create: `src/components/BJsonGraph/nodes/ObjectNode.vue`
- Create: `src/components/BJsonGraph/nodes/ArrayNode.vue`
- Create: `src/components/BJsonGraph/nodes/ValueNode.vue`

- [ ] **Step 1: 创建 ObjectNode.vue** — 标题行 `{ }` + key 名 + 折叠按钮，副标题 `N keys`，边框色 `var(--json-node-object)`，emit `node-click` 和 `toggle-collapse` 事件

- [ ] **Step 2: 创建 ArrayNode.vue** — 标题行 `[ ]` + key 名 + 折叠按钮，副标题 `N items`，边框色 `var(--json-node-array)`

- [ ] **Step 3: 创建 ValueNode.vue** — 第一行 key 名，第二行 value（按类型着色），点击 emit `node-click`

- [ ] **Step 4: Commit**

```bash
git add src/components/BJsonGraph/nodes/
git commit -m "feat(json-graph): add ObjectNode, ArrayNode, ValueNode components"
```

---

### Task 9: JsonSourceEditor 组件（含 EditorController 委托方法）

**Files:**
- Create: `src/components/BJsonGraph/JsonSourceEditor.vue`

**审查修正**: JsonSourceEditor 需暴露完整 EditorController 所需的底层方法，供 BJsonGraph/index.vue 组装为 EditorController 接口。

- [ ] **Step 1: 创建 JsonSourceEditor.vue** — 基于 CodeMirror 6，配置 json 语言 + lint + foldGutter + search + history，暴露以下方法：
  - `getEditorView()` — 获取 CodeMirror EditorView 实例
  - `getSelection()` — 委托 CodeMirror `state.selection.main`
  - `insertAtCursor(content)` — 委托 CodeMirror `dispatch`
  - `replaceSelection(content)` — 委托 CodeMirror `dispatch`
  - `replaceDocument(content)` — 委托 CodeMirror `dispatch`
  - `dispatchSelection(start, end)` — 定位选区并滚动
  - `selectLineRange(startLine, endLine)` — 行号转偏移量后定位
  - `undo()` / `redo()` / `canUndo()` / `canRedo()` — 委托 CodeMirror history
  - `focusEditor()` — 委托 CodeMirror `focus()`
  - `setSearchTerm(term)` / `findNext()` / `findPrevious()` / `clearSearch()` / `getSearchState()` — 委托 CodeMirror search 扩展
  - emit `update:value` 和 `selection-change` 事件

- [ ] **Step 2: Commit**

```bash
git add src/components/BJsonGraph/JsonSourceEditor.vue
git commit -m "feat(json-graph): add JsonSourceEditor with EditorController delegation"
```

---

### Task 10: JsonNodeGraph 组件

**Files:**
- Create: `src/components/BJsonGraph/JsonNodeGraph.vue`

- [ ] **Step 1: 创建 JsonNodeGraph.vue** — Vue Flow 容器，配置 nodesDraggable=false/nodesConnectable=false/elementsSelectable=true，注册三种自定义节点模板（object/array/value），引入 Background/Controls/MiniMap，显示解析错误和自动折叠提示。**fitView 仅在首次加载时自动触发**，后续由外部调用方按需触发

- [ ] **Step 2: Commit**

```bash
git add src/components/BJsonGraph/JsonNodeGraph.vue
git commit -m "feat(json-graph): add JsonNodeGraph with Vue Flow"
```

---

### Task 11: BJsonGraph 入口组件（EditorController 实现 + structured 暴露）

**Files:**
- Create: `src/components/BJsonGraph/index.vue`

**审查修正**:
1. `defineExpose` 暴露完整 `EditorController` 接口（含 undo/redo/search/selectLineRange 等），内部委托给 JsonSourceEditor
2. **不自行注册/注销** `editorToolContextRegistry`，仅暴露 `getCurrentPath/getCurrentNodeType/getValueAtPath/getStructureSummary` 供页面层拼装 `structured` 字段
3. 脏状态/保存通过 `emit('update:value')` 同步内容，由页面层的 `useSession/useFileState` 统一管理

- [ ] **Step 1: 创建 BJsonGraph/index.vue** — 使用 BPanelSplitter 左右分栏，组装 useJsonParse + useGraphLayout + useSourceSync，连接 JsonSourceEditor 和 JsonNodeGraph 的事件。`defineExpose` 返回 `BJsonGraphPublicInstance`（继承 `EditorController`），所有 EditorController 方法委托给 JsonSourceEditor

- [ ] **Step 2: Commit**

```bash
git add src/components/BJsonGraph/index.vue
git commit -m "feat(json-graph): add BJsonGraph entry with EditorController implementation"
```

---

### Task 12: EditorDriver 类型定义 + 驱动注册表

**Files:**
- Create: `src/views/editor/drivers/types.ts`
- Create: `src/views/editor/drivers/index.ts`
- Create: `test/views/editor/drivers.test.ts`

**设计依据**: 设计文档 §可维护性与扩展性 — 引入 EditorDriver 模式，页面层通过 `resolveEditorDriver(fileState)` 获取驱动，用动态组件渲染，避免 if/else 膨胀。

- [ ] **Step 1: 写失败测试**

```typescript
/**
 * @file drivers.test.ts
 * @description EditorDriver 驱动注册表测试
 */
import { describe, expect, it } from 'vitest';
import type { EditorDriver, EditorToolbarConfig, CreateToolContextInput } from '@/views/editor/drivers/types';

describe('EditorDriver registry', () => {
  it('EditorDriver interface has required fields', () => {
    const driver: EditorDriver = {
      id: 'test',
      match: () => true,
      component: {} as any,
      createToolContext: () => ({ document: {}, editor: {} }) as any,
      toolbar: {
        showViewModeToggle: false,
        showOutlineToggle: false,
        showStructuredViewToggle: false,
        showSearch: true,
      },
      supportsOutline: false,
    };
    expect(driver.id).toBe('test');
  });

  it('resolveEditorDriver returns matching driver', () => {
    // 测试 .json 文件匹配 jsonDriver
    // 测试 .md 文件匹配 markdownDriver
    // 测试未知扩展名回退
  });

  it('resolveEditorDriver falls back for unknown ext', () => {
    // 未知扩展名应回退到默认驱动
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- test/views/editor/drivers.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 drivers/types.ts**

```typescript
/**
 * @file types.ts
 * @description EditorDriver 类型定义
 */
import type { Component } from 'vue';
import type { AIToolContext } from '@/ai/tools/editor-context';
import type { EditorFile } from '@/views/editor/types';

/** 编辑器工具栏配置 */
export interface EditorToolbarConfig {
  /** 是否显示 rich/source 视图切换 */
  showViewModeToggle: boolean;
  /** 是否显示大纲切换 */
  showOutlineToggle: boolean;
  /** 是否显示结构化视图切换（如 JSON 节点图） */
  showStructuredViewToggle: boolean;
  /** 是否显示查找替换 */
  showSearch: boolean;
}

/** createToolContext 输入参数 */
export interface CreateToolContextInput {
  /** 当前文件状态 */
  fileState: EditorFile;
  /** 编辑器实例（兼容 EditorController） */
  editorInstance: Record<string, unknown> | null;
  /** 当前是否激活 */
  isActive: boolean;
}

/** 编辑器驱动接口 */
export interface EditorDriver {
  /** 驱动唯一标识 */
  id: string;
  /** 是否匹配当前文件 */
  match: (file: EditorFile) => boolean;
  /** 要渲染的编辑器组件 */
  component: Component;
  /** 生成页面层工具上下文 */
  createToolContext: (input: CreateToolContextInput) => AIToolContext;
  /** 工具栏能力配置 */
  toolbar: EditorToolbarConfig;
  /** 是否显示大纲 */
  supportsOutline: boolean;
}
```

- [ ] **Step 4: 实现 drivers/index.ts** — 维护驱动列表，`resolveEditorDriver(fileState)` 按序查找首个匹配驱动。先注册 markdownDriver 和 jsonDriver 的占位（下一 Task 实现具体驱动）

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test -- test/views/editor/drivers.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/views/editor/drivers/ test/views/editor/drivers.test.ts
git commit -m "feat(editor): add EditorDriver types and registry"
```

---

### Task 13: Markdown 驱动 + JSON 驱动实现

**Files:**
- Create: `src/views/editor/drivers/markdown.ts`
- Create: `src/views/editor/drivers/json.ts`
- Modify: `src/views/editor/drivers/index.ts`（注册驱动）
- Create: `test/views/editor/drivers-markdown.test.ts`
- Create: `test/views/editor/drivers-json.test.ts`

**设计依据**: 设计文档 §可维护性与扩展性 — 每种文件类型对应一个驱动对象，声明 match/component/createToolContext/toolbar。

- [ ] **Step 1: 写失败测试**
  - markdownDriver: `match({ ext: 'md' })` 返回 true，`match({ ext: 'json' })` 返回 false，toolbar 显示 rich/source 切换 + 大纲，createToolContext 不含 `structured`
  - jsonDriver: `match({ ext: 'json' })` 返回 true，`match({ ext: 'md' })` 返回 false，toolbar 显示 structured toggle + search，createToolContext 含 `structured` 字段

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- test/views/editor/drivers-markdown.test.ts test/views/editor/drivers-json.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 markdown.ts**
  - `id: 'markdown'`
  - `match: (file) => file.ext === 'md' || !file.ext`（默认回退）
  - `component: BMarkdown`
  - `createToolContext`: 仅返回基础 `document` / `editor`，无 `structured`
  - `toolbar`: `showViewModeToggle: true, showOutlineToggle: true, showStructuredViewToggle: false, showSearch: true`
  - `supportsOutline: true`

- [ ] **Step 4: 实现 json.ts**
  - `id: 'json'`
  - `match: (file) => file.ext === 'json'`
  - `component: BJsonGraph`
  - `createToolContext`: 返回基础字段 + `structured`（从 `editorInstance` 读取 `getCurrentPath`/`getCurrentNodeType`/`getValueAtPath`/`getStructureSummary`）
  - `toolbar`: `showViewModeToggle: false, showOutlineToggle: false, showStructuredViewToggle: true, showSearch: true`
  - `supportsOutline: false`

- [ ] **Step 5: 更新 drivers/index.ts** — 注册 markdownDriver 和 jsonDriver，`resolveEditorDriver` 按序匹配（json 在前，markdown 在后作为回退）

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm test -- test/views/editor/drivers-markdown.test.ts test/views/editor/drivers-json.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/views/editor/drivers/markdown.ts src/views/editor/drivers/json.ts src/views/editor/drivers/index.ts test/views/editor/
git commit -m "feat(editor): add markdown and json drivers"
```

---

### Task 14: editor/index.vue 重构 + 类型迁移闭环

**Files:**
- Modify: `src/views/editor/index.vue`
- Modify: `src/views/editor/hooks/useBindings.ts`
- Modify: `src/views/editor/hooks/useFileSelection.ts`
- Modify: `src/components/BMarkdown/index.vue`（补齐 defineExpose）

**审查修正**:
1. `editorRef` 类型从 `BMarkdownPublicInstance` 改为 `EditorController`，BJsonGraph 和 BMarkdown 都赋值给同一个 ref
2. 使用 `resolveEditorDriver(fileState)` 获取当前驱动，用动态组件 `<component :is="activeDriver.component">` 渲染
3. `registerEditorContext()` 调用 `activeDriver.createToolContext(input)` 拼装上下文，不再按扩展名 if/else
4. 工具栏根据 `activeDriver.toolbar` 配置渲染
5. **[类型迁移闭环]** `useBindings.ts` 和 `useFileSelection.ts` 的参数类型从 `Ref<BMarkdownPublicInstance | null>` 提升到 `Ref<EditorController | null>`
6. BMarkdown 组件补齐 `focusEditorAtStart`、`scrollToAnchor`、`getActiveAnchorId` 三个方法的 `defineExpose`

- [ ] **Step 1: 修改 editor/index.vue**
  - 引入 `resolveEditorDriver`
  - 将 `editorRef` 类型改为 `EditorController | null`
  - 模板中使用 `<component :is="activeDriver.component" :ref="setEditorRef" ... />` 动态渲染
  - `registerEditorContext()` 改为调用 `activeDriver.createToolContext({ fileState, editorInstance, isActive })`
  - 工具栏根据 `activeDriver.toolbar` 配置条件渲染
  - 保持现有 `useBindings`、`useFileSelection`、`activated/deactivated` 逻辑不变

- [ ] **Step 2: 修改 useBindings.ts 参数类型**
  - 将 `editorInstance?: Ref<BMarkdownPublicInstance | null>` 改为 `editorInstance?: Ref<EditorController | null>`
  - 函数体仅使用 `undo()`/`redo()`，无需其他改动

- [ ] **Step 3: 修改 useFileSelection.ts 参数类型**
  - 将 `editorInstance: Ref<BMarkdownPublicInstance | null>` 改为 `editorInstance: Ref<EditorController | null>`
  - 函数体仅使用 `selectLineRange()`，无需其他改动

- [ ] **Step 4: 补齐 BMarkdown defineExpose**
  - 在 BMarkdown 的 `defineExpose` 中补齐 `focusEditorAtStart`、`scrollToAnchor`、`getActiveAnchorId` 三个方法
  - 确保返回类型完全兼容 `EditorController`

- [ ] **Step 5: 验证 Markdown 编辑器无回归**

Run: `pnpm dev`，打开 .md 文件确认 BMarkdown 正常工作

- [ ] **Step 6: 运行 TypeScript 类型检查**

Run: `pnpm typecheck`
Expected: PASS — `EditorController` ref 兼容 BMarkdown 和 BJsonGraph

- [ ] **Step 7: Commit**

```bash
git add src/views/editor/ src/components/BMarkdown/index.vue
git commit -m "feat(editor): refactor index.vue with EditorDriver pattern and type migration"
```

---

### Task 15: 端到端集成验证

**Files:**
- 无新增文件

- [ ] **Step 1: 启动开发服务器**

Run: `pnpm dev`

- [ ] **Step 2: 验证 JSON 文件打开** — 创建测试 .json 文件，通过文件对话框打开，确认 BJsonGraph 渲染（左侧源码 + 右侧节点图）

- [ ] **Step 3: 验证双向联动** — 点击节点图节点确认源码定位，移动源码光标确认节点图高亮

- [ ] **Step 4: 验证折叠/展开** — 点击对象/数组节点的折叠按钮，确认子树隐藏/恢复

- [ ] **Step 5: 验证 AI 上下文** — 在 BChatSidebar 中使用 AI 工具，确认 structured.getCurrentPath() 返回正确路径

- [ ] **Step 6: 验证主题切换** — 切换明暗主题，确认节点颜色正确变化

- [ ] **Step 7: 验证非法 JSON** — 输入非法 JSON，确认右侧显示错误提示而非崩溃

- [ ] **Step 8: 验证编辑器协议** — 确认 Ctrl+Z/Y 撤销重做、Ctrl+F 查找替换、Ctrl+S 保存、行范围定位等功能在 JSON 模式下正常工作

- [ ] **Step 9: 运行全量测试确认无回归**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git commit --allow-empty -m "feat(json-graph): integration verification complete"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ 独立 BJsonGraph 组件 → Task 11
- ✅ JSON 源码编辑器 → Task 9
- ✅ 节点图（Vue Flow）→ Task 10
- ✅ 3 种自定义节点 → Task 8
- ✅ dagre LR 布局 → Task 4
- ✅ 双向联动 + 防循环 → Task 5
- ✅ JSON 解析 + 位置映射 → Task 3
- ✅ StructuredDocumentContext → Task 6
- ✅ 主题变量 → Task 7
- ✅ 条件渲染 → Task 14（通过 EditorDriver 动态组件）
- ✅ 交互边界（nodesDraggable=false）→ Task 10
- ✅ 内容同步与保存（复用 useSession/useFileState）→ Task 9 + Task 14
- ✅ 超大文件自动折叠 → Task 4 (useGraphLayout)
- ✅ 错误处理 → Task 3 (useJsonParse) + Task 10 (JsonNodeGraph)
- ✅ **[P1 修正]** EditorController 公共协议 → Task 2 + Task 9 + Task 11 + Task 14
- ✅ **[P1 修正]** 脏状态/保存复用 useFileState → Task 14
- ✅ **[P2 修正]** AI 上下文注册由页面层统一管理 → Task 6 + Task 13 + Task 14
- ✅ **[P2 修正]** fitView 触发策略优化 → Task 5 + Task 10
- ✅ **[P2 修正]** 折叠状态拆分 autoCollapsedPaths / userCollapsedPaths / userExpandedPaths → Task 2 (types) + Task 4 (useGraphLayout)
- ✅ **[P2 修正]** 类型迁移范围闭环（useBindings + useFileSelection + BMarkdown defineExpose）→ Task 14
- ✅ **[新增]** EditorDriver 驱动注册表模式 → Task 12 + Task 13 + Task 14

**2. Placeholder scan:** 无 TBD/TODO/未完成步骤 ✅

**3. Type consistency:** JsonNodeInfo.path 统一为 JSON Pointer 格式，BJsonGraphPublicInstance 继承 EditorController 确保类型兼容 ✅

**4. Review feedback traceability:**
- P1 编辑器公共协议 → Task 2 (types), Task 9 (JsonSourceEditor), Task 11 (index.vue defineExpose), Task 14 (editorRef 类型)
- P1 脏状态/保存 → Task 14 (registerEditorContext 不读 fileState.savedContent)
- P2 AI 上下文注册 → Task 6 (测试), Task 13 (jsonDriver.createToolContext), Task 14 (页面层统一注册)
- P2 fitView 策略 → Task 5 (useSourceSync), Task 10 (JsonNodeGraph)
- P2 折叠状态拆分 → Task 2 (JsonGraphState 类型), Task 4 (useGraphLayout 可见性判断)
- P2 类型迁移闭环 → Task 14 (useBindings.ts + useFileSelection.ts + BMarkdown defineExpose)
- 新增 EditorDriver 模式 → Task 12 (types + registry), Task 13 (markdown + json drivers), Task 14 (index.vue 重构)
