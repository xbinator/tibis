/**
 * @file navigation.ts
 * @description 统一判定 Vue Router 导航结果是否阻断后续业务状态变更。
 */
import { isNavigationFailure, NavigationFailureType } from 'vue-router';

/**
 * 判断导航结果是否代表需要阻断后续操作的失败。
 * 重复导航已达到目标地址，因此按成功处理；中止和取消导航按失败处理。
 * @param result - router.push 或 router.replace 的已解析结果
 * @returns 是否需要阻断后续业务状态变更
 */
export function isBlockingNavigationFailure(result: unknown): boolean {
  return isNavigationFailure(result) && !isNavigationFailure(result, NavigationFailureType.duplicated);
}
