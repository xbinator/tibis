# Windows Assisted Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Windows NSIS 安装包启用可选择安装范围和目录的安装向导，同时保留并区分便携版产物。

**Architecture:** 仅使用 electron-builder 26.15.3 原生的 `nsis` 与 `portable` 顶层配置，不增加自定义 NSIS 脚本，也不修改发布工作流。通过 Vitest 读取并解析 `electron-builder.yml`，锁定安装向导行为与两个 Windows 产物的命名规则。

**Tech Stack:** electron-builder 26.15.3、NSIS、YAML、js-yaml、Vitest、TypeScript

---

## 文件结构

- Create: `test/config/electron-builder.test.ts`：解析构建配置并验证 Windows 安装向导及产物命名。
- Modify: `electron-builder.yml`：添加 NSIS 安装向导和便携版专属配置。
- Modify: `changelog/2026-07-11.md`：记录 Windows 安装体验变更。
- Existing: `docs/superpowers/specs/2026-07-11-windows-assisted-installer-design.md`：已批准的设计说明。
- Create: `docs/superpowers/plans/2026-07-11-windows-assisted-installer.md`：本实施计划。

### Task 1: 添加 Windows 安装器配置测试

**Files:**
- Create: `test/config/electron-builder.test.ts`

- [x] **Step 1: 写入失败测试**

```typescript
/**
 * @file electron-builder.test.ts
 * @description 验证 Windows 安装向导和便携版的 electron-builder 配置。
 */
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * NSIS 安装器配置。
 */
interface NsisInstallerConfig {
  /** 是否使用一键安装。 */
  oneClick?: boolean;
  /** 是否允许修改安装目录。 */
  allowToChangeInstallationDirectory?: boolean;
  /** 是否固定为所有用户安装。 */
  perMachine?: boolean;
  /** 是否默认选择所有用户安装。 */
  selectPerMachineByDefault?: boolean;
  /** 是否允许安装器请求管理员权限。 */
  allowElevation?: boolean;
  /** 是否创建桌面快捷方式。 */
  createDesktopShortcut?: boolean;
  /** 是否创建开始菜单快捷方式。 */
  createStartMenuShortcut?: boolean;
  /** 快捷方式名称。 */
  shortcutName?: string;
  /** 安装完成后是否允许启动应用。 */
  runAfterFinish?: boolean;
  /** 安装包产物名称模板。 */
  artifactName?: string;
}

/**
 * 便携版配置。
 */
interface PortableInstallerConfig {
  /** 便携版产物名称模板。 */
  artifactName?: string;
}

/**
 * Windows 构建配置。
 */
interface WindowsInstallerConfig {
  /** Windows 构建目标。 */
  target?: string[];
}

/**
 * 测试所需的 electron-builder 配置结构。
 */
interface ElectronBuilderConfig {
  /** NSIS 安装器配置。 */
  nsis?: NsisInstallerConfig;
  /** 便携版配置。 */
  portable?: PortableInstallerConfig;
  /** Windows 构建配置。 */
  win?: WindowsInstallerConfig;
}

/**
 * 读取 electron-builder YAML 配置。
 * @returns 测试所需的构建配置
 */
function readElectronBuilderConfig(): ElectronBuilderConfig {
  const source = readFileSync(new URL('../../electron-builder.yml', import.meta.url), 'utf8');
  return load(source) as ElectronBuilderConfig;
}

describe('electron-builder Windows installer config', (): void => {
  it('uses an assisted installer with configurable scope and directory', (): void => {
    const config = readElectronBuilderConfig();

    expect(config.nsis).toMatchObject({
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      perMachine: false,
      selectPerMachineByDefault: false,
      allowElevation: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'Tibis',
      runAfterFinish: true,
      artifactName: `tibis-\${os}-\${arch}-setup.\${ext}`
    });
  });

  it('uses a distinct artifact name for the portable executable', (): void => {
    const config = readElectronBuilderConfig();

    expect(config.portable).toMatchObject({
      artifactName: `tibis-\${os}-\${arch}-portable.\${ext}`
    });
  });

  it('keeps both installer and portable Windows targets enabled', (): void => {
    const config = readElectronBuilderConfig();

    expect(config.win?.target).toEqual(['nsis', 'portable']);
  });
});
```

- [x] **Step 2: 运行测试并确认按预期失败**

Run: `pnpm test test/config/electron-builder.test.ts`

Expected: 两个测试均因 `config.nsis` 和 `config.portable` 为 `undefined` 而失败，证明测试覆盖的是尚未实现的配置。

### Task 2: 启用 NSIS 安装向导并区分 Windows 产物

**Files:**
- Modify: `electron-builder.yml`
- Test: `test/config/electron-builder.test.ts`

- [x] **Step 1: 添加最小 electron-builder 配置**

在 `win` 配置后添加：

```yaml
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  perMachine: false
  selectPerMachineByDefault: false
  allowElevation: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Tibis
  runAfterFinish: true
  artifactName: "tibis-${os}-${arch}-setup.${ext}"
portable:
  artifactName: "tibis-${os}-${arch}-portable.${ext}"
```

- [x] **Step 2: 运行聚焦测试并确认通过**

Run: `pnpm test test/config/electron-builder.test.ts`

Expected: `3 passed`，没有警告或错误。

- [x] **Step 3: 运行测试文件 ESLint 检查**

Run: `pnpm exec eslint test/config/electron-builder.test.ts`

Expected: 退出码为 0，无错误。

### Task 3: 更新变更日志

**Files:**
- Modify: `changelog/2026-07-11.md`

- [x] **Step 1: 在 Changed 章节追加记录**

```markdown
- Windows NSIS 安装包启用安装向导，支持选择安装范围和目录，并使用独立名称区分安装版与便携版。
```

- [x] **Step 2: 检查文档未出现本机绝对路径**

Run: `rg -n '/''Users/|[A-Za-z]:\\\\' docs/superpowers/specs/2026-07-11-windows-assisted-installer-design.md docs/superpowers/plans/2026-07-11-windows-assisted-installer.md changelog/2026-07-11.md`

Expected: 无输出，退出码为 1。

### Task 4: 完整验证和差异审查

**Files:**
- Verify: `electron-builder.yml`
- Verify: `test/config/electron-builder.test.ts`
- Verify: `changelog/2026-07-11.md`
- Verify: `docs/superpowers/specs/2026-07-11-windows-assisted-installer-design.md`
- Verify: `docs/superpowers/plans/2026-07-11-windows-assisted-installer.md`

- [x] **Step 1: 运行配置测试**

Run: `pnpm test test/config/electron-builder.test.ts`

Expected: `3 passed`。

- [x] **Step 2: 运行 TypeScript 类型检查**

Run: `pnpm exec tsc --noEmit`

Expected: 退出码为 0，无类型错误。

- [x] **Step 3: 让 electron-builder 加载配置并执行目录打包**

Run: `pnpm exec electron-builder --config electron-builder.yml --dir --publish never`

Expected: electron-builder 成功加载完整配置并生成当前平台的未封装应用目录；不应出现未知 `nsis` 或 `portable` 配置键错误。Windows 安装向导的实际界面留待 `windows-latest` 发布构建验收。

- [x] **Step 4: 检查工作区状态**

Run: `git status --short`

Expected: 仅显示本计划列出的五个文件，且均未暂存、未提交。

- [x] **Step 5: 审查已跟踪文件差异且不提交**

Run: `git diff -- electron-builder.yml changelog/2026-07-11.md`

Expected: 仅包含安装器配置和 changelog 变更。

- [x] **Step 6: 审查新增测试差异且不提交**

Run: `git diff --no-index /dev/null test/config/electron-builder.test.ts`

Expected: 仅包含 Windows 安装器配置测试。

- [x] **Step 7: 审查新增设计和计划文档且不提交**

Run: `git diff --no-index /dev/null docs/superpowers/specs/2026-07-11-windows-assisted-installer-design.md`

Run: `git diff --no-index /dev/null docs/superpowers/plans/2026-07-11-windows-assisted-installer.md`

Expected: 两份文档与已批准设计及实际实现一致；所有文件保持未暂存、未提交状态，由用户统一提交。
