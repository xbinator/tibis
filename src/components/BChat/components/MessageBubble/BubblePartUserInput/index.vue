<template>
  <div :class="name">
    <div :class="bem('text')">
      <template v-for="(segment, index) in segments" :key="index">
        <span v-if="segment.type === 'text'">{{ segment.text }}</span>
        <span v-else-if="segment.type === 'skill'" class="b-skill-reference" :title="segment.name">
          <span class="b-skill-reference__name">{{ segment.name }}</span>
        </span>
        <span
          v-else
          :class="segment.presentation.rootClass"
          :title="segment.presentation.title"
          role="button"
          tabindex="0"
          @click="onChipClick(segment)"
          @keydown.enter.prevent="onChipClick(segment)"
          @keydown.space.prevent="onChipClick(segment)"
        >
          <BRecentIcon :class="segment.presentation.iconClass" :file-name="segment.presentation.fileName" :size="14" />
          <span :class="segment.presentation.fileNameClass">{{ segment.presentation.fileName }}</span>
          <span :class="segment.presentation.lineTextClass">{{ segment.presentation.lineText }}</span>
        </span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file BubblePartUserInput.vue
 * @description 渲染用户输入消息，将文件与技能引用 Token 解析为内联引用展示。
 */
import type { ChatMessageTextPart } from 'types/chat';
import { computed } from 'vue';
import type { FileRefChipPresentation } from '@/components/BChat/utils/chipResolver/file/presentation';
import { createFileRefChipPresentation } from '@/components/BChat/utils/chipResolver/file/presentation';
import { splitReferenceText, type UserInputReferenceSegment } from '@/components/BChat/utils/userInputReference';
import { useNavigate } from '@/hooks/useNavigate';
import type { ParsedFileReference } from '@/utils/file/reference';
import { createNamespace } from '@/utils/namespace';

defineOptions({ name: 'BubblePartUserInput' });

interface Props {
  /** 用户输入消息片段 */
  part: ChatMessageTextPart;
}

const props = defineProps<Props>();
const { openFile } = useNavigate();

const [name, bem] = createNamespace('', 'message-bubble-user-input');

// ─── 类型定义 ────────────────────────────────────────────────────────────────

interface TextSegment {
  type: 'text';
  text: string;
}

interface FileRefSegment {
  type: 'file';
  fullPath: string | null;
  fileId: string | null;
  startLine: number;
  endLine: number;
  isUnsaved: boolean;
  presentation: FileRefChipPresentation;
}

interface SkillRefSegment {
  type: 'skill';
  name: string;
}

/** 用户输入中可渲染的文本、文件引用或技能引用片段。 */
type Segment = TextSegment | FileRefSegment | SkillRefSegment;

// ─── 工具函数 ────────────────────────────────────────────────────────────────

/**
 * 将结构化文件引用转换为消息气泡片段。
 * @param parsed - 已解析文件引用
 * @returns 文件引用片段
 */
function createFileRefSegment(parsed: ParsedFileReference): FileRefSegment {
  const presentation = createFileRefChipPresentation({
    title: parsed.filePath ?? parsed.fileName,
    fileName: parsed.fileName,
    startLine: parsed.startLine,
    endLine: parsed.endLine
  });

  return {
    type: 'file',
    fullPath: parsed.filePath,
    fileId: parsed.fileId,
    startLine: parsed.startLine,
    endLine: parsed.endLine,
    isUnsaved: parsed.isUnsaved,
    presentation
  };
}

/**
 * 将原始文本解析为纯文本、文件引用与技能引用片段的交替序列。
 * 匹配格式：`{{@filePath}}`、`{{@filePath#Lstart-Lend}}` 与 `{{$skillName}}`。
 * @param text - 用户消息原始正文
 * @returns 有序渲染片段
 */
function parseTextSegments(text: string): Segment[] {
  return splitReferenceText(text).map((segment: UserInputReferenceSegment): Segment => {
    if (segment.type === 'text') return segment;
    if (segment.type === 'file') return createFileRefSegment(segment.token.match.reference);
    return { type: 'skill', name: segment.token.match.name };
  });
}

/**
 * 处理文件引用 chip 的点击与键盘打开行为。
 * @param segment - 被触发的文件引用片段
 */
function onChipClick(segment: FileRefSegment): void {
  openFile({
    filePath: segment.fullPath,
    fileId: segment.fileId,
    fileName: segment.presentation.fileName,
    range: {
      startLine: segment.startLine,
      endLine: segment.endLine
    }
  });
}

// ─── 计算属性 ────────────────────────────────────────────────────────────────

const segments = computed<Segment[]>(() => parseTextSegments(props.part.text ?? ''));
</script>

<style scoped lang="less">
.message-bubble-user-input {
  word-break: normal;
  white-space: pre-wrap;
}

.message-bubble-user-input__text {
  word-break: normal;
  white-space: pre-wrap;
}
</style>
