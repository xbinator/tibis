# Shell PTY Release Gate

Shell `auto-default` 依赖 `node-pty` 原生 ABI、平台进程树清理和打包后的辅助文件。TypeScript 编译成功或系统 Node.js 直接加载 `node-pty` 都不能作为发布验收。

## 平台矩阵

每个实际发布的 OS/arch 必须独立通过以下顺序：

1. 使用 lockfile 安装依赖，并由 `postinstall` 针对当前 Electron ABI 重建 `node-pty`。
2. 运行 `pnpm shell:pty:smoke`，在 Electron 主进程中完成真实 PTY 输出、一次 Enter 写入、headless terminal 投影和 exit 0。
3. 运行当前平台完整的 `pnpm electron:build`。
4. 运行 `pnpm shell:pty:packaged-smoke`，由打包应用自身的 `--shell-pty-smoke` 入口重复完整 PTY 循环。
5. 确认打包配置将 `node_modules/node-pty/**/*` 和所有 `.node` 文件从 asar 解包，且平台辅助程序可执行。

Linux job 必须在 `xvfb-run` 下启动开发 Electron 与打包应用。macOS arm64、macOS x64、Windows 和 Linux 任一 job 失败都会阻止发布。

## Capability token

仅当同一平台还通过 prompt safety、checkpoint re-entry、timeout 区分、finished exactly-once 和 process-tree cleanup 测试后，才允许为该平台配置 `TIBIS_SHELL_AUTO_DEFAULT_CAPABILITY=<platform>-<arch>:v1`。

缺少 token、token 与 platform/arch/version 不匹配、native 模块加载失败或 packaged smoke 失败时，模型 schema 不暴露 `auto-default`，主进程也拒绝直接请求。普通 pipe 模式不受影响。
