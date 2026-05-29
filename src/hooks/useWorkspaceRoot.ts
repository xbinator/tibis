/**
 * @file useWorkspaceRoot.ts
 * @description 工作区根目录 composable，挂载时自动异步初始化，提供同步读取能力。
 */
import { shallowRef, ref, onMounted } from 'vue';
import { native } from '@/shared/platform';

/**
 * 工作区根目录 composable。
 * 挂载时自动异步初始化，提供同步读取能力。
 * @returns workspaceRoot（响应式引用）和 getWorkspaceRoot（工具回调）
 */
export function useWorkspaceRoot() {
  /** 工作区根目录，挂载后同步读取 */
  const workspaceRoot = shallowRef<string | null>(null);

  /** 是否已完成初始化 */
  const initialized = ref(false);

  onMounted(async () => {
    const tibisWorkspace = await native.getTibisWorkspaceRoot();
    workspaceRoot.value = tibisWorkspace?.rootPath ?? null;
    initialized.value = true;
  });

  /** 同步获取工作区根目录，供工具选项使用 */
  function getWorkspaceRoot(): string | null {
    return workspaceRoot.value;
  }

  return { workspaceRoot, initialized, getWorkspaceRoot };
}
