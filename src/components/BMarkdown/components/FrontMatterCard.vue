<template>
  <div :class="name">
    <div class="b-markdown-frontmatter__header">
      <span class="b-markdown-frontmatter__title">元数据</span>
      <div class="b-markdown-frontmatter__actions">
        <button
          class="b-markdown-frontmatter__action-btn b-markdown-frontmatter__toggle-btn"
          :title="collapsed ? '展开' : '折叠'"
          @click="collapsed = !collapsed"
        >
          <Icon :icon="collapsed ? 'mdi:chevron-down' : 'mdi:chevron-up'" />
        </button>
      </div>
    </div>

    <Transition name="b-markdown-frontmatter-collapse">
      <div v-show="!collapsed" class="b-markdown-frontmatter__content">
        <div v-for="(value, key) in data" :key="key" class="b-markdown-frontmatter__item">
          <input
            v-if="editingKey === key"
            v-model="editKeyInput"
            v-focus="{ selectAll: true }"
            class="b-markdown-frontmatter__key editing"
            placeholder="键名"
            @blur="handleKeyEditComplete(String(key))"
            @keydown.enter="handleKeyEditComplete(String(key))"
            @keydown.escape="cancelKeyEdit"
          />
          <div v-else class="b-markdown-frontmatter__key" @dblclick="startKeyEdit(String(key))">
            {{ key }}
          </div>

          <div class="b-markdown-frontmatter__value-wrapper">
            <input
              v-if="isSimpleValue(value)"
              v-model="localData[key]"
              class="b-markdown-frontmatter__value"
              :placeholder="'值'"
              @input="handleValueChange(String(key), localData[key])"
            />
            <div v-else class="b-markdown-frontmatter__value complex" @click="toggleComplexEdit(String(key))">
              {{ formatComplexValue(value) }}
            </div>
          </div>

          <button class="b-markdown-frontmatter__delete" title="删除" @click="handleDeleteField(String(key))">
            <Icon icon="mdi:close" />
          </button>

          <Transition name="b-markdown-frontmatter-slide">
            <div v-if="complexEditingKey === String(key)" class="b-markdown-frontmatter__complex-editor">
              <textarea
                v-model="complexEditValue"
                class="b-markdown-frontmatter__complex-textarea"
                placeholder="输入 YAML 格式的值"
                @keydown.enter.ctrl="confirmComplexEditInline"
              ></textarea>
              <div class="b-markdown-frontmatter__complex-actions">
                <button class="b-markdown-frontmatter__complex-btn cancel" @click="cancelComplexEdit">取消</button>
                <button class="b-markdown-frontmatter__complex-btn confirm" @click="confirmComplexEditInline">确定</button>
              </div>
            </div>
          </Transition>
        </div>

        <div class="b-markdown-frontmatter__add-row">
          <input v-model="newKey" class="b-markdown-frontmatter__key b-markdown-frontmatter__new-key" placeholder="新键名" @keydown.enter="confirmAddField" />
          <input
            v-model="newValue"
            class="b-markdown-frontmatter__value b-markdown-frontmatter__new-value"
            placeholder="新值"
            @keydown.enter="confirmAddField"
          />
          <button class="b-markdown-frontmatter__action-btn b-markdown-frontmatter__add-btn" title="添加" :disabled="!newKey.trim()" @click="confirmAddField">
            <Icon icon="mdi:check" />
          </button>
        </div>

        <div v-if="Object.keys(data).length === 0 && !newKey" class="b-markdown-frontmatter__empty">暂无元数据</div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { FrontMatterData } from '../hooks/useFrontMatter';
import { ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import yaml from 'js-yaml';
import { vFocus } from '@/directives/focus';
import { createNamespace } from '@/utils/namespace';

const [name] = createNamespace('', 'b-markdown-frontmatter');

interface Props {
  data?: FrontMatterData;
}

const props = withDefaults(defineProps<Props>(), {
  data: () => ({})
});

const emit = defineEmits<{
  (e: 'update', data: FrontMatterData): void;
  (e: 'updateField', key: string, value: unknown): void;
  (e: 'removeField', key: string): void;
  (e: 'addField', key: string, value: unknown): void;
}>();

const collapsed = ref(false);
const localData = ref<Record<string, unknown>>({ ...props.data });
const editingKey = ref<string | null>(null);
const editKeyInput = ref('');
const newKey = ref('');
const newValue = ref('');
const complexEditingKey = ref<string | null>(null);
const complexEditValue = ref('');

watch(
  () => props.data,
  (newData) => {
    localData.value = { ...newData };
  },
  { deep: true }
);

function isSimpleValue(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function formatComplexValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.length} 项]`;
  }
  if (typeof value === 'object' && value !== null) {
    return `{${Object.keys(value).length} 个属性}`;
  }
  return String(value);
}

function handleValueChange(key: string, value: unknown): void {
  emit('updateField', key, value);
}

function startKeyEdit(key: string): void {
  editingKey.value = key;
  editKeyInput.value = key;
}

function cancelKeyEdit(): void {
  editingKey.value = null;
  editKeyInput.value = '';
}

function handleKeyEditComplete(oldKey: string): void {
  const editedKey = editKeyInput.value.trim();

  if (!editedKey || editedKey === oldKey) {
    cancelKeyEdit();
    return;
  }

  if (editedKey !== oldKey && props.data[editedKey] !== undefined) {
    cancelKeyEdit();
    return;
  }

  const newData: FrontMatterData = {};
  Object.entries(props.data).forEach(([k, v]) => {
    if (k === oldKey) {
      newData[editedKey] = v;
    } else {
      newData[k] = v;
    }
  });

  emit('update', newData);
  cancelKeyEdit();
}

function handleDeleteField(key: string): void {
  emit('removeField', key);
}

function confirmAddField(): void {
  const key = newKey.value.trim();
  if (!key) return;

  let parsedValue: unknown = newValue.value;
  if (newValue.value.includes('\n') || newValue.value.includes(':')) {
    try {
      parsedValue = yaml.load(newValue.value);
    } catch {
      parsedValue = newValue.value;
    }
  }

  emit('addField', key, parsedValue);
  newKey.value = '';
  newValue.value = '';
}

function toggleComplexEdit(key: string): void {
  if (complexEditingKey.value === key) {
    complexEditingKey.value = null;
    return;
  }

  const value = props.data[key];
  complexEditingKey.value = key;
  complexEditValue.value = yaml.dump(value, { indent: 2, lineWidth: -1 }).trim();
}

function cancelComplexEdit(): void {
  complexEditingKey.value = null;
  complexEditValue.value = '';
}

function confirmComplexEditInline(): void {
  if (!complexEditingKey.value) return;

  try {
    const value = yaml.load(complexEditValue.value);
    emit('updateField', complexEditingKey.value, value);
  } catch {
    emit('updateField', complexEditingKey.value, complexEditValue.value);
  }
  complexEditingKey.value = null;
}
</script>

<style lang="less" scoped>
.b-markdown-frontmatter {
  margin: 16px 0;
  background-color: var(--frontmatter-bg);
  border: 1px solid var(--frontmatter-border);
  border-radius: 8px;
}

.b-markdown-frontmatter__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
}

.b-markdown-frontmatter__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--frontmatter-key-text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.b-markdown-frontmatter__actions {
  display: flex;
  gap: 4px;
}

.b-markdown-frontmatter__action-btn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 16px;
  color: var(--tag-secondary-text);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    color: var(--tag-text);
    background-color: var(--tag-hover-bg);
  }
}

.b-markdown-frontmatter__content {
  padding: 8px 14px;
  border-top: 1px solid var(--frontmatter-border);
}

.b-markdown-frontmatter__item {
  position: relative;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 0;
}

.b-markdown-frontmatter__key {
  box-sizing: border-box;
  min-width: 80px;
  max-width: 150px;
  height: 28px;
  padding: 0 8px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 12px;
  font-weight: 500;
  line-height: 28px;
  color: var(--color-purple);
  cursor: pointer;
  background-color: var(--color-purple-bg);
  border: 1px solid transparent;
  border-radius: 4px;
  transition: border-color 0.2s;

  &:hover {
    border-color: var(--color-purple-border);
  }

  &.editing {
    width: 120px;
    outline: none;
    background-color: var(--bg-primary);
    border-color: var(--color-purple);
  }
}

.b-markdown-frontmatter__value-wrapper {
  flex: 1;
  min-width: 0;
}

.b-markdown-frontmatter__value {
  box-sizing: border-box;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  font-size: 13px;
  line-height: 24px;
  color: var(--frontmatter-value-text);
  outline: none;
  background-color: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  transition: border-color 0.2s;

  &:focus {
    border-color: var(--color-purple);
  }

  &.complex {
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 12px;
    line-height: 24px;
    color: var(--tag-secondary-text);
    cursor: pointer;
    background-color: var(--tag-bg);

    &:hover {
      background-color: var(--tag-hover-bg);
    }
  }
}

.b-markdown-frontmatter__delete {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 14px;
  color: var(--tag-placeholder);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.2s;

  &:hover {
    color: var(--color-error);
    background-color: var(--color-error-bg);
  }
}

.b-markdown-frontmatter__item:hover .b-markdown-frontmatter__delete {
  opacity: 1;
}

.b-markdown-frontmatter__add-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 0 0;
  margin-top: 8px;
  border-top: 1px dashed var(--frontmatter-divider);
}

.b-markdown-frontmatter__new-key {
  background-color: var(--bg-primary);
  border: 1px solid var(--border-primary);
}

.b-markdown-frontmatter__new-value {
  background-color: var(--bg-primary);
}

.b-markdown-frontmatter__add-btn {
  opacity: 0.5;

  &:not(:disabled):hover {
    color: var(--color-success);
    background-color: var(--color-success-bg);
    opacity: 1;
  }

  &:disabled {
    cursor: not-allowed;
  }
}

.b-markdown-frontmatter__complex-editor {
  position: absolute;
  right: 0;
  z-index: 10;
  width: 320px;
  padding: 12px;
  margin-top: 4px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: var(--shadow-md);
}

.b-markdown-frontmatter__complex-textarea {
  width: 100%;
  height: 120px;
  padding: 8px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 12px;
  resize: vertical;
  outline: none;
  border: 1px solid var(--border-primary);
  border-radius: 4px;

  &:focus {
    border-color: var(--color-purple);
  }
}

.b-markdown-frontmatter__complex-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 8px;
}

.b-markdown-frontmatter__complex-btn {
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;

  &.cancel {
    color: var(--tag-secondary-text);
    background-color: var(--tag-bg);
    border: none;

    &:hover {
      background-color: var(--tag-hover-bg);
    }
  }

  &.confirm {
    color: var(--bg-primary);
    background-color: var(--color-purple);
    border: none;

    &:hover {
      background-color: var(--color-purple-hover);
    }
  }
}

.b-markdown-frontmatter__empty {
  padding: 12px 0;
  font-size: 13px;
  color: var(--tag-placeholder);
  text-align: center;
}

.b-markdown-frontmatter-collapse-enter-active,
.b-markdown-frontmatter-collapse-leave-active {
  overflow: hidden;
  transition: all 0.3s ease;
}

.b-markdown-frontmatter-collapse-enter-from,
.b-markdown-frontmatter-collapse-leave-to {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  opacity: 0;
}

.b-markdown-frontmatter-collapse-enter-to,
.b-markdown-frontmatter-collapse-leave-from {
  max-height: 500px;
  opacity: 1;
}

.b-markdown-frontmatter-slide-enter-active,
.b-markdown-frontmatter-slide-leave-active {
  transition: all 0.2s ease;
}

.b-markdown-frontmatter-slide-enter-from,
.b-markdown-frontmatter-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
