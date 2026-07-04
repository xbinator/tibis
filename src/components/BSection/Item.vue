<script lang="tsx">
import type { BSectionLabelMinWidth } from './context';
import type { BSectionItemProps as Props } from './types';
import { defineComponent, computed, type CSSProperties, type PropType, h } from 'vue';
import { addCssUnit } from '@/utils/css';
import { createNamespace } from '@/utils/namespace';
import { useSectionContext } from './context';

const [, bem] = createNamespace('section-item');

/**
 * 区块字段行组件
 * 封装"前缀 + 控件"的 flex 行布局，支持文字标签、图标前缀和 label tooltip。
 */
export default defineComponent({
  name: 'BSectionItem',
  props: {
    label: {
      type: String,
      default: undefined
    },
    icon: {
      type: String,
      default: undefined
    },
    iconSize: {
      type: Number,
      default: 16
    },
    labelMinWidth: {
      type: [Number, String] as PropType<BSectionLabelMinWidth | undefined>,
      default: undefined
    },
    direction: {
      type: String as PropType<'horizontal' | 'vertical'>,
      default: 'horizontal'
    },
    tooltip: {
      type: String,
      default: undefined
    }
  },
  setup(props: Props, { slots }) {
    /** 最近 BSectionBlock 提供的共享上下文。 */
    const sectionContext = useSectionContext();

    /** 标签区域的内联样式。 */
    const labelStyle = computed<CSSProperties>(() => {
      const minWidth = addCssUnit(props.labelMinWidth ?? sectionContext.labelMinWidth.value);

      if (minWidth === undefined) return {};

      return { minWidth };
    });

    /**
     * 渲染前缀内容（文字或图标）。
     * @returns 前缀 JSX 节点
     */
    function renderLabelContent() {
      if (props.label && !props.icon) {
        return h('span', null, props.label);
      }

      if (props.icon) {
        return <BIcon icon={props.icon} size={props.iconSize} class={bem('icon')} />;
      }

      return null;
    }

    /**
     * 渲染 label 区域，按需用 ATooltip 包裹。
     * @returns label JSX 节点
     */
    function renderLabel() {
      const content = renderLabelContent();
      const labelClass = bem('label', { tooltip: !!props.tooltip });

      if (!content) return null;

      if (props.tooltip) {
        return (
          <div class={labelClass} style={labelStyle.value}>
            <ATooltip title={props.tooltip}>{content}</ATooltip>
          </div>
        );
      }

      return (
        <div class={labelClass} style={labelStyle.value}>
          {content}
        </div>
      );
    }

    return () => (
      <div class={bem({ vertical: props.direction === 'vertical' })}>
        {renderLabel()}
        {slots.default?.()}
      </div>
    );
  }
});
</script>

<style lang="less">
.b-section-item {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;

  /* 控件填满剩余宽度 */
  .ant-input-number,
  .ant-select,
  .ant-input {
    width: 100%;
  }
}

.b-section-item__label {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  min-width: 18px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 标签启用 tooltip：鼠标移入显示虚线下划线 */
.b-section-item__label--tooltip {
  -webkit-text-decoration-line: underline;
  text-decoration-line: underline;
  -webkit-text-decoration-style: dashed;
  text-decoration-style: dashed;
  -webkit-text-decoration-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
  text-decoration-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
  cursor: help;
}

/* 垂直布局：前缀与控件纵向排列 */
.b-section-item--vertical {
  flex-direction: column;
  align-items: stretch;

  .b-section-item__label {
    justify-content: flex-start;
    min-width: 0;
  }
}
</style>
