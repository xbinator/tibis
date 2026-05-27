# Electron 原生模块版本不匹配问题

## 问题现象

启动 Electron 项目时出现以下错误：

```
Error: The module '...\better-sqlite3\build\Release\better_sqlite3.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 137. This version of Node.js requires
NODE_MODULE_VERSION 145. Please try re-compiling or re-installing
the module (for instance, using `npm rebuild` or `npm install`).
```

## 问题原因

### 根本原因

**原生 Node.js 模块版本不匹配**

1. **原生模块特性**：

   - `better-sqlite3` 是一个原生 C++ 模块，需要针对特定的 Node.js 版本编译
   - 编译时会生成 `.node` 二进制文件，包含 `NODE_MODULE_VERSION` 标识

2. **Electron 的特殊性**：

   - Electron 内置了自己的 Node.js 运行时
   - Electron 版本更新时，内置的 Node.js 版本也会变化
   - 不同的 Node.js 版本有不同的 `NODE_MODULE_VERSION`

3. **版本对应关系**：
   - `NODE_MODULE_VERSION 137`：对应旧版本的 Node.js
   - `NODE_MODULE_VERSION 145`：对应 Electron v41.3.0 内置的 Node.js 版本

### 为什么会发生

1. **依赖安装时机问题**：

   - 原生模块在 `pnpm install` 时编译
   - 如果 Electron 版本更新后没有重新编译原生模块，就会出现版本不匹配

2. **postinstall 脚本未执行**：
   - 项目配置了 `postinstall` 脚本运行 `electron-rebuild`
   - 但某些情况下（如 lockfile 存在时）postinstall 可能不会执行

## 解决方案

### 方案一：手动重新编译（推荐）

使用 `electron-rebuild` 重新编译原生模块：

```bash
# 使用 pnpm
pnpm exec electron-rebuild -f -w better-sqlite3

# 或使用 npx
npx @electron/rebuild -f -w better-sqlite3
```

参数说明：

- `-f`：强制重新编译
- `-w`：指定要编译的模块名称

### 方案二：重新安装依赖

删除 `node_modules` 并重新安装：

```bash
# 删除依赖
rm -rf node_modules

# 重新安装（会自动运行 postinstall）
pnpm install
```

### 方案三：手动触发 postinstall

```bash
pnpm run postinstall
```

## Electron 41 与 tree-sitter 的 C++20 编译问题

### 问题现象

执行 `pnpm install` 或 `pnpm i` 时，依赖解析和下载已经完成，但 `postinstall` 阶段失败：

```text
> tibis@0.1.9 postinstall
> electron-rebuild

Building modules: better-sqlite3, tree-sitter, tree-sitter-bash, tree-sitter-powershell
```

随后 `tree-sitter@0.25.0` 编译报错：

```text
error: "C++20 or later required."
error: unknown type name 'concept'
error: use of undeclared identifier 'requires'
node-gyp failed to rebuild 'node_modules/.pnpm/tree-sitter@0.25.0/node_modules/tree-sitter'
```

### 问题原因

这是 Electron 原生模块重编译时的 C++ 标准不匹配问题：

1. `electron@41.6.1` 使用的 V8 头文件要求 C++20 或更高标准。
2. `tree-sitter@0.25.0` 的 `binding.gyp` 中仍声明了 C++17 编译参数。
3. `postinstall` 会执行 `electron-rebuild`，将 `tree-sitter` 等原生模块重新编译到 Electron 运行时。
4. 当编译器按 C++17 解析 Electron 41 的 V8 头文件时，`concept`、`requires` 等 C++20 语法无法识别，于是安装失败。

因此，该问题不是普通的网络下载失败，也不是删除 lockfile 可以稳定解决的问题。根因是 Electron 41 的头文件要求与 `tree-sitter` 原生模块默认编译标准不一致。

### 解决思路

项目当前使用 `web-tree-sitter` 加载 WASM grammar 文件，不直接使用 native `tree-sitter` 绑定。因此解决方向是把 native `tree-sitter` 从安装和 Electron rebuild 链路中移除：

相关文件：

- `package.json`
- `pnpm-lock.yaml`

具体策略：

1. `package.json` 不再直接依赖 `tree-sitter`。
2. `package.json` 的 `pnpm.peerDependencyRules.ignoreMissing` 忽略 `tree-sitter-bash` 和 `tree-sitter-powershell` 的 optional peer `tree-sitter`，避免 pnpm 自动安装 native `tree-sitter`。
3. `postinstall` 使用 `electron-rebuild --only better-sqlite3`，只重编译实际通过 native binding 运行的 Electron 模块。

开发者只需要正常安装依赖：

#### macOS / Linux

```bash
pnpm i
```

如果依赖已经安装过，只需要重新编译原生模块，可以执行：

```bash
pnpm run postinstall
```

#### Windows PowerShell

Windows 需要先确认已经安装 Visual Studio Build Tools 2022，并勾选 C++ 桌面开发工具链。

```powershell
pnpm i
```

重新编译原生模块：

```powershell
pnpm run postinstall
```

#### Windows cmd

```bat
pnpm i
```

重新编译原生模块：

```bat
pnpm run postinstall
```

不建议只依赖 `CL=/std:c++20` 或 `CXXFLAGS=-std=c++20` 这类环境变量。Windows 的 MSVC 构建中，`tree-sitter@0.25.0` 原始 `binding.gyp` 会继续传入 `/std:c++17`，并在日志中出现 `overriding '/std:c++20' with '/std:c++17'`，最终仍然触发 Electron 41 的 C++20 头文件错误。

### 长期解决思路

后续可以考虑以下方向之一，继续降低原生模块维护成本：

1. 如果后续必须使用 native `tree-sitter`，升级到默认兼容 Electron 41 / C++20 的版本。
2. 如果 Electron 版本没有必须升级到 41，可以评估回退到 V8 头文件仍兼容 C++17 的 Electron 版本。
3. 在 CI 和本地开发文档中固定 Node.js、pnpm、Electron 与原生模块的兼容矩阵，减少环境差异。

## pnpm store-dir 指向 hvigor 缓存的问题

### 问题现象

如果安装时出现类似错误：

```text
EPERM: operation not permitted, symlink '<project-path>' -> '.hvigor/caches/v10/projects/...'
```

说明 pnpm 当前的 `store-dir` 被配置到了 hvigor 缓存目录。受限环境、沙箱环境或权限异常时，pnpm 在该目录登记项目软链接会失败。

### 解决方案

先查看当前配置：

```bash
pnpm config list
```

如果看到 `store-dir` 指向 `.hvigor/caches`，可以改回普通 pnpm store：

```bash
pnpm config set store-dir ~/.pnpm-store
```

然后重新安装：

```bash
pnpm i
```

## 预防措施

### 1. 配置 package.json

确保 `package.json` 中配置了 `postinstall` 脚本：

```json
{
  "scripts": {
    "postinstall": "electron-rebuild"
  }
}
```

### 2. 配置 pnpm 只构建原生模块

在 `package.json` 中添加：

```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["electron", "better-sqlite3"]
  }
}
```

这样可以确保 pnpm 只构建必要的原生模块，提高安装速度。

### 3. Electron 版本更新后

当 Electron 版本更新后，务必重新编译原生模块：

```bash
pnpm exec electron-rebuild
```

## 常见问题

### Q1: 为什么 `pnpm install` 后还是报错？

**A**: 可能是因为：

1. lockfile 存在，跳过了 postinstall 脚本
2. pnpm 的缓存导致没有重新编译
3. 需要使用 `--force` 参数强制重新安装

### Q2: 如何查看 Electron 的 Node.js 版本？

**A**: 运行以下命令：

```bash
npx electron --version
```

然后在 [Electron Releases](https://www.electronjs.org/releases/stable) 页面查看对应的 Node.js 版本。

### Q3: 如何查看 NODE_MODULE_VERSION？

**A**: 在 Node.js 或 Electron 中运行：

```javascript
console.log(process.versions.modules);
```

### Q4: 端口被占用怎么办？

**A**: 如果端口 1420 被占用，可以：

1. 查找并结束占用进程：

```bash
# Windows
netstat -ano | findstr :1420
taskkill /F /PID <PID>

# Linux/macOS
lsof -i :1420
kill -9 <PID>
```

2. 或修改 `.env` 文件中的端口配置：

```
DEV_SERVER_PORT=1421
```

## 相关资源

- [Electron Documentation - Using Native Node Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [electron-rebuild GitHub](https://github.com/electron/rebuild)
- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3)
- [Node.js NODE_MODULE_VERSION](https://nodejs.org/en/download/releases/)

## 总结

Electron 原生模块版本不匹配是一个常见问题，主要原因是：

1. **原生模块需要针对特定 Node.js 版本编译**
2. **Electron 内置的 Node.js 版本与系统不同**
3. **依赖更新后未重新编译原生模块**

解决方案很简单：**使用 `electron-rebuild` 重新编译原生模块**。

记住：**每次 Electron 版本更新后，都需要重新编译原生模块！**
