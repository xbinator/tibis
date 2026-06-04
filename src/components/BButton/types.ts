export interface BButtonProps {
  // 按钮类型
  type?: 'primary' | 'secondary' | 'outline' | 'text' | 'ghost';
  // 按钮大小
  size?: 'small' | 'middle' | 'large';
  // 是否禁用
  disabled?: boolean;
  // 是否加载中
  loading?: boolean;
  // 是否全宽
  block?: boolean;
  // 是否圆角
  rounded?: boolean;
  // 是否方角
  square?: boolean;
  // 图标
  icon?: string;
  // 文本
  text?: string;
  // 是否危险
  danger?: boolean;
  // 提示信息
  tooltip?: string;
  // 是否显示箭头
  arrow?: boolean;
  // 提示位置
  placement?:
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'topLeft'
    | 'topRight'
    | 'bottomLeft'
    | 'bottomRight'
    | 'leftTop'
    | 'leftBottom'
    | 'rightTop'
    | 'rightBottom';
}
