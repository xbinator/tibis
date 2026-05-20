# Speech Runtime 发布流程

本文档说明如何将语音运行时资源（whisper.cpp 二进制 + 模型）编译、发布并回填到项目 manifest。

## 前置条件

- 仓库 `xbinator/tibis` 的 push 权限
- GitHub Actions 已启用

## 一键发布（推荐）

项目已配置 GitHub Actions workflow，可自动完成三平台编译、sha256 计算和 GitHub Release 创建。

### 操作步骤

1. 打开 GitHub 仓库 → **Actions** → **Build Speech Runtime**
2. 点击 **Run workflow**
3. 填写参数：

| 参数 | 说明 | 示例 |
|------|------|------|
| `version` | 语音运行时版本号，同时用作 Release tag | `2026.05.04` |
| `whisper_ref` | whisper.cpp Git 引用（分支、tag 或 commit） | `master` 或 `v1.8.1` |

4. 等待 workflow 执行完成（约 10-15 分钟）
5. 执行完成后，GitHub Release 页面会出现 `speech-runtime-<version>`

### Workflow 做了什么

```
┌───────────────────────────────────────────────────────┐
│  build 作业（三平台并行）                                │
│                                                         │
│  macos-latest   →  whisper-darwin-arm64                 │
│  macos-15-intel →  whisper-darwin-x64                   │
│  windows-latest →  whisper-win32-x64.exe                │
│                                                         │
│  每个平台：checkout whisper.cpp → cmake 编译 → 计算 sha256 │
└───────────────────────────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────┐
│  release 作业                                           │
│                                                         │
│  1. 下载三个编译产物                                      │
│  2. 从 HuggingFace 下载 ggml-base.bin                    │
│  3. 计算所有文件 sha256                                   │
│  4. 创建 GitHub Release 并上传资源                        │
│  5. Release body 包含 sha256 摘要和回填指引                │
└───────────────────────────────────────────────────────┘
```

### Runner 平台对应

| 平台 | Runner 标签 | 架构 | 产出文件 |
|------|-------------|------|----------|
| macOS arm64 | `macos-latest` | arm64 | `whisper-darwin-arm64` |
| macOS x64 | `macos-15-intel` | x64 | `whisper-darwin-x64` |
| Windows x64 | `windows-latest` | x64 | `whisper-win32-x64.exe` |

> `macos-15-intel` 是当前用于 x64 Intel 架构的 GitHub Actions macOS runner，`macos-latest` 为 Apple Silicon。

## 回填 manifest

Release 创建成功后，需要将 sha256 回填到 `resources/speech/manifest.json`。

### 方式一：手动回填

1. 打开 Release 页面，复制 Release body 中的 sha256 值
2. 替换 `resources/speech/manifest.json` 中的占位符：

| 占位符 | 替换为 |
|--------|--------|
| `REPLACE_WITH_DARWIN_ARM64_WHISPER_SHA256` | Release 中 darwin-arm64 的 sha256 |
| `REPLACE_WITH_DARWIN_X64_WHISPER_SHA256` | Release 中 darwin-x64 的 sha256 |
| `REPLACE_WITH_WIN32_X64_WHISPER_SHA256` | Release 中 win32-x64 的 sha256 |
| `REPLACE_WITH_GGML_BASE_SHA256` | Release 中 ggml-base.bin 的 sha256 |

### 方式二：使用 manifest 工具

如果本地有编译产物，可以使用项目内置工具一键回填：

```bash
pnpm run speech:manifest:fill -- \
  --manifest resources/speech/manifest.json \
  --darwin-arm64 <whisper-darwin-arm64文件路径> \
  --darwin-x64 <whisper-darwin-x64文件路径> \
  --win32-x64 <whisper-win32-x64.exe文件路径> \
  --model <ggml-base.bin文件路径>
```

### 校验 manifest

回填完成后，运行校验确认结构完整：

```bash
pnpm run speech:manifest:validate
```

## 部署 manifest 到线上

manifest 回填并校验通过后，需要将其部署到应用可访问的线上地址。

### 环境变量

应用通过 `TIBIS_SPEECH_RUNTIME_MANIFEST_URL` 环境变量读取远程 manifest：

```
TIBIS_SPEECH_RUNTIME_MANIFEST_URL=https://<your-host>/manifest.json
```

### 托管方案

| 方案 | 免费额度 | 国内速度 | 说明 |
|------|----------|----------|------|
| Cloudflare R2 | 10GB + 零出站费 | ✅ 较快 | 推荐，零流量费 |
| GitHub Releases | 无限 | ❌ 慢 | 最省事，国内不稳定 |
| 阿里云 OSS | 无免费层 | ✅ 最佳 | 国内用户首选 |

### Cloudflare R2 部署示例

```bash
# 安装 Wrangler CLI
npm install -g wrangler
wrangler login

# 创建存储桶（首次）
wrangler r2 bucket create tibis-speech-runtime

# 上传 manifest
wrangler r2 object put tibis-speech-runtime/manifest.json --file resources/speech/manifest.json
```

上传后，将 `TIBIS_SPEECH_RUNTIME_MANIFEST_URL` 指向 R2 公开访问地址。

> 如果使用 GitHub Releases 托管 whisper 二进制，manifest 中的 `url` 字段无需修改，已经指向 GitHub Release 地址。

## 真机验证

发布后，需在三个平台上验证完整链路：

- [ ] macOS arm64：点击麦克风 → 自动安装 → 录音 → 转写成功
- [ ] macOS x64：同上
- [ ] Windows x64：同上

验证要点：

- 首次点击麦克风触发自动安装
- 安装进度正常显示
- 安装完成后可实际录音转写
- 设置页可查看状态、重装、删除
- 删除后重新触发安装

## 版本升级流程

当需要升级 whisper.cpp 或模型时：

1. 触发 **Build Speech Runtime** workflow，使用新版本号（如 `2026.06.01`）
2. 回填新 manifest（或创建新的 manifest 文件）
3. 部署新 manifest 到线上
4. 应用端会在下次检查时发现新版本

> 第一版不支持自动后台升级，用户需在设置页手动触发重装。

## 相关文件

| 文件 | 说明 |
|------|------|
| `.github/workflows/build-speech-runtime.yml` | GitHub Actions 编译发布 workflow |
| `resources/speech/manifest.json` | 语音运行时资源清单模板 |
| `scripts/speech/manifest-tool.mjs` | manifest 管理工具（fill/hash/localize/validate） |
| `scripts/speech/dev-runtime.mjs` | 本地开发运行时管理 |
| `electron/main/modules/speech/installer.mts` | 主进程安装器 |
| `electron/main/modules/speech/runtime.mts` | 主进程运行时管理 |
