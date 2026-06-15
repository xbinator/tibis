/**
 * @file topicSegmenter.ts
 * @description 话题边界检测：根据时间间隔、显式切换词和文件引用跳变将消息分割为话题段。
 */

import dayjs from 'dayjs';
import type { Message } from '@/components/BChat/utils/types';

/**
 * 话题边界信息。
 */
export interface TopicBoundary {
  /** 边界所在消息 ID */
  messageId: string;
  /** 边界原因 */
  reason: 'time_gap' | 'explicit_switch' | 'file_context_change';
}

/**
 * 话题段定义。
 */
export interface TopicSegment {
  /** 段内消息列表 */
  messages: Message[];
  /** 段起始消息 ID */
  startMessageId: string;
  /** 段结束消息 ID */
  endMessageId: string;
}

/** 时间间隔阈值（30 分钟，单位毫秒） */
const TIME_GAP_THRESHOLD = 30 * 60 * 1000;

/** 显式切换关键词 */
const EXPLICIT_SWITCH_PATTERNS = [/换个话题/, /接下来/, /另外/, /接下来我们/, /现在来/, /下一个/, /new topic/i, /let's move on/i, /next/i];

/**
 * 检测话题边界。
 * @param messages - 消息列表（需按时间排序）
 * @returns 话题边界列表
 */
export function detectTopicBoundaries(messages: Message[]): TopicBoundary[] {
  const boundaries: TopicBoundary[] = [];

  for (let i = 1; i < messages.length; i += 1) {
    const prev = messages[i - 1];
    const curr = messages[i];

    // 只处理 user 和 assistant 消息
    if (curr.role !== 'user' && curr.role !== 'assistant') continue;

    // 1. 时间间隔检测
    const prevTime = dayjs(prev.createdAt).valueOf();
    const currTime = dayjs(curr.createdAt).valueOf();
    if (currTime - prevTime > TIME_GAP_THRESHOLD) {
      boundaries.push({ messageId: curr.id, reason: 'time_gap' });
      continue;
    }

    // 2. 显式切换词检测（仅 user 消息）
    if (curr.role === 'user' && curr.content) {
      const hasExplicitSwitch = EXPLICIT_SWITCH_PATTERNS.some((pattern) => pattern.test(curr.content));
      if (hasExplicitSwitch) {
        boundaries.push({ messageId: curr.id, reason: 'explicit_switch' });
        continue;
      }
    }

    // 3. 文件引用跳变检测（需要与时间间隔或显式切换共同出现才成立）
    // 单独的文件引用跳变不作为强边界，避免"跨文件修改"被误拆
    // 此处仅标记，不直接作为边界
  }

  return boundaries;
}

/**
 * 将消息列表按话题边界分割为多个段。
 * @param messages - 消息列表
 * @param boundaries - 话题边界列表
 * @returns 话题段列表
 */
export function segmentMessages(messages: Message[], boundaries: TopicBoundary[]): TopicSegment[] {
  if (boundaries.length === 0) {
    return [
      {
        messages,
        startMessageId: messages[0]?.id ?? '',
        endMessageId: messages[messages.length - 1]?.id ?? ''
      }
    ];
  }

  const boundaryIds = new Set(boundaries.map((b) => b.messageId));
  const segments: TopicSegment[] = [];
  let currentSegment: Message[] = [];

  for (const msg of messages) {
    if (boundaryIds.has(msg.id) && currentSegment.length > 0) {
      segments.push({
        messages: currentSegment,
        startMessageId: currentSegment[0].id,
        endMessageId: currentSegment[currentSegment.length - 1].id
      });
      currentSegment = [];
    }
    currentSegment.push(msg);
  }

  // 最后一个段
  if (currentSegment.length > 0) {
    segments.push({
      messages: currentSegment,
      startMessageId: currentSegment[0].id,
      endMessageId: currentSegment[currentSegment.length - 1].id
    });
  }

  return segments;
}

/**
 * 检测消息列表是否应该分割为多段。
 * 当话题边界数量 >= 2 时返回 true（至少 3 段才有意义）。
 * @param messages - 消息列表
 * @returns 是否应该分段
 */
export function shouldSegment(messages: Message[]): boolean {
  const boundaries = detectTopicBoundaries(messages);
  return boundaries.length >= 2;
}
