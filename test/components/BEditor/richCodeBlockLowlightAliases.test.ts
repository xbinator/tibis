/**
 * @file richCodeBlockLowlightAliases.test.ts
 * @description 验证富文本代码块高亮使用的 Lowlight 语言别名配置。
 */
import { common, createLowlight } from 'lowlight';
import { describe, expect, test } from 'vitest';
import { registerRichCodeBlockLowlightAliases } from '@/components/BEditor/utils/richCodeBlockLowlight';

/**
 * 提取语法树中的 className，便于断言高亮 token 已产生。
 */
interface LowlightElementNode {
  /** 节点类型 */
  type: string;
  /** 子节点列表 */
  children?: LowlightElementNode[];
  /** 节点属性 */
  properties?: {
    /** 高亮类名 */
    className?: string[];
  };
}

/**
 * 收集 Lowlight 语法树中的高亮类名。
 * @param node - 当前语法树节点
 * @returns 当前节点及子节点中的 className 列表
 */
function collectClassNames(node: LowlightElementNode): string[] {
  const currentClassNames = node.properties?.className ?? [];
  const childClassNames = node.children?.flatMap((child: LowlightElementNode): string[] => collectClassNames(child)) ?? [];

  return [...currentClassNames, ...childClassNames];
}

describe('registerRichCodeBlockLowlightAliases', () => {
  test('registers rich editor UI languages before the first highlight pass', () => {
    const lowlight = createLowlight(common);

    expect(lowlight.registered('vue')).toBe(false);
    expect(lowlight.registered('react')).toBe(false);

    registerRichCodeBlockLowlightAliases(lowlight);

    expect(lowlight.registered('vue')).toBe(true);
    expect(lowlight.registered('react')).toBe(true);

    const vueTree = lowlight.highlight('vue', '<template><BButton /></template>') as LowlightElementNode;
    const reactTree = lowlight.highlight('react', 'const button = <Button />') as LowlightElementNode;

    expect(collectClassNames(vueTree)).toContain('hljs-tag');
    expect(collectClassNames(reactTree)).toContain('hljs-keyword');
  });
});
