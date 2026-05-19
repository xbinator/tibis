/**
 * @file index.test.ts
 * @description 验证 BJsonViewer 使用 VueFlow 内建的 fitViewOnInit 进行整图居中展示。
 */
/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BJsonViewer from '@/components/BJsonViewer/index.vue';
import csJson from '../../../cs.json';

const vueFlowPropsSpy = vi.hoisted(() => vi.fn());

vi.mock('@vue-flow/core', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    Position: { Left: 'left', Right: 'right' },
    Handle: defineComponent({
      name: 'MockHandle',
      setup() {
        return () => h('div');
      }
    }),
    VueFlow: defineComponent({
      name: 'MockVueFlow',
      props: {
        nodes: { type: Array, default: () => [] },
        edges: { type: Array, default: () => [] },
        fitViewOnInit: { type: Boolean, default: false }
      },
      setup(props) {
        vueFlowPropsSpy({
          fitViewOnInit: props.fitViewOnInit,
          nodesCount: props.nodes.length,
          edgesCount: props.edges.length
        });

        return () => h('div');
      }
    })
  };
});

describe('BJsonViewer', () => {
  it('初始化时启用 VueFlow 内建的 fitViewOnInit 进行整图居中', () => {
    mount(BJsonViewer, {
      props: {
        value: csJson
      }
    });

    expect(vueFlowPropsSpy).toHaveBeenCalled();

    const latestCall = vueFlowPropsSpy.mock.calls.at(-1)?.[0];

    expect(latestCall).toBeDefined();
    expect(latestCall.fitViewOnInit).toBe(true);
    expect(latestCall.nodesCount).toBeGreaterThan(0);
    expect(latestCall.edgesCount).toBeGreaterThan(0);
  });
});
