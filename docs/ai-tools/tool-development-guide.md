# AI 工具开发指南

日期：2026-06-19

本文档说明如何在当前工具架构下新增或修改 AI 工具。现在工具定义和执行已经拆成两层：

- `shared/ai/tools/toolRegistry.ts` 是已迁移 ChatRuntime 工具的单一元数据源，包含工具名、schema、风险等级、运行时归属、分组和暴露策略。
- `electron/main/modules/chat/runtime/tools/**/index.mts` 是已迁移工具的主进程执行入口。
- `src/ai/tools/catalog/runtimeTools.ts` 只为 renderer 暴露 schema-only 工具，执行时会提示该工具已迁移到主进程。
- `src/ai/tools/builtin/**/index.ts` 只保留仍需 renderer 本地状态或本地交互的工具。

新增工具前，先判断工具属于哪一类，再决定写在哪里。

## 工具类型

### 主进程工具

优先选择这一类。适合：

- 文件、目录、日志、设置、MCP、资源打开等系统或应用级能力。
- 需要统一确认、路径校验、工作区边界、主进程文件系统访问的能力。
- 不应该依赖 Vue store、DOM、当前组件实例的能力。

代码落点：

- 元数据：`shared/ai/tools/toolRegistry.ts`
- 执行逻辑：`electron/main/modules/chat/runtime/tools/<GroupTool>/index.mts`
- 分发入口：`electron/main/modules/chat/runtime/tools/index.mts`
- 共享工具 helper：`electron/main/modules/chat/runtime/tools/*.mts`
- renderer schema-only wrapper：通常由 `src/ai/tools/catalog/runtimeTools.ts` 从 registry 自动派生，不要重复写 schema 字面量。

### Renderer-local 工具

仅当工具必须依赖 renderer 本地状态时使用。当前包括：

- `QuestionTool`
- `TodoWriteTool`
- `MemoryTool`
- `ShellTool`
- `SkillTool`

代码落点：

- `src/ai/tools/builtin/<ToolName>/index.ts`
- `src/ai/tools/builtin/index.ts`

不要把已经能在主进程完成的工具继续放进 renderer-local 目录。

### SDK-managed 工具

由 AI SDK 或 provider 集成处理，例如 Tavily 和 MCP provider 工具。通常不需要放入本地 builtin 执行器。

## 主进程工具新增步骤

### 1. 选定工具分组

主进程工具按目录分组：

- `ReadTool`：只读环境、当前文档、当前网页、日志、MCP 设置等。
- `FileTool`：文件和目录读取、创建、写入、编辑。
- `SettingsTool`：应用设置和 MCP server 配置写入。
- `DrawingTool`：画板读取、创建和操作。
- `ResourceTool`：打开文件、网页或其他资源。

如果新工具不属于这些分组，先判断是否真的需要新分组。新分组需要同步：

- `shared/ai/tools/toolRegistry.ts` 的 `ToolRuntimeGroup`
- `electron/main/modules/chat/runtime/tools/constants.mts`
- `electron/main/modules/chat/runtime/tools/index.mts`
- 对应测试

### 2. 在 registry 增加工具定义

在 `shared/ai/tools/toolRegistry.ts` 中新增：

- 工具名常量
- schema 常量或内联 schema
- `TOOL_REGISTRY` 条目

条目需要包含：

- `runtime`
- `group`
- `exposure`
- `definition`

示例：

```ts
/** 示例工具名称。 */
export const EXAMPLE_TOOL_NAME = 'example_tool';

/** 已迁移到主进程的工具 registry。 */
export const TOOL_REGISTRY = [
  // ...existing tools
  {
    runtime: 'main',
    group: 'read',
    exposure: 'default-readonly',
    definition: {
      name: EXAMPLE_TOOL_NAME,
      description: '读取示例信息并返回结构化结果。',
      source: 'builtin',
      riskLevel: 'read',
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '查询关键字。' }
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  }
] as const satisfies ToolRegistryEntry[];
```

不要在 renderer 和 main 各写一份 schema。registry 是唯一来源。

### 3. 实现主进程执行逻辑

在对应 `tools/<GroupTool>/index.mts` 中实现：

- `is<Group>Tool(toolName: string): boolean`
- 输入归一化函数
- 具体执行函数
- 分组入口 `execute<Group>Tool`

结果统一使用：

- `createMainToolSuccessResult`
- `createMainToolFailureResult`
- `createMainToolCancelledResult`
- `createBridgeFailureResult`

这些 helper 在 `electron/main/modules/chat/runtime/tools/results.mts`。

### 4. 处理确认和 bridge

主进程工具依赖来自 `MainToolsDependencies`：

- `requestConfirmation`
- `requestBridge`
- `now`

需要用户确认时，通过 `requestConfirmation`。用户拒绝时返回 cancelled，不要伪装成普通 failure。

主进程无法直接读取 renderer 状态时，通过 `requestBridge`，例如：

- 当前编辑器内容
- 未保存草稿内容
- 当前画板数据
- 当前 WebView 页面快照
- 让 renderer 打开资源或创建草稿

bridge 不是第二套工具运行时，只是主进程向 renderer 请求 UI 状态或 UI 动作的受控 RPC。

### 5. 更新分发入口

如果使用已有分组，通常只需要在该分组的 `is<Group>Tool` 和 `execute<Group>Tool` 中接入。

如果新增分组，需要更新：

- `electron/main/modules/chat/runtime/tools/index.mts`
- `electron/main/modules/chat/runtime/tools/constants.mts`
- `shared/ai/tools/toolRegistry.ts`

### 6. 补测试

主进程工具测试通常放在：

- `test/electron/main/modules/chat/runtime/main-tools.test.ts`
- 或新增更聚焦的工具测试文件

至少覆盖：

- 成功路径
- 输入非法
- 用户取消确认
- bridge 失败
- 工作区路径边界
- 结果结构是否可序列化

如果修改 registry，还要覆盖：

- `test/ai/tools/builtin-index.test.ts`
- `test/electron/main/modules/chat/runtime/main-tools.test.ts`
- registry / constants 对齐相关测试

## Renderer-local 工具新增步骤

只有工具必须依赖 renderer 本地执行时才走这条路径。

### 1. 创建工具目录

使用目录结构：

```text
src/ai/tools/builtin/<ToolName>/index.ts
```

每个工具文件需要：

- 文件头说明
- 明确输入/输出类型
- JSDoc 注释
- 禁止 `any`
- 统一结果工厂

### 2. 在 builtin index 注册

更新：

- `src/ai/tools/builtin/index.ts`

renderer-local 工具不要写入 `shared/ai/tools/toolRegistry.ts`，除非它未来要迁移到主进程。

### 3. 测试

测试放在：

- `test/ai/tools/*`

覆盖成功、失败、上下文缺失和权限分支。

## 风险等级和暴露策略

### riskLevel

- `read`：读取信息，不修改状态。
- `write`：修改文件、设置、画板或应用状态。
- `dangerous`：可能大范围覆盖、删除、逃逸工作区或造成高误伤风险。

只读不等于永远不确认。读取工作区外绝对路径、敏感设置或本地资源时，仍应走确认。

### exposure

registry 的 `exposure` 决定聊天侧默认是否暴露：

- `default-readonly`：默认只读工具。
- `default-writable`：默认写工具。
- `conditional-readonly`：条件启用的只读工具。
- `conditional-writable`：条件启用的写工具。
- `compat-hidden`：兼容保留，不默认暴露。

不要在其他地方再维护重复默认清单。

## 参数和结果约束

### schema 和输入类型一致

`definition.parameters` 必须和输入归一化逻辑一致。类型必填的字段，要放进 `required`。

### 结果必须可结构化克隆和 JSON 序列化

不要返回：

- 函数
- `Map`
- `Set`
- `Date` 实例
- DOM 对象
- class 实例
- `AbortSignal`
- Vue Proxy

返回普通对象、数组、字符串、数字、布尔值和 `null`。

### 描述写给模型看

`definition.description` 是模型选择工具的依据。要说明：

- 工具做什么
- 什么时候用
- 需要什么输入
- 返回什么信息
- 不适合什么场景

## 主进程工具模板

```ts
/**
 * @file index.mts
 * @description ChatRuntime 主进程示例工具。
 */
import type { AIToolExecutionResult } from 'types/ai';
import type { ChatRuntimeMainToolExecutionInput } from '../../types.mjs';
import type { MainToolsDependencies } from '../types.mjs';
import { EXAMPLE_TOOL_NAME } from '../constants.mjs';
import { createMainToolFailureResult, createMainToolSuccessResult } from '../results.mjs';

/**
 * 判断是否为示例工具。
 * @param toolName - 工具名称
 * @returns 是否为示例工具
 */
export function isExampleTool(toolName: string): boolean {
  return toolName === EXAMPLE_TOOL_NAME;
}

/**
 * 执行示例工具。
 * @param input - 工具执行输入
 * @param deps - 主进程工具依赖
 * @returns 工具执行结果
 */
export async function executeExampleTool(input: ChatRuntimeMainToolExecutionInput, deps: MainToolsDependencies): Promise<AIToolExecutionResult> {
  void deps;
  if (typeof input.input !== 'object' || input.input === null) {
    return createMainToolFailureResult(input.toolName, 'INVALID_INPUT', '工具输入必须是对象');
  }

  return createMainToolSuccessResult(EXAMPLE_TOOL_NAME, { ok: true });
}
```

## 开发检查清单

- 工具是否真的需要 renderer-local？能主进程化就主进程化。
- 工具名是否只在 `shared/ai/tools/toolRegistry.ts` 定义一次？
- registry 的 `runtime`、`group`、`exposure`、`riskLevel` 是否正确？
- schema 是否和输入归一化一致？
- 主进程执行结果是否使用 `tools/results.mts` helper？
- 写操作、工作区外路径、危险读取是否有确认？
- bridge 失败是否返回稳定错误，而不是抛出到 runtime 外层？
- 结果是否可结构化克隆？
- 是否补测试？
- 是否更新 `docs/development/chat-runtime-architecture-map.md` 或相关 README？
- 是否记录到当天 changelog？

## 推荐阅读顺序

第一次接触这块代码，建议按顺序读：

1. `shared/ai/tools/toolRegistry.ts`
2. `src/ai/tools/catalog/runtimeTools.ts`
3. `src/ai/tools/builtin/index.ts`
4. `electron/main/modules/chat/runtime/README.md`
5. `electron/main/modules/chat/runtime/tools/index.mts`
6. `electron/main/modules/chat/runtime/tools/types.mts`
7. 目标工具分组的 `electron/main/modules/chat/runtime/tools/**/index.mts`
8. `src/components/BChat/utils/runtimeBridge.ts`

这样能先建立“registry 定义 -> renderer schema-only 暴露 -> 主进程执行 -> 必要时 bridge 到 renderer”的完整链路。
