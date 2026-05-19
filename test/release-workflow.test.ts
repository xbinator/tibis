/**
 * @file release-workflow.test.ts
 * @description 验证 GitHub Release 工作流的手动发版回滚配置。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * GitHub Actions workflow 的最小结构。
 */
interface WorkflowDocument {
  /** 工作流任务映射表。 */
  jobs?: Record<string, WorkflowJob>;
}

/**
 * GitHub Actions job 的最小结构。
 */
interface WorkflowJob {
  /** job 依赖项。 */
  needs?: string | string[];
  /** job 级别执行条件。 */
  if?: string;
  /** job 输出映射。 */
  outputs?: Record<string, string>;
  /** job 步骤列表。 */
  steps?: WorkflowStep[];
}

/**
 * GitHub Actions step 的最小结构。
 */
interface WorkflowStep {
  /** step 名称。 */
  name?: string;
  /** shell 脚本内容。 */
  run?: string;
}

/**
 * 读取 Release workflow 配置。
 * @returns Release workflow 的 YAML 对象
 */
function readReleaseWorkflow(): WorkflowDocument {
  const workflowPath = resolve(process.cwd(), '.github/workflows/release.yml');
  const workflowContent = readFileSync(workflowPath, 'utf8');

  return load(workflowContent) as WorkflowDocument;
}

/**
 * 获取指定名称的 workflow job。
 * @param workflow - workflow 配置对象
 * @param jobName - job 名称
 * @returns workflow job
 */
function getWorkflowJob(workflow: WorkflowDocument, jobName: string): WorkflowJob {
  const job = workflow.jobs?.[jobName];

  expect(job).toBeDefined();

  return job!;
}

/**
 * 获取指定 job 中的脚本步骤。
 * @param job - workflow job
 * @param stepName - step 名称
 * @returns step 脚本内容
 */
function getStepRun(job: WorkflowJob, stepName: string): string {
  const step = job.steps?.find((item: WorkflowStep): boolean => item.name === stepName);

  expect(step?.run).toBeDefined();

  return step!.run!;
}

describe('release workflow rollback', () => {
  it('exports rollback metadata from the prepare job', () => {
    const workflow = readReleaseWorkflow();
    const prepareJob = getWorkflowJob(workflow, 'prepare');

    expect(prepareJob.outputs?.release_branch).toBe('${{ steps.release.outputs.release_branch }}');
    expect(prepareJob.outputs?.rollback_ref).toBe('${{ steps.release.outputs.rollback_ref }}');
    expect(prepareJob.outputs?.rollback_required).toBe('${{ steps.release.outputs.rollback_required }}');
  });

  it('rolls back manual release side effects when the prepare step is interrupted', () => {
    const workflow = readReleaseWorkflow();
    const prepareJob = getWorkflowJob(workflow, 'prepare');
    const prepareScript = getStepRun(prepareJob, 'Prepare tag');

    expect(prepareScript).toContain('trap rollback_release_side_effects EXIT');
    expect(prepareScript).toContain('git push origin ":refs/tags/$tag_name"');
    expect(prepareScript).toContain('git push origin "$rollback_ref:$REF_NAME" --force');
  });

  it('has a cleanup job for cancellations after prepare has completed', () => {
    const workflow = readReleaseWorkflow();
    const rollbackJob = getWorkflowJob(workflow, 'rollback');
    const rollbackScript = getStepRun(rollbackJob, 'Rollback release ref');

    expect(rollbackJob.needs).toEqual(['prepare', 'build', 'publish']);
    expect(rollbackJob.if).toContain('always()');
    expect(rollbackJob.if).toContain('cancelled()');
    expect(rollbackJob.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(rollbackJob.if).toContain("needs.prepare.outputs.rollback_required == 'true'");
    expect(rollbackScript).toContain('git push origin ":refs/tags/$TAG_NAME"');
    expect(rollbackScript).toContain('git push origin "$ROLLBACK_REF:$RELEASE_BRANCH" --force');
  });
});
