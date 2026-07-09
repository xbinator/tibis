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
import { computed } from 'vue';

/**
 * Schema 说明对应的 WidgetData 字段名。
 */
type SchemaHelpKey = 'inputSchema' | 'outputSchema';

/**
 * Schema 填写说明入参。
 */
interface Props {
  /** 当前说明面向的 WidgetData schema 字段 */
  kind?: SchemaHelpKey;
}

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

const props = withDefaults(defineProps<Props>(), {
  kind: 'inputSchema'
});
const open = defineModel<boolean>('open', { required: true });

/** 各类 Schema 说明内容。 */
const schemaHelpContentMap: Record<SchemaHelpKey, SchemaHelpContent> = {
  inputSchema: {
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
  },
  outputSchema: {
    title: '出参填写说明',
    lead: '出参描述 onExecute 返回给调用方的数据。以查天气为例，可以声明天气摘要、温度、预警列表等返回字段。',
    example: `## 查天气出参

\`\`\`json
{
  "type": "object",
  "properties": {
    "summary": {
      "type": "string",
      "description": "天气摘要，例如上海今天晴，28℃"
    },
    "temperature": {
      "type": "number",
      "description": "温度数值"
    },
    "alerts": {
      "type": "array",
      "description": "天气预警列表",
      "items": {
        "type": "string"
      }
    }
  },
  "required": ["summary"]
}
\`\`\``
  }
};

/** 当前 Schema 说明内容。 */
const schemaHelpContent = computed<SchemaHelpContent>(() => schemaHelpContentMap[props.kind]);
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
