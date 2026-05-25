# Skill 创建功能设计

## 概述

在 Skill 设置页新增"创建技能"入口，用户上传 `.skill` 或 `.zip` 文件，经前端解析预览后安装到 `.agents/skills/` 目录。

## 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 文件格式 | `.skill` / `.zip` 均为 zip 包 | 后缀只是约定，内部结构相同 |
| 包结构 | 单 Skill：`<name>/SKILL.md` + 可选资源文件 | 一次导入一个 Skill，简单直接 |
| 解压位置 | 前端 Worker | 避免阻塞主线程，利用 Vite `new Worker()` module 支持 |
| 解压库 | JSZip | 纯前端解压，轻量 |
| 交互流程 | 上传 → 预览确认 → 安装 | 用户可提前看到 Skill 信息，避免误装 |
| 安装方式 | 临时目录写入 → rename 到目标 | 保证原子性，中途失败不留残缺目录 |
| 冲突处理 | 提示覆盖确认 | 充分告知用户，避免意外覆盖 |
| Worker 生命周期 | 模态框打开时创建，关闭时终止 | 明确所有权，避免内存泄漏 |
| 中断处理 | 关闭模态框时立即 terminate Worker | 避免解析中关闭导致 Worker 继续运行 |

## 包格式规范

### 内部结构（zip）

```
<skill-name>/
├── SKILL.md          # 必需，含 YAML frontmatter（name, description 必填）
├── templates/        # 可选，模板文件
├── examples/         # 可选，示例文件
└── ...               # 其他可选资源
```

### SKILL.md 格式

复用现有 `parseSkillMarkdown` 解析器（`src/ai/skill/parser.ts`），校验规则：
- **`name`**：必填，字符串，skill 唯一标识
- **`description`**：必填，字符串，触发场景描述
- 缺少任一必填字段 → `parseError` 非空，Worker 返回错误

### 大小限制

| 层级 | 检查点 | 阈值 | 行为 |
|------|--------|------|------|
| zip 整体 | 文件选择后 `File.size` | 5 MB | 超过则拒绝 |
| 单条目 | Worker 内解压后字节数 | 1 MB | 超过则拒绝整个包 |
| SKILL.md 内容 | `parseSkillMarkdown` 截断 | 10000 字符 | 截断 + 提示完整路径 |
| 条目总数 | Worker 内计数 | 50 | 超过则拒绝 |

### 安全校验

**Zip Slip 防护**（Worker 内）：

- 路径必须以 `<skill-name>/` 开头（即解压根目录第一级为 skill 目录名）
- 路径不得包含 `../` 或 `..\`
- 不满足任一条件 → Worker 返回错误，拒绝整个包

**文件类型校验**（Worker 内，先于解压）：

- `.skill` 文件无标准 MIME 类型，`accept=".skill,.zip"` 在部分 OS 中可能不生效
- Worker 在 `JSZip.loadAsync` 之前先检查 ArrayBuffer 前 4 字节是否为 `PK\x03\x04`（zip magic bytes）
- 不是 zip → 返回错误 "不支持的文件格式，仅支持 .skill 和 .zip（ZIP 格式）"

**路径校验**（主进程 ensureDir）：

- `fs:ensureDir` handler 接受的路径必须包含 `/.agents/` 或 `\\.agents\\`，否则拒绝
- 防止主进程被用来在任意路径创建目录

## UI 设计

### 入口

Skill 设置页 `#headerExtra` 插槽新增"创建技能"按钮，与 MCP 设置页"添加"按钮风格一致。

### 模态框三步骤

**步骤 1 — 上传区域**

- 自定义拖拽区域：监听 `dragover`/`drop` 事件，过滤 `.skill,.zip` 文件
- BUpload 组件仅作为点击触发的文件选择器（`accept=".skill,.zip"`），隐藏其默认样式
- BUpload 不原生支持拖拽，拖拽逻辑需在 SkillCreatorModal 中自建（监听 `dragenter`/`dragover`/`dragleave`/`drop`）
- 显示支持格式和大小限制提示
- 文件选择后立即校验大小，不合法则 message 提示

**步骤 2 — 解析中**

- Worker 在后台解压解析
- 模态框展示 loading 态（ASpin + "正在解析…"）
- 用户关闭模态框 → 立即 terminate Worker 并中止

**步骤 3 — 预览确认**

- 展示 Skill 名称、描述
- SKILL.md 内容预览（可滚动，等宽字体，最大高度 200px）
- 内容被截断时在预览区顶部显示醒目的黄色警告条
- 附带资源文件列表
- 同名冲突警告："xxx 已存在，安装将覆盖原有内容"（仅在 `store.skills` 中已存在时显示）
- 两个按钮：取消 / 确认安装

## 数据流

```
选择文件 (BUpload)
  → 主线程校验 File.size ≤ 5MB
  → 创建 Worker，postMessage(ArrayBuffer)
  → Worker:
    → JSZip.loadAsync
    → Zip Slip 安全校验（路径穿越检测）
    → 校验条目数 ≤ 50
    → 遍历条目：校验单文件 ≤ 1MB
    → 找到 <name>/SKILL.md，parseSkillMarkdown()
    → 收集附属资源文件 { path, content }
    → postMessage({ skill, resources, warnings })
  → 主线程接收 → 渲染预览
    → 截断发生时在预览 UI 显眼位置展示警告
  → 用户确认安装（原子性）：
    → IPC ensureDir(.agents/skills/.tmp-<id>/)
    → IPC writeFile(SKILL.md + 资源文件) 到临时目录
    → 如有同名目标 → renameFile(目标 → .bak-<id>/) 备份
    → renameFile(.tmp-<id>/ → 目标/)
    → 成功 → trashFile(.bak-<id>/) + rescan
    → 失败 → restore .bak-<id>/ → 目标 + trashFile .tmp-<id>/ + 报错
  → 用户关闭/取消：
    → 如步骤 2 → terminate Worker
    → 如步骤 3 → 直接关闭，不触发安装
  → Worker 异常（onerror）→ message 提示 + resetState
```

### Worker 通信协议

Worker 文件：`src/ai/skill/installer.worker.ts`

```typescript
// 主线程 → Worker
worker.postMessage({ type: 'parse', buffer: arrayBuffer }, [arrayBuffer]);

// Worker → 主线程（成功）
{ type: 'success', skill: SkillDefinition, resources: ResourceFile[], warnings: string[] }
// Worker → 主线程（失败）
{ type: 'error', error: string }
```

使用 `Transferable` 传递 ArrayBuffer 避免拷贝。

### Worker 实现细节

**加载方式**（项目中无 Worker 先例，此为首次引入）：

```typescript
// SkillCreatorModal.vue 中
const worker = new Worker(
  new URL('@/ai/skill/installer.worker.ts', import.meta.url),
  { type: 'module' }
);
```

Vite 原生支持 `new URL(..., import.meta.url)` 模式的 Worker，开发环境和生产构建均可正常工作。`type: 'module'` 允许 Worker 内使用 ES module import。

**依赖打包**：

Worker 内 `import JSZip from 'jszip'` 和 `import { parseSkillMarkdown } from './parser'`（含 `js-yaml` 传递依赖）均由 Vite 自动打包到 Worker bundle，无需额外配置。`parseSkillMarkdown` 的 `filePath` 参数在 Worker 中传 `/<skillDirName>/SKILL.md`（虚拟路径），仅用于推导 `dirPath`（`/<skillDirName>`）和截断提示文本；安装时由 `buildSkillMd()` 重建完整 Markdown 写入真实磁盘路径。

**生命周期**（详见数据流图）：
- 模态框 `visible` 变为 `true` → 不创建 Worker（延迟到文件选择后）
- 用户选择文件 → `terminateWorker()` 清理旧实例 → `createWorker()` 新建
- 用户关闭模态框（`visible` 变为 `false`）→ `watch(visible)` 触发 `terminateWorker()` + 重置状态
- 解析中关闭 → `worker.terminate()` 立即中止，`onmessage` 不再触发

### 安装原子性

采用"备份 → 替换 → 清理或回滚"策略，消除 TOCTOU 竞态：

```
1. 在 .agents/skills/ 下创建临时目录 .tmp-<nanoid(8)>
2. 写入 SKILL.md + 所有资源文件到临时目录
3. 如目标 .agents/skills/<name>/ 已存在：
   renameFile(<name>/ → .bak-<nanoid(8)>/)  // 备份
4. renameFile(.tmp-<id>/ → <name>/)          // 替换
5. 成功 → trashFile(.bak-<id>/)              // 清理备份
   失败 → renameFile(.bak-<id>/ → <name>/)   // 回滚
         trashFile(.tmp-<id>/)               // 清理临时
         报错
```

- 任意步骤失败 → 孤儿 `.tmp-*` / `.bak-*` 目录遗留
- 下次 `scanSkills()` 调用时（应用启动或手动 rescan）：扫描前先 `trashFile` 清理所有 `.tmp-*` 和 `.bak-*` 目录
- 同时 `scanDirectory` 中过滤 `.` 开头的目录名，防止孤儿目录被当作 skill 解析

### Worker 生命周期

```
模态框打开（visible true） → 不创建 Worker
用户选择文件且大小校验通过 → 创建 Worker（懒初始化）
解析完成（成功/失败） → 保留 Worker 引用供后续可能的重新选择
模态框关闭 → terminate Worker + 置 null
```

- 用户重新选择文件 → `terminateWorker()` 清理旧实例 → `createWorker()` 新建（不复用）
- 步骤 2（解析中）用户关闭模态框 → `worker.terminate()` 立即中止
- 模态框关闭时始终清理 Worker

## 文件变更

### 新增文件

- `src/views/settings/tools/skill/components/SkillCreatorModal.vue` — 模态框（三步骤 UI + Worker 管理）
- `src/ai/skill/installer.worker.ts` — Web Worker（JSZip 解压 + 安全校验 + 解析）

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/views/settings/tools/skill/index.vue` | `#headerExtra` 加"创建技能"按钮，引入模态框 |
| `src/ai/skill/scanner.ts` | `scanDirectory` 中过滤 `.` 开头的目录名，避免临时/备份目录被误解析 |
| `electron/main/modules/file/ipc.mts` | 新增 `fs:ensureDir` handler（`fs.promises.mkdir` recursive，路径须含 `/.agents/`） |
| `electron/preload/index.mts` | 暴露 `ensureDir` 方法 |
| `types/electron-api.d.ts` | 新增 `ensureDir` 类型声明 |
| `package.json` | 新增 `jszip` 依赖 |

## 测试要点

- 正常 `.zip` / `.skill` 上传预览安装
- 超大文件（>5MB）拒绝
- zip 条目过多（>50）拒绝
- 单文件过大（>1MB）跳过并警告
- SKILL.md 缺 name/description → 解析错误提示
- 缺少 SKILL.md → 明确报错
- zip slip 路径穿越 → 拒绝（`../../etc/passwd` 等）
- 同名 Skill 冲突 → 覆盖确认
- 不含资源文件的纯 SKILL.md → 正常安装
- Worker 异常 → 主线程捕获展示错误
- 写盘失败 → 错误提示 + 清理临时文件
- 步骤 2 关闭模态框 → Worker 被终止
- 非 zip 文件（magic bytes 不匹配）→ 拒绝
- 安装中途强制关闭模态框 → 孤儿 `.tmp-*` 目录在下次启动时自动清理
- 孤儿 `.bak-*` 目录在下次启动时自动清理
