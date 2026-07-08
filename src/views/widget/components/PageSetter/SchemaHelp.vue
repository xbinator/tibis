<!--
  @file SchemaHelp.vue
  @description Widget页面 Schema 填写说明抽屉。
-->
<template>
  <BDrawer v-model:open="open" :keyboard="true" :mask-closable="true" :title="schemaHelpContent.title" :width="480" placement="right">
    <div class="schema-help">
      <!-- 1. 简短导语 -->
      <BMessage :content="schemaHelpContent.lead" />

      <!-- 2. JSON Schema 完整示例 -->
      <BMessage :content="schemaHelpContent.example" />
    </div>
  </BDrawer>
</template>

<script setup lang="ts">
/**
 * Schema 填写说明内容。
 */
interface SchemaHelpContent {
  /** 抽屉标题 */
  title: string;
  /** 说明导语（Markdown） */
  lead: string;
  /** JSON 示例（Markdown，含标题与代码块） */
  example: string;
}

const open = defineModel<boolean>('open', { required: true });

/** 当前 Schema 说明内容。 */
const schemaHelpContent: SchemaHelpContent = {
  title: '入参填写说明',
  lead: '入参描述调用组件前需要提供的数据。以查天气为例，大模型需要知道要查询哪个城市、哪一天以及温度单位。',
  example: `## 查天气入参

\`\`\`json
{
  "type": "object",
  "properties": {
    "city": {
      "type": "string",
      "description": "城市名称，例如上海"
    },
    "date": {
      "type": "string",
      "description": "查询日期，例如今天或明天"
    },
    "unit": {
      "type": "string",
      "description": "温度单位，celsius 或 fahrenheit"
    }
  },
  "required": ["city"]
}
\`\`\``
};
</script>

<style lang="less" scoped>
.schema-help {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 0 0 8px;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-secondary);
  user-select: text;

  :deep(.b-message__code-header) {
    display: none;
  }

  :deep(.b-message__code-block) {
    background: var(--bg-secondary);
  }
}

.schema-help :deep(.b-message) {
  overflow: visible;
}

.schema-help :deep(.b-message__placeholder) {
  display: none;
}
</style>
