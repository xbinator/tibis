# Widget Schema Editor Design

## Goal

把画图页面 PageSetter 中入参与出参的 JSON `<pre>` 预览重构为可直接编辑的树形 Schema 编辑器，支持字段名、字段类型、必填、对象展开收起、添加子字段和删除字段。

## Scope

- 主面板直接编辑 `WidgetSchemaObject`。
- 保留 JSON Monaco 弹窗作为高级编辑入口。
- 新的主面板组件命名为 `src/views/widget/components/PageSetter/SchemaTreeEditor.vue`。
- 原 JSON 弹窗组件改名为 `src/views/widget/components/PageSetter/SchemaInputEditor.vue`。
- 不改变 `WidgetSchemaObject` 与 `WidgetSchemaProperty` 的持久化契约。

## Component Design

`PageSetter.vue` 继续负责区块布局、说明抽屉、JSON 高级编辑弹窗开关和 schema 回写。入参和出参区块内用 `SchemaTreeEditor` 替换原 `<pre class="schema-preview">`。

`SchemaTreeEditor.vue` 负责树形 schema 编辑。它通过 `v-model:schema` 接收并输出完整 `WidgetSchemaObject`，内部把根 schema 当成不可见 object 容器，只渲染 `properties` 的字段行。每行包含字段名输入、类型选择、必填复选、展开按钮、添加子字段按钮和删除按钮。

`SchemaInputEditor.vue` 保留原 Monaco JSON 编辑、校验和保存逻辑，避免高级批量编辑能力回退。

## Data Rules

- 字段类型沿用现有类型：`string`、`number`、`boolean`、`object`、`array`。
- 添加字段默认生成唯一字段名 `field`、`field1`、`field2`。
- 修改字段名时同步迁移属性值，并同步父级 `required`。
- 如果字段名为空或与同级字段重复，不覆盖已有字段，显示该行错误状态。
- 删除字段时同步从父级 `required` 中移除。
- object 字段拥有自己的 `properties` 和 `required`。
- array 字段自动补齐 `items`，默认 `items.type` 为 `string`。

## Interaction

- 空 schema 显示空态和添加字段按钮。
- object 字段可以展开或收起，展开后显示子字段。
- object 字段展示添加子字段按钮；非 object 字段不展示。
- 必填复选框操作当前字段所属父级 schema 的 `required`。
- 顶部区块的“编辑”按钮继续打开 JSON 高级编辑弹窗。

## Testing

- 更新 PageSetter 测试，验证 schema 主面板不再渲染 `.schema-preview`。
- 覆盖字段名修改、必填切换、object 子字段添加和删除。
- 保留 JSON 弹窗的输入、输出、空内容恢复默认 schema、非法 JSON 不覆盖旧 schema 等测试。
