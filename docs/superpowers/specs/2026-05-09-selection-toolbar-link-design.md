# Selection Toolbar 链接功能设计

## 背景

当前选区工具栏（`SelectionToolbar`）只支持文本格式操作（bold/italic/underline/strike/code），缺少链接设置与取消功能。项目已有 `@tiptap/extension-link`（`MarkdownLink`），`setLink()`/`unsetLink()` 命令可用，只需增加 UI 交互层。

## 范围

仅涉及 **Rich 模式**（`SelectionToolbarRich` 宿主），Source 模式不做改动。

## 行为矩阵

| 选区状态 | 点击 link 按钮 | 结果 |
|---------|---------------|------|
| 不含链接（`isActive('link')` 为 false） | 弹出 LinkPopover | 用户输入 URL 后确认 → `setLink({ href })` 设置链接 |
| 包含链接（`isActive('link')` 为 true） | 直接执行 | `unsetLink()` 移除链接，不弹窗 |

## 组件结构

```
SelectionToolbarRich (host)                       ← 新增 link 处理分支 + LinkPopover 状态管理
 ├─ SelectionToolbar (content)                    ← 无改动（仅新增 link 按钮数据注入）
 └─ LinkPopover (新建，teleport → overlayRoot)      ← 新建组件
      ├─ <input> URL 输入框（autofocus）
      ├─ 确认按钮（Enter 快捷键）
      └─ 取消按钮（Esc 快捷键 / 点击外部）
```

## 接口变更

### `SelectionToolbarAction` 类型扩展

```typescript
// adapters/selectionAssistant.ts
export type SelectionToolbarAction =
  'ai' | 'reference' | 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'link';
                                                                             // ^^^^ 新增
```

### `PaneRichEditor.vue` - formatButtons 新增 link

```typescript
const formatButtons = computed(() => [
  { command: 'bold' as SelectionToolbarAction, icon: 'lucide:bold' },
  { command: 'italic' as SelectionToolbarAction, icon: 'lucide:italic' },
  { command: 'underline' as SelectionToolbarAction, icon: 'lucide:underline' },
  { command: 'strike' as SelectionToolbarAction, icon: 'lucide:strikethrough' },
  { command: 'code' as SelectionToolbarAction, icon: 'lucide:code' },
  { command: 'link' as SelectionToolbarAction, icon: 'lucide:link' },   // 新增
]);
```

### `SelectionToolbarRich.vue` - handleFormat 新增 link 分支

```typescript
function handleFormat(command: SelectionToolbarAction): void {
  // ... 现有分支不变 ...
  case 'link':
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
    } else {
      openLinkPopover();
    }
    break;
}
```

### 新建 `LinkPopover.vue`

Props:
- `editor: Editor` — TipTap 编辑器实例
- `overlayRoot: HTMLElement` — teleport 目标容器
- `anchorElement: HTMLElement | null` — 定位锚点（工具栏 DOM）

Emits:
- `close` — 关闭 popover

内部状态:
- `href: string` — 输入框绑定值
- `isVisible: boolean` — 控制显隐

**定位逻辑**：参考 `SelectionToolbarRich.syncStyle` 模式，teleport 到 overlayRoot，绝对定位在工具栏下方 8px，水平居中。

**关闭条件**：
- `onClickOutside`（点击 toolbar 或 popover 以外的区域）
- Esc 键
- 确认 / 取消按钮点击

## 数据流

```
用户选中文本 → SelectionToolbar 弹出（现有逻辑）
  ↓ 点击 link 按钮
SelectionToolbarRich.handleFormat('link')
  ↓ isActive('link') === false
openLinkPopover() → 显示 LinkPopover
  ↓ 用户输入 URL 并确认
editor.chain().focus().setLink({ href }).run()
  ↓
closeLinkPopover() → 选区保持，工具栏继续显示
```

```
用户选中含链接文本 → SelectionToolbar 弹出，link 按钮 active
  ↓ 点击 link 按钮
handleFormat('link') → isActive('link') === true
  ↓
editor.chain().focus().unsetLink().run()
  ↓ 链接移除，工具栏更新（link 按钮恢复非 active）
```

## 边界情况

1. **URL 为空**：确认按钮 disabled，仅允许非空提交
2. **Popover 打开时再次点击 link 按钮**：关闭 popover（toggle 行为）
3. **Popover 内 pointer 事件不隐藏工具栏**：popover DOM 节点需要在 `shouldHide` 的判断中排除
4. **设置链接后工具栏状态**：`editor.isActive('link')` 变为 true，link 按钮高亮
5. **移除链接后工具栏状态**：link 按钮恢复非 active，选区保持
6. **Popover 宽度**：固定 280px，足够显示常见 URL

## 文件清单

| 文件 | 改动 |
|------|------|
| `src/components/BMarkdown/adapters/selectionAssistant.ts` | `SelectionToolbarAction` 新增 `'link'` |
| `src/components/BMarkdown/components/PaneRichEditor.vue` | `formatButtons` 新增 link 按钮 |
| `src/components/BMarkdown/components/SelectionToolbarRich.vue` | `handleFormat` 新增 link 分支 + LinkPopover 状态管理 |
| **新建** `src/components/BMarkdown/components/LinkPopover.vue` | 链接 URL 输入浮层组件 |
