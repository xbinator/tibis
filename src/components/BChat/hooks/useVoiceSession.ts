/**
 * @file useVoiceTranscriptionSession.ts
 * @description 管理语音转写会话中的分段队列、并行转写与增量拼接结果。
 */
import { computed, ref } from 'vue';
import { hasElectronAPI, getElectronAPI } from '@/shared/platform/electron-api';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** 语音段状态。 */
export type VoiceSegmentStatus = 'pending' | 'transcribing' | 'partial' | 'final' | 'failed';

/** 待转写的语音段输入。 */
export interface PendingVoiceSegment {
  /** 段落唯一标识。 */
  id: string;
  /** 段落分隔符。 */
  separator: '' | '\n';
  /** 音频二进制数据。 */
  buffer: ArrayBuffer;
  /** 音频 MIME 类型。 */
  mimeType: string;
}

/** 已登记的语音段。 */
export interface VoiceSegment extends PendingVoiceSegment {
  /** 段序号（即入队顺序）。 */
  index: number;
  /** 当前状态。 */
  status: VoiceSegmentStatus;
  /** 当前文本。 */
  text: string;
}

/** 单段转写结果。 */
export interface TranscribeResult {
  text: string;
}

/** 会话完成结果。 */
export interface SessionResult {
  /** 最终拼接文本。 */
  text: string;
  /** 转写失败的段 ID 列表，为空则表示全部成功。 */
  failedSegmentIds: string[];
}

/** 单段转写函数签名。 */
export type VoiceSegmentTranscriber = (segment: PendingVoiceSegment) => Promise<TranscribeResult>;

// ─── 默认转写执行器 ──────────────────────────────────────────────────────────

/**
 * 默认单段转写执行器，调用 Electron IPC 完成转写。
 */
export async function defaultVoiceSegmentTranscriber(segment: PendingVoiceSegment): Promise<TranscribeResult> {
  if (!hasElectronAPI()) {
    return { text: '' };
  }

  const result = await getElectronAPI().transcribeAudio({
    buffer: segment.buffer,
    mimeType: 'audio/wav',
    segmentId: segment.id,
    language: 'zh'
  });

  return { text: result.text };
}

// ─── 并发控制 ────────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 2;

/**
 * 创建并发门，用于限制同时转写的段数。
 * @param max - 最大并发数
 * @returns 获取与释放令牌的方法
 */
function createConcurrencyGate(max: number) {
  let active = 0;
  const pending: Array<() => void> = [];

  async function acquire(): Promise<void> {
    if (active < max) {
      active += 1;
      return;
    }
    return new Promise<void>((resolve) => {
      pending.push(resolve);
    });
  }

  function release(): void {
    active -= 1;
    const next = pending.shift();
    if (next) {
      active += 1;
      next();
    }
  }

  return { acquire, release };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * 管理语音转写分段会话。
 *
 * - 分段并行转写，最大并发 2，入队顺序即显示顺序。
 * - `partialText` 包含所有已完成和正在转写的段文本，用于实时显示。
 * - `finalText` 仅拼接状态为 `final` 的段。
 * - `completeSession` 等待全部段完成，返回失败段列表。
 *
 * @param transcribe - 单段转写执行器，默认使用 Electron IPC。
 */
export function useVoiceSession(transcribe: VoiceSegmentTranscriber = defaultVoiceSegmentTranscriber) {
  /** 当前会话的全部段信息。 */
  const segments = ref<VoiceSegment[]>([]);

  /** 并发控制门。 */
  const gate = createConcurrencyGate(MAX_CONCURRENT);

  /** 当前会话中所有段的转写 Promise，用于 completeSession 等待。 */
  let inFlightTasks: Promise<void>[] = [];

  /** 会话版本号，用于隔离 reset 之前遗留的异步结果。 */
  let sessionVersion = 0;

  // ── 计算属性 ───────────────────────────────────────────────────────────────

  /**
   * 已完成段按入队顺序拼接的最终文本。
   */
  const finalText = computed<string>(() =>
    segments.value
      .filter((s) => s.status === 'final')
      .map((s) => `${s.separator}${s.text}`)
      .join('')
  );

  /**
   * 增量文本，包含 final 和 transcribing 状态的段，用于实时显示。
   */
  const partialText = computed<string>(
    () =>
      [...segments.value]
        .sort((a, b) => a.index - b.index)
        .reduce<{ blocked: boolean; text: string }>(
          (state, segment) => {
            if (state.blocked) {
              return state;
            }

            if (segment.status !== 'final') {
              return { ...state, blocked: true };
            }

            return {
              blocked: false,
              text: `${state.text}${segment.separator}${segment.text}`
            };
          },
          { blocked: false, text: '' }
        ).text
  );

  // ── 内部工具 ───────────────────────────────────────────────────────────────

  /**
   * 通过索引更新段字段，触发 Vue 响应式。
   */
  function patchSegment(index: number, patch: Partial<Pick<VoiceSegment, 'status' | 'text'>>): void {
    const segment = segments.value[index];
    if (!segment) {
      return;
    }

    segments.value[index] = { ...segment, ...patch };
  }

  // ── 对外接口 ───────────────────────────────────────────────────────────────

  /**
   * 把新的语音段加入并行转写队列。
   *
   * 不等待任何前序段，直接通过并发门发起转写。
   * 调用方无需 await 此方法；如需等待转写完成，await `completeSession()`。
   *
   * @param input - 待入队语音段
   */
  function enqueueSegment(input: PendingVoiceSegment): void {
    const index = segments.value.length;
    segments.value.push({ ...input, index, status: 'pending', text: '' });
    const taskSessionVersion = sessionVersion;

    const task = gate.acquire().then(async () => {
      if (taskSessionVersion !== sessionVersion) {
        return;
      }

      patchSegment(index, { status: 'transcribing' });

      try {
        const { text } = await transcribe(input);
        if (taskSessionVersion !== sessionVersion || segments.value[index]?.id !== input.id) {
          return;
        }
        patchSegment(index, { status: 'final', text });
      } catch {
        if (taskSessionVersion !== sessionVersion || segments.value[index]?.id !== input.id) {
          return;
        }
        patchSegment(index, { status: 'failed', text: '' });
      } finally {
        gate.release();
      }
    });

    inFlightTasks.push(task);
  }

  /**
   * 等待所有已入队段转写完毕，返回最终结果。
   *
   * @returns 最终拼接文本与失败段 ID 列表
   */
  async function completeSession(): Promise<SessionResult> {
    await Promise.allSettled(inFlightTasks);

    const failedSegmentIds = segments.value.filter((s) => s.status === 'failed').map((s) => s.id);

    return { text: finalText.value, failedSegmentIds };
  }

  /**
   * 重置会话，清空所有段与队列，为下一次录音做准备。
   * 建议在 `completeSession` 完成后调用，避免重置正在转写中的段。
   */
  function resetSession(): void {
    sessionVersion += 1;
    segments.value = [];
    inFlightTasks = [];
  }

  return {
    segments,
    finalText,
    partialText,
    enqueueSegment,
    completeSession,
    resetSession
  };
}
