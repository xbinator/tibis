# GitHub 自动发版流程

本文档说明 Tibis 如何通过 GitHub Actions 自动更新版本号、创建标签、构建安装包并发布 GitHub Release。

## 相关文件

- `.github/workflows/release.yml`：自动发版工作流
- `package.json`：应用版本号来源
- `electron-builder.yml`：Electron 安装包构建配置
- `release/`：本地打包产物目录，CI 中会把该目录下的安装包上传到 GitHub Release

## 推荐发版方式

推荐在 GitHub 网页端手动触发 Release 工作流。

1. 打开仓库的 `Actions` 页面
2. 选择 `Release` 工作流
3. 点击 `Run workflow`
4. 选择版本递增方式：
   - `patch`：修复版本，例如 `0.1.0` 到 `0.1.1`
   - `minor`：功能版本，例如 `0.1.0` 到 `0.2.0`
   - `major`：大版本，例如 `0.1.0` 到 `1.0.0`
   - `custom`：自定义版本，需要填写 `version`
5. 点击运行

工作流会自动完成以下步骤：

1. 根据选择的版本递增方式更新 `package.json` 的 `version`
2. 提交发版 commit，格式为 `chore: release vX.Y.Z`
3. 创建并推送 `vX.Y.Z` 标签
4. 在 macOS、Windows、Linux 三个平台构建安装包
5. 创建 GitHub Release
6. 上传构建产物供用户下载

## 自定义版本

如果选择 `custom`，需要在 `version` 输入框填写不带 `v` 前缀的版本号。

示例：

```text
0.2.0
1.0.0
1.0.0-beta.1
```

工作流会自动创建对应标签：

```text
v0.2.0
v1.0.0
v1.0.0-beta.1
```

带 `-` 的版本会被发布为 GitHub prerelease，例如 `v1.0.0-beta.1`。

## 保留的标签触发方式

如果需要从本地手动创建标签，也可以继续使用标签触发发版。

```bash
git tag v0.1.1
git push origin v0.1.1
```

推送 `v*` 标签后，`Release` 工作流会直接使用该标签构建并发布对应 Release。

这种方式不会自动修改 `package.json`。因此本地手动打标签前，需要确保 `package.json` 中的 `version` 已经和标签一致。

## 未签名安装包说明

当前项目是开源项目，暂未配置 macOS 或 Windows 代码签名。

这不会阻止 GitHub Release 发布安装包，但用户首次运行时可能看到系统安全提示：

- macOS 可能提示无法验证开发者，需要用户右键打开，或在系统设置中允许打开
- Windows 可能触发 SmartScreen，需要用户确认继续运行
- Linux 的 AppImage 和 deb 通常不受代码签名影响

发布说明或 README 中可以提示用户：当前安装包暂未签名，请确认下载来源为项目官方 GitHub Release 后再打开。

## 失败处理

如果发版失败，优先检查以下位置：

1. GitHub `Actions` 页面中的 `Release` 工作流日志
2. `Prepare release ref` job 是否成功更新版本并创建标签
3. 三个平台的 `Build` job 是否有依赖安装或 Electron 打包错误
4. `Publish GitHub Release` job 是否成功上传 `release-artifacts/*`

如果失败发生在创建标签之后，后续重试前需要确认远端是否已经存在对应 `vX.Y.Z` 标签和 GitHub Release，避免重复发布同一个版本。

### macOS dmg-builder 下载失败

仓库 `.npmrc` 使用 `electron_mirror` 加速 Electron 本体下载。macOS DMG 构建还会额外下载 `electron-builder-binaries` 中的 `dmg-builder` 辅助包。

如果镜像缺少对应文件，可能出现类似错误：

```text
Response code 404 (Not Found) for https://cdn.npmmirror.com/binaries/electron/dmg-builder@...
```

`Release` 工作流会在打包步骤显式设置 `ELECTRON_BUILDER_BINARIES_MIRROR`，让 `dmg-builder` 从 GitHub 官方源下载，避免被 Electron 本体镜像带到缺失的镜像地址。
