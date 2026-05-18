<template>
  <div :class="name">
    <div :class="bem('header')">
      <span :class="bem('title')">元数据</span>
      <div :class="bem('actions')">
        <button :class="[bem('action-btn'), bem('toggle-btn')]" :title="collapsed ? '展开' : '折叠'" @click="collapsed = !collapsed">
          <Icon :icon="collapsed ? 'mdi:chevron-down' : 'mdi:chevron-up'" />
        </button>
      </div>
    </div>

    <Transition name="b-markdown-frontmatter-collapse">
      <div v-show="!collapsed" :class="bem('content')">
        <div v-for="(value, key) in data" :key="key" :class="bem('item')">
          <input
            v-if="editingKey === key"
            v-model="editKeyInput"
            v-focus="{ selectAll: true }"
            :class="bem('key', 'editing')"
            placeholder="键名"
            @blur="handleKeyEditComplete(String(key))"
            @keydown.enter="handleKeyEditComplete(String(key))"
            @keydown.escape="cancelKeyEdit"
          />
          <div v-else :class="bem('key')" @dblclick="startKeyEdit(String(key))">
            {{ key }}
          </div>

          <div :class="bem('value-wrapper')">
            <input
              v-if="isSimpleValue(value)"
              v-model="localData[key]"
              :class="bem('value')"
              :placeholder="'值'"
              @input="handleValueChange(String(key), localData[key])"
            />
            <div v-else :class="[bem('value'), bem('value', 'complex')]" @click="toggleComplexEdit(String(key))">
              {{ formatComplexValue(value) }}
            </div>
          </div>

          <button :class="bem('delete')" title="删除" @click="handleDeleteField(String(key))">
            <Icon icon="mdi:close" />
          </button>
        </div>

        <div :class="bem('add-row')">
          <input v-model="newKey" :class="[bem('key'), bem('new-key')]" placeholder="新键名" @keydown.enter="confirmAddField" />
          <input v-model="newValue" :class="[bem('value'), bem('new-value')]" placeholder="新值" @keydown.enter="confirmAddField" />
          <button :class="[bem('action-btn'), bem('add-btn')]" title="添加" :disabled="!newKey.trim()" @click="confirmAddField">
            <Icon icon="mdi:check" />
          </button>
        </div>

        <div v-if="Object.keys(data).length === 0 && !newKey" :class="bem('empty')">暂无元数据</div>
      </div>
    </Transition>

    <BModal v-model:open="complexEditOpen" title="编辑元数据值" :width="520">
      <ATextarea v-model:value="complexEditValue" :autosize="{ minRows: 16, maxRows: 20 }" placeholder="输入 YAML 格式的值" />
      <template #footer>
        <BButton type="secondary" @click="cancelComplexEdit">取消</BButton>
        <BButton @click="confirmComplexEditInline">确定</BButton>
      </template>
    </BModal>
  </div>
</template>

<script setup lang="ts">
import type { FrontMatterData } from '../hooks/useFrontMatter';
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import yaml from 'js-yaml';
import { vFocus } from '@/directives/focus';
import { createNamespace } from '@/utils/namespace';

const [name, bem] = createNamespace('', 'b-markdown-frontmatter');

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

const complexEditOpen = computed({
  get: () => complexEditingKey.value !== null,
  set: (val: boolean) => {
    if (!val) {
      complexEditingKey.value = null;
      complexEditValue.value = '';
    }
  }
});

watch(
  () => props.data,
  (newData) => {
    localData.value = { ...newData };
  },
  { deep: true }
);

function isSimpleValue(value: unknown): boolean {
  return ['string', 'number', 'boolean'].includes(typeof value);
}

function formatComplexValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.length} 项]`;
  }
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
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
    complexEditOpen.value = false;
    return;
  }

  const value = props.data[key];
  complexEditingKey.value = key;
  complexEditValue.value = yaml.dump(value, { indent: 2, lineWidth: -1 }).trim();
}

function cancelComplexEdit(): void {
  complexEditOpen.value = false;
}

function confirmComplexEditInline(): void {
  if (!complexEditingKey.value) return;

  try {
    const value = yaml.load(complexEditValue.value);
    emit('updateField', complexEditingKey.value, value);
  } catch {
    emit('updateField', complexEditingKey.value, complexEditValue.value);
  }
  complexEditOpen.value = false;
}
</script>

<style lang="less" scoped>
.b-markdown-frontmatter {
  margin: 16px 40px 0;
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

  &--editing {
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

  &--complex {
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 12px;
    line-height: 28px;
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
</style>
