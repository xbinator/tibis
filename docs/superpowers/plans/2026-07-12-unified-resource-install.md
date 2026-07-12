# Skill 与 Widget 统一安装事务 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Skill 与 Widget 共用一个可配置的原子目录安装器，并同步 Logger 刷新测试及筛选控件尺寸。

**Architecture:** 通用安装器位于 `src/utils/file`，只依赖注入的文件 API，通过 `conflictStrategy` 表达覆盖或拒绝。安装阶段通过事件回调交给共享日志适配器，Skill 与 Widget 只负责构造文件列表和处理安装后的 Store/导航行为。

**Tech Stack:** Vue 3、TypeScript、Electron preload API、Vitest、Vue Test Utils、Less。

**Implementation status:** 已实现。最终实现增加了主进程跨窗口安装锁、持久化事务恢复，并复用 `src/shared/workspace/pathUtils.ts` 统一 UNC 路径拼接和跨平台安全相对路径校验；这些稳定性增强优先于下方最初计划中的“无需新增 IPC”假设。

---

### Task 1: 通用目录安装器

**Files:**
- Create: `src/utils/file/directory.ts`
- Create: `test/utils/file/directory.test.ts`

- [ ] **Step 1: 写入失败测试**

测试定义期望 API：

```ts
await installDirectory({
  api,
  targetDir: 'C:/Users/test/.agents/skills/demo',
  conflictStrategy: 'replace',
  files: [
    { kind: 'text', relativePath: 'SKILL.md', content: '# Demo' },
    { kind: 'binary', relativePath: 'assets/icon.bin', content: binary }
  ],
  scratchNameFactory: (kind) => (kind === 'temporary' ? '.tmp-test' : '.bak-test'),
  onEvent
});
```

分别验证：文本/二进制写入临时目录、`reject` 不写入、`replace` 备份后激活、`EPERM` 重试、激活失败恢复备份、失败清理临时目录。

- [ ] **Step 2: 运行测试确认 RED**

Run: `pnpm exec vitest run test/utils/file/directory.test.ts`

Expected: FAIL，因为通用安装器尚不存在。

- [ ] **Step 3: 实现最小安装器**

```ts
export type DirectoryInstallConflictStrategy = 'replace' | 'reject';
export type DirectoryInstallFile =
  | { kind: 'text'; relativePath: string; content: string }
  | { kind: 'binary'; relativePath: string; content: ArrayBuffer };

export interface DirectoryInstallerOptions {
  api: DirectoryInstallerAPI;
  targetDir: string;
  conflictStrategy: DirectoryInstallConflictStrategy;
  files: DirectoryInstallFile[];
  scratchNameFactory?: (kind: 'temporary' | 'backup') => string;
  onEvent?: (event: DirectoryInstallEvent) => void | Promise<void>;
}

export async function installDirectory(options: DirectoryInstallerOptions): Promise<void> {
  // 检查冲突 → 写临时目录 → 可选备份 → 激活 → 清理或回滚。
}
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `pnpm exec vitest run test/utils/file/directory.test.ts`

Expected: PASS。

### Task 2: 共享安装日志适配器与 Skill 迁移

**Files:**
- Create: `src/shared/logger/directoryInstall.ts`
- Modify: `src/views/settings/tools/skill/components/SkillCreator.vue`
- Modify: `test/views/settings/tools/skill/skill-creator.test.ts`

- [ ] **Step 1: 修改 Skill 测试形成 RED**

Mock `installDirectory` 并验证 Skill 调用使用：

```ts
expect(installDirectoryMock).toHaveBeenCalledWith(
  expect.objectContaining({
    conflictStrategy: 'replace',
    targetDir: '/Users/test/.agents/skills/demo-skill',
    files: expect.arrayContaining([expect.objectContaining({ kind: 'text', relativePath: 'SKILL.md' })])
  })
);
```

保留 Windows 路径、阶段日志和扫描失败降级测试。

- [ ] **Step 2: 运行 Skill 测试确认 RED**

Run: `pnpm exec vitest run test/views/settings/tools/skill/skill-creator.test.ts`

Expected: FAIL，因为 Skill 仍自行实现目录事务。

- [ ] **Step 3: 迁移 Skill**

Skill 只构造 `SKILL.md` 与资源文件数组，以 `replace` 调用 `installDirectory`；事件回调使用：

```ts
onEvent: (event) => logDirectoryInstallEvent('skill', skillName, event)
```

删除组件内备份、激活、回滚和清理代码。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `pnpm exec vitest run test/utils/file/directory.test.ts test/views/settings/tools/skill/skill-creator.test.ts`

Expected: PASS。

### Task 3: Widget 迁移与降级行为

**Files:**
- Modify: `src/views/settings/tools/widget/index.vue`
- Modify: `test/views/settings/tools/widget/index.test.ts`

- [ ] **Step 1: 扩展 Widget 测试形成 RED**

验证 Widget 调用安装器时使用 `reject`、包含 `widget.json` 与资源文件；安装失败显示原始错误并记录 ERROR；扫描失败仍更新 Store；编辑器打开失败保留已安装 Widget并显示警告。

- [ ] **Step 2: 运行 Widget 测试确认 RED**

Run: `pnpm exec vitest run test/views/settings/tools/widget/index.test.ts`

Expected: FAIL，因为 Widget 仍直接写目录且没有持久化日志。

- [ ] **Step 3: 迁移 Widget**

```ts
await installDirectory({
  api: getElectronAPI(),
  targetDir: widgetDir,
  conflictStrategy: 'reject',
  files: [
    { kind: 'text', relativePath: 'widget.json', content: JSON.stringify(widgetData, null, 2) },
    ...resources.map((resource) => ({ kind: 'binary' as const, relativePath: resource.relativePath, content: resource.content }))
  ],
  onEvent: (event) => logDirectoryInstallEvent('widget', widgetId, event)
});
```

扫描与打开编辑器使用独立降级分支，磁盘成功后不回滚。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `pnpm exec vitest run test/views/settings/tools/widget/index.test.ts`

Expected: PASS。

### Task 4: Logger 刷新测试适配

**Files:**
- Modify: `test/views/settings/logger/index.test.ts`

- [ ] **Step 1: 补充行为测试**

验证“刷新”文本按钮、点击后重载、加载时 disabled 且重复点击不会触发第二次请求。不检查图标、type 或按钮顺序。

- [ ] **Step 2: 运行测试**

Run: `pnpm exec vitest run test/views/settings/logger/index.test.ts`

Expected: PASS；如果旧测试替身未转发 loading，则先看到 disabled 断言失败，再仅修改测试替身。

### Task 5: LogFilterBar 尺寸

**Files:**
- Modify: `src/views/settings/logger/components/LogFilterBar.vue`

- [ ] **Step 1: 写 scoped Less**

使用完整类名和 `:deep` 覆盖 `.ant-select-selector`、`.ant-input-affix-wrapper`、`.ant-picker` 及其输入文字，使三个控件高度为 `28px`、字号为 `12px`。

- [ ] **Step 2: 运行 Stylelint**

Run: `pnpm exec stylelint 'src/views/settings/logger/**/*.{vue,less,css}'`

Expected: PASS。

### Task 6: Changelog 与完整验证

**Files:**
- Modify: `changelog/2026-07-12.md`

- [ ] **Step 1: 更新变更记录**

记录统一目录安装事务、可配置冲突策略、Widget 日志降级、Logger 测试适配和筛选栏尺寸。

- [ ] **Step 2: 运行相关测试**

Run: `pnpm exec vitest run test/utils/file/directory.test.ts test/views/settings/tools/skill/skill-creator.test.ts test/views/settings/tools/widget/index.test.ts test/views/settings/logger/index.test.ts`

Expected: PASS。

- [ ] **Step 3: 运行全量验证**

Run: `pnpm test`

Run: `pnpm exec eslint src --ext .vue,.ts,.tsx,.js,.jsx,.mts`

Run: `pnpm exec stylelint 'src/**/*.{vue,less,css}'`

Run: `pnpm exec tsc --noEmit`

Run: `pnpm build`

Expected: 全部退出码 0；保持工作区未提交。
