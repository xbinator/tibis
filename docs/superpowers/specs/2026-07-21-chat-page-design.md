# 独立聊天页与多会话标签设计

## 背景

当前聊天能力只通过 `src/layouts/default/components/ChatSider.vue` 提供。侧栏已经组合了会话标题、会话历史和完整 `BChat`，但不能把某个会话作为主内容区标签长期保留，也无法同时查看多个独立会话。

本设计新增 `src/views/chat/index.vue`，让用户从 ChatSider Header 把当前会话打开为顶部标签。聊天页直接复用 `src/components/BChat/index.vue`，不复制聊天运行时、消息持久化或工具执行逻辑。

## 目标

- 新增 `/chat`，表示唯一的空白聊天页草稿。
- 新增 `/chat/:sessionId`，表示指定持久化会话的聊天页。
- 支持多个持久化会话分别打开为多个顶部标签。
- ChatSider Header 支持把当前会话或空白草稿打开到聊天页。
- 同一个持久化会话不能同时挂载在 ChatSider 和聊天页中。
- ChatSider 历史点击已打开的会话时切换到对应标签，不重复加载会话。
- 聊天标签显示运行、等待处理、失败和后台完成状态。
- 删除会话时同步关闭对应聊天标签；处于运行或等待状态的会话禁止删除。
- 保留完整 `BChat` 的新会话命令和会话分支能力，并使其符合多标签模型。

## 非目标

- 不迁移 ChatSider 中尚未发送的文字、图片或其他输入草稿。
- 不在聊天页重新实现会话历史、模型选择、消息列表或工具交互。
- 不持久化聊天标签的运行时状态。
- 不允许同时打开多个 `/chat` 空白草稿标签。
- 不在本次工作中重构通用标签页体系或聊天持久化协议。

## 核心约束

### 会话所有权

每个持久化会话在 renderer 中只能由一个可交互的 `BChat` 实例持有：

- 会话可以由 ChatSider 持有。
- 会话可以由 `/chat/:sessionId` 标签持有。
- 两者不能同时持有同一个 `sessionId`。

该约束由明确入口维护，不增加扫描全部状态的全局修正监听：

- Header 打开当前会话后，ChatSider 主动进入空白新会话。
- 历史点击已打开的会话时只切换标签，不修改 ChatSider 当前的其他会话。
- 历史点击未打开的会话时仍按现有逻辑在 ChatSider 内切换。

`/chat` 创建真实会话后、升级为 `/chat/:sessionId` 前也视为已经持有该会话。ChatSider 判断会话是否已打开时，必须同时查询路由标签和运行时注册表中的真实 `sessionId`，不能只查找 `chat:<sessionId>` 标签 ID。

### 标签身份

- `/chat` 使用固定标签 ID `chat:new`。
- `/chat/:sessionId` 使用标签 ID `chat:<sessionId>`。
- 标签 KeepAlive cache key 与标签 ID 一致。
- `/chat` 首次创建会话后，原标签在原位置升级为 `chat:<sessionId>`，不留下 `chat:new` 重复项。

## 路由设计

新增 `src/router/routes/modules/chat.ts`，注册两个路由记录：

| 路径 | 用途 | 标签 ID | 默认标题 |
| --- | --- | --- | --- |
| `/chat` | 唯一空白聊天草稿 | `chat:new` | 新会话 |
| `/chat/:sessionId` | 持久化会话 | `chat:<sessionId>` | 聊天 |

两个路由均使用聊天图标，并加载 `src/views/chat/index.vue`。路由辅助逻辑负责：

- 规范化 `sessionId`。
- 构建聊天路径和标签 ID。
- 判断一个标签是否为聊天标签。
- 从现有标签中查找指定会话或 `/chat` 草稿。

辅助逻辑必须集中定义，ChatSider、Chat 页面和 HeaderTabs 不分别手写路径解析规则。

聊天路由不通过 `props` 向页面注入 `sessionId`。Chat 页面在组件实例创建时从 `route.params.sessionId` 规范化并捕获一次不可变会话 ID；不能使用持续响应全局路由的 `computed`。这样每个 KeepAlive 聊天实例保留自己的会话身份，切换到其他聊天标签时不会让后台实例跟随当前路由改变会话。

## 组件职责

### ChatSider

`src/layouts/default/components/ChatSider.vue` 新增 Header 打开按钮，并维护以下入口行为：

1. 当前为持久化会话 A：
   - 已存在 `/chat/A` 时切换到该标签。
   - 不存在时创建并切换到 `/chat/A`。
   - 导航成功后将 ChatSider 重置为空白新会话。

2. 当前为空白新会话：
   - 已存在 `/chat` 时切换到该标签。
   - 不存在时创建并切换到 `/chat`。
   - 清空 ChatSider 内尚未发送的草稿，不迁移内容。

3. 历史点击会话 A：
   - A 已有 `chat:A` 标签时切换到 `/chat/A`。
   - A 暂时由 `chat:new` 持有时切换到 `/chat`。
   - ChatSider 当前为 B 时继续保持 B。
   - A 没有聊天标签时在 ChatSider 中正常切换到 A。

4. 删除会话 A：
   - A 没有活动 Runtime 时，删除成功后关闭 `/chat/A`。
   - A 暂时由 `chat:new` 持有时，删除成功后关闭 `/chat`。
   - A 正在运行或等待用户时，历史列表直接禁用删除按钮，不显示确认框，也不终止 Runtime。

侧栏聊天忙碌时，Header 打开按钮沿用现有会话操作禁用规则。

ChatSider 不直接处理 `Tab | ChatTabRuntimeRecord` 联合类型。`src/layouts/default/hooks/useChatOwner.ts` 统一查询标签 Store 与聊天运行时注册表，并返回 `{ tabId, path, sessionId }` 结构。打开聊天页、点击已打开历史会话、删除空闲会话三个入口只依赖该标准 Owner，不再通过字段存在性判断来源类型。

### Chat 页面

`src/views/chat/index.vue` 是一个轻量页面壳：

- 实例创建时从路由捕获 `sessionId`，不存在时向 `BChat` 传入 `null`。
- 页面主体直接渲染完整 `BChat`。
- 接收会话创建、标题持久化、草稿创建、加载和运行状态事件。
- 把聊天运行状态同步到运行时标签状态注册表。
- 在页面卸载时注销本标签的运行时控制器。

聊天页不增加会话历史面板；会话导航由顶部标签和 ChatSider 完成。

### BChat

`src/components/BChat/index.vue` 保持聊天能力的唯一实现，并补充页面壳需要的窄接口：

- 对外暴露清空为新草稿的方法，用于 ChatSider 打开空白聊天页后清理旧输入。
- 对外暴露终止当前 Runtime 的方法，用于标签关闭保护。
- 对外发布可区分 `idle`、`running`、`waiting`、`error` 的运行状态。
- 继续发布 `session-created`、`session-title-persisted` 和 `loading-change`，并在 `/new` 时发布 `new-session` 请求。

`BChat` 不读取路由，也不通过 `externalDraftNavigation` 判断宿主类型。`/new` 只发布 `new-session`，由宿主决定如何创建草稿：聊天页打开或复用唯一 `/chat`，ChatSider 重置侧栏会话并调用 `resetDraft()`。`resetDraft()` 只重置内部草稿状态，不再反向发布新会话事件，避免宿主事件回环。

新增接口必须复用现有 Session actor 与 workflow 状态，不能建立第二套运行状态来源。

### HeaderTabs

`src/layouts/default/components/HeaderTabs.vue` 在聊天标签图标附近渲染运行状态：

| 状态 | 表现 | 清除条件 |
| --- | --- | --- |
| `idle` | 无附加标记 | 无 |
| `running` | 旋转状态图标 | Runtime 完成、失败、取消或等待用户 |
| `waiting` | 橙色高优先级提示 | 用户完成交互或终止 Runtime |
| `error` | 红色错误提示 | 下一次运行开始或标签关闭 |
| `completed` | 蓝色未读圆点 | 用户切换到该标签 |

状态优先级为 `waiting`、`running`、`error`、`completed`、`idle`。同一标签只显示一个状态。

状态与图标、样式的对应关系由配置映射维护，并交给轻量状态组件渲染；HeaderTabs 不为每个状态分别维护模板判断。`running` 与 `waiting` 是否属于活动 Runtime 由运行时模块的统一谓词判断，关闭、删除保护和终止逻辑复用同一定义。

隐藏标签进入 `waiting` 时只更新顶部标签的橙色状态，不弹出全局消息，也不自动抢占用户当前页面。

关闭 `running` 或 `waiting` 标签时，提示用户“终止并关闭”。确认后先终止 Runtime，终止成功后再执行现有标签关闭计划。取消或终止失败时保留标签。

“关闭其他标签”“关闭右侧标签”“关闭已保存标签”和“关闭全部标签”同样执行聊天 Runtime 保护。一次关闭计划只显示一次确认，并列出需要终止的聊天数量；所有目标 Runtime 均终止成功后才应用原关闭计划。发生部分终止失败时保留整个标签关闭计划，已经成功终止的聊天保持标签可见并显示真实空闲状态。

关闭前置条件由 `src/layouts/default/hooks/useTabCloseGuard.ts` 集中处理。该 Hook 依次处理活动聊天 Runtime 的终止确认与现有未保存确认，并以 `canClose(plan): Promise<boolean>` 返回是否允许应用计划。HeaderTabs 只负责获取关闭计划、调用守卫、应用计划、清理聊天运行态和执行必要导航。

### 聊天标签运行时注册表

新增只存在于 renderer 内存中的聊天标签运行时注册表，职责包括：

- 按标签 ID 保存当前状态和真实 `sessionId`。
- 保存标签是否已被用户查看，用于生成 `completed` 未读状态。
- 在 `/chat` 升级时把 `chat:new` 状态迁移到 `chat:<sessionId>`。
- 为标签关闭流程提供终止当前 Runtime 的控制入口。
- 提供统一的活动状态谓词，将 `running` 和 `waiting` 视为活动 Runtime。
- 标签关闭或页面卸载时清理状态与控制入口。

该注册表不写入 `localStorage`，不加入持久化 `Tab` 结构。应用重启后由现有 Actor system 和 Runtime recovery 恢复真实 Runtime，并同步重建对应标签的运行状态与终止控制器。

## 关键流程

### 打开已保存会话

1. 用户在 ChatSider 中打开会话 A。
2. ChatSider 通过路由标签和运行时注册表查找 A 的拥有者。
3. 已存在时直接导航到拥有者路径；不存在时导航到 `/chat/A`，由路由守卫创建标签。
4. 导航成功后，ChatSider 清空当前会话并进入新会话草稿。
5. `/chat/A` 中的 `BChat` 加载 A 的历史消息并继续聊天。

如果导航失败，第 4 步不得执行，ChatSider 保留原会话。

### 打开空白聊天页

1. 用户在 ChatSider 新会话状态点击打开按钮。
2. ChatSider 查找 `chat:new`。
3. 已存在时切换到 `/chat`，不存在时创建 `/chat` 标签。
4. ChatSider 清理内部未发送输入并保持空白新会话。
5. `/chat` 使用独立空白 `BChat`，不接收侧栏草稿内容。

### `/chat` 升级为持久化会话

1. `/chat` 中的用户首次发送消息。
2. `BChat` 创建会话 A 并发布 `session-created`。
3. Chat 页面记录 A 的 ID、初始标题和当前运行状态，但不在运行中立即销毁当前 KeepAlive 实例。
4. 当前生成流程进入 Session actor 的 `idle` 状态后：
   - 将 `chat:new` 标签在原位置替换为 `chat:A`。
   - 把路径改为 `/chat/A`。
   - 把运行时状态和控制入口迁移到 `chat:A`。
   - 使用 `router.replace` 更新当前路由。
5. 自动标题持久化完成后，通过应用级会话标题事件更新 `chat:A` 的标签标题。标题同步不依赖升级前的 Chat 页面继续挂载。

升级失败时保留可恢复的 `/chat` 页面与已创建会话信息，不创建第二个聊天实例。

### 在聊天页创建会话分支

1. 用户在 `/chat/A` 从消息创建分支 C。
2. `BChat` 发布 C 的 `session-created`。
3. 因当前路由已有 A，Chat 页面把该事件识别为分支创建，而不是草稿升级。
4. 保留 `/chat/A` 及其缓存状态。
5. 新建并切换到 `/chat/C`。

### 在聊天页执行 `/new`

1. 用户在 `/chat/A` 执行 `/new`。
2. `BChat` 只发布新会话导航请求，不先清空 A 的消息。
3. Chat 页面响应 `new-session`。
4. 保留 `/chat/A` 标签和 A 的本地消息。
5. 已存在 `chat:new` 时切换到 `/chat`；否则创建并切换到 `/chat`。
6. 目标 `/chat` 实例自行初始化或重置空白草稿。

实现时应让页面壳决定跨标签的新会话导航，避免先清空 A 再把已清空的实例长期缓存。

### 后台会话需要处理

1. A 在非激活标签中运行。
2. Session actor 进入 `waitingForUser`。
3. A 的注册状态更新为 `waiting`。
4. HeaderTabs 显示橙色状态，不弹出全局消息。
5. 用户点击对应标签后进入 `/chat/A`，在原 `BChat` 中完成确认或回答。

### 关闭或删除运行中会话

1. 关闭标签入口查询聊天标签运行状态。
2. `running` 或 `waiting` 时显示终止确认。
3. 用户确认后调用该标签注册的终止控制器，只有终止成功后才继续关闭标签。
4. SessionHistory 接收宿主提供的忙碌会话 ID；对应删除按钮直接禁用。
5. 空闲会话删除成功后移除对应标签与 KeepAlive cache key。

## 标签 Store 变更

现有 `src/stores/workspace/tabs.ts` 需要增加原子标签替换能力，用于 `/chat` 升级：

- 保留原标签数组位置。
- 替换 `id`、`path`、`title` 和 `cacheKey`。
- 迁移 dirty、missing 等按标签 ID 记录的状态，即使聊天标签当前不使用这些状态。
- 从 `cachedKeys` 移除旧 cache key，并加入新 cache key。
- 单次持久化最终状态，避免 UI 短暂出现新旧两个标签。

通用替换动作不包含聊天路由知识，聊天字段由调用方构造。

## 错误处理

- 路由导航失败：保留 ChatSider 当前会话与输入状态。
- Runtime 终止失败：保留待关闭标签，向用户显示错误。
- 会话删除失败：保留标签，沿用 SessionHistory 的错误提示。
- `/chat` 升级失败：不删除草稿标签；允许用户继续查看当前内容或重试导航。
- 标签状态注册表缺失控制器：关闭运行中标签时按失败处理，不能绕过终止保护。

所有新增异步流程使用 `src/utils/asyncTo.ts` 归一化错误，不手写异步 `try/catch`。

## 测试设计

### 路由与辅助函数

- `/chat` 和 `/chat/:sessionId` 正确注册。
- 标签 ID、cache key、标题和图标正确解析。
- 聊天路径构建、会话 ID 解析和标签查找覆盖草稿与持久化会话。
- 重复导航按已到达目标处理；中止或取消导航必须阻断后续会话归属变更。

### ChatSider

- Header 打开已有会话并在导航成功后重置侧栏。
- Header 打开或复用唯一 `/chat`。
- 导航失败时保留当前会话。
- 未发送草稿不迁移，侧栏输入被清理。
- 点击已打开的 A 时切换 `/chat/A`，侧栏 B 保持不变。
- 点击暂时由 `/chat` 持有的 A 时切换 `/chat`，侧栏 B 保持不变。
- 点击未打开的 A 时仍在侧栏切换。
- 删除会话成功后关闭对应标签。
- `running` 和 `waiting` 会话的删除按钮禁用，不调用删除接口。
- 空闲会话删除成功后关闭对应聊天标签。
- 标准 Owner 查询同时覆盖普通 `chat:<sessionId>` 标签和暂时持有真实会话的 `chat:new`。
- 侧栏忙碌时打开按钮禁用。

### Chat 页面

- `/chat` 向 `BChat` 传入 `null`。
- `/chat/A` 向 `BChat` 传入 A。
- 聊天页不声明 `sessionId` Props，聊天路由也不配置页面 Props。
- 切换全局路由后，已创建并缓存的聊天页实例仍保持创建时捕获的会话 ID。
- 草稿首次创建会话后等待安全状态再升级路由和标签。
- 草稿升级迁移运行时状态且不留下 `chat:new`。
- 自动标题更新对应标签。
- `/chat/A` 创建分支 C 时保留 A 并打开 `/chat/C`。
- `/chat/A` 执行 `/new` 时保留 A 并打开或复用 `/chat`。
- `/new` 导航过程中不清空 A 的缓存消息。
- `BChat` 不包含宿主判断属性，`resetDraft()` 不发布新会话事件。

### HeaderTabs 与运行时状态

- 五种状态按预期渲染，优先级正确。
- 状态图标通过配置映射渲染，活动状态判断在运行时模块集中维护。
- 后台完成产生未读状态，激活标签后清除。
- `waiting` 只更新对应顶部标签状态，不产生全局消息。
- 运行中关闭需要终止确认。
- 终止成功后继续既有关闭计划；取消或失败时保留标签。
- 批量关闭只确认一次，并在全部目标 Runtime 终止成功后应用关闭计划。
- 运行时状态不写入持久化 Tab 数据。
- 重启恢复只绑定已有顶部聊天标签或唯一 `chat:new`，不会把 ChatSider Runtime 误登记为顶部标签。
- 关闭守卫独立覆盖单个/批量 Runtime 确认、终止失败、用户取消和未保存确认。

### 标签 Store

- 原子替换保持标签顺序。
- 正确替换 ID、路径、标题和 cache key。
- 正确迁移按标签 ID 保存的状态。
- 持久化结果中不存在旧标签和旧 cache key。

### 回归验证

- ChatSider 原有会话创建、切换、标题编辑和历史刷新行为保持通过。
- 普通文件、设置、WebView 和 Widget 标签关闭行为不受聊天终止保护影响。
- 执行相关 Vitest、ESLint、Stylelint 和 TypeScript 检查。
- 在 `changelog/2026-07-21.md` 记录实现内容。

## 验收标准

- 用户能从 ChatSider Header 打开已有会话或空白聊天页。
- 多个持久化会话可以同时显示为独立顶部标签。
- `/chat` 首次发送后稳定升级为 `/chat/:sessionId`，没有重复标签或中断的流式响应。
- ChatSider 不会加载已由聊天标签持有的会话。
- 后台聊天的运行、等待、失败和完成状态在 HeaderTabs 可见。
- 等待用户处理的后台会话可从顶部橙色状态识别并返回正确标签。
- 运行或等待中的会话不能被直接关闭，也不能从历史列表删除。
- 删除会话后对应聊天标签和 KeepAlive 缓存同步移除。
- 会话分支打开新标签，`/new` 打开唯一空白聊天标签。
- ChatSider 只消费标准化 Owner，不再判断标签和运行时记录的联合结构。
- HeaderTabs 的关闭执行流程不再内嵌 Runtime 与未保存确认细节。
- 工作区只有代码、测试、设计文档与 changelog 变更，不包含 Git 提交。

## 重构边界

- 本轮只标准化 ChatSider 会话 Owner，并抽离 HeaderTabs 关闭守卫。
- 不调整 ChatPage 草稿晋升状态机。
- 不迁移 `normalizeRouteParam`，不扩展聊天路由辅助函数职责。
- 重构不得改变任何导航、删除、终止、未保存确认或 Runtime 状态行为。
