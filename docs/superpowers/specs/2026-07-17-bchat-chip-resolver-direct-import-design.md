# BChat ChipResolver 直接导入重构设计

## 背景

`BubblePartUserInput` 的渲染片段仍使用 `fileRef` 与 `skillRef` 作为判别值，而共享引用分段器已经统一使用 `file` 与 `skill`。同时，`chipResolver/file/index.ts` 和 `chipResolver/skill/index.ts` 只承担代理导出，增加了定位实际实现的跳转层级。

## 目标

- 将消息气泡渲染片段的文件、技能判别值统一为 `file`、`skill`。
- 删除 `chipResolver/file/index.ts` 与 `chipResolver/skill/index.ts`。
- 所有消费者直接引用 `presentation.ts` 或 `widget.ts`，让依赖来源清晰可见。
- 保持 Chip 展示、点击导航和技能名称展示行为不变。

## 设计

### 渲染片段

`FileRefSegment.type` 从 `fileRef` 改为 `file`，`SkillRefSegment.type` 从 `skillRef` 改为 `skill`。模板判断、片段构造和联合类型收窄同步使用新判别值，与 `UserInputReferenceSegment` 保持一致。

### 模块导入

- `BubblePartUserInput` 从 `chipResolver/file/presentation` 导入文件 Chip 展示类型与工厂。
- `chipResolver/index.ts` 从 `file/widget`、`skill/widget` 导入 Widget 工厂。
- ChipResolver 测试从对应 `widget` 文件直接导入工厂。
- 删除文件和技能子目录的 `index.ts`，不在顶层新增替代代理导出。

## 验证

- 运行 ChipResolver、用户输入气泡和文件引用解析相关测试。
- 运行 TypeScript、ESLint 与 Stylelint 检查。
- 搜索确认 `fileRef`、`skillRef` 以及对子目录入口的导入均已消失。

## 非目标

- 不调整 `chipResolver/index.ts` 作为聊天输入框组合解析器的职责。
- 不改动文件或技能 Chip 的样式文件。
- 不改变引用 Token 格式、解析规则或点击行为。
