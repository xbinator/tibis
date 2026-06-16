/**
 * @file useShortcuts.ts
 * @description 全局快捷键注册 Hook，支持 Mac 按键映射和局部作用域守卫。
 */
import { useEventListener, useMagicKeys, whenever } from '@vueuse/core';
import { isMac } from '@/shared/platform/env';

/**
 * 快捷键清理函数。
 */
type ShortcutCleanup = () => void;

/**
 * 快捷键注册配置。
 */
interface ShortcutOptions {
  /** 快捷键组合，如 'Ctrl+S'、'Ctrl+Shift+Z' */
  key: string;
  /** 触发回调 */
  handler: () => void;
  /** 快捷键作用域守卫，返回 false 时不触发回调也不阻止默认行为 */
  guard?: (event: KeyboardEvent) => boolean;
  /** 是否启用，默认 true */
  enabled?: boolean;
  /** 是否阻止默认行为，默认 true */
  preventDefault?: boolean;
}

/**
 * 解析后的快捷键结构。
 */
interface ParsedShortcut {
  /** 是否需要 Ctrl 或 Meta 主修饰键 */
  ctrl: boolean;
  /** 是否需要 Shift 修饰键 */
  shift: boolean;
  /** 是否需要 Alt 修饰键 */
  alt: boolean;
  /** 主键，小写，如 's'、'z' */
  key: string;
}

/**
 * useShortcuts Hook 返回值。
 */
interface UseShortcutsReturn {
  /** 注册单个快捷键 */
  registerShortcut: (options: ShortcutOptions) => ShortcutCleanup;
  /** 批量注册快捷键 */
  registerShortcuts: (shortcuts: ShortcutOptions[]) => ShortcutCleanup;
}

/**
 * 通过原始键盘事件触发的快捷键规则。
 */
interface GuardedShortcutRule extends ParsedShortcut {
  /** 触发回调 */
  handler: () => void;
  /** 快捷键作用域守卫 */
  guard: (event: KeyboardEvent) => boolean;
  /** 是否阻止默认行为 */
  preventDefault: boolean;
}

/**
 * 解析快捷键字符串为修饰键和主键结构。
 * @param shortcut - 快捷键字符串
 * @returns 解析后的快捷键结构
 */
function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut
    .toLowerCase()
    .split('+')
    .map((s) => s.trim());
  return {
    ctrl: parts.includes('ctrl') || parts.includes('meta'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: parts[parts.length - 1]
  };
}

/**
 * 将快捷键字符串转为 useMagicKeys 所需的 key，处理 Mac 的 Ctrl 到 Meta 映射。
 * @param shortcut - 快捷键字符串
 * @returns useMagicKeys 可识别的组合键列表
 */
function resolveKeyCombos(shortcut: string): string[] {
  const normalized = shortcut.replace(/\+/g, '_').replace(/\s+/g, '').toLowerCase();
  const combos = [normalized];

  if (isMac() && /ctrl/i.test(shortcut)) {
    combos.push(normalized.replace(/ctrl/g, 'meta'));
  }

  return combos;
}

/**
 * 创建快捷键注册工具。
 * @returns 快捷键注册 API
 */
export function useShortcuts(): UseShortcutsReturn {
  const keys = useMagicKeys();

  /** 所有已注册快捷键的 preventDefault 规则，由单一 keydown 监听统一处理 */
  const preventRules: ParsedShortcut[] = [];
  /** 需要读取原始事件进行作用域判断的快捷键规则。 */
  const guardedShortcutRules: GuardedShortcutRule[] = [];

  // 单一全局 keydown 监听，统一处理所有 preventDefault
  useEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      // 修饰键自身触发的 keydown 直接跳过
      if (['control', 'shift', 'alt', 'meta'].includes(e.key.toLowerCase())) return;

      for (let i = 0; i < guardedShortcutRules.length; i++) {
        const rule = guardedShortcutRules[i];
        const ctrlMatch = isMac() ? e.metaKey === rule.ctrl : e.ctrlKey === rule.ctrl;

        if (ctrlMatch && e.shiftKey === rule.shift && e.altKey === rule.alt && e.key.toLowerCase() === rule.key && rule.guard(e)) {
          if (rule.preventDefault) {
            e.preventDefault();
          }

          rule.handler();
          return;
        }
      }

      for (let i = 0; i < preventRules.length; i++) {
        const rule = preventRules[i];

        const ctrlMatch = isMac() ? e.metaKey === rule.ctrl : e.ctrlKey === rule.ctrl;

        if (ctrlMatch && e.shiftKey === rule.shift && e.altKey === rule.alt && e.key.toLowerCase() === rule.key) {
          e.preventDefault();
          break;
        }
      }
    },
    { capture: true }
  );

  /**
   * 内部注册快捷键。
   * @param options - 快捷键注册配置
   * @returns 取消快捷键注册的函数
   */
  function register(options: ShortcutOptions): ShortcutCleanup {
    const { key, handler, guard, enabled = true, preventDefault = true } = options;

    if (!enabled) return () => undefined;

    if (guard) {
      const rule: GuardedShortcutRule = {
        ...parseShortcut(key),
        handler,
        guard,
        preventDefault
      };
      guardedShortcutRules.push(rule);

      return () => {
        const idx = guardedShortcutRules.indexOf(rule);
        if (idx !== -1) guardedShortcutRules.splice(idx, 1);
      };
    }

    // 注册 magic key 监听（自动处理 Mac Ctrl → Meta）
    const stopFns = resolveKeyCombos(key).map((combo) => whenever(keys[combo], handler));

    // 添加 preventDefault 规则（Mac 下同时匹配 meta）
    let parsedRule: ParsedShortcut | null = null;
    if (preventDefault) {
      parsedRule = parseShortcut(key);
      preventRules.push(parsedRule);
    }

    return () => {
      stopFns.forEach((stop) => stop());
      if (parsedRule) {
        const idx = preventRules.indexOf(parsedRule);
        if (idx !== -1) preventRules.splice(idx, 1);
      }
    };
  }

  /**
   * 批量注册快捷键。
   * @param shortcuts - 快捷键注册配置列表
   * @returns 取消全部快捷键注册的函数
   */
  function registerShortcuts(shortcuts: ShortcutOptions[]): ShortcutCleanup {
    const stopFns = shortcuts.map(register);
    return () => stopFns.forEach((stop) => stop());
  }

  return {
    registerShortcut: register,
    registerShortcuts
  };
}
