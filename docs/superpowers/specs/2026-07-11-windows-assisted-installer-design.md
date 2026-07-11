# Windows 安装向导设计

## 目标

将 Windows NSIS 安装包从默认的一键安装改为安装向导，让用户可以选择安装范围和安装目录，同时继续提供无需安装的便携版。

## 已确认需求

- Windows 安装包使用传统安装向导，不再自动执行一键安装。
- 用户可以选择“仅当前用户”或“所有用户”，默认选择“仅当前用户”。
- 用户可以修改安装目录。
- 默认创建桌面快捷方式和开始菜单快捷方式。
- 安装完成后允许启动 Tibis。
- 保留现有 Windows 便携版。
- 安装版和便携版使用不同产物名称，避免两个 `.exe` 产物同名。

## 方案选择

采用 electron-builder 官方 NSIS 配置，不引入自定义 NSIS 脚本，也不切换到 MSI。官方配置已经覆盖本次需求，改动范围小，并继续兼容当前 GitHub Actions 发布流程。

## 配置设计

在 `electron-builder.yml` 中新增顶层 `nsis` 配置：

- `oneClick: false`：启用安装向导。
- `allowToChangeInstallationDirectory: true`：显示安装目录选择步骤。
- `perMachine: false`：允许选择当前用户或所有用户安装。
- `selectPerMachineByDefault: false`：默认选择当前用户安装。
- `allowElevation: true`：选择所有用户安装时允许请求管理员权限。
- `createDesktopShortcut: true`：创建桌面快捷方式。
- `createStartMenuShortcut: true`：创建开始菜单快捷方式。
- `shortcutName: Tibis`：统一快捷方式名称。
- `runAfterFinish: true`：安装完成后允许立即启动应用。
- `artifactName: "tibis-${os}-${arch}-setup.${ext}"`：明确标识安装版产物。

新增顶层 `portable` 配置：

- `artifactName: "tibis-${os}-${arch}-portable.${ext}"`：明确标识便携版产物。

`win.target` 继续保留 `nsis` 和 `portable`，发布工作流仍上传 `release/*.exe`，因此无需修改 `.github/workflows/release.yml`。

## 用户流程

用户运行 `setup.exe` 后进入安装向导，选择安装范围；默认仅为当前用户安装。随后用户确认或修改安装目录并完成安装。选择所有用户时，安装器按需触发 Windows UAC。安装完成后创建快捷方式，并提供立即启动 Tibis 的选项。

便携版不进入安装向导，用户可以直接将 `portable.exe` 放在任意目录运行。

## 验证方案

- 添加针对 `electron-builder.yml` 的配置测试，先验证当前配置缺少安装向导选项，再通过最小配置变更使测试通过。
- 验证 YAML 能被 electron-builder 正确加载，且配置键符合 electron-builder 26.15.3 的结构。
- 运行相关单元测试和项目要求的静态检查。
- 检查最终差异，确认只修改安装器配置、配置测试、设计文档和当天 changelog。
- Windows 安装向导的最终界面和 UAC 行为由下一次 `windows-latest` 发布构建产物进行实际验收。

## 变更记录

在 `changelog/2026-07-11.md` 的 `Changed` 部分记录 Windows 安装包新增安装向导、目录选择和安装范围选择能力。
