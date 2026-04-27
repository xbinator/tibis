# BPromptEditor 纯渲染引擎重构

## 问题

`BPromptEditor` 核心层（`variableChip.ts`、`index.vue`、`pasteHandler.ts`）硬编码了大量业务知识，每增加一种 chip 类型都需要修改编辑器源码。

### 当前耦合点

| 位置 | 硬编码内容 |
|------|-----------|
| `variableChip.ts:12-30` | `FileRefWidget` 类，`fileName:line` 显示逻辑 |
| `variableChip.ts:39-52` | `file-ref:` 前缀识别、`|` 分隔符解析 |
| `index.vue:429` | `insertFileReference` 方法签名和 token 构造逻辑 |
| `pasteHandler.ts:28-29` | 文件拖拽/粘贴的 token 格式 |
| `extraChip.ts`(规划中) | 与 variableChip 重复的 `{{...}}` 匹配逻辑（`extraChipsField`） |

---

## 目标

**BPromptEditor 变成纯渲染引擎**，只负责 `{{...}}` 匹配和装饰渲染，不关心 token 的内部语义。chip 的样式、格式、显示逻辑全部由消费者（BChatSidebar）控制。

---

## 架构对比

```
┌── 当前 ──────────────────────────────────────┐
│  BChatSidebar                                 │
│    ↓ 调用 insertFileReference(reference)       │
│  BPromptEditor                                │
│    ├── 知道 file-ref: 格式                     │
│    ├── 知道 | 分隔符                            │
│    ├── 构造 FileRefWidget                      │
│    └── 渲染 fileName:line                      │
└───────────────────────────────────────────────┘

┌── 重构后 ────────────────────────────────────┐
│  BChatSidebar                                 │
│    ├── 定义 chipResolver(body) → ChipResult   │
│    ├── 定义 FileRefWidget 类                   │
│    ├── 构造 token 格式                         │
│    └── 调用 editor.insertTextAtCursor(token)  │
│  BPromptEditor                                │
│    ├── 匹配 {{...}}                            │
│    ├── 调用 chipResolver(body)                │
│    └── 渲染返回的 widget / className           │
└───────────────────────────────────────────────┘
```

---

## 核心 API 设计

### ChipResolver

```typescript
/**
 * Chip 解析器，由消费者提供。
 * 接收 `{{...}}` 内部的 body 文本，返回渲染指令。
 * 返回 null 表示不渲染为 chip（当做普通文本）。
 *
 * 注意：resolver 必须是稳定引用。
 * 如果消费者每次渲染都创建新函数，会导致 compartment 频繁 reconfigure、
 * 触发全量重装饰。推荐使用 `shallowRef` 包裹 resolver，或将其定义为组件
 * setup 外层的纯函数（不会随渲染重建）。
 *
 * 编辑器内部通过 watch + 引用相等比较跳过不必要的 reconfigure。
 */
type ChipResolver = (body: string) => ChipResult | null

/**
 * Chip 渲染指令，通过联合类型保证 widget 和 className 互斥。
 * 编译器会在同时传两个时直接报错，而非运行时静默忽略。
 */
type ChipResult =
  | { widget: WidgetType }
  | { className: string }
```

### Props 变更

```typescript
interface BPromptEditorProps {
  // ── 保留 ──
  placeholder?: string
  options?: VariableOptionGroup[]   // 触发器补全菜单
  disabled?: boolean
  maxHeight?: number | string
  submitOnEnter?: boolean

  // ── 新增 ──
  chipResolver?: ChipResolver       // chip 渲染器
  /**
   * 文件粘贴回调。
   * 当前仅支持同步返回（用 file.name 等同步数据构造 token）。
   * 返回 Promise 时 pasteHandler 会打 warning 并跳过插入——
   * 因为异步 resolve 前用户可能已编辑文档，偏移量失效无法安全插入。
   * 如需异步粘贴，应采用占位符 + 替换方案（见 pasteHandler 小节）。
   */
  onPasteFiles?: (files: File[]) => Promise<string | null> | string | null
}
```

### Exposed Methods

```typescript
defineExpose({
  focus: () => void,
  /** 在保存的光标位置或当前位置插入文本 */
  insertTextAtCursor: (text: string) => void,
  /** 保存当前光标位置（用于跨组件延迟插入场景） */
  saveCursorPosition: () => void,
  /**
   * 获取编辑器原始内容。
   * 返回包含 `{{...}}` token 的原始文本，即 CodeMirror doc 内容，不做 chip 展开。
   * 消费者如需解释 token，应使用自己的 resolver 逻辑。
   */
  getText: () => string,
})

/**
 * insertTextAtCursor 插入位置优先级：
 * 1. 如果有通过 saveCursorPosition 保存的位置，使用最后一次保存的位置
 *    （多次调用 saveCursorPosition 只保留最后一次，无队列语义）
 * 2. 否则使用当前光标位置
 * 3. 插入后清除保存的位置，光标移到插入内容末尾
 */
```

> `insertFileReference` 移除，由消费者调用 `insertTextAtCursor` 传入已构造好的 token。

---

## 文件变更清单

### 1. `variableChip.ts` → 纯 {{...}} 匹配层

**移除**：
- `FileRefWidget` 类（移到 BChatSidebar）
- `file-ref:` 前缀判断和 `|` 拆分逻辑
- `b-prompt-chip--file` 类名引用
- 模块级全局变量

**新增**：
- `chipResolverEffect` StateEffect，resolver 变化时派发
- `ChipFieldState` 将 resolver 和 decorations 共同存在 StateField 内部
- `buildDecorations` 接收 resolver 参数（纯函数，不访问外部状态）

```typescript
// variableChip.ts
import { StateEffect } from '@codemirror/state'

export const chipResolverEffect = StateEffect.define<ChipResolver>()

interface ChipFieldState {
  resolver: ChipResolver
  decorations: DecorationSet
}

function buildDecorations(text: string, resolver: ChipResolver): DecorationSet {
  const decorations: Range<Decoration>[] = []
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const body = match[1]
    const result = resolver(body)
    if (!result) continue
    if ('widget' in result) {
      decorations.push(
        Decoration.replace({ widget: result.widget })
          .range(match.index, match.index + match[0].length)
      )
    } else {
      decorations.push(
        Decoration.mark({ class: result.className })
          .range(match.index, match.index + match[0].length)
      )
    }
  }
  return Decoration.set(decorations, true)
}

export const variableChipField = StateField.define<ChipFieldState>({
  create(state) {
    const resolver: ChipResolver = () => null
    return { resolver, decorations: buildDecorations(state.doc.toString(), resolver) }
  },
  update({ resolver, decorations }, tr) {
    const nextResolver = tr.effects.find(e => e.is(chipResolverEffect))?.value ?? resolver
    const resolverChanged = nextResolver !== resolver
    if (tr.docChanged || resolverChanged) {
      return {
        resolver: nextResolver,
        decorations: buildDecorations(tr.newDoc.toString(), nextResolver)
      }
    }
    return { resolver, decorations: decorations.map(tr.changes) }
  },
  provide: field => EditorView.decorations.from(field, s => s.decorations)
})
```

**getChipAtPos 微调**：`state.field(variableChipField)` 现在返回 `ChipFieldState`，需改为 `state.field(variableChipField, false)?.decorations`。

**为什么不用模块级变量**：
- 模块级 `_chipResolver` 是全局状态，多实例 mount 时互相覆盖
- 测试环境中常挂多个组件实例，全局状态导致测试顺序敏感
- 放在 StateField 内部，每个 EditorView 独立持有自己的 resolver，天然隔离

**resolver 切换流程**：

```
resolver 变化 → watch 检测到引用变化
              → view.dispatch({ effects: chipResolverEffect.of(newResolver) })
              → StateField.update 检测到 chipResolverEffect effect
              → 重建 decorations
```

- 编辑器内部在 `watch(props.chipResolver)` 中做 **引用相等比较**（`===`）
- 消费者使用 `shallowRef` 包裹 resolver，或定义为 setup 外层纯函数
- `variableChipField` 始终是同一个静态引用，`atomicRanges` 无需改动

### 2. `index.vue` → 通用化

**变更**：
- `insertFileReference` → `insertTextAtCursor(text: string)`
- `captureCursorPosition` → `saveCursorPosition`
- 接收 `chipResolver` prop，变化时派发 `chipResolverEffect` StateEffect
- 接收 `onPasteFiles` prop，透传给 `createPasteHandlerExtension`

### 3. `pasteHandler.ts` → 回调化

**变更**：
- 接收 `onPasteFiles` 回调，不再硬编码 token 格式
- 回调支持同步和异步返回值

**异步位点可靠性取舍**：`event.preventDefault()` 锁定粘贴瞬间的文档偏移量 `pos`，如果 `onPasteFiles` 异步 resolve 时用户已编辑了文档，`pos` 对应的位置已被其他变更位移，插入会落在错误位置。

选择：**限定 `onPasteFiles` 必须同步返回，不等待异步 resolve**。当前业务场景（用 `file.name` 构造 token）本身就是同步的，无实际损失。签名保留 `Promise<string|null> | string | null` 以备未来扩展，但 pasteHandler 内检测到 Promise 时打 warning 并跳过插入。

```typescript
paste(event, view) {
  if (event instanceof ClipboardEvent) {
    const { files } = event.clipboardData || {}
    if (files?.length && onPasteFiles) {
      event.preventDefault()
      const pos = view.state.selection.main.head
      const result = onPasteFiles(Array.from(files))
      if (result instanceof Promise) {
        console.warn('[pasteHandler] Async onPasteFiles not supported — pos is stale after user edits. Insertion skipped.')
        return true
      }
      if (typeof result === 'string') {
        view.dispatch({
          changes: { from: pos, insert: result },
          selection: { anchor: pos + result.length }
        })
      }
      return true
    }
  }
  return false
}
```

> 如果未来真的需要异步粘贴（如先上传文件拿到 URL），应采用**占位符 + 替换**方案：先插入 `{{file-ref:uploading|xxx|}}` 临时 chip，Promise resolve 后用 `view.dispatch` 替换占位符范围为最终 token。但当前无需实现。

### 4. `BChatSidebar/index.vue` → 承担业务逻辑

**新增**：
- 定义 `chipResolver` 函数（处理 `file-ref:`、未来 `@mention` 等）
- 定义 `FileRefWidget` 类
- 定义 `onPasteFiles` 回调（构造文件 chip token）
- `handleChatInsertFileReference` 中：
  - 构造 token（`{{file-ref:id|fileName|line}}`）
  - 调用 `editor.insertTextAtCursor(token)`

### 5. `useVariableEncoder.ts`

**评估**：此文件是 contenteditable 时代的遗留代码，encode/decode 逻辑与 CodeMirror 架构无关。计划 **废弃**，但分阶段：

- 第一阶段：保留，不修改
- 第二阶段：评估所有调用方，确认无使用后移除

---

## 兼容性

### Token 格式

不强制 token 格式，由 `chipResolver` 决定解析逻辑。现有 `{{file-ref:id|fileName|line}}` 格式完全兼容——只需在 BChatSidebar 的 `chipResolver` 中解析即可。

### 旧 token 兼容

如果旧消息中包含 `{{file-ref:id}}`（无 `|` 的旧格式），`chipResolver` 可以：
```typescript
if (body.startsWith('file-ref:')) {
  const parts = body.slice(9).split('|')
  const id = parts[0]
  const fileName = parts[1] || id
  const line = parts[2] || ''
  return { widget: new FileRefWidget(fileName, line) }
}
```

### getChipAtPos

返回类型和接口不变，内部取 `field` 值时调整为 `state.field(variableChipField, false)?.decorations`（因 field 值现在是 `ChipFieldState`，装饰在 `.decorations` 上）。

### 原子范围

保持不变，通过 `EditorView.atomicRanges` 从 `variableChipField` 获取。

---

## 其他决策

### `extraChip.ts` 合并

**结论：不创建独立 `extraChipsField`**。新的 chip 类型全部通过 `chipResolver` 返回，由统一的 `variableChipField` 渲染。

理由：
1. 避免两套 `{{...}}` 正则匹配（性能浪费）
2. 避免两个 StateField 竞争装饰范围
3. 统一 `getChipAtPos` 查询入口

如果未来需要非 `{{...}}` 格式的 chip（如行内装饰、链接预览等），届时再评估是否需要新增独立的 StateField 或不同的匹配策略。

---

## 实施顺序

| 阶段 | 内容 | 风险 | 验收标准 |
|------|------|------|----------|
| 1 | `variableChip.ts` 重构：`ChipFieldState` + `chipResolverEffect` StateEffect | 低 | 现有 chip 测试全部通过；`atomicRanges`/`getChipAtPos` 行为不变 |
| 2 | `index.vue` 接口通用化（insertTextAtCursor、getText） | 低 | 旧接口调用方类型检查通过 |
| 3 | `pasteHandler.ts` 改为回调（同步 only，异步打 warning） | 低 | 拖拽/粘贴文件 chip 正常渲染；异步回调被正确拒绝 |
| 4 | BChatSidebar 迁移：定义 resolver、widget、回调 | 中-高 | chip 渲染截图与迁移前一致；Backspace 删除、mousedown 跳转、原子范围行为不变 |
| 5 | 移除 `useVariableEncoder.ts` | 低 | 无调用方引用 |
| 6 | 清理测试，补充 resolver 相关单元测试 | 低 | 覆盖率不降 |

> 阶段 4 依赖前三个阶段全部正确，且 FileRefWidget 从内核移到 BChatSidebar 后需要确认 DOM 结构和样式不变，是唯一存在联调风险的阶段。

每个阶段独立提交，阶段 4 完成后即可验收完整功能。

---

## 待讨论

1. **triggerState / triggerPlugin**：变量触发补全也嵌在编辑器中，是否需要同样外移为 `onTrigger` 回调？本次暂不处理，保持现状。
