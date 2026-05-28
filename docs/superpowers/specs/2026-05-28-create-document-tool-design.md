# create_document 工具设计

## 概述

为 `DocumentTool` 新增 `create_document` 工具，允许 AI 在编辑器中创建新的未保存草稿标签页（类似 IDE 的"新建文件"操作）。创建后的文档以 `unsaved://` 虚拟路径标识，用户可后续手动保存到磁盘。

## 工具定义

| 属性 | 值 |
|------|-----|
| 名称 | `create_document` |
| 来源 | `builtin` |
| 风险等级 | `write` |
| 权限类别 | `document` |
| 需要活动文档 | `false` |
| `safeAutoApprove` | `true`（创建草稿为低风险操作，允许用户一键信任） |
| 注册策略 | 始终注册（与 `TodoWriteTool` 一致，不依赖确认适配器） |
| 所属工具组 | `DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES` |

## 参数

```typescript
interface CreateDocumentInput {
  /** 文档标题/文件名，如 "README"。必填。 */
  title: string;
  /** 文档初始内容。必填，允许空字符串（将打开空白文档）。 */
  content: string;
  /** 文件扩展名，默认为 "md"。可选，会经过安全清洗（去除路径分隔符和前导点号）。 */
  ext?: string;
}
```

## 返回结果

```typescript
interface CreateDocumentResult {
  /** 文档 ID（由业务层通过 nanoid 生成）。 */
  id: string;
  /** 文档标题（来自 openDraft 处理后的 draft.file.name，由 extractNameAndExt 从 originalPath 解析而来，不含扩展名）。 */
  title: string;
  /** 文档路径（unsaved:// 虚拟路径）。 */
  path: string;
  /** 文档内容（即传入的 content）。 */
  content: string;
}
```

## 执行流程

1. 校验 `title` 非空，否则返回 `INVALID_INPUT` 错误
2. 校验 `options.openDraft` 可用，否则返回 `EXECUTION_FAILED` 错误
3. 清洗 `ext` 参数：去除路径分隔符（`/\:*?"<>|`）和前导点号，防止路径穿越；清洗后为空则回退为 `md`
4. 拼接文件名：`{title}.{ext}`
5. 调用 `options.openDraft({ originalPath: fileName, content })` 创建草稿并打开编辑器标签页
6. 返回 `{ id, title, path (unsaved://虚拟路径), content }`

## 实现方案

### 文件变更

**`src/ai/tools/builtin/DocumentTool/index.ts`**

- 新增 `CREATE_DOCUMENT_TOOL_NAME` 常量
- 新增 `CreateDocumentInput`、`CreateDocumentResult` 接口
- 新增 `CreateBuiltinDocumentWriteToolOptions` 接口（含 `openDraft` 选项）
- 新增 `createBuiltinDocumentWriteTool()` 工厂函数（`safeAutoApprove: true`、`ext` 参数清洗）

**`src/ai/tools/builtin/index.ts`**

- 导入 `CREATE_DOCUMENT_TOOL_NAME` 和 `createBuiltinDocumentWriteTool`
- 将 `CREATE_DOCUMENT_TOOL_NAME` 加入 `DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES`
- 在 `createBuiltinTools()` 中，将 `createBuiltinDocumentWriteTool` 的调用放在 `if (!options.confirm)` 守卫之前，使其在无确认适配器时也注册（与 `TodoWriteTool` 一致）

### 关键设计决策

- **始终注册**：创建标签页是低风险写操作，与 `TodoWriteTool` 同为不依赖确认适配器的写工具
- **仅创建未保存草稿**：不涉及工作区文件创建，语义清晰；如需创建磁盘文件，使用 `write_file`
- **`safeAutoApprove: true`**：允许用户在首次使用时一键信任，后续不再弹确认
- **`ext` 安全清洗**：去除路径分隔符和前导点号，避免 AI 传入的异常扩展名导致文件名显示异常
- **ID 由业务层生成**：通过 `openDraft` → `useOpenDraft` → `filesStore.createAndOpen` 生成 `nanoid`
- **`title` 返回值**：返回的是 `useOpenDraft` 中 `extractNameAndExt` 解析后的 `draft.file.name`（不含扩展名的纯文件名），而非用户原始传入的 `title` 参数
- **`content` 允许空字符串**：AI 传入空内容时将打开空白文档，不做报错处理

## 测试要点

- 正常创建文档，返回正确的 id/title/path/content
- title 为空时返回 `INVALID_INPUT`
- `openDraft` 不可用时返回 `EXECUTION_FAILED`
- 自定义 `ext` 参数正确生效
- 默认扩展名 `md` 正确生效
- `ext` 包含路径分隔符时（如 `ext: "../etc/passwd"`）清洗后正确降级
- `ext` 包含前导点号时（如 `ext: ".md"`）清洗后正确降级
- `content` 为空字符串时正常创建空文档
- `title` 包含特殊字符（如 `/`、`\`、`.`）时的文件名结果
