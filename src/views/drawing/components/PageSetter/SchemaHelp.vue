<!--
  @file SchemaHelp.vue
  @description 画图页面 Schema 填写说明抽屉。
-->
<template>
  <BDrawer v-model:open="open" :get-container="false" :keyboard="true" :mask-closable="true" :title="schemaHelpTitle" :width="480" placement="right">
    <div class="schema-help">
      <section class="schema-help__intro" aria-label="示例场景">
        <div class="schema-help__intro-heading">
          <h3 class="schema-help__intro-title">查天气</h3>
          <span class="schema-help__intro-label">示例场景</span>
        </div>
        <p class="schema-help__intro-text">{{ schemaHelpLead }}</p>
      </section>

      <section class="schema-help__section">
        <div class="schema-help__section-header">
          <BIcon icon="lucide:list-checks" :size="14" />
          <span>参数说明</span>
        </div>
        <div class="schema-help__field-list" role="list">
          <div v-for="field in schemaHelpFields" :key="field.name" class="schema-help__field-item" role="listitem">
            <div class="schema-help__field-main">
              <code class="schema-help__field-name">{{ field.name }}</code>
              <div class="schema-help__field-meta">
                <span class="schema-help__type">{{ field.type }}</span>
                <span :class="['schema-help__required', { 'is-optional': !field.required }]">
                  {{ field.required ? '必填' : '可选' }}
                </span>
              </div>
            </div>
            <p class="schema-help__field-desc">{{ field.description }}</p>
          </div>
        </div>
      </section>

      <section class="schema-help__section">
        <div class="schema-help__section-header">
          <BIcon icon="lucide:braces" :size="14" />
          <span>JSON Schema 示例</span>
        </div>
        <div class="schema-help__example" :class="{ 'is-expanded': schemaExampleExpanded }">
          <div class="schema-help__example-title">
            <span>{{ schemaHelpExampleTitle }}</span>
            <div class="schema-help__example-actions">
              <code>type: object</code>
              <BButton
                class="schema-help__expand"
                :icon="schemaExampleExpanded ? 'lucide:minimize-2' : 'lucide:maximize-2'"
                size="mini"
                square
                :tooltip="schemaExampleExpanded ? '收起查看' : '放大查看'"
                type="secondary"
                @click="toggleSchemaExampleExpanded"
              />
            </div>
          </div>
          <pre class="schema-help__example-code"><code>{{ schemaHelpExample }}</code></pre>
        </div>
      </section>
    </div>
  </BDrawer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * Schema 说明类型。
 */
type SchemaKind = 'input' | 'output';

/**
 * Schema 填写说明抽屉入参。
 */
interface Props {
  /** 当前说明对应的 schema 类型 */
  kind: SchemaKind;
}

/**
 * Schema 参数字段说明。
 */
interface SchemaHelpField {
  /** 参数字段名 */
  name: string;
  /** JSON Schema 字段类型 */
  type: string;
  /** 是否必填 */
  required: boolean;
  /** 字段业务说明 */
  description: string;
}

/**
 * Schema 填写说明内容。
 */
interface SchemaHelpContent {
  /** 抽屉标题 */
  title: string;
  /** 说明导语 */
  lead: string;
  /** 参数字段说明列表 */
  fields: SchemaHelpField[];
  /** JSON 示例标题 */
  exampleTitle: string;
  /** JSON 示例 */
  example: string;
}

const props = defineProps<Props>();
const open = defineModel<boolean>('open', { required: true });
/** JSON Schema 示例是否在抽屉内展开。 */
const schemaExampleExpanded = ref(false);

/** Schema 填写说明内容映射。 */
const schemaHelpContentMap: Record<SchemaKind, SchemaHelpContent> = {
  input: {
    title: '入参填写说明',
    lead: '入参描述调用组件前需要提供的数据。以查天气为例，大模型需要知道要查询哪个城市、哪一天以及温度单位。',
    fields: [
      {
        name: 'city',
        type: 'string',
        required: true,
        description: '城市名称，例如“上海”或“北京”。'
      },
      {
        name: 'date',
        type: 'string',
        required: false,
        description: '查询日期，例如“今天”“明天”或 2026-06-28。'
      },
      {
        name: 'unit',
        type: 'string',
        required: false,
        description: '温度单位，例如 celsius 或 fahrenheit。'
      }
    ],
    exampleTitle: '查天气入参',
    example: `{
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
}`
  },
  output: {
    title: '出参填写说明',
    lead: '出参描述组件执行后会返回的数据。以查天气为例，大模型可以继续使用天气概况、温度和建议等结果。',
    fields: [
      {
        name: 'condition',
        type: 'string',
        required: true,
        description: '天气概况，例如晴、多云、小雨。'
      },
      {
        name: 'temperatureCelsius',
        type: 'number',
        required: true,
        description: '摄氏温度，便于后续判断冷热。'
      },
      {
        name: 'suggestion',
        type: 'string',
        required: false,
        description: '出行建议，例如是否需要带伞或添加外套。'
      }
    ],
    exampleTitle: '查天气出参',
    example: `{
  "type": "object",
  "properties": {
    "condition": {
      "type": "string",
      "description": "天气概况"
    },
    "temperatureCelsius": {
      "type": "number",
      "description": "摄氏温度"
    },
    "suggestion": {
      "type": "string",
      "description": "出行建议"
    }
  },
  "required": ["condition", "temperatureCelsius"]
}`
  }
};

/** 当前 Schema 说明内容。 */
const schemaHelpContent = computed<SchemaHelpContent>(() => schemaHelpContentMap[props.kind]);
/** Schema 说明抽屉标题。 */
const schemaHelpTitle = computed<string>(() => schemaHelpContent.value.title);
/** Schema 说明导语。 */
const schemaHelpLead = computed<string>(() => schemaHelpContent.value.lead);
/** Schema 参数字段说明列表。 */
const schemaHelpFields = computed<SchemaHelpField[]>(() => schemaHelpContent.value.fields);
/** Schema 说明示例标题。 */
const schemaHelpExampleTitle = computed<string>(() => schemaHelpContent.value.exampleTitle);
/** Schema 说明示例。 */
const schemaHelpExample = computed<string>(() => schemaHelpContent.value.example);

/**
 * 切换 JSON Schema 示例在抽屉内的展开状态。
 */
function toggleSchemaExampleExpanded(): void {
  schemaExampleExpanded.value = !schemaExampleExpanded.value;
}
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
}

.schema-help__intro {
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-secondary);
}

.schema-help__intro-label {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  color: var(--text-tertiary);
  background: var(--bg-secondary);
  border-radius: 999px;
}

.schema-help__intro-heading {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}

.schema-help__intro-title {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.4;
  color: var(--text-primary);
}

.schema-help__intro-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-secondary);
}

.schema-help__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.schema-help__section-header {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-primary);
}

.schema-help__field-list {
  overflow: hidden;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
}

.schema-help__field-item {
  padding: 10px 12px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-secondary);
}

.schema-help__field-item:last-child {
  border-bottom: 0;
}

.schema-help__field-main {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  justify-content: space-between;
}

.schema-help__field-name {
  min-width: 0;
  padding: 1px 5px;
  font-family: var(--font-family-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace);
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-primary);
  overflow-wrap: anywhere;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.schema-help__field-meta {
  display: inline-flex;
  flex-shrink: 0;
  gap: 6px;
  align-items: center;
}

.schema-help__type,
.schema-help__required {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary);
  background: var(--color-primary-bg);
  border-radius: 999px;
}

.schema-help__required {
  color: var(--color-danger, #ef4444);
  background: rgb(239 68 68 / 10%);
}

.schema-help__required.is-optional {
  color: var(--text-tertiary);
  background: var(--bg-secondary);
}

.schema-help__field-desc {
  margin: 6px 0 0;
  line-height: 1.7;
  color: var(--text-secondary);
}

.schema-help__example {
  overflow: hidden;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
}

.schema-help__example-title {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-primary);
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-primary);
}

.schema-help__example-actions {
  display: inline-flex;
  flex-shrink: 0;
  gap: 6px;
  align-items: center;
}

.schema-help__example-title code {
  padding: 1px 6px;
  font-family: var(--font-family-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace);
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  white-space: nowrap;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.schema-help__expand {
  flex-shrink: 0;
}

.schema-help__example-code {
  max-height: 220px;
  padding: 10px 12px;
  margin: 0;
  overflow: auto;
  user-select: text;
  background: var(--bg-secondary);
  border: 0;
  border-radius: 0;
}

.schema-help__example.is-expanded .schema-help__example-code {
  max-height: min(58vh, 560px);
}

.schema-help__example-code code {
  font-family: var(--font-family-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace);
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-secondary);
  white-space: pre;
  background: transparent;
}

.schema-help__example.is-expanded .schema-help__example-code code {
  font-size: 12px;
  line-height: 1.65;
}
</style>
