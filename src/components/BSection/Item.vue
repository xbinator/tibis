<script lang="tsx">
import type { BSectionLabelMinWidth } from './context';
import type { BSectionItemLabelAlign, BSectionItemProps as Props } from './types';
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
    },
    tips: {
      type: String,
      default: undefined
    },
    labelAlign: {
      type: String as PropType<BSectionItemLabelAlign>,
      default: 'left'
    },
    contentAlign: {
      type: String as PropType<'left' | 'right'>,
      default: 'left'
    }
  },
  setup(props: Props, { slots }) {
    /** 最近 BSectionBlock 提供的共享上下文。 */
    const sectionContext = useSectionContext();

    /** 标签水平对齐到 flex justify-content 的映射。 */
    const LABEL_ALIGN_JUSTIFY_MAP: Record<BSectionItemLabelAlign, CSSProperties['justifyContent']> = {
      left: 'flex-start',
      center: 'center',
      right: 'flex-end'
    };

    /** 标签区域的内联样式。 */
    const labelStyle = computed<CSSProperties>(() => {
      const minWidth = addCssUnit(props.labelMinWidth ?? sectionContext.labelMinWidth.value);
      const style: CSSProperties = {
        justifyContent: LABEL_ALIGN_JUSTIFY_MAP[props.labelAlign ?? 'left']
      };

      if (minWidth !== undefined) {
        style.minWidth = minWidth;
      }

      return style;
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
     *
     * - `tooltip`：包裹 ATooltip 并启用 `--tooltip` 修饰符（虚线下划线视觉提示）。
     * - `tips`：仅包裹 ATooltip，不加视觉提示类。
     * - 二者同时传入时，ATooltip 文本优先使用 `tooltip`，`--tooltip` 类仅由 `tooltip` 控制。
     * @returns label JSX 节点
     */
    function renderLabel() {
      const content = renderLabelContent();
      /** ATooltip 显示的文本，tooltip 优先于 tips。 */
      const tooltipText = props.tooltip ?? props.tips;
      /** 仅 tooltip 启用虚线下划线视觉提示，tips 不加。 */
      const labelClass = bem('label', { tooltip: !!props.tooltip });

      if (!content) return null;

      if (tooltipText) {
        return (
          <div class={labelClass} style={labelStyle.value}>
            <ATooltip title={tooltipText}>{content}</ATooltip>
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
        <div class={bem('content', { right: props.contentAlign === 'right' })}>{slots.default?.()}</div>
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

/* 控件区内容贴右：horizontal 下用 auto 外边距推到行尾 */
.b-section-item__content--right {
  margin-left: auto;
}

/* 垂直布局：前缀与控件纵向排列 */
.b-section-item--vertical {
  flex-direction: column;
  align-items: stretch;

  .b-section-item__label {
    justify-content: flex-start;
    min-width: 0;
  }

  /* 垂直布局下控件区贴右：覆盖默认的 align-items: stretch，让控件收缩到内容宽度并贴右 */
  .b-section-item__content--right {
    align-self: flex-end;
    margin-left: 0;
  }
}
</style>
