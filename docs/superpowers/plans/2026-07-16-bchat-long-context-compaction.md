# BChat 长会话上下文压缩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 BChat 增加跨 Provider 的滚动上下文压缩，在可用输入预算达到约 80% 时同步生成结构化 checkpoint，把后续模型投影压回约 55%，并在对话流中只展示压缩状态。

**Architecture:** 主进程 ChatRuntime 持有原始消息、会话写锁和 compaction 执行器；纯策略模块负责预算、boundary、拓扑、fingerprint、artifact identity 和投影。checkpoint 作为 `assistant` 消息中的 `compaction` part 写入现有 `parts_json`，不新增表。Renderer 只提供 `/compact` 命令、Actor 生命周期接入和状态渲染。

**Tech Stack:** Vue 3、TypeScript strict、Electron、XState、Vercel AI SDK 6、Vitest、Zod、lodash-es、Node `crypto`。

## Global Constraints

- 实现必须遵循 `docs/superpowers/specs/2026-07-16-bchat-long-context-compaction-design.md`，设计与计划冲突时先停下更新设计，不能在代码中静默改变语义。
- 不新增数据库表或列；原始消息和所有 checkpoint 都保存在既有 `chat_messages.parts_json`。
- 不允许 `any`；所有新增函数、接口、类型和复杂逻辑都添加准确注释，函数名不超过 4 个单词。
- 新增异步流程使用 `src/utils/asyncTo.ts` 归一化异常；同步解析和类型守卫允许 `try/catch`。
- 数据库中的原始 tool result 永不因压缩或预算裁剪被覆盖；旧工具结果裁剪只发生在模型请求投影中。
- `ChatMessageCompactionPart.status === 'success'` 后不可修改；自动和手动压缩都持有同一把 session 写锁。
- `modelSnapshot` 只保存脱敏字段，禁止把 `apiKey`、`baseUrl` 或完整 provider 配置写入消息或日志。
- 每个任务严格执行 Red → Green → Refactor；先看到目标测试因缺少行为失败，再写最小实现。
- 每个任务完成后运行该任务列出的测试并单独提交；提交前只 stage 当前任务文件，避免混入工作区既有改动。

---

## Task 1: 定义 checkpoint、摘要和 Runtime 共享契约

**Files:**

- Modify: `types/chat.d.ts`
- Modify: `types/chat-runtime.d.ts`
- Modify: `electron/main/modules/chat/runtime/types.mts`
- Create: `electron/main/modules/chat/runtime/compaction/types.mts`
- Create: `electron/main/modules/chat/runtime/compaction/checkpoint.mts`
- Create: `test/electron/main/modules/chat/runtime/compaction/checkpoint.test.ts`

- [x] **Step 1: 先写 checkpoint 状态约束测试**

测试至少覆盖：`success` 必须包含 boundary、fingerprint、model/budget snapshot 和 summary；非 `success` 不得携带 summary；`pending` 可以缺少 boundary；脱敏模型快照不接受额外 secret 字段。

```ts
it('只接受完整且脱敏的 success checkpoint', () => {
  const result = validateCheckpoint({
    id: 'checkpoint-1',
    type: 'compaction',
    status: 'success',
    trigger: 'automatic',
    boundaryPartId: 'part-9',
    sourceFingerprint: 'sha256:abc',
    modelSnapshot: {
      providerType: 'openai',
      providerId: 'provider-1',
      modelId: 'gpt-test',
      contextWindow: 128_000
    },
    budgetSnapshot: createBudgetFixture(),
    summary: createSummaryFixture(),
    createdAt: 1,
    completedAt: 2
  });

  expect(result.ok).toBe(true);
});
```

- [x] **Step 2: 运行测试并确认红测**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction/checkpoint.test.ts`

Expected: FAIL，提示 `checkpoint.mjs` 或 `validateCheckpoint` 不存在。

- [x] **Step 3: 在共享类型中加入完整数据契约**

在 `types/chat.d.ts` 定义并逐字段注释以下类型，再把 compaction 加入 `ChatMessagePart` 联合：

```ts
export interface CompactionModelSnapshot {
  providerType: AIProviderType;
  providerId: string;
  modelId: string;
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface CompactionBudgetSnapshot {
  outputReserve: number;
  safetyReserve: number;
  usableInputTokens: number;
  triggerTokens: number;
  targetTokens: number;
  summaryMaxTokens: number;
  rawTailMaxTokens: number;
}

export interface ChatMessageCompactionPart extends ChatMessagePartBase {
  type: 'compaction';
  status: 'pending' | 'success' | 'failed' | 'cancelled' | 'skipped';
  trigger: 'automatic' | 'manual';
  boundaryPartId?: string;
  parentCheckpointId?: string;
  sourceFingerprint?: string;
  modelSnapshot?: CompactionModelSnapshot;
  budgetSnapshot?: CompactionBudgetSnapshot;
  summary?: StructuredContextSummary;
  errorCode?: string;
  validationErrorCode?: 'INVALID_SHAPE' | 'INVALID_REFERENCE' | 'INVALID_OBJECTIVE_RELATION';
  createdAt: number;
  completedAt?: number;
}
```

同文件加入设计文档中的 `StructuredContextSummary`、`ObjectiveState`、`ContextOwner`、`ContextAction`、`OpenQuestion`、`ContextFact`、`ContextFailure`、`ArtifactState`。必须保留已经确认的字段名：`type`、结构化 objective、带 owner 的 action/question、带稳定 `id` 的 artifact。

- [x] **Step 4: 增加手动压缩与恢复阶段类型**

在 `types/chat-runtime.d.ts` 新增：

```ts
export interface ChatRuntimeCompactInput {
  runtimeId: string;
  sessionId: string;
  clientId: string;
  agentId: string;
  contextWindow?: number;
  system?: string;
  workspaceRoot?: string;
  tools?: AITransportTool[];
  skillContentHashes?: Record<string, string>;
  capabilities?: ChatRuntimeCapabilityDescriptor;
}
```

在主进程 `ChatRuntimePhase` 中加入 `'compacting'`，并同步所有 recovery snapshot 对 phase 的联合类型。不要恢复已移除的 compression role、独立压缩 record 或 context-usage event。

- [x] **Step 5: 实现运行时类型守卫和终态校验**

`compaction/types.mts` 只承载内部类型与版本常量：

```ts
export const SUMMARY_SCHEMA_VERSION = 1;
export const FINGERPRINT_VERSION = 1;
export const PROJECTOR_VERSION = 2;
export const COMPACTION_POLICY_VERSION = 3;

export interface CompactionSourceSnapshot {
  parentCheckpoint?: StructuredContextSummary;
  sourceParts: ImmutableChatPart[];
  boundaryPartId: string;
  sourceFingerprint: string;
}
```

`checkpoint.mts` 提供 `isCompactionPart`、`isSuccessCheckpoint`、`validateCheckpoint`。校验失败返回带稳定 error code 的判别联合，不直接修改输入对象。

- [x] **Step 6: 运行测试和类型检查**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction/checkpoint.test.ts test/electron/main/modules/chat/runtime/shared-types.test.ts`

Expected: PASS。

Run: `pnpm exec tsc --noEmit`

Expected: PASS。

- [x] **Step 7: 提交契约**

```bash
git add types/chat.d.ts types/chat-runtime.d.ts electron/main/modules/chat/runtime/types.mts electron/main/modules/chat/runtime/compaction/types.mts electron/main/modules/chat/runtime/compaction/checkpoint.mts test/electron/main/modules/chat/runtime/compaction/checkpoint.test.ts
git commit -m "feat(chat): 定义上下文压缩检查点契约"
```

## Task 2: 实现 Token 估算和预算规划

**Files:**

- Create: `electron/main/modules/chat/runtime/compaction/token-estimator.mts`
- Create: `electron/main/modules/chat/runtime/compaction/budget.mts`
- Create: `test/electron/main/modules/chat/runtime/compaction/token-estimator.test.ts`
- Create: `test/electron/main/modules/chat/runtime/compaction/budget.test.ts`

- [x] **Step 1: 写 Token 估算红测**

覆盖 ASCII、CJK、JSON tool schema、system、用户/assistant model message 和空输入。估算必须确定性、单调且至少返回 1，不能依赖 Provider tokenizer。

```ts
it('内容增加时估算 token 单调增加', () => {
  expect(estimateTextTokens('hello world')).toBeGreaterThan(estimateTextTokens('hello'));
  expect(estimateRequestTokens({ system: '规则', tools: [], messages: [] })).toBeGreaterThan(0);
});
```

- [x] **Step 2: 写预算公式红测**

```ts
it('按 80% 触发并以 55% 为目标', () => {
  const budget = createCompactionBudget({ contextWindow: 128_000, noncompressibleTokens: 20_000 });

  expect(budget.outputReserve).toBe(8_192);
  expect(budget.safetyReserve).toBe(6_400);
  expect(budget.usableInputTokens).toBe(113_408);
  expect(budget.triggerTokens).toBe(Math.floor(113_408 * 0.8));
  expect(budget.targetTokens).toBe(Math.floor(113_408 * 0.55));
  expect(budget.summaryMaxTokens).toBe(16_384);
});
```

继续覆盖：输出预留 clamp 到 `[1024, floor(W × .25)]`、安全预留至少 1024、`Q < 1024`、`F >= C`、摘要请求自身超过 `W - S` 和硬限制 `H = U`。

- [x] **Step 3: 运行红测**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction/token-estimator.test.ts test/electron/main/modules/chat/runtime/compaction/budget.test.ts`

Expected: FAIL，目标模块尚不存在。

- [x] **Step 4: 实现保守估算器**

从已移除实现中只复用确定性字符权重思路，不恢复旧 compression record。建议先实现：ASCII `0.3`、CJK `0.6`、其他字符 `0.5`，再对 JSON 包装、消息 role、tool schema 和 system 增加固定开销。

公开 API 保持小而纯：

```ts
export function estimateTextTokens(text: string): number;
export function estimatePartTokens(part: ChatMessagePart): number;
export function estimateRequestTokens(input: TokenRequestInput): number;
```

- [x] **Step 5: 实现预算判定**

`budget.mts` 输出 snapshot 和判定结果，不读取全局状态：

```ts
export interface CompactionBudgetInput {
  contextWindow: number;
  maxOutputTokens?: number;
  noncompressibleTokens: number;
}

export function createCompactionBudget(input: CompactionBudgetInput): CompactionBudgetSnapshot;
export function shouldAutoCompact(estimatedTokens: number, budget: CompactionBudgetSnapshot): boolean;
export function exceedsHardLimit(estimatedTokens: number, budget: CompactionBudgetSnapshot): boolean;
```

使用设计文档的 `W/R/O/S/U/T/C/F/A/Q/L` 公式，不引入隐藏阈值。

- [x] **Step 6: 运行测试**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction/token-estimator.test.ts test/electron/main/modules/chat/runtime/compaction/budget.test.ts`

Expected: PASS。

- [x] **Step 7: 提交预算模块**

```bash
git add electron/main/modules/chat/runtime/compaction/token-estimator.mts electron/main/modules/chat/runtime/compaction/budget.mts test/electron/main/modules/chat/runtime/compaction/token-estimator.test.ts test/electron/main/modules/chat/runtime/compaction/budget.test.ts
git commit -m "feat(chat): 添加上下文压缩预算计算"
```

## Task 3: 实现 immutable boundary 与 Part 拓扑校验

**Files:**

- Create: `electron/main/modules/chat/runtime/compaction/topology.mts`
- Create: `electron/main/modules/chat/runtime/compaction/boundary.mts`
- Create: `test/electron/main/modules/chat/runtime/compaction/topology.test.ts`
- Create: `test/electron/main/modules/chat/runtime/compaction/boundary.test.ts`

- [x] **Step 1: 写 boundary 红测**

覆盖以下规则：boundary 在触发用户消息之前；拒绝 streaming text、`tool.status === 'inputting' | 'executing'`、pending confirmation、awaiting user choice；完整 `done` tool result 可作为边界；当前 assistant 消息只能选择已经终态的尾部 part。

```ts
it('不会越过当前触发用户消息', () => {
  const boundary = findSafeBoundary(messages, { currentUserMessageId: 'user-current' });
  expect(boundary?.partId).toBe('previous-immutable-part');
});
```

- [x] **Step 2: 写依赖闭包红测**

覆盖 `boundaryPartId`、`parentCheckpointId`、所有 summary `sourcePartIds`、tool call/result、confirmation 和 user choice。缺 parent 时必须移除该 checkpoint 及其所有后代，而不是保留断链摘要。

- [x] **Step 3: 运行红测**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction/boundary.test.ts test/electron/main/modules/chat/runtime/compaction/topology.test.ts`

Expected: FAIL。

- [x] **Step 4: 实现扁平 Part 索引和 immutable 判定**

```ts
export interface IndexedChatPart {
  messageId: string;
  messageIndex: number;
  partIndex: number;
  part: ChatMessagePart;
}

export function indexMessageParts(messages: readonly ChatMessageRecord[]): IndexedChatPart[];
export function isImmutablePart(part: ChatMessagePart, message: ChatMessageRecord): boolean;
export function findSafeBoundary(messages: readonly ChatMessageRecord[], input: BoundaryInput): BoundaryResult | null;
```

不要通过文本长度切 Part；同一 tool/交互语义单元必须整体保留。

- [x] **Step 5: 实现拓扑 validator 与清理函数**

```ts
export interface TopologyResult {
  validCheckpointIds: Set<string>;
  invalidCheckpointIds: Set<string>;
  errors: TopologyError[];
}

export function validatePartTopology(messages: readonly ChatMessageRecord[]): TopologyResult;
export function removeInvalidCheckpoints(messages: readonly ChatMessageRecord[]): ChatMessageRecord[];
```

清理函数返回 clone，只删除无效 compaction part；不能修改原 messages。`success` checkpoint 的 boundary 必须在它之前并指向 immutable part。

- [x] **Step 6: 运行测试**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction/boundary.test.ts test/electron/main/modules/chat/runtime/compaction/topology.test.ts`

Expected: PASS。

- [x] **Step 7: 提交 boundary/topology**

```bash
git add electron/main/modules/chat/runtime/compaction/topology.mts electron/main/modules/chat/runtime/compaction/boundary.mts test/electron/main/modules/chat/runtime/compaction/topology.test.ts test/electron/main/modules/chat/runtime/compaction/boundary.test.ts
git commit -m "feat(chat): 校验上下文压缩边界拓扑"
```

## Task 4: 实现版本化 source fingerprint

**Files:**

- Create: `electron/main/modules/chat/runtime/compaction/fingerprint.mts`
- Create: `test/electron/main/modules/chat/runtime/compaction/fingerprint.test.ts`

- [x] **Step 1: 写 fingerprint 红测**

固定输入多次计算结果相同；source 内容、part/message ID、boundary、parent、schema/projector/policy 版本、model、`contextWindow`、`maxOutputTokens` 或任一 budget 字段变化时结果必须不同。

```ts
it.each([
  ['model', (value) => ({ ...value, modelSnapshot: { ...value.modelSnapshot, modelId: 'other' } })],
  ['budget', (value) => ({ ...value, budgetSnapshot: { ...value.budgetSnapshot, targetTokens: 42 } })],
  ['source', (value) => ({ ...value, sources: [{ ...value.sources[0], contentHash: 'changed' }] })]
])('%s 变化会改变 fingerprint', (_label, mutate) => {
  expect(buildSourceFingerprint(mutate(fixture))).not.toBe(buildSourceFingerprint(fixture));
});
```

- [x] **Step 2: 运行红测**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction/fingerprint.test.ts`

Expected: FAIL。

- [x] **Step 3: 实现 stable stringify + SHA-256**

使用 Node `createHash('sha256')`，对象键递归排序，数组保持拓扑顺序。不要使用不稳定的原生对象插入顺序作为协议。

```ts
export function buildSourceFingerprint(input: CompactionFingerprintInput): string {
  return `sha256:${createHash('sha256').update(stableStringify(input)).digest('hex')}`;
}
```

`createFingerprintInput` 必须从实际源 Part 重新计算 `contentHash`，不能接受调用方复制旧 fingerprint。

- [x] **Step 4: 运行测试并提交**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction/fingerprint.test.ts`

Expected: PASS。

```bash
git add electron/main/modules/chat/runtime/compaction/fingerprint.mts test/electron/main/modules/chat/runtime/compaction/fingerprint.test.ts
git commit -m "feat(chat): 生成上下文压缩源指纹"
```

## Task 5: 为文件工具建立稳定 artifact identity

**Files:**

- Modify: `src/components/BChat/utils/runtimeBridge.ts`
- Modify: `electron/main/modules/chat/runtime/tools/types.mts`
- Modify: `electron/main/modules/chat/runtime/tools/guards.mts`
- Modify: `electron/main/modules/chat/runtime/tools/FileTool/index.mts`
- Modify: `electron/main/modules/chat/runtime/tools/index.mts`
- Create: `electron/main/modules/chat/runtime/compaction/artifact-registry.mts`
- Modify: `test/components/BChat/runtime-bridge.test.ts`
- Modify: `test/electron/main/modules/chat/runtime/main-tools.test.ts`
- Create: `test/electron/main/modules/chat/runtime/compaction/artifact-registry.test.ts`

- [x] **Step 1: 写 artifact registry 红测**

覆盖：同一路径连续 read/write/edit 复用 ID；bridge 返回现有文档 ID 时以该 ID 为准；重命名证据使新旧路径指向同一 ID；删除后同路径新建分配新 ID；从最新 checkpoint 和后续 tool result 重建映射；不能凭文件名猜测外部移动。

```ts
it('路径变化后保留 artifact 身份', () => {
  const registry = createArtifactRegistry({ createId: () => 'artifact-1' });
  registry.observe({ path: 'src/a.ts', operation: 'read' });
  registry.move({ previousPath: 'src/a.ts', path: 'src/utils/a.ts' });

  expect(registry.resolve('src/utils/a.ts')).toBe('artifact-1');
});
```

- [x] **Step 2: 写 bridge/tool result 红测**

`BChatRuntimeFileContentSnapshot` 增加 `artifactId?: string`；当前打开文档按 path 命中时返回 `StoredDocumentRecord.id`。`read_file`、`write_file`、`edit_file`、`create_document` 的成功 result data 都包含 `artifactId`。

- [x] **Step 3: 运行红测**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction/artifact-registry.test.ts test/components/BChat/runtime-bridge.test.ts test/electron/main/modules/chat/runtime/main-tools.test.ts`

Expected: FAIL。

- [x] **Step 4: 实现 registry 并注入文件工具**

```ts
export interface ArtifactObservation {
  artifactId?: string;
  path: string;
  previousPath?: string;
  operation: 'read' | 'created' | 'modified' | 'deleted' | 'moved';
}

export interface ArtifactRegistry {
  observe(input: ArtifactObservation): string;
  resolve(path: string): string | undefined;
  move(input: { artifactId?: string; previousPath: string; path: string }): string;
}
```

为每个 Runtime 从“最新有效 checkpoint artifacts + boundary 后历史 tool result + bridge 文档快照”重建 registry。磁盘 fallback 第一次观察路径时用 `nanoid()`；不新增持久化表。

- [x] **Step 5: 更新文件结果形状**

bridge 命中已有文档时 `artifactId = document.id`。文件工具在成功 result data 中追加 `artifactId`，创建文档同时保留原有 `id` 以兼容现有调用方。若当前没有 move 工具，不为本功能额外增加 move AI tool；只消费已有显式移动证据。

- [x] **Step 6: 运行测试并提交**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction/artifact-registry.test.ts test/components/BChat/runtime-bridge.test.ts test/electron/main/modules/chat/runtime/main-tools.test.ts`

Expected: PASS。

```bash
git add src/components/BChat/utils/runtimeBridge.ts electron/main/modules/chat/runtime/tools/types.mts electron/main/modules/chat/runtime/tools/guards.mts electron/main/modules/chat/runtime/tools/FileTool/index.mts electron/main/modules/chat/runtime/tools/index.mts electron/main/modules/chat/runtime/compaction/artifact-registry.mts test/components/BChat/runtime-bridge.test.ts test/electron/main/modules/chat/runtime/main-tools.test.ts test/electron/main/modules/chat/runtime/compaction/artifact-registry.test.ts
git commit -m "feat(chat): 维护文件产物稳定身份"
```

## Task 6: 生成并校验结构化摘要

**Files:**

- Modify: `types/chat.d.ts`
- Modify: `electron/main/modules/ai/service.mts`
- Modify: `electron/main/modules/chat/runtime/compaction/checkpoint.mts`
- Modify: `electron/main/modules/chat/runtime/compaction/executor.mts`
- Create: `electron/main/modules/chat/runtime/compaction/summary-schema.mts`
- Create: `electron/main/modules/chat/runtime/compaction/summary-generator.mts`
- Modify: `electron/main/modules/chat/runtime/compaction/types.mts`
- Modify: `test/electron/main/modules/chat/runtime/compaction/checkpoint.test.ts`
- Modify: `test/electron/main/modules/chat/runtime/compaction/executor.test.ts`
- Modify: `test/electron/main/modules/chat/runtime/compaction/fingerprint.test.ts`
- Create: `test/electron/main/modules/chat/runtime/compaction/summary-schema.test.ts`
- Create: `test/electron/main/modules/chat/runtime/compaction/summary-generator.test.ts`
- Modify: `test/electron/main/modules/ai/service.test.ts`

- [x] **Step 1: 写 schema 红测**

覆盖 active objective、superseded 关系、success criteria、owner、artifact identity、合法 `type`、所有 `sourcePartIds` 非空字符串；`activeObjectiveId` 只能指向 active objective；重复业务 ID 和悬空 objective 关系拒绝。

- [x] **Step 2: 写生成器红测**

断言当前 resolver 的 provider/model 被使用；请求设置 `output.schema`、`maxOutputTokens = budget.summaryMaxTokens`、`requestId = runtimeId`；不传 tools/Tavily/MCP；输入只来自冻结 snapshot，不包含 pending part；模型错误不会生成伪 success fallback。首次 schema 校验失败时根据脱敏子错误码重试一次，重试仍失败时保留最终子错误码。

```ts
expect(generateText).toHaveBeenCalledWith(
  expect.objectContaining({ providerType: 'anthropic' }),
  expect.objectContaining({
    modelId: 'claude-test',
    maxOutputTokens: 8_000,
    tools: undefined,
    output: expect.objectContaining({ name: 'context_compaction' })
  })
);
```

- [x] **Step 3: 写同步生成中止红测**

在 `AIService.generateText` 测试中验证 `requestId` 会注册 AbortSignal，`abortStream(requestId)` 会终止同步生成，并在成功、失败、取消后清理 controller。

- [x] **Step 4: 运行红测**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction test/electron/main/modules/ai/service.test.ts`

Expected: FAIL。

- [x] **Step 5: 实现 JSON schema 与语义校验**

`summary-schema.mts` 导出 AI SDK JSON schema 和运行时 validator。JSON schema 负责形状，validator 负责跨字段关系与证据引用。

完整导出 `structuredSummarySchema: JSONSchema7` 和以下 validator；schema 必须逐层声明 `additionalProperties: false`，并把设计文档列出的所有必填字段放进对应 `required`，不能用宽泛的 `Record<string, unknown>` 代替字段定义。

```ts
export function validateStructuredSummary(
  value: unknown,
  allowedPartIds: ReadonlySet<string>
): SummaryValidationResult;
```

所有 `sourcePartIds` 必须能在冻结 source 或 parent checkpoint 证据集合中解析。

- [x] **Step 6: 实现摘要 prompt 和生成器**

Prompt 明确要求：更新同一目标而非重复创建；显式替换目标时建立 superseded 关系；区分 pending action owner 和 open question owner；artifact 以 ID 为身份、path 为可变属性；保持最新用户任务原文不进入摘要范围。

```ts
export async function generateStructuredSummary(
  input: SummaryGenerationInput,
  dependencies: SummaryGeneratorDependencies
): Promise<SummaryGenerationResult>;
```

使用现有异步错误归一化方式包装依赖调用。`AIInvokeResult.output` 首次不合法时，只把 `INVALID_SHAPE`、`INVALID_REFERENCE` 或 `INVALID_OBJECTIVE_RELATION` 加入修复提示，并使用相同冻结 source 定向重新生成一次；不得把无效原始输出写入数据库或日志。第二次仍不合法时返回 `SCHEMA_INVALID` 与最终子错误码，不能解析 `result.text` 猜测成功，也不能继续重试。

- [x] **Step 7: 让 generateText 支持 requestId 中止**

把 `abortSignal: this.registerAbortSignal(request.requestId)` 加到同步生成的 base options，并在 `finally` 调用 `removeController`。不要改变无 requestId 调用的行为。

- [x] **Step 8: 运行测试并提交**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction test/electron/main/modules/ai/service.test.ts`

Expected: PASS。

```bash
git add types/chat.d.ts electron/main/modules/ai/service.mts electron/main/modules/chat/runtime/compaction/checkpoint.mts electron/main/modules/chat/runtime/compaction/executor.mts electron/main/modules/chat/runtime/compaction/summary-schema.mts electron/main/modules/chat/runtime/compaction/summary-generator.mts electron/main/modules/chat/runtime/compaction/types.mts test/electron/main/modules/chat/runtime/compaction test/electron/main/modules/ai/service.test.ts
git commit -m "feat(chat): 生成结构化上下文摘要"
```

## Task 7: 构建 checkpoint + raw tail 上下文投影

**Files:**

- Modify: `electron/main/modules/chat/runtime/context/model-message.mts`
- Modify: `electron/main/modules/chat/runtime/context/tool-output-prune.mts`
- Create: `electron/main/modules/chat/runtime/compaction/projector.mts`
- Create: `test/electron/main/modules/chat/runtime/compaction/projector.test.ts`
- Modify: `test/electron/main/modules/chat/runtime/model-message-context.test.ts`
- Modify: `test/electron/main/modules/chat/runtime/tool-output-prune.test.ts`

- [x] **Step 1: 写 projector 红测**

覆盖：选最新拓扑有效 success；忽略 pending/failed/cancelled/skipped；用 synthetic assistant context 替换 boundary 前原始投影；保留 boundary 后 raw tail；允许在同一 assistant message 的 immutable boundary 后投影 suffix；无效 checkpoint 回退到上一个 success。

```ts
it('保留同一 assistant message 中 checkpoint 后的工具续轮', () => {
  const projected = projectContext(messagesWithInlineCheckpoint);
  expect(projected.checkpointId).toBe('checkpoint-2');
  expect(projected.messages.flatMap((message) => message.parts).map((part) => part.id)).toContain('tool-after-checkpoint');
});
```

- [x] **Step 2: 写只投影裁剪红测**

调用 projector 后，模型输入中的旧大型 tool result 被替换为确定性占位，但传入原始 messages 深比较不变，message writer 未被调用。默认投影保护最近两轮；达到压缩阈值后的高压投影先裁剪当前 Agent 轮次中较早的完整大型工具结果并保留最新结果，仍无法满足预算或硬限制时再裁剪最新完整结果的正文。当前用户消息、未完成工具和 Part 拓扑保持原样。

- [x] **Step 3: 运行红测**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction/projector.test.ts test/electron/main/modules/chat/runtime/model-message-context.test.ts test/electron/main/modules/chat/runtime/tool-output-prune.test.ts`

Expected: FAIL。

- [x] **Step 4: 实现 synthetic summary 投影**

```ts
export interface ContextProjection {
  messages: ChatMessageRecord[];
  checkpointId?: string;
  estimatedTokens: number;
}

export function projectContext(input: ContextProjectionInput): ContextProjection;
```

把结构化摘要序列化为稳定、明确标注为“历史 checkpoint”的内部 assistant text；不要把摘要存回 `message.content`，不要让 UI 看到 synthetic message。

- [x] **Step 5: 调整 model-message 与 tool prune**

`toRuntimeModelMessages` 明确跳过 `compaction` part。保留 `pruneMessageToolOutputs` 的纯 clone 能力，并增加当前 Agent 轮次高压裁剪；删除所有暗示可持久化覆盖原消息的 API/注释，裁剪只能由 projector 对 clone 调用。

- [x] **Step 6: 运行测试并提交**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction/projector.test.ts test/electron/main/modules/chat/runtime/model-message-context.test.ts test/electron/main/modules/chat/runtime/tool-output-prune.test.ts`

Expected: PASS。

```bash
git add electron/main/modules/chat/runtime/context/model-message.mts electron/main/modules/chat/runtime/context/tool-output-prune.mts electron/main/modules/chat/runtime/compaction/projector.mts test/electron/main/modules/chat/runtime/compaction/projector.test.ts test/electron/main/modules/chat/runtime/model-message-context.test.ts test/electron/main/modules/chat/runtime/tool-output-prune.test.ts
git commit -m "feat(chat): 构建上下文压缩模型投影"
```

## Task 8: 实现规划器和原子 compaction executor

**Files:**

- Create: `electron/main/modules/chat/runtime/compaction/planner.mts`
- Create: `electron/main/modules/chat/runtime/compaction/executor.mts`
- Create: `test/electron/main/modules/chat/runtime/compaction/planner.test.ts`
- Create: `test/electron/main/modules/chat/runtime/compaction/executor.test.ts`

- [x] **Step 1: 写 planner 红测**

覆盖自动低于阈值 skip、手动强制、无可压缩内容 skipped、Q 不足时先投影裁剪、摘要请求超窗、current user/system/tools 不可压缩、相同 fingerprint 已 failed 时自动不重试、手动可重试。

- [x] **Step 2: 写 executor 顺序红测**

用事件数组断言顺序严格为：冻结 source → 计算 plan/fingerprint → 插入 pending → 生成 summary → 校验 → 再验 lease/boundary/fingerprint → 单次 update success。生成器接收到的 snapshot 中不包含 pending。

```ts
expect(events).toEqual([
  'capture',
  'plan',
  'write:pending',
  'generate',
  'validate',
  'verify',
  'write:success'
]);
```

继续覆盖取消写 `cancelled`、schema/model error 写 `failed`、source 变化写 `SOURCE_CHANGED`、成功后对象冻结/后续拒绝修改、错误不破坏旧 checkpoint。

- [x] **Step 3: 运行红测**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction/planner.test.ts test/electron/main/modules/chat/runtime/compaction/executor.test.ts`

Expected: FAIL。

- [x] **Step 4: 实现纯 planner**

```ts
export type CompactionPlanResult =
  | { status: 'ready'; plan: CompactionPlan }
  | { status: 'skipped'; reason: CompactionSkipReason }
  | { status: 'blocked'; errorCode: CompactionErrorCode };

export function createCompactionPlan(input: CompactionPlanInput): CompactionPlanResult;
```

planner 计算 boundary、不可压缩 tokens、tail、summary budget、model/budget snapshot 和 fingerprint；`Q < 1024` 时先裁剪当前 Agent 轮次中较早的完整大型工具结果并重新规划，仍不足时再裁剪最新完整结果正文，最后才阻止压缩；不写消息、不调模型。

- [x] **Step 5: 实现 executor**

```ts
export interface CompactionExecutor {
  execute(input: CompactionExecuteInput): Promise<CompactionExecuteResult>;
  cancel(runtimeId: string): void;
}
```

pending part 追加到当前 assistant message 尾部；手动模式由调用方先创建 compaction-only assistant message。每次状态变化通过现有 message writer 整条原子更新。写 success 前重新从当前消息计算 fingerprint，不复制 snapshot 中字符串冒充验证。

- [x] **Step 6: 校验压缩后目标预算**

summary 返回后重新估算 `F + actualSummary + actualTail`。超过 `C` 时标记 `failed`（`TARGET_BUDGET_EXCEEDED`），不能提交一个已知仍过大的 success checkpoint。

- [x] **Step 7: 运行测试并提交**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction/planner.test.ts test/electron/main/modules/chat/runtime/compaction/executor.test.ts`

Expected: PASS。

```bash
git add electron/main/modules/chat/runtime/compaction/planner.mts electron/main/modules/chat/runtime/compaction/executor.mts test/electron/main/modules/chat/runtime/compaction/planner.test.ts test/electron/main/modules/chat/runtime/compaction/executor.test.ts
git commit -m "feat(chat): 原子执行上下文压缩"
```

## Task 9: 在每个模型请求边界接入自动压缩

**Files:**

- Modify: `electron/main/modules/chat/runtime/service.mts`
- Modify: `electron/main/modules/chat/runtime/types.mts`
- Modify: `electron/main/modules/chat/runtime/runners/factory.mts`
- Modify: `electron/main/modules/chat/runtime/stream/index.mts`
- Modify: `electron/main/modules/chat/runtime/stream/request.mts`
- Modify: `test/electron/main/modules/chat/runtime/service.test.ts`
- Modify: `test/electron/main/modules/chat/runtime/stream/executor.test.ts`
- Modify: `test/electron/main/modules/chat/runtime/atomic-write.test.ts`

- [x] **Step 1: 写首次请求自动压缩红测**

用户消息已持久化、模型调用前达到 `T` 时，断言 pending/success update 均早于 `streamExecutor.execute`；主模型收到 re-project 后的 checkpoint + tail；当前用户消息保持原文。

- [x] **Step 2: 写工具续轮红测**

第一轮完整 tool result 写入后，下一次 `streamExecutor.execute` 前再次预算检查并可在同一 assistant message 尾部插入 compaction part。长任务达到阈值时，模型投影裁剪当前轮次中较早的大型工具结果、保留最新结果，数据库 assistant message 保持完整。`tool.status === 'executing'` 时不插 pending；工具完成后自然再检查，不新增 `compactionDeferred`。

- [x] **Step 3: 写锁、失败和硬限制红测**

覆盖 pending 期间同 session send/continue/rollback 返回 `SESSION_BUSY` 且不新增消息；自动压缩失败但低于 `H` 可用旧投影继续；达到 `H` 则不调主模型；相同 failed fingerprint 下一轮不重试；abort 同时取消 summary 和当前 runtime。

- [x] **Step 4: 写全量历史读取红测**

默认 reader 必须调用 `chatSessionManager.getAllMessages(sessionId)`，不能继续使用只取最近 30 条的 `getMessages`，否则 checkpoint parent 和 artifact evidence 会丢失。

- [x] **Step 5: 运行红测**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/service.test.ts test/electron/main/modules/chat/runtime/stream/executor.test.ts test/electron/main/modules/chat/runtime/atomic-write.test.ts`

Expected: FAIL。

- [x] **Step 6: 保持 raw state 与 projection 分离**

在 service 的续轮循环中始终保留 raw source messages；每次调用模型前执行 `prepareContextBeforeRequest`，只把 projection 交给 request builder：

```ts
const prepared = await prepareContextBeforeRequest({
  runtime,
  rawMessages: createContinuationSourceMessages(sourceMessages, assistantMessage),
  assistantMessage,
  trigger: 'automatic'
});

await streamExecutor.execute(runtime, prepared.projectedMessages, assistantMessage);
```

严禁把 `projectedMessages` 写回下一轮 raw source，否则后续 checkpoint 会失去证据 Part。

- [x] **Step 7: 删除持久化 tool prune**

从 `service.mts` 删除 `pruneOldToolOutputsIfNeeded` 及其成功后 DB update 调用。旧工具裁剪已在 Task 7 的 projector 中完成。

- [x] **Step 8: 接入共享 resolver、executor 和全量 reader**

service 构造时创建或注入 model resolver、summary generator、compaction executor，测试依赖均可替换。默认 reader 改为 `getAllMessages`。Runtime 持锁范围不变，自动压缩复用已持有锁。

- [x] **Step 9: 运行测试并提交**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/service.test.ts test/electron/main/modules/chat/runtime/stream/executor.test.ts test/electron/main/modules/chat/runtime/atomic-write.test.ts test/electron/main/modules/chat/runtime/compaction`

Expected: PASS。

```bash
git add electron/main/modules/chat/runtime/service.mts electron/main/modules/chat/runtime/types.mts electron/main/modules/chat/runtime/runners/factory.mts electron/main/modules/chat/runtime/stream/index.mts electron/main/modules/chat/runtime/stream/request.mts test/electron/main/modules/chat/runtime/service.test.ts test/electron/main/modules/chat/runtime/stream/executor.test.ts test/electron/main/modules/chat/runtime/atomic-write.test.ts
git commit -m "feat(chat): 接入自动上下文压缩"
```

## Task 10: 接入手动 `/compact` 与 Actor 生命周期

**Files:**

- Modify: `types/electron-api.d.ts`
- Modify: `electron/preload/index.mts`
- Modify: `electron/main/modules/chat/runtime/ipc.mts`
- Modify: `electron/main/modules/chat/runtime/service.mts`
- Modify: `src/ai/chat/types.ts`
- Modify: `src/ai/chat/machine/sessionMachine.ts`
- Modify: `src/components/BChat/hooks/useChatSessionActor.ts`
- Modify: `src/components/BChat/hooks/useChatRuntime.ts`
- Modify: `src/components/BChat/hooks/useChatWorkflow.ts`
- Modify: `src/components/BChat/hooks/useSlashCommands.ts`
- Modify: `src/components/BChat/index.vue`
- Modify: `test/electron/main/modules/chat/runtime/ipc.test.ts`
- Modify: `test/electron/main/modules/chat/runtime/service.test.ts`
- Modify: `test/ai/chat/session-machine.test.ts`
- Modify: `test/components/BChat/use-chat-session-actor.test.ts`
- Modify: `test/components/BChat/use-chat-runtime.test.ts`
- Modify: `test/components/BChat/command-panel-model-entry.test.ts`

- [x] **Step 1: 写 IPC/service 红测**

覆盖 `chat:runtime:compact` 注册、preload 转发、service 获取写锁后创建 compaction-only assistant message、成功/skip/fail/cancel 使用标准 message/complete/error event、busy 时不插消息。

- [x] **Step 2: 写 Actor 红测**

新增 `ChatIntent { type: 'compact' }` 和 `session.compact`；只允许 idle → preparing → running，复用 busy/abortable tag；完成回 idle，取消走现有 cancelling；不重新引入单独 `compacting` XState 状态。

```ts
actor.send({ type: 'session.compact' });
expect(actor.getSnapshot().matches('preparing')).toBe(true);
expect(actor.getSnapshot().context.intent).toEqual({ type: 'compact' });
```

- [x] **Step 3: 写 slash command 红测**

`/compact` 映射到 `compactContext`，并使用 `allowWhenIdleOnly`；Renderer 拦截命令，不创建 user message，不发送文本 `/compact` 给模型。

- [x] **Step 4: 运行红测**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/ipc.test.ts test/electron/main/modules/chat/runtime/service.test.ts test/ai/chat/session-machine.test.ts test/components/BChat/use-chat-session-actor.test.ts test/components/BChat/use-chat-runtime.test.ts test/components/BChat/command-panel-model-entry.test.ts`

Expected: FAIL。

- [x] **Step 5: 打通 IPC**

在 Electron API、preload 和 IPC 注册中加入 `chatRuntimeCompact(input)`；返回现有 `ChatRuntimeStartResult`。`service.compact` 在插入 assistant message 前获取同一 session 写锁，把 runtime phase 设为 `'compacting'`，然后异步执行并发出标准事件。

- [x] **Step 6: 打通 Workflow**

`useChatSessionActor` 暴露 `compact()`；`useChatRuntime` 暴露 `compact(input)`；`useChatWorkflow` 暴露 `compactContext()`：

1. `beginOperation()`；
2. `sessionActor.compact()`；
3. 准备当前 runtime config；
4. `runtimeLauncher.start(prepared)`；
5. 调 `chatRuntime.compact`；
6. 按现有成功/失败/取消路径 finish。

手动命令没有当前 user message，使用全量历史规划；无可压缩内容时写 `skipped` part。

- [x] **Step 7: 注册 `/compact`**

```ts
const COMMAND_HANDLER_MAP = {
  model: 'openModelSelector',
  new: 'createNewSession',
  clear: 'clearInput',
  compact: 'compactContext'
} as const satisfies Record<string, keyof CommandHandlers>;
```

在 `BChat/index.vue` 将 `compactContext: workflow.compactContext` 注入 hook。忙碌时保持现有拒绝策略，不排队、不隐式生成消息。

- [x] **Step 8: 运行测试并提交**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/ipc.test.ts test/electron/main/modules/chat/runtime/service.test.ts test/ai/chat/session-machine.test.ts test/components/BChat/use-chat-session-actor.test.ts test/components/BChat/use-chat-runtime.test.ts test/components/BChat/command-panel-model-entry.test.ts`

Expected: PASS。

```bash
git add types/electron-api.d.ts electron/preload/index.mts electron/main/modules/chat/runtime/ipc.mts electron/main/modules/chat/runtime/service.mts src/ai/chat/types.ts src/ai/chat/machine/sessionMachine.ts src/components/BChat/hooks/useChatSessionActor.ts src/components/BChat/hooks/useChatRuntime.ts src/components/BChat/hooks/useChatWorkflow.ts src/components/BChat/hooks/useSlashCommands.ts src/components/BChat/index.vue test/electron/main/modules/chat/runtime/ipc.test.ts test/electron/main/modules/chat/runtime/service.test.ts test/ai/chat/session-machine.test.ts test/components/BChat/use-chat-session-actor.test.ts test/components/BChat/use-chat-runtime.test.ts test/components/BChat/command-panel-model-entry.test.ts
git commit -m "feat(chat): 添加手动上下文压缩命令"
```

## Task 11: 在消息流中展示压缩状态

**Files:**

- Modify: `src/components/BChat/components/MessageBubble/BubblePartStatus/index.vue`
- Modify: `src/components/BChat/components/MessageBubble.vue`
- Create: `test/components/BChat/status-part.component.test.ts`
- Modify: `test/components/BChat/message-bubble.component.test.ts`

- [x] **Step 1: 写组件红测**

逐状态断言唯一可见文本：

```ts
const labels = {
  pending: '上下文压缩中…',
  success: '上下文已压缩',
  failed: '上下文压缩失败',
  cancelled: '上下文压缩已取消',
  skipped: '当前上下文无需压缩'
};
```

DOM 不得包含摘要、Token、比例、boundary、fingerprint、model snapshot 或 error detail；根状态节点包含 `aria-live="polite"`。

- [x] **Step 2: 写 MessageBubble 顺序红测**

真实 parts 为 `text → tool → compaction → tool → text` 时 DOM 保持相同顺序。compaction-only assistant message 不显示 branch/regenerate/copy 工具栏；普通完成 assistant 仍显示。

- [x] **Step 3: 运行红测**

Run: `pnpm exec vitest run test/components/BChat/status-part.component.test.ts test/components/BChat/message-bubble.component.test.ts`

Expected: FAIL。

- [x] **Step 4: 实现状态组件**

复用 `BubblePartStatus`，可选接收 `ChatMessageCompactionPart`，用 `createNamespace('bubble-part-status')` 生成 BEM 类名，样式选择器写完整类名，不使用 `&__...`。无 part 时展示中断状态，有 part 时只读取 part.status；所有状态仅展示文字，不使用图标。

- [x] **Step 5: 接入 MessageBubble**

将 render item 联合加入：

```ts
| { key: string; kind: 'status'; part: ChatMessageCompactionPart }
```

在 `flatMap` 中按 part 原始位置产生 item，并在 template 渲染 `BubblePartStatus`。新增 `hasAssistantContent`，只有 text/tool/widget 等用户可操作内容才展示 assistant toolbar，compaction-only 不展示。`ConversationView.loading` 通过独立属性禁用 branch/regenerate/rollback，事件处理层再次守卫 busy 状态，但输入编辑器仍允许修改草稿。

- [x] **Step 6: 运行组件和样式测试**

Run: `pnpm exec vitest run test/components/BChat/status-part.component.test.ts test/components/BChat/message-bubble.component.test.ts`

Expected: PASS。

Run: `pnpm exec stylelint 'src/components/BChat/components/MessageBubble/**/*.{vue,less}'`

Expected: PASS。

- [x] **Step 7: 提交 UI**

```bash
git add src/components/BChat/components/MessageBubble/BubblePartStatus/index.vue src/components/BChat/components/MessageBubble.vue test/components/BChat/status-part.component.test.ts test/components/BChat/message-bubble.component.test.ts
git commit -m "feat(chat): 展示上下文压缩状态"
```

## Task 12: 重写分支引用、保护截断并恢复遗留 pending

**Files:**

- Modify: `electron/main/modules/chat/runtime/branch.mts`
- Modify: `electron/main/modules/chat/runtime/service.mts`
- Modify: `electron/main/modules/chat/service.mts`
- Modify: `src/ai/chat/policies/regeneration.ts`
- Modify: `src/components/BChat/hooks/useRollback.ts`
- Modify: `test/electron/main/modules/chat/branch.test.ts`
- Modify: `test/electron/main/modules/chat/branch-transaction.test.ts`
- Modify: `test/electron/main/modules/chat/runtime/recovery-requests.test.ts`
- Modify: `test/ai/chat/regeneration.test.ts`
- Modify: `test/components/BChat/use-rollback.test.ts`

- [x] **Step 1: 写分支红测**

分支重建所有 message/part ID 后，断言 `boundaryPartId`、`parentCheckpointId` 和每个 summary `sourcePartIds` 都通过 `partIdMap` 重写；artifact/objective/action 等业务 ID 保持不变；fingerprint 与源分支不同且按保存的 model/budget/version snapshot 重算。

- [x] **Step 2: 写无效链清理红测**

若目标分支缺少 evidence 或 parent，移除该 checkpoint 和所有后代；仍保留普通消息与完整 tool/interaction 单元。事务失败时不产生半个 session。

- [x] **Step 3: 写回滚/重新生成红测**

完整 message 截断后运行 topology validator：截断点后的 checkpoint 随消息删除；截断点前依赖完整的 checkpoint 保留；不允许只保留同一 assistant message 部分 Part。若已有异常数据导致依赖断裂，清理无效 checkpoint 链。

- [x] **Step 4: 写启动恢复红测**

应用恢复扫描发现遗留 `pending` 时，在持锁条件下更新为 `failed`，`errorCode = 'INTERRUPTED'`；已经 success 的 checkpoint 不变；下次请求可基于新 fingerprint 重新评估。

- [x] **Step 5: 运行红测**

Run: `pnpm exec vitest run test/electron/main/modules/chat/branch.test.ts test/electron/main/modules/chat/branch-transaction.test.ts test/electron/main/modules/chat/runtime/recovery-requests.test.ts test/ai/chat/regeneration.test.ts test/components/BChat/use-rollback.test.ts`

Expected: FAIL。

- [x] **Step 6: 分两阶段克隆并重写引用**

`branch.mts` 先分配全部 message/part ID map，再 clone/rewrite。对每个 success checkpoint：

```ts
const rewritten = {
  ...checkpoint,
  id: requireMappedPart(checkpoint.id),
  boundaryPartId: requireMappedPart(checkpoint.boundaryPartId),
  parentCheckpointId: checkpoint.parentCheckpointId ? requireMappedPart(checkpoint.parentCheckpointId) : undefined,
  summary: rewriteSummarySources(checkpoint.summary, partIdMap)
};
```

完成拓扑校验后，用重写后的实际源 Part 重建 fingerprint。不得读取创建分支时当前模型。

- [x] **Step 7: 在主进程持久化截断前执行拓扑归一化**

回滚/重新生成继续 renderer 现有的 message-level slice，不从 renderer 导入主进程模块。统一在 `ChatSessionManager.setSessionMessages` 的事务写入前调用 `removeInvalidCheckpoints`，确保所有 IPC 持久化截断都经过同一校验。正常的完整 message 截断应原样返回；只有历史异常数据存在悬空依赖时才删除无效 checkpoint 链。不要添加 part-level 回滚功能。

- [x] **Step 8: 恢复 pending**

在 Runtime recovery 初始化路径扫描全量消息，将遗留 pending 更新为 failed 后再暴露 recovery snapshots；异步写入使用 `asyncTo`，并记录脱敏 error code。

- [x] **Step 9: 运行测试并提交**

Run: `pnpm exec vitest run test/electron/main/modules/chat/branch.test.ts test/electron/main/modules/chat/branch-transaction.test.ts test/electron/main/modules/chat/runtime/recovery-requests.test.ts test/ai/chat/regeneration.test.ts test/components/BChat/use-rollback.test.ts test/electron/main/modules/chat/runtime/compaction/topology.test.ts test/electron/main/modules/chat/runtime/compaction/fingerprint.test.ts`

Expected: PASS。

```bash
git add electron/main/modules/chat/runtime/branch.mts electron/main/modules/chat/runtime/service.mts electron/main/modules/chat/service.mts src/ai/chat/policies/regeneration.ts src/components/BChat/hooks/useRollback.ts test/electron/main/modules/chat/branch.test.ts test/electron/main/modules/chat/branch-transaction.test.ts test/electron/main/modules/chat/runtime/recovery-requests.test.ts test/ai/chat/regeneration.test.ts test/components/BChat/use-rollback.test.ts
git commit -m "fix(chat): 重建会话分支压缩拓扑"
```

## Task 13: 补齐质量回归、日志、文档和全量验证

**Files:**

- Create: `test/fixtures/chat/long-context-compaction.ts`
- Create: `test/electron/main/modules/chat/runtime/compaction/quality-regression.test.ts`
- Modify: `electron/main/modules/chat/runtime/compaction/executor.mts`
- Modify: `docs/superpowers/specs/2026-07-16-bchat-long-context-compaction-design.md`（仅当实现中确认了需要回写的澄清）
- Modify: `changelog/2026-07-16.md`

- [x] **Step 1: 建立固定长会话 fixture**

fixture 覆盖：目标被替换、不同 owner 的 pending action/open question、文件创建/修改/移动/删除、多次滚动 checkpoint、超长旧 tool output、当前超长用户任务、失败后重试和模型切换。所有 ID 固定，测试结果可重复。

- [x] **Step 2: 写质量回归红测**

确定性验证：active objective/success criteria 保留；superseded 目标不重新激活；owners 正确；artifact 路径变化 ID 不变；所有 sourcePartIds 可解析；最终投影 `<= targetTokens`；最新用户任务保持原文。

- [x] **Step 3: 实现脱敏诊断日志**

executor 只记录：runtime/session/checkpoint ID、trigger/status、fingerprint 前缀、估算/投影 tokens、duration、脱敏 model snapshot、error code。禁止记录消息正文、完整摘要、API key、文件内容或完整 fingerprint。

- [x] **Step 4: 运行全部 compaction 与关联回归**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/compaction test/electron/main/modules/chat/runtime/service.test.ts test/electron/main/modules/chat/runtime/stream/executor.test.ts test/electron/main/modules/chat/branch.test.ts test/components/BChat/status-part.component.test.ts test/components/BChat/message-bubble.component.test.ts test/ai/chat/session-machine.test.ts`

Expected: PASS，且无未处理 rejection、无 snapshot 泄密输出。

- [x] **Step 5: 更新 changelog**

在 `changelog/2026-07-16.md` 的 `Added`/`Changed`/`Fixed` 中记录：80% 自动触发、55% 目标、手动 `/compact`、状态 part、稳定 artifact identity、投影-only tool prune、分支 fingerprint 重算和拓扑恢复。不要写本机绝对路径。

- [x] **Step 6: 运行自动修复检查**

Run: `pnpm lint`

Expected: PASS；检查 formatter 产生的修改只涉及本功能文件。

Run: `pnpm lint:style`

Expected: PASS；检查没有 `&__...` 新样式。

- [x] **Step 7: 运行类型与构建检查**

Run: `pnpm exec tsc --noEmit`

Expected: PASS。

Run: `pnpm run electron:build-main`

Expected: PASS。

Run: `pnpm build`

Expected: PASS。

- [x] **Step 8: 运行全量测试**

Run: `pnpm test`

Expected: 全部测试 PASS；记录实际测试数量和耗时供最终交付说明。

- [x] **Step 9: 检查数据库未变更和敏感信息**

Run: `git diff --name-only -- electron/main/modules/database electron/main/modules/chat/migrations`

Expected: 无输出。

Run: `rg -n "apiKey|baseUrl|82K|24K|summaryMaxTokens" src/components/BChat/components/MessageBubble/BubblePartStatus src/components/BChat/components/MessageBubble.vue`

Expected: 无输出；UI 不暴露模型、预算或摘要信息。

- [x] **Step 10: 最终提交**

```bash
git add test/fixtures/chat/long-context-compaction.ts test/electron/main/modules/chat/runtime/compaction/quality-regression.test.ts electron/main/modules/chat/runtime/compaction/executor.mts changelog/2026-07-16.md
git commit -m "test(chat): 完善上下文压缩质量回归"
```

## Final Acceptance Checklist

- [x] 不新增数据库表、列或独立压缩 record。
- [x] 首次请求和每个工具续轮前都在约 80% 阈值检查，目标约 55%。
- [x] 当前 selected model 生成摘要，snapshot 含 `contextWindow` 且无 secret。
- [x] active tool、pending confirmation、awaiting user choice 期间不开始压缩。
- [x] `boundaryPartId` 指向 checkpoint 前的 immutable part；success 后不可变。
- [x] 自动 compaction part 保持在当前 assistant message 中；手动命令可生成 compaction-only message。
- [x] UI 只显示五种状态文案，不显示摘要、Token、比例或诊断字段。
- [x] pending 持锁期间同会话发送、编辑、回滚和重新生成均不能写库。
- [x] 原始 tool result 不被裁剪回写；投影裁剪不会改变 raw messages。
- [x] artifact 移动/重命名有证据时 ID 稳定，删除后同路径新建获得新 ID。
- [x] 分支重写所有 Part 引用并重算 fingerprint；回滚/重新生成保持依赖闭包。
- [x] 相同 failed fingerprint 不自动重试；手动可强制；硬限制时不发必然溢出的请求。
- [x] 遗留 pending 可恢复为 failed，旧 success checkpoint 继续有效。
- [x] lint、stylelint、TypeScript、Electron main build、renderer build 和全量测试均通过。
