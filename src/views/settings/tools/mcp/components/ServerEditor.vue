<template>
  <BModal v-model:open="modalOpen" :title="modalTitle" :width="640" @cancel="handleCancel">
    <div class="server-editor-modal">
      <div class="server-editor-modal__editor">
        <BMonaco ref="editorRef" v-model:value="jsonText" class="server-editor-modal__monaco" language="json" :editable="true" :editor-state="editorState" />
      </div>
    </div>

    <template #footer>
      <div class="server-editor-modal__footer">
        <div class="server-editor-modal__error">{{ parseError }}</div>

        <BButton type="secondary" @click="handleCancel">取消</BButton>
        <BButton type="primary" :disabled="!parsedDraft || !!parseError" @click="handleConfirm">保存</BButton>
      </div>
    </template>
  </BModal>
</template>

<script setup lang="ts">
/**
 * @file ServerEditorModal.vue
 * @description MCP Server 添加/编辑弹窗，内置 Monaco JSON 编辑器与格式校验。
 */
import { computed, nextTick, ref, watch } from 'vue';
import { isArray, isObject } from 'lodash-es';
import type { EditorState } from '@/components/BEditor/types';
import BMonaco from '@/components/BMonaco/index.vue';
import type { MCPServerConfig, MCPTransportType } from '@/shared/storage/tool-settings';
import { DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS } from '@/shared/storage/tool-settings';

/**
 * MCP Server 编辑弹窗提交的草稿结构。
 */
export interface MCPServerEditorDraft {
  /** 展示名称 */
  name: string;
  /** 传输类型 */
  transport: MCPTransportType;
  /** 启动命令（stdio） */
  command: string;
  /** 启动参数（stdio） */
  args: string[];
  /** 环境变量（stdio） */
  env: Record<string, string>;
  /** 服务端 URL（streamableHTTP/sse） */
  url: string;
  /** 是否启用 OAuth */
  enableOAuth: boolean;
  /** 允许暴露的工具名列表 */
  toolAllowlist: string[];
  /** 单次工具调用超时 */
  toolCallTimeoutMs: number;
}

/**
 * MCP Server JSON 编辑器的占位示例。
 */
const MCP_SERVER_JSON_PLACEHOLDER = `{
  "name": "filesystem",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem"],
  "env": {},
  "toolAllowlist": ["read_file", "list_directory"],
  "toolCallTimeoutMs": 30000
}`;

/**
 * JSON 解析结果。
 */
interface MCPServerDraftParseResult {
  /** 解析后的草稿 */
  draft: MCPServerEditorDraft | null;
  /** 解析错误信息 */
  error: string;
}

/**
 * 将任意对象安全转换为字符串字典。
 * @param value - 待转换值
 * @returns 字符串字典
 */
function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isObject(value) || isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).map(([key, itemValue]) => [String(key), String(itemValue)]));
}

/**
 * 将任意值安全转换为字符串数组。
 * @param value - 待转换值
 * @returns 字符串数组
 */
function normalizeStringArray(value: unknown): string[] {
  return isArray(value) ? value.map((item) => String(item)) : [];
}

/**
 * 将 MCP server 配置序列化为编辑器使用的 JSON。
 * @param server - 当前编辑的 server，空时返回示例 JSON
 * @returns 格式化后的 JSON 字符串
 */
function serializeMCPServerEditorDraft(server: MCPServerConfig | null): string {
  if (!server) {
    return MCP_SERVER_JSON_PLACEHOLDER;
  }

  const isRemote = server.transport === 'streamableHTTP' || server.transport === 'sse';
  return JSON.stringify(
    {
      name: server.name,
      transport: server.transport,
      ...(isRemote ? { url: server.url } : { command: server.command, args: server.args, env: server.env }),
      ...(isRemote && server.oauth ? { enableOAuth: true } : {}),
      toolAllowlist: server.toolAllowlist,
      toolCallTimeoutMs: server.toolCallTimeoutMs
    },
    null,
    2
  );
}

/**
 * 将 JSON 文本解析为可提交的 MCP server 草稿。
 * @param jsonText - 编辑器中的 JSON 文本
 * @returns 解析结果
 */
function parseMCPServerEditorDraft(jsonText: string): MCPServerDraftParseResult {
  const raw = jsonText.trim();
  if (!raw) {
    return { draft: null, error: '请输入 MCP Server JSON 配置。' };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const transport: MCPTransportType = parsed.transport === 'streamableHTTP' || parsed.transport === 'sse' ? parsed.transport : 'stdio';

    if (transport === 'stdio') {
      if (typeof parsed.command !== 'string' || !parsed.command.trim()) {
        return {
          draft: null,
          error: '`command` 必须是非空字符串（stdio 模式）。'
        };
      }
    } else if (typeof parsed.url !== 'string' || !parsed.url.trim()) {
      return {
        draft: null,
        error: '`url` 必须是非空字符串（远程模式）。'
      };
    }

    return {
      draft: {
        name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'New MCP Server',
        transport,
        command: typeof parsed.command === 'string' ? parsed.command.trim() : '',
        args: normalizeStringArray(parsed.args),
        env: normalizeStringRecord(parsed.env),
        url: typeof parsed.url === 'string' ? parsed.url.trim() : '',
        enableOAuth: Boolean(parsed.enableOAuth),
        toolAllowlist: normalizeStringArray(parsed.toolAllowlist),
        toolCallTimeoutMs: typeof parsed.toolCallTimeoutMs === 'number' ? parsed.toolCallTimeoutMs : DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS
      },
      error: ''
    };
  } catch (error) {
    return {
      draft: null,
      error: error instanceof Error ? error.message : 'JSON 格式错误'
    };
  }
}

interface Props {
  /** 弹窗是否打开 */
  open: boolean;
  /** 当前编辑的 server，空时为新增模式 */
  server?: MCPServerConfig | null;
}

const props = withDefaults(defineProps<Props>(), {
  server: null
});

const emit = defineEmits<{
  /**
   * 更新弹窗开关状态。
   * @param event - 事件名
   * @param value - 是否打开
   */
  (event: 'update:open', value: boolean): void;
  /**
   * 用户确认保存当前 JSON 草稿。
   * @param event - 事件名
   * @param draft - 解析后的草稿
   */
  (event: 'confirm', draft: MCPServerEditorDraft): void;
  /**
   * 用户取消编辑。
   * @param event - 事件名
   */
  (event: 'cancel'): void;
}>();

const modalOpen = computed<boolean>({
  /**
   * 读取弹窗开关状态。
   * @returns 是否打开
   */
  get(): boolean {
    return props.open;
  },
  /**
   * 同步弹窗开关状态给父层。
   * @param value - 是否打开
   */
  set(value: boolean): void {
    emit('update:open', value);
  }
});

const modalTitle = computed<string>(() => (props.server ? '编辑 MCP Server' : '添加 MCP Server'));
const editorRef = ref<InstanceType<typeof BMonaco> | null>(null);
const jsonText = ref(serializeMCPServerEditorDraft(props.server ?? null));

const parseResult = computed(() => parseMCPServerEditorDraft(jsonText.value));
const parsedDraft = computed<MCPServerEditorDraft | null>(() => parseResult.value.draft);
const parseError = computed<string>(() => parseResult.value.error);

/**
 * 供 BMonaco 使用的编辑器状态。
 * 这里仅承载 Monaco 所需的最小元信息，真实草稿仍由 jsonText 驱动。
 * @returns 统一编辑器状态
 */
const editorState = computed<EditorState>(() => ({
  id: props.server?.id ?? 'mcp-server-draft',
  name: props.server?.name ?? 'mcp-server.json',
  path: null,
  ext: 'json',
  content: jsonText.value
}));

/**
 * 根据当前模式重置编辑器内容。
 */
function resetEditorContent() {
  jsonText.value = serializeMCPServerEditorDraft(props.server ?? null);
}

/**
 * 聚焦 Monaco 编辑器。
 */
function focusEditor() {
  if (!editorRef.value || typeof editorRef.value.focusEditor !== 'function') {
    return;
  }

  editorRef.value.focusEditor();
}

/**
 * 处理取消操作。
 */
function handleCancel(): void {
  emit('cancel');
  emit('update:open', false);
}

/**
 * 处理确认保存操作。
 */
function handleConfirm(): void {
  if (!parsedDraft.value || parseError.value) {
    return;
  }

  emit('confirm', parsedDraft.value);
}

watch(
  () => [props.open, props.server] as const,
  async ([open]): Promise<void> => {
    if (!open) {
      return;
    }

    // 每次打开弹窗时都回填最新 server 配置，避免连续编辑时残留上次输入。
    resetEditorContent();
    await nextTick();
    focusEditor();
  },
  { immediate: true }
);
</script>

<style scoped lang="less">
.server-editor-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.server-editor-modal__editor {
  position: relative;
  min-height: 320px;
  padding: 1px;
  overflow: hidden;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 6px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.server-editor-modal__editor:hover {
  border-color: var(--border-hover);
}

.server-editor-modal__editor:focus-within {
  border-color: var(--input-focus-border);
  box-shadow: 0 0 0 2px var(--input-focus-shadow);
}

.server-editor-modal__monaco {
  min-height: 320px;
}

.server-editor-modal__editor :deep(.b-editor-monaco),
.server-editor-modal__editor :deep(.b-editor-monaco__host) {
  min-height: 320px;
}

.server-editor-modal__editor :deep(.monaco-editor),
.server-editor-modal__editor :deep(.monaco-editor-background) {
  background: var(--input-bg);
}

.server-editor-modal__editor :deep(.monaco-editor .margin),
.server-editor-modal__editor :deep(.monaco-editor .monaco-editor-background) {
  background: var(--input-bg);
}

.server-editor-modal__editor :deep(.monaco-editor .view-lines) {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
}

.server-editor-modal__footer {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
}

.server-editor-modal__error {
  flex: 1;
  font-size: 12px;
  color: var(--color-error);
}
</style>
