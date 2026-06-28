# 2026-06-27 DrawingData Contract Design

## Goal

为 `DrawingData` 增加画板级能力契约字段，使一个画板文件不仅能保存可视化元素，还能描述自己作为 LLM 可调用能力时的标识、用途、入参和出参。

新增字段：

- `name`：标识符，用于稳定引用这个画板能力。
- `description`：功能描述，用于说明这个画板能力适合解决什么问题。
- `inputSchema`：入参 schema，必须是 `type: 'object'` 的对象格式。
- `outputSchema`：出参 schema，必须是 `type: 'object'` 的对象格式。

这些字段属于 `DrawingData` 顶层契约，不放入 `metadata`。`metadata` 继续作为画板内部扩展信息使用。

## Requirements

- 在 `src/components/BDrawing/types.ts` 中为 `DrawingData` 增加 `name`、`description`、`inputSchema`、`outputSchema`。
- `name` 是稳定标识符，不承担中文展示名职责。
- `description` 是给人和 LLM 读取的能力说明。
- `inputSchema` 和 `outputSchema` 都必须是对象 schema，不支持顶层非对象入参或出参。
- 新建画板必须带默认空契约。
- 旧画板数据必须能归一化为新结构。
- `PageSetter` 作为首个编辑入口，允许编辑 `name`、`description`、`inputSchema`、`outputSchema`。
- `DrawingData` 对外快照必须始终包含这四个契约字段。
- 不提交本设计文档或后续实现变更，由用户自行提交。

## Data Model

在 `src/components/BDrawing/types.ts` 中新增 schema 类型。首版只建 JSON Schema object 子集，避免把通用 JSON Schema 全量复杂度引入画板模型。

```ts
/**
 * DrawingData 支持的 schema 字段类型。
 */
export type DrawingSchemaPropertyType = 'string' | 'number' | 'boolean' | 'object' | 'array';

/**
 * DrawingData 入参与出参 schema 属性。
 */
export interface DrawingSchemaProperty {
  /** 字段类型 */
  type: DrawingSchemaPropertyType;
  /** 字段说明 */
  description?: string;
  /** 对象或数组项结构，首版仅作为透传信息保存 */
  properties?: Record<string, DrawingSchemaProperty>;
  /** 数组元素结构 */
  items?: DrawingSchemaProperty;
}

/**
 * DrawingData 入参与出参对象 schema。
 */
export interface DrawingSchemaObject {
  /** 顶层 schema 固定为对象 */
  type: 'object';
  /** schema 说明 */
  description?: string;
  /** 对象字段定义 */
  properties: Record<string, DrawingSchemaProperty>;
  /** 必填字段 */
  required?: string[];
  /** 是否允许未声明字段 */
}

/**
 * 画板外部双向绑定数据。
 */
export interface DrawingData {
  /** 画板能力标识符 */
  name: string;
  /** 画板能力描述 */
  description: string;
  /** 画板能力入参 schema */
  inputSchema: DrawingSchemaObject;
  /** 画板能力出参 schema */
  outputSchema: DrawingSchemaObject;
  /** 画板元信息 */
  metadata: DrawingMetadata;
  /** 元素数据 */
  elements: DrawingElement[];
  /** 视口数据 */
  viewport: DrawingViewport;
}
```

默认空 schema：

```ts
{
  type: 'object',
  properties: {},
  required: [],
}
```

## Field Semantics

### name

`name` 是机器可读标识符，用于后续 chat/LLM 能力选择、模板引用或工具注册。

建议校验规则：

- 允许空字符串，表示当前画板尚未配置为可调用能力。
- 非空时必须匹配 `^[a-z][a-z0-9_]*$`。
- 不自动从文件标题或中文名称生成，避免误生成不稳定 API 名。

### description

`description` 描述这个画板能力的用途、适用场景和边界。

示例：

```text
根据用户姓名、职位和简介生成一张个人资料卡片。
```

### inputSchema

`inputSchema` 描述调用这个画板能力时需要提供的参数。顶层必须是对象。

示例：

```json
{
  "type": "object",
  "properties": {
    "userName": {
      "type": "string",
      "description": "用户姓名"
    },
    "bio": {
      "type": "string",
      "description": "用户简介"
    }
  },
  "required": ["userName"],
}
```

### outputSchema

`outputSchema` 描述这个画板能力执行后的返回结构。首版仅保存 schema，不实现运行时执行器。

示例：

```json
{
  "type": "object",
  "properties": {
    "drawingId": {
      "type": "string",
      "description": "生成后的画板文件 ID"
    }
  },
  "required": ["drawingId"],
}
```

## Normalization And Defaults

`boardTransforms.ts` 目前通过 `createDrawingDataSnapshot()` 输出轻量 `DrawingData`。该路径应成为补齐默认契约字段的统一出口。

新增或调整默认创建函数：

- `createDefaultDrawingSchemaObject()` 返回空对象 schema。
- `createDefaultDrawingData()` 返回包含完整契约字段、`metadata`、`elements`、`viewport` 的新画板数据。
- 旧数据缺少 `name` 时补 `''`。
- 旧数据缺少 `description` 时补 `''`。
- 旧数据缺少 `inputSchema` 或其顶层不是对象 schema 时补默认空对象 schema。
- 旧数据缺少 `outputSchema` 或其顶层不是对象 schema 时补默认空对象 schema。
- 旧数据缺少 `metadata` 时继续补 `{}`。

归一化只保证结构可用，不尝试从元素内容推断 `inputSchema` 或 `outputSchema`。

## Model Sync

当前 `useModelSync.ts` 的内容比较只覆盖 `elements` 和 `viewport`。实现该设计时继续沿用这个边界：契约字段属于外部 `DrawingData` 模型，不进入内部 `DrawingBoardState` 的内容比较和重置判断。

采用以下策略：

- `name`、`description`、`inputSchema`、`outputSchema` 作为 `DrawingData` 外部模型字段，由 `PanelSettings` 和 `PageSetter` 通过 `v-model:value` 双向绑定完整 `DrawingData`。
- `useModelSync` 在创建对外快照时保留现有契约字段，类似当前保留 `metadata`。
- 如果外部模型替换了契约字段，但元素和视口未变，也不重置 board 内部状态。
- 对外快照必须包含契约字段，避免保存后丢失。

这样契约字段不会污染 `DrawingBoardState` 的历史栈，也不会让编辑表单触发画布重置。

## PageSetter UX

`src/views/drawing/components/PageSetter.vue` 是首个配置入口。

首版分区：

- 基础信息：`name`、`description`。
- 入参：`inputSchema` 预览区、extra 区域 mini 编辑按钮，以及 BSectionBlock 标题旁 help 插槽中的填写说明图标。
- 出参：`outputSchema` 预览区、extra 区域 mini 编辑按钮，以及 BSectionBlock 标题旁 help 插槽中的填写说明图标。

交互要求：

- `name` 在页面上显示为“名称”，使用普通输入框编辑；作为后续工具注册标识时再做格式校验。
- `description` 使用多行输入。
- `inputSchema` 和 `outputSchema` 通过弹窗编辑 JSON，面板下方只做只读预览，不引入复杂 schema builder。
- 填写说明入口通过 `BSectionBlock` 的 help 插槽放在“入参 / 出参”标题旁，以图标打开抽屉；抽屉使用参数表格说明字段、类型、必填和业务说明，并以“查天气”作为入参 / 出参示例。
- JSON 输入解析失败时保留文本并显示错误，不写回 `DrawingData`。
- JSON 解析成功但顶层不是 `{ "type": "object" }` 时显示错误，不写回 `DrawingData`。
- 弹窗内容留空时可以恢复默认空对象 schema。

后续可演进为结构化字段编辑器，但首版不做。

## Chat And LLM Boundary

本设计只让画板数据具备可被 LLM 理解的能力描述，不实现实际调用执行器。

后续 chat 能力可以读取当前或指定 `DrawingData` 的：

- `name`
- `description`
- `inputSchema`
- `outputSchema`

并把它注册为可选能力。执行时再通过单独的 drawing runtime 将入参绑定到画板元素。元素绑定规则不在本设计范围内。

## Error Handling

- 旧数据归一化永不抛错，无法识别的 schema 回退为空对象 schema。
- `PageSetter` 的 schema JSON 解析错误只影响当前输入框，不破坏已保存的 `DrawingData`。
- `name` 非空但不符合标识符规则时不阻止页面使用，但应阻止把该画板注册为可调用能力。
- 保存文件时仍保存当前有效的 `DrawingData`，不保存弹窗中尚未解析成功的临时 JSON 文本。

## Testing

新增或更新测试：

- `createDrawingDataSnapshot()` 对旧数据补齐 `name`、`description`、`inputSchema`、`outputSchema`。
- 新建 drawing 页面默认数据包含完整契约字段。
- `useModelSync` 在元素或视口变化后保留契约字段。
- `useModelSync` 不把 `selection`、`draft`、`history` 写入外部模型。
- `PageSetter` 能编辑 `name` 和 `description`。
- `PageSetter` 能写回合法 `inputSchema` 和 `outputSchema`。
- `PageSetter` 对非法 JSON 或非对象 schema 显示错误且不写回。
- `PanelSettings` 与 `PageSetter` 通过 `v-model:value` 回写完整 `DrawingData`。
- 旧 `.tibis` drawing 数据仍可加载并归一化。

## Non-Goals

- 不实现 LLM 对 DrawingData 的实际调用运行时。
- 不设计元素字段与 `inputSchema` 的绑定协议。
- 不实现结构化 JSON Schema 可视化编辑器。
- 不支持顶层非对象入参或出参。
- 不把契约字段纳入画布撤销/重做历史。
- 不迁移 Electron 侧 drawing runtime 的独立模型。
