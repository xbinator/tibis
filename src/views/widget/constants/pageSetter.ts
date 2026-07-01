/**
 * @file pageSetter.ts
 * @description 小组件页面设置面板常量。
 */

/** Schema 默认新增字段名。 */
export const WIDGET_SCHEMA_DEFAULT_FIELD_NAME = 'field';

/** 交互脚本摘要高亮语言。 */
export const WIDGET_INTERACTION_SCRIPT_HIGHLIGHT_LANGUAGE = 'typescript';

/** Widget 交互脚本默认代码。 */
export const WIDGET_INTERACTION_SCRIPT_DEFAULT_CODE = [
  '// defineConfig 会为生命周期和 methods 注入 this 上下文，无需自行创建。',
  '// 在这里可以读取 this.$input，使用 this.$setState 写入状态。',
  '// 需要请求数据时，可以使用 this.$http；request 超时和队列由系统统一控制。',
  '// 当需要结束等待并向聊天上行消息时，通过 this.$sendMessage 上行一条聊天消息。',
  '// 如果没有调用 this.$sendMessage，小组件会继续等待用户操作。',
  '',
  'defineConfig({',
  '  async mounted() {',
  '    // 小组件创建或展示时执行。',
  '  },',
  '',
  '  async unmounted() {',
  '    // 小组件运行完成后执行一次。',
  '  },',
  '',
  '  methods: {',
  '    async sendText() {',
  "      await this.$sendMessage({ content: [{ type: 'text', text: '确认下单' }] })",
  '    }',
  '  }',
  '})',
  ''
].join('\n');
