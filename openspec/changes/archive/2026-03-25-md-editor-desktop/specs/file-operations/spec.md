## ADDED Requirements

### Requirement: 新建文件
用户 SHALL 能够创建新的 Markdown 文档，当前编辑内容会被清空。

#### Scenario: 新建空白文档
- **WHEN** 用户点击"新建"按钮或使用 Ctrl+N 快捷键
- **THEN** 编辑区清空，预览区显示空白，预览区显示提示"新建文档"

#### Scenario: 新建前提示保存
- **WHEN** 用户有未保存的内容时点击"新建"
- **THEN** 弹出提示框询问是否保存当前文档

### Requirement: 打开文件
用户 SHALL 能够打开本地已存在的 .md 或 .markdown 文件。

#### Scenario: 打开 Markdown 文件
- **WHEN** 用户点击"打开"按钮或使用 Ctrl+O 快捷键，选择 .md 文件
- **THEN** 文件内容加载到编辑区，预览区显示渲染结果，窗口标题显示文件名

#### Scenario: 打开非 Markdown 文件
- **WHEN** 用户选择非 Markdown 格式文件
- **THEN** 显示错误提示"仅支持 Markdown 文件"

### Requirement: 保存文件
用户 SHALL 能够将编辑内容保存到本地文件系统。

#### Scenario: 保存已有文件
- **WHEN** 用户点击"保存"按钮或使用 Ctrl+S 快捷键，且文件已存在
- **THEN** 内容直接保存到原文件，不弹出保存对话框

#### Scenario: 另存为新文件
- **WHEN** 用户点击"另存为"或使用 Ctrl+Shift+S
- **THEN** 弹出系统保存对话框，用户选择保存路径后保存

#### Scenario: 首次保存
- **WHEN** 用户编辑新文档后点击"保存"
- **THEN** 弹出系统保存对话框，默认文件名可编辑

### Requirement: 文件修改状态提示
编辑器 SHALL 标识当前文档是否有未保存的修改。

#### Scenario: 显示修改状态
- **WHEN** 用户编辑文档内容
- **THEN** 窗口标题显示 * 标记，表示有未保存的修改

#### Scenario: 保存后清除修改状态
- **WHEN** 用户保存文档
- **THEN** 窗口标题的 * 标记消失