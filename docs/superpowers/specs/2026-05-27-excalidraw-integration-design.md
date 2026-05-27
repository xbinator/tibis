# Excalidraw 集成设计

## 概述

Tibis 接入 Excalidraw 手绘风格白板，提供三种能力：独立页面全屏编辑、编辑器内嵌只读预览、AI 生成图表。三者统一设计，共享核心组件和数据格式，分步交付。

## 方案选型

| 方案 | 说明 | 结论 |
|------|------|------|
| A：BExcalidraw + npm 包 | 引入 `@excalidraw/excalidraw`，封装为 B 系列组件 | ✅ 采用 |
| B：iframe 嵌入 | 嵌入 excalidraw.com 或自部署实例 | ❌ 依赖网络、跨 iframe 通信复杂 |
| C：React-Vue 桥接 | veaury 桥接 React 组件 | ❌ 引入 React 运行时、违反技术栈统一性 |

选择方案 A 的理由：
- `@excalidraw/excalidraw` 框架无关（Preact + Canvas），可在 Vue 中直接渲染
- 与 B 系列组件规范一致
- 离线可用，符合项目"本地优先"理念
- 大包通过 Vite 拆包解决

## 独立 .excalidraw 文件策略

**不支持独立 .excalidraw 文件**。所有 Excalidraw 数据统一嵌入 Markdown 代码块。

理由：
- 如果支持 `.excalidraw` 文件，`resolveEditorKind` 会将其路由到 Monaco 编辑器，用户看到裸 JSON，体验差
- 避免引入新的文件类型和编辑器路由分支
- 与 Mermaid 代码块体验保持一致

因此路由参数 `:fileId` 始终指向 .md 文件，不存在独立白板文件场景。

## 核心组件架构

```
src/components/BExcalidraw/
├── index.vue                    # 主入口（动态 import @excalidraw/excalidraw，暴露 API）
├── hooks/
│   ├── useExcalidrawScene.ts    # 场景数据管理（load/save/scene state）
│   ├── useExcalidrawTheme.ts    # 明暗主题同步（复用 MutationObserver 模式）
│   └── useExcalidrawExport.ts   # 导出能力（PNG/SVG/JSON）
├── components/
│   └── ExcalidrawToolbar.vue    # 自定义工具栏（适配项目风格）
└── utils/
    ├── sceneSerializer.ts       # 场景 JSON ↔ Markdown 代码块序列化
    └── aiSchema.ts              # AI 工具输出的 Excalidraw JSON schema 校验
```

### 自动注册配置

在 `vite.config.ts:18-41` 的 `COMPONENT_DIRS` 中新增 `'BExcalidraw'`，使 `unplugin-vue-components` 自动发现和导入该目录下组件。

具体改动位置：`vite.config.ts:40`，在 `'BUpload'` 后追加 `'BExcalidraw'`。

### 模式设计

BExcalidraw 支持 `mode: 'full' | 'compact'` prop：

- **full（独立页面）**：完整 Excalidraw 编辑器，所有绘图工具可用
- **compact（编辑器内嵌）**：只读 SVG 预览，不加载编辑器运行时，右上角"打开画板"按钮跳转独立页面

## 数据流与存储

### Markdown 代码块格式

````markdown
```excalidraw {"blockId":"abc123"}
{"type":"excalidraw","version":2,"elements":[...],"appState":{...}}
```
````

代码块语言标记后附带 JSON 元信息，包含 `blockId` 字段作为稳定标识。该 ID 在代码块创建时生成（nanoid），存储在 TipTap Node 的 attrs 中，随文档持久化。

数据统一存储在 Markdown 代码块内 JSON，所有模式共享同一数据源。

### 数据流

```
[独立页面编辑] → Excalidraw onChange → 场景 JSON → 写回 .md 文件代码块
                                                        ↑
[编辑器内嵌]   → exportToSvg(JSON) → 只读 SVG 预览 → 点击按钮 → 打开独立 Tab
                                                        ↑
[AI 生成]      → ExcalidrawTool 输出 JSON → 写入代码块 → 同上预览
```

### 关键机制

- 内嵌预览通过 `exportToSvg` 生成 SVG，结果缓存避免重复渲染
- 独立页面通过 Tab 的 `cacheKey` 关联源 .md 文件 + `blockId`（稳定 ID，非索引位置）
- 编辑保存后，通过事件总线（`helpers/events.ts` 模式）通知编辑器刷新预览

### 为什么用 blockId 而非 blockIndex

用代码块位置索引作为 cacheKey 存在漂移风险：用户在 Excalidraw 代码块之前插入或删除其他代码块会导致索引偏移，Tab 关联到错误代码块。`blockId` 在代码块创建时生成并持久化到文档 AST 中，不受位置变化影响。

## 编辑器内嵌

内嵌模式为只读预览，不加载 Excalidraw 编辑器运行时：

- 通过 `exportToSvg`（从 `@excalidraw/utils` 按需引入）生成 SVG 渲染
- 右上角"打开画板"按钮，点击跳转独立 Tab 编辑
- 预览与 CodeBlock 的 Mermaid 预览体验一致

### CodeBlock 具体改动

1. **`PREVIEWABLE_LANGUAGES`**（`CodeBlock.vue:84`）：新增 `'excalidraw'`
   ```ts
   // 改前
   const PREVIEWABLE_LANGUAGES = new Set<PreviewType>(['mermaid', 'json']);
   // 改后
   const PREVIEWABLE_LANGUAGES = new Set<PreviewType>(['mermaid', 'json', 'excalidraw']);
   ```

2. **`PreviewType`**（`CodeBlock.vue:70`）：联合类型新增 `'excalidraw'`

3. **`LANGUAGE_OPTIONS`**（`CodeBlock.vue:86-113`）：新增条目
   ```ts
   { value: 'excalidraw', label: 'Excalidraw' }
   ```

4. Excalidraw 预览逻辑与 Mermaid 预览平级，检测到 `excalidraw` 语言时渲染 SVG 预览区 + "打开画板"按钮

## 主题同步

复用 CodeBlock 中 Mermaid 已有的主题监听模式（`CodeBlock.vue:130-135`）：

```ts
// 已有模式：通过 MutationObserver 监听 data-theme 属性变化
new MutationObserver(handleThemeChange).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme']
});
```

`useExcalidrawTheme.ts` 采用同一机制：
- 监听 `document.documentElement[data-theme]` 属性变化
- 变化时通知 Excalidraw 实例切换 `theme` prop（`'dark'` | `'light'`）
- 不引入额外的主题监听方式，保持一致性

## 图片/资源处理策略

Excalidraw 支持嵌入图片，需要明确存储策略：

- **采用 base64 内联**：图片数据存储在代码块 JSON 的 `element.dataURL` 字段中
- **限制**：单张图片超过 500KB 时，插入时自动压缩（复用项目已有的 sharp 图片处理能力，通过 IPC 调用主进程 `image/compress`）
- **权衡**：base64 会增大 Markdown 文件体积，但避免了独立资源文件的管理复杂度（文件组织、清理、移动时引用断裂等问题）
- **未来可选优化**：如果实际使用中大图场景频繁，可考虑将图片提取为独立文件存储在 `.tibis/assets/` 目录中，代码块 JSON 改为引用相对路径

## AI 工具集成

### 工具定义

- **位置**：`src/ai/tools/builtin/ExcalidrawTool/`
- **名称**：`excalidraw_diagram`
- **描述**：生成 Excalidraw 白板图表

### 工具注册

在 `src/ai/tools/builtin/index.ts` 中：
- 在 `createBuiltinTools()` 中实例化 `createExcalidrawTool()`
- 放入 `DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES` 数组（写入代码块属于写操作）
- 在 `ALL_BUILTIN_TOOL_NAMES` 中自动包含

### 输入参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `prompt` | string | 图表描述 |
| `type` | enum | `flowchart` \| `architecture` \| `mindmap` \| `wireframe` \| `custom` |

### 执行流程

1. AI 通过工具调用生成结构化描述（非直接输出 Excalidraw JSON）
2. `aiSchema.ts` 将结构化描述转换为 Excalidraw elements 数组
3. 校验 JSON schema
4. 校验通过 → 在当前光标位置插入 ```excalidraw 代码块
5. 渲染侧展示 SVG 预览 + "打开画板"按钮

### 结构化描述中间格式

AI 不直接输出 Excalidraw elements JSON（过于复杂且容易出错），而是输出简化的结构化描述，由 `aiSchema.ts` 转换为 Excalidraw elements。

#### 通用 schema

```ts
interface ExcalidrawPrompt {
  /** 图表类型 */
  type: 'flowchart' | 'architecture' | 'mindmap';
  /** 节点列表 */
  nodes: Array<{
    /** 节点 ID */
    id: string;
    /** 显示文本 */
    label: string;
    /** 节点形状 */
    shape: 'rectangle' | 'diamond' | 'ellipse' | 'cylinder';
    /** 分组 ID（可选） */
    group?: string;
  }>;
  /** 连线列表 */
  edges: Array<{
    /** 起点 ID */
    from: string;
    /** 终点 ID */
    to: string;
    /** 连线标签（可选） */
    label?: string;
    /** 箭头样式 */
    arrow?: 'arrow' | 'none' | 'both';
  }>;
}
```

#### 转换示例（flowchart）

**AI 输入**：
```json
{
  "type": "flowchart",
  "nodes": [
    { "id": "start", "label": "用户请求", "shape": "ellipse" },
    { "id": "auth", "label": "鉴权检查", "shape": "diamond" },
    { "id": "success", "label": "返回数据", "shape": "rectangle" },
    { "id": "fail", "label": "401 错误", "shape": "rectangle" }
  ],
  "edges": [
    { "from": "start", "to": "auth" },
    { "from": "auth", "to": "success", "label": "通过" },
    { "from": "auth", "to": "fail", "label": "失败" }
  ]
}
```

**转换输出**（Excalidraw elements 片段）：
```json
[
  { "type": "ellipse", "id": "start", "x": 200, "y": 50, "width": 160, "height": 60, "text": "用户请求" },
  { "type": "diamond", "id": "auth", "x": 200, "y": 180, "width": 160, "height": 100, "text": "鉴权检查" },
  { "type": "rectangle", "id": "success", "x": 80, "y": 360, "width": 160, "height": 60, "text": "返回数据" },
  { "type": "rectangle", "id": "fail", "x": 320, "y": 360, "width": 160, "height": 60, "text": "401 错误" },
  { "type": "arrow", "id": "e1", "startBinding": "start", "endBinding": "auth" },
  { "type": "arrow", "id": "e2", "startBinding": "auth", "endBinding": "success", "text": "通过" },
  { "type": "arrow", "id": "e3", "startBinding": "auth", "endBinding": "fail", "text": "失败" }
]
```

转换逻辑在 `aiSchema.ts` 中实现，负责：
- 根据图表类型选择布局算法（flowchart 自上而下、mindmap 中心发散、architecture 分层）
- 计算节点坐标、连线端点
- 映射 shape → Excalidraw element type

## 路由与 Tab 集成

### 新增路由

| 路径 | 说明 |
|------|------|
| `/excalidraw/:fileId` | 独立白板编辑页，`:fileId` 为关联的 .md 文件 ID |

参数命名使用 `fileId` 而非 `id`，明确语义为文件引用而非白板自身 ID。与编辑器路由 `/editor/:id?` 的 `:id`（自动生成 nanoid）区分。

### Tab 行为

- Tab 标题显示文件名 + 图标标识
- `cacheKey` 编码 `fileId + blockId`，通过稳定 blockId 关联，同一文件多个白板各有独立 Tab
- 支持拖拽排序、右键菜单（复用 HeaderTabs 能力）
- KeepAlive 缓存，切换 Tab 不丢失编辑状态

### 从内嵌跳转

代码块预览区"打开画板"按钮 → `router.push({ name: 'excalidraw', params: { fileId }, query: { blockId } })`

### Excalidraw undo/redo 隔离

Excalidraw 内部维护独立的 undo/redo 栈，不与 TipTap 编辑器的 undo/redo 交互。在独立页面中键盘快捷键（Ctrl+Z/Ctrl+Shift+Z）由 Excalidraw 消费；在内嵌预览模式下 Excalidraw 不加载，快捷键不受影响。

## 构建优化与包体积控制

### Vite 拆包

在 `vite.config.ts:59-136` 的 `VENDOR_CHUNK_GROUPS` 数组末尾新增：

```ts
{
  name: 'excalidraw',
  test: /node_modules\/(@excalidraw\/excalidraw|roughjs|canvas-roundrect-polyfill)\//
}
```

注意：项目使用 Rolldown（`vite.config.ts:192-197`），配置格式为 `rolldownOptions.output.codeSplitting.groups`，不是 `rollupOptions.output.manualChunks`。

### 加载策略

| 模块 | 首屏加载 | 按需加载 |
|------|---------|---------|
| 主 bundle | 0 | - |
| 预览（exportToSvg） | - | ~200KB gzipped |
| 编辑器（full） | - | ~1.8MB gzipped |

- `@excalidraw/excalidraw` 仅在独立页面路由 dynamic import，不打入主 bundle
- 预览用 `exportToSvg` 从 `@excalidraw/utils` 按需引入
- SVG 导出在 Web Worker 中执行，避免阻塞 UI

## 快捷键说明

独立页面模式下 Excalidraw 消费常用快捷键（Ctrl+Z/Ctrl+Shift+Z/Ctrl+C/Ctrl+V 等），不与全局快捷键冲突。内嵌预览模式无 Excalidraw 实例，不存在快捷键冲突。

## 分步交付计划

| 阶段 | 内容 | 依赖 |
|------|------|------|
| P1：独立页面 | BExcalidraw 组件 + `/excalidraw/:fileId` 路由 + Tab 管理 + 场景 JSON 读写 | 无 |
| P2：编辑器内嵌 | TipTap 代码块扩展 + 只读 SVG 预览 + "打开画板"跳转按钮 | P1 |
| P3：AI 生成 | ExcalidrawTool + 结构化描述→Excalidraw elements 转换 + schema 校验 | P2 |

每个阶段可独立验证和交付。
