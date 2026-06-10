/**
 * @file vue3-moveable.d.ts
 * @description 修正 vue3-moveable 包实际 ESM 入口的类型声明。
 */
declare module 'vue3-moveable/dist/moveable.js' {
  import type { DefineComponent } from 'vue';

  const Moveable: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;

  export default Moveable;
  export const VueMoveable: typeof Moveable;
}
