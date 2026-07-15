# Skill 与 Widget 资源懒加载设计

## 背景

当前 Skill Store 与 Widget Store 在初始化阶段扫描资源目录时会立即读取并解析全部入口文件，同时目录监听会把文件内容变化直接写入 Store。聊天发送前还会重新扫描磁盘，工具执行前也会再次读取目标文件。

新的目标是把资源生命周期改为“目录索引先行、内容首次使用时加载”：应用启动只发现 Skill 与 Widget 目录；任何业务第一次使用资源时统一通过 Store 读取并缓存内容；同一应用生命周期内不再重复读取已经加载的入口文件。

## 目标

- 应用初始化只扫描 `.agents/skills/*` 与 `.tibis/widgets/*` 的一级资源目录，不读取入口文件内容。
- Skill Store 与 Widget Store 同时维护目录索引、启用状态、入口文件原文和解析结果。
- 设置列表、聊天工具、详情页和编辑器统一通过 Store 获取入口文件内容。
- 相同资源的并发首次加载只产生一次磁盘请求。
- 应用内保存或接受外部修改后立即更新 Store 缓存。
- 保留 Widget 编辑器现有的草稿恢复、保存基线与冲突确认行为。

## 非目标

- 不持久化入口文件内容缓存；应用重启后重新进入未加载状态。
- 不通过全局资源目录监听刷新已经加载的文件内容。
- 不把 Skill 目录中的辅助文件全部缓存到 Store；只有入口 `SKILL.md` 属于 Skill 内容缓存。
- 不合并 Skill Store 与 Widget Store；两者保留独立的领域类型和行为。
- 本设计不改变 Skill 或 Widget 文件格式。

## 核心决策

### 统一资源 Entry

Store 使用统一 Entry 同时表达目录索引和可选内容缓存，不维护额外的 `loaded` 布尔值。

```ts
/** Skill 目录索引与内容缓存。 */
interface SkillEntry {
  /** 资源目录名，用作内部稳定 ID。 */
  id: string;
  /** Skill 资源目录绝对路径。 */
  dirPath: string;
  /** Skill 入口文件绝对路径。 */
  filePath: string;
  /** 是否启用。 */
  enabled: boolean;
  /** 完整 SKILL.md 原文；undefined 表示尚未成功加载。 */
  sourceContent?: string;
  /** 入口文件解析结果。 */
  definition?: SkillDefinition;
  /** 最近一次读取失败信息；成功加载后清除。 */
  loadError?: string;
  /** 防止迟到请求覆盖保存或删除结果的内部修订序号。 */
  revision: number;
}
```

Widget 使用等价的 `WidgetEntry`，其中 `sourceContent` 保存完整 `widget.json` 原文，`definition` 保存 `WidgetDefinition`。

必须保持以下不变量：

- `sourceContent === undefined` 表示尚未成功读取；不能使用字符串真值判断，因为空字符串也是已经读取的内容。
- 成功读取后同时写入 `sourceContent` 与 `definition`，即使解析结果包含 `parseError`。
- 读取失败时保留 `sourceContent === undefined`，记录 `loadError`，允许下次调用重试。
- Entry 的 `enabled` 是启用状态的唯一事实源；解析结果不负责管理启用状态。

### 稳定标识

- Skill 与 Widget 的内部 ID 都来自一级资源目录名。
- 设置页路由、切换启用状态、删除资源和 Store 查找均使用目录 ID。
- Skill frontmatter 的 `name` 继续用于展示和聊天 Skill 工具参数。
- Widget 的展示名称继续来自 `widget.json`，内部 ID 仍为目录名。
- Skill 禁用状态改为按目录 ID 持久化；兼容读取旧的按名称禁用记录，并在资源首次加载后迁移。
- 设置页可展示多个 frontmatter 同名但目录 ID 不同的 Skill；聊天工具目录继续按解析后的 Skill 名称去重，保持现有工具调用语义。

## 公共共享请求 Class

新增 `src/utils/sharedRequest.ts`，提供与业务无关的按键请求共享能力。

```ts
/**
 * 按资源键共享正在执行的异步请求。
 */
export class SharedRequest<Key, Result> {
  /** 正在执行的请求。 */
  private readonly pendingRequests = new Map<Key, Promise<Result>>();

  /**
   * 创建共享请求实例。
   * @param handler - 实际异步请求处理函数
   */
  public constructor(private readonly handler: (key: Key) => Promise<Result>) {}

  /**
   * 执行请求，相同 Key 的并发调用共享同一个 Promise。
   * @param key - 请求资源键
   * @returns 请求结果
   */
  public fetch(key: Key): Promise<Result> {
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending;
    }

    const current = Promise.resolve()
      .then((): Promise<Result> => this.handler(key))
      .finally((): void => {
        if (this.pendingRequests.get(key) === current) {
          this.pendingRequests.delete(key);
        }
      });

    this.pendingRequests.set(key, current);
    return current;
  }
}
```

`SharedRequest` 只共享执行中的 Promise，并在成功或失败后清理；它不缓存成功结果。长期内容缓存由 Store Entry 的 `sourceContent` 表达。

Skill Store 与 Widget Store 分别创建自己的 `SharedRequest<string, Entry>` 实例。不同 ID 可以并行加载，相同 ID 的并发调用复用同一个 Promise。

## Store API

Skill Store 提供以下主要能力：

```ts
fetchSkill(id: string): Promise<SkillEntry>;
fetchAllSkills(): Promise<PromiseSettledResult<SkillEntry>[]>;
updateSkillContent(id: string, sourceContent: string): SkillEntry;
```

Widget Store 提供对称能力：

```ts
fetchWidget(id: string): Promise<WidgetEntry>;
fetchAllWidgets(): Promise<PromiseSettledResult<WidgetEntry>[]>;
updateWidgetContent(id: string, sourceContent: string): WidgetEntry;
```

`fetch` 在本项目中的明确语义是“取得资源内容”：

1. Entry 已有 `sourceContent` 时立即返回缓存。
2. Entry 未加载时通过 `SharedRequest.fetch(id)` 发起首次读取。
3. Entry 正在加载时复用同一个 Promise。
4. 读取成功后解析原文并更新 Entry。
5. 读取失败时拒绝本次 Promise，但不形成长期内容缓存。

`fetchAllSkills()` 与 `fetchAllWidgets()` 内部使用 `Promise.allSettled()`，保证单个资源读取失败不会阻塞其他资源。

Store 还应保留目录索引、初始化等待、启用状态、按 ID 查找、删除及创建流程需要的接口。现有 `syncFromDisk()`、`resolveLatestEnabledSkill()` 与 `resolveLatestEnabledWidget()` 不再承担内容刷新职责，由新的 `fetch` API 替代。

## 初始化与目录监听

### 初始化顺序

默认布局中的 `useSkillInit` 与 `useWidgetInit` 继续拥有应用级资源生命周期：

1. setup 阶段调用 Store 初始化屏障。
2. mounted 阶段先订阅资源目录事件。
3. 注册对应资源根目录监听。
4. 扫描资源根目录的一级非隐藏子目录。
5. 为每个目录创建不含内容的 Entry。
6. 完成初始化屏障。

初始化扫描不得读取 `SKILL.md` 或 `widget.json`。安装事务恢复仍可读取 `.install-*.json` 事务记录；资源入口文件是否存在、是否可读以及内容是否有效，都推迟到首次 `fetch` 时判断。

### 目录事件

主进程目录监听补充一级子目录的 `addDir` 与 `unlinkDir` 事件，并通过通用目录事件通道发送给渲染进程。Hook 只处理目录路径和事件类型，不读取或解析文件内容。

- 新增一级非隐藏目录：添加未加载 Entry。
- 删除目录：删除 Entry 及其内容缓存。
- 重命名目录：表现为删除旧 ID、添加新 ID。
- 嵌套目录：不创建独立资源 Entry。
- `.tmp-*`、`.bak-*` 及其他隐藏目录：继续忽略。
- 普通文件内容变化：全局资源目录监听不处理。

监听器必须先于目录扫描建立，使监听注册前后的目录变化最终能被事件或随后的完整目录扫描覆盖。异步 mounted 流程增加卸载标记，避免组件在等待监听注册期间卸载后遗留 watcher。

## 消费点数据流

### 设置列表

Skill 和 Widget 设置列表进入页面后：

1. 等待目录索引初始化完成。
2. 调用对应的 `fetchAll*()`。
3. 使用 Entry 中的解析结果展示名称、描述和解析错误。
4. 单个资源读取失败时展示该 Entry 的 `loadError`，其他资源继续显示。

设置列表本身属于资源消费者，因此允许它首次加载全部资源。

### 聊天工具构建与执行

聊天构建工具快照前：

1. 等待 Skill 与 Widget 目录索引初始化。
2. 并行调用 `fetchAllSkills()` 与 `fetchAllWidgets()`。
3. 使用已启用、已成功读取且无解析错误的 Entry 构建工具描述。
4. 根据已加载 Skill 的内容 hash 构建运行时版本映射。

具体工具执行时再次调用 `fetchSkill(id)` 或 `fetchWidget(id)`。正常情况下直接返回构建工具阶段形成的 Store 缓存，不再读取磁盘。

由此移除“聊天发送前全量重新扫描内容”和“工具执行前强制重新读盘”的旧语义。外部程序在资源首次加载后直接修改文件，不会自动改变当前应用生命周期内的聊天资源快照。

### Skill 详情页

- Skill 详情路由改用目录 ID 查找 Entry。
- 进入页面调用 `fetchSkill(id)`。
- 页面标题、描述、解析错误和 `SKILL.md` 预览使用 Entry 中的缓存。
- `SkillPreview` 浏览 Skill 目录的其他辅助文件时继续按选中文件直接读盘；辅助文件不进入全局 Skill Store。
- 切换启用状态继续直接更新 Entry 的 `enabled`。

### Widget 编辑器

`src/views/widget/hooks/useSession.ts` 调整为：

1. 根据路由 ID 调用 `fetchWidget(id)`。
2. 使用 Entry 的 `sourceContent` 构造页面初始文件状态，不再为 `widget.json` 重复调用 `native.readFile()`。
3. 继续使用最近文件记录中的草稿和保存基线执行现有协调流程。
4. 保留活跃编辑器自己的文件监听、外部修改确认和文件缺失处理；文件 watcher 注册时的初始 `add` 事件不得再次读取已经由 Store 提供的入口内容。
5. 保存成功后调用 `updateWidgetContent()`。
6. 用户接受外部文件修改后同样调用 `updateWidgetContent()`。

如果 Widget 在打开编辑器之前已被设置列表或聊天加载，编辑器使用的是同一应用生命周期内的 Store 快照；这是本设计的预期缓存语义。

### Skill 编辑保存

Skill 入口文件可能通过通用 Markdown 编辑器打开。为避免通用编辑器直接依赖 Skill Store，文件保存流程发布通用的“文件内容已保存”事件，载荷包含文件路径和已保存内容。

Skill 资源生命周期层订阅该事件；当保存路径匹配某个 Skill Entry 的 `filePath` 时，调用 `updateSkillContent()` 更新原文、解析结果和内容 hash。保存内容本身已经可用，因此即使该 Entry 原先尚未加载，也可以直接形成首次内容缓存，无需再次读盘。

Widget 专用编辑器可以直接更新 Widget Store，同时也可以复用相同保存事件；实现时只能选择一个写回入口，避免重复解析。

## 缓存生命周期

- Store 内容缓存只存在于当前应用进程生命周期。
- 首次加载前的磁盘修改会在首次 `fetch` 时读取到。
- 首次加载后的外部磁盘修改默认不使缓存失效。
- 活跃编辑器检测到外部修改且用户接受时，使用接受的内容更新缓存。
- 应用内成功保存时立即更新缓存。
- 资源目录删除时删除缓存。
- 资源目录重命名时旧 ID 缓存删除，新 ID 从未加载状态开始。
- 应用重启后所有 Entry 重新从目录索引和未加载状态开始。

## 并发与迟到结果保护

`SharedRequest` 只解决同 ID 并发读取去重，Store 仍负责领域状态的写回顺序。

每个 Entry 使用内部 `revision`：

1. 首次读取开始时捕获当前 revision 与 Entry 身份。
2. 应用内保存、接受外部修改、目录删除或同 ID Entry 替换时递增 revision。
3. 读取完成后只有 Entry 仍存在、身份相同且 revision 未变化时才能写回。
4. 迟到读取若已被新保存覆盖，返回当前最新 Entry，不覆盖缓存。
5. 目录已经删除时拒绝或返回资源不存在错误，不能重新插入 Entry。

## 错误处理

- 目录扫描失败：记录错误、完成初始化屏障，并允许应用以空资源列表运行。
- 入口文件不存在或读取失败：设置 `loadError`，保持 `sourceContent === undefined`，下次调用可以重试。
- 入口文件解析失败：缓存原文和带 `parseError` 的解析结果，避免反复读取；设置页展示错误，聊天工具排除资源。
- 批量加载：使用 `Promise.allSettled()` 隔离单个资源失败。

## 后续调整：Store 获取 API 与错误边界

本节覆盖上文所有 `fetchSkill`、`fetchWidget`、`fetchAllSkills`、`fetchAllWidgets` 及“读取失败时拒绝 Promise”的旧描述。

- 单项异步获取统一命名为 `getSkill(id)` 与 `getWidget(id)`。
- 批量异步获取统一命名为 `getSkills()` 与 `getWidgets()`。
- 同步索引查询 `getSkillById()`、`getSkillByName()`、`getWidgetById()` 保持不变。
- Store 使用 `asyncTo()` 捕获共享首次读取请求的异常；读取失败时更新 Entry 的 `loadError` 并返回当前 Entry，不向消费层抛出读取异常。
- 请求的目录 ID 不存在时返回 `undefined`；成功或读取失败但目录仍存在时返回对应 Entry。
- `getSkills()` 与 `getWidgets()` 返回当前存在的 Entry 数组，单项读取失败通过该 Entry 的 `loadError` 表达，不返回 `PromiseSettledResult`。
- Skill 详情、Widget 编辑器、聊天运行时和工具执行层不再为入口读取编写 `try/catch` 或判断 `PromiseSettledResult.status`。
- 已由资源目录 watcher 替代的 `onSkillChanged`、`skill:changed`、`watchDirectory()` 与 `unwatchDirectory()` 整条旧监听链删除。
- 更新缓存：始终用与解析器相同的逻辑重新生成解析结果与内容 hash，避免原文和定义不一致。
- 删除与加载竞争：使用 Entry 身份和 revision 阻止迟到写回。

## 测试策略

### 公共工具

为 `SharedRequest` 覆盖：

- 相同 Key 的并发调用共享同一个 Promise。
- 不同 Key 独立并行。
- 成功结束后清除进行中请求。
- 失败结束后清除进行中请求并允许重试。
- handler 同步抛出时转换为被拒绝的 Promise。

### Scanner 与初始化 Hook

- 初始化扫描只读取一级目录，不读取 `SKILL.md` 或 `widget.json`；安装事务恢复可以读取事务记录。
- 隐藏目录和安装事务临时目录被忽略。
- 目录监听先于初始扫描建立。
- 新增、删除和重命名目录正确更新 Entry。
- 内容 change 事件不触发资源解析。
- mounted 异步流程中卸载不会遗留监听。

### Skill 与 Widget Store

- 初始化后 Entry 不含 `sourceContent`。
- 第一次 `fetch` 读取并缓存原文与解析结果。
- 重复 `fetch` 不再读取磁盘。
- 相同 ID 并发 `fetch` 只读取一次。
- `fetchAll*()` 隔离单个失败。
- 读取失败不形成内容缓存且下次可以重试。
- 解析失败形成内容缓存并保留诊断信息。
- 应用内保存更新原文、解析结果和 hash。
- 较早读取不会覆盖较新的保存结果。
- 目录删除期间完成的读取不会恢复已删除 Entry。
- 禁用状态按目录 ID 持久化，并兼容旧 Skill 名称记录。

### 消费点

- 设置列表进入时调用 `fetchAll*()` 并显示加载结果。
- 聊天构建工具前加载全部资源，工具执行复用缓存而不再次读盘。
- Skill 内容 hash 使用 Store 当前缓存，并在应用内保存后更新。
- Skill 详情页通过 Store 取得 `SKILL.md`，辅助文件按需读盘。
- Widget 编辑器通过 Store 取得入口内容，保留草稿协调。
- Widget 文件 watcher 的初始事件不会造成第二次入口文件读取。
- Widget 保存和接受外部修改后更新 Store。
- 通用编辑器保存 Skill 入口文件后通过保存事件更新 Skill Store。

### 仓库检查

实现完成后执行相关 Vitest，并运行：

```bash
pnpm lint
pnpm lint:style
pnpm exec tsc --noEmit
git diff --check
```

## 预期结果

完成后，Skill 与 Widget 的目录发现不再产生入口文件读取开销；内容只在设置列表、聊天、详情页或编辑器首次使用时加载。同一资源的并发加载会共享请求，成功内容在 Store 中复用，应用内修改会显式更新缓存，而外部修改不会在当前应用生命周期内隐式替换已经加载的资源快照。
