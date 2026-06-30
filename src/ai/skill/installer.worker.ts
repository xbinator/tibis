/**
 * @file installer.worker.ts
 * @description Web Worker：接收 zip ArrayBuffer，解压并解析 SKILL.md。
 */
/* eslint-disable no-restricted-globals */
import type { SkillDefinition } from './types';
import { parseSkillPackageBuffer, type SkillPackageResource } from './package';

/** Worker 请求。 */
interface WorkerRequest {
  type: 'parse';
  buffer: ArrayBuffer;
}

/** Worker 成功响应。 */
interface WorkerSuccessResponse {
  type: 'success';
  skill: SkillDefinition;
  /** 原始 SKILL.md 完整内容（含 frontmatter），安装时直接写入保留所有字段 */
  rawSkillMd: string;
  resources: SkillPackageResource[];
  warnings: string[];
}

/** Worker 错误响应。 */
interface WorkerErrorResponse {
  type: 'error';
  error: string;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>): Promise<void> => {
  if (event.data.type !== 'parse') return;

  const { buffer } = event.data;

  try {
    const result = await parseSkillPackageBuffer(buffer);

    self.postMessage({
      type: 'success',
      ...result
    } satisfies WorkerSuccessResponse);
  } catch (err: unknown) {
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err)
    } satisfies WorkerErrorResponse);
  }
};
