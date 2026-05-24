/**
 * @file mermaidRenderId.ts
 * @description 生成 Mermaid 渲染使用的稳定唯一 DOM id。
 */

let mermaidRenderIdCounter = 0;

/**
 * 生成 Mermaid render() 需要的唯一 id。
 * @returns 当前页面生命周期内唯一的 Mermaid 渲染 id
 */
export function createMermaidRenderId(): string {
  mermaidRenderIdCounter = (mermaidRenderIdCounter + 1) % Number.MAX_SAFE_INTEGER;

  return `mermaid-${Date.now()}-${mermaidRenderIdCounter}`;
}
