<template>
  <div :class="name">
    <div :class="bem('text')">
      <template v-for="(segment, index) in segments" :key="index">
        <span v-if="segment.type === 'text'">{{ segment.text }}</span>
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
 * @description 渲染用户输入消息，将文件引用标签解析为内联 chip 展示。
 */
import type { ChatMessageTextPart } from 'types/chat';
import { computed } from 'vue';
import type { FileRefChipPresentation } from '@/components/BChatSidebar/components/FileRefChip';
import { createFileRefChipPresentation } from '@/components/BChatSidebar/components/FileRefChip';
import { useNavigate } from '@/hooks/useNavigate';
import { parseFileReferenceToken } from '@/utils/file';
import { createNamespace } from '@/utils/namespace';
import { MESSAGE_REF_PATTERN } from '../../utils/fileReferenceContext';

defineOptions({ name: 'BubblePartUserInput' });

interface Props {
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
  type: 'fileRef';
  fullPath: string | null;
  fileId: string | null;
  startLine: number;
  endLine: number;
  isUnsaved: boolean;
  presentation: FileRefChipPresentation;
}

type Segment = TextSegment | FileRefSegment;

// ─── 工具函数 ────────────────────────────────────────────────────────────────

/**
 * 将原始文本解析为纯文本与文件引用片段的交替序列。
 * 匹配格式：{{#filePath startLine-endLine|renderStartLine-renderEndLine}}
 */
function parseSegments(text: string): Segment[] {
  const result: Segment[] = [];
  const pattern = new RegExp(MESSAGE_REF_PATTERN.source, 'g');
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const matchStart = match.index!;

    // 匹配前的纯文本
    if (matchStart > lastIndex) {
      result.push({ type: 'text', text: text.slice(lastIndex, matchStart) });
    }

    // 去掉 {{ }} 后直接交给 parseFileReferenceToken 解析，避免手动拆组再拼回
    const tokenContent = match[0].slice(2, -2);
    const parsed = parseFileReferenceToken(tokenContent);

    if (parsed) {
      const presentation = createFileRefChipPresentation({
        title: parsed.filePath ?? parsed.fileName,
        fileName: parsed.fileName,
        startLine: parsed.startLine,
        endLine: parsed.endLine
      });

      result.push({
        type: 'fileRef',
        fullPath: parsed.filePath,
        fileId: parsed.fileId,
        startLine: parsed.startLine,
        endLine: parsed.endLine,
        isUnsaved: parsed.isUnsaved,
        presentation
      });
    }

    lastIndex = matchStart + match[0].length;
  }

  // 尾部剩余纯文本
  if (lastIndex < text.length) {
    result.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return result;
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

const segments = computed<Segment[]>(() => parseSegments(props.part.text ?? ''));
</script>

<style scoped lang="less">
@import url('../FileRefChip/index.less');

.message-bubble-user-input {
  word-break: normal;
  white-space: pre-wrap;

  &__text {
    word-break: normal;
    white-space: pre-wrap;
  }
}
</style>
