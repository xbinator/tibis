/**
 * @file widgetMethods.ts
 * @description BWidget 方法配置规整工具。
 */

/**
 * 方法动作配置。
 */
export interface MethodAction {
  /** 需要调用的方法名 */
  method: string;
  /** 方法参数，支持 {{ }} 变量模板 */
  args: string[];
}

/**
 * 判断值是否为普通对象。
 * @param value - 待判断值
 * @returns 是否为普通对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 规整方法动作。
 * @param value - 原始方法动作
 * @returns 可执行的方法动作
 */
export function normalizeMethodAction(value: unknown): MethodAction | null {
  if (!isRecord(value)) {
    return null;
  }

  const method = typeof value.method === 'string' ? value.method.trim() : '';

  if (!method) {
    return null;
  }

  return {
    args: Array.isArray(value.args) ? value.args.filter((item: unknown): item is string => typeof item === 'string') : [],
    method
  };
}

/**
 * 规整方法动作列表。
 * @param value - 原始方法动作列表
 * @returns 可执行的方法动作列表
 */
export function normalizeMethodActions(value: unknown): MethodAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((action: unknown): MethodAction[] => {
    const normalizedAction = normalizeMethodAction(action);

    return normalizedAction ? [normalizedAction] : [];
  });
}
