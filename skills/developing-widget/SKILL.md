---
name: developing-widget
description: 用于创建、生成、编写、校验或安装 Tibis Widget 包、widget.json、Widget 元素树、数据绑定、交互脚本，以及可导入的 Widget 目录或 ZIP。
---

# 开发 Widget

创建完整且通过校验的 Tibis Widget 包。Widget 包是一个根目录包含 `widget.json` 的目录，可包含后续通过 JSON 或 ZIP 导入时需要的资源文件。

## 必须执行的流程

1. 创建或修改 `widget.json` 前，先阅读 `references/widget-format.md`。
2. 如果 Widget 包含元素、样式、分组、循环、绑定、图片或按钮，阅读 `references/elements-and-bindings.md`。
3. 如果涉及 `execute.code`、生命周期方法、HTTP、消息、logger 或按钮动作，阅读 `references/runtime-api.md`。
4. 创建新包时，从 `assets/widget-template/widget.json` 开始，然后逐项替换字段。
5. 写出完整的 Widget 目录。根目录 `widget.json` 必须包含顶层 `WidgetData` 结构：`name`、`description`、`inputSchema`、`outputSchema`、`dataSchema`、`execute`、`metadata`、`elements`。同时包含 `image.src` 引用的本地资源，以及运行时需要的 `assets/` 文件。
6. 运行 `node scripts/validate-widget.js <widget-directory>`，并修复所有错误。
7. 交付 Widget 包路径、校验命令和仍需说明的 warning。

## 编写规则

- 如果本文档与当前仓库源码冲突，以当前仓库源码为准。
- 除非用户明确要求“安装”或“持久化”Widget，否则不要把生成结果写入用户主目录下的 Widget 扫描目录。
- 用户明确要求安装或持久化时，唯一正确的落盘文件路径是 `~/.tibis/widgets/<widget-id>/widget.json`。路径中必须包含复数目录段 `widgets/`，`<widget-id>` 是创建弹窗里的“小组件标识”，也是 `WidgetDefinition.id` 和 `widget.json` 的直接父目录名；它不是 `widget.json.name` 显示名。只有当 `name` 本身已符合 `[a-z0-9_-]` 时，才可以让标识与名称相同。
- 写入安装路径前必须做路径自检：最终路径必须以 `/widget.json` 结尾，且父目录必须位于 `~/.tibis/widgets/` 下。不要在输出、计划或脚本中复述错误完整路径，避免后续步骤误用。
- 不要执行不可信的 `execute.code`；校验只做静态检查。
- 不要发明 `widget.json` 顶层字段。使用 `references/widget-format.md` 中定义的 `WidgetData` 结构。
- 保持 schema 的 `required` 数组与 `properties` 对齐；未知 required 字段通常需要修复。
- 使用全局唯一的元素 ID，包括嵌套 group 内的元素。
- 只使用受支持的元素名称：`rect`、`text`、`image`、`button`、`group`。
- 确认每个按钮 action 方法都存在于 `execute.code`。
- 除非已知宿主集成会分发包内资源，否则图片优先使用 HTTP URL 或 data URL。
- validator 退出状态不是 0 时，绝不要声称 Widget 已准备好。

## 输出要求

完成后提供：

- Widget 目录路径；
- 重要文件的简要说明；
- 实际运行的 validator 命令与结果；
- 如仍有 warning，说明保留原因。
