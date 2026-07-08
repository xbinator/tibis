<!--
  @file ActionHelp.vue
  @description Widget页面 动作脚本编写说明抽屉。
-->
<template>
  <BDrawer v-model:open="open" :keyboard="true" :mask-closable="true" :title="actionHelpContent.title" :width="480" placement="right">
    <div class="action-help">
      <!-- 1. 导语 -->
      <BMessage :content="actionHelpContent.lead" />

      <!-- 2. 查天气示例 -->
      <BMessage :content="actionHelpContent.example" />

      <!-- 3. 可用 API 速查 -->
      <BMessage :content="actionHelpContent.apiReference" />
    </div>
  </BDrawer>
</template>

<script setup lang="ts">
/**
 * 动作脚本说明内容。
 */
interface ActionHelpContent {
  /** 抽屉标题 */
  title: string;
  /** 导语（Markdown） */
  lead: string;
  /** 查天气示例（Markdown 代码块） */
  example: string;
  /** 可用 API 速查（Markdown） */
  apiReference: string;
}

const open = defineModel<boolean>('open', { required: true });

/** 动作脚本说明内容。 */
const actionHelpContent: ActionHelpContent = {
  title: '动作脚本编写说明',
  lead: `动作脚本用于编写小组件的 JavaScript 逻辑。
请使用 \`export default class Xxx extends Widget\` 导出一个 Widget 子类。
**类属性**会自动成为元素中可绑定的数据字段，**类方法**则可被按钮等元素的事件调用。`,
  example: `## 查天气示例

\`\`\`javascript
export default class Weather extends Widget {
  // 类属性 → 元素中通过 {{ weather.temperature }} 引用
  weather = { temperature: 0, condition: '' }

  // 必填：返回值会写入 this.$output
  async onExecute() {
    // 只读入参
    const { city } = this.$input
    // 托管 HTTP
    const { data } = await this.$http.get(
      'https://api.example.com/weather', { query: { city } }
    )
    this.weather = {
      temperature: data.temperature,
      condition: data.condition
    }
    // 持久化日志
    await this.$logger.info('查询成功', city)
    // 返回值写入 this.$output
    return this.weather
  }

  // 小组件展示后执行
  onMounted() {}

  // 类方法可被元素事件调用，例如按钮 @click="this.confirm()"
  async confirm() {
    // 向上行发消息
    await this.$sendMessage('已确认')
  }
}
\`\`\``,
  apiReference: `## 可用 API 速查

在 Widget 类的方法中，可通过 \`this\` 访问以下成员。

### 上下文属性

| 名称 | 说明 |
| --- | --- |
| \`this.$input\` | 只读入参，由入参 schema 推导类型。 |
| \`this.$output\` | onExecute 的返回值，失败时为 undefined。 |
| \`this.$http\` | 托管 HTTP 客户端，支持 get/post/put/patch/delete。 |
| \`this.$logger\` | 持久化日志通道，可在「设置 → 日志」查看。 |

### 生命周期钩子

| 名称 | 说明 |
| --- | --- |
| \`onExecute()\` | 大模型打开小组件时执行，返回值写入 this.$output。 |
| \`onMounted()\` | 小组件展示后执行，常用于消费 this.$output。 |

### 主动方法

| 名称 | 说明 |
| --- | --- |
| \`this.$sendMessage(text)\` | 向聊天请求发送一条上行消息。 |`
};
</script>

<style lang="less" scoped>
.action-help {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 0 0 8px;
  font-size: 13px;
  line-height: 1.65;
  user-select: text;

  :deep(.b-message__code-header) {
    display: none;
  }

  :deep(.b-message__code-block) {
    background: var(--bg-secondary);
  }
}

.action-help :deep(.b-message) {
  overflow: visible;
}

.action-help :deep(.b-message__placeholder) {
  display: none;
}
</style>
