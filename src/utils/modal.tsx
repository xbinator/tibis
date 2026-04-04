import type { VNode } from 'vue';
import { createApp, h, ref } from 'vue';
import { Button, Input } from 'ant-design-vue';
import BModal from '@/components/BModal/index.vue';

interface ModalInstance {
  close: () => void;
}

interface ModalOptions {
  title?: string;
  width?: string | number;
}

// ——— 基础创建 / 销毁 ———

interface ModalInstance {
  close: () => void;
}

function createModalInstance(content: VNode, options: ModalOptions = {}): ModalInstance {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const visible = ref(true);

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    visible.value = false;
    setTimeout(() => {
      app.unmount();
      container.remove();
    }, 300);
  };

  const app = createApp({
    render() {
      return h(
        BModal,
        {
          open: visible.value,
          title: options.title,
          width: options.width || 400,
          closable: true,
          maskClosable: true,
          'onUpdate:open': (val: boolean) => {
            visible.value = val;
          },
          onClose: close
        },
        { default: () => content }
      );
    }
  });

  app.mount(container);
  return { close };
}

type DeleteOptions = Pick<ModalOptions, 'title'>;

interface InputOptions {
  defaultValue?: string;
  placeholder?: string;
  okText?: string;
}

interface FooterButtonsProps {
  onCancel: () => void;
  onConfirm: () => void;
  confirmText?: string;
  danger?: boolean;
}

/** 底部按钮区 */
function FooterButtons({ onCancel, onConfirm, confirmText = '确定', danger = false }: FooterButtonsProps) {
  return (
    <div style={{ textAlign: 'right' }}>
      <Button onClick={onCancel}>取消</Button>
      <Button type="primary" danger={danger} onClick={onConfirm} style={{ marginLeft: '8px' }}>
        {confirmText}
      </Button>
    </div>
  );
}

/** 确认类弹窗内容区 */
interface ConfirmContentProps extends FooterButtonsProps {
  content: string;
}

function ConfirmContent({ content, ...footerProps }: ConfirmContentProps) {
  return (
    <div>
      <div style={{ marginBottom: '16px' }}>{content}</div>
      <FooterButtons {...footerProps} />
    </div>
  );
}

// ——— 公共 API ———

export class Modal {
  static #confirmBase(content: string, title: string, footerProps: Partial<FooterButtonsProps> = {}): Promise<[boolean, boolean]> {
    return new Promise((resolve) => {
      let instance: ModalInstance;
      const handleConfirm = (): void => {
        resolve([false, true]);
        instance.close();
      };
      const handleCancel = (): void => {
        resolve([true, false]);
        instance.close();
      };

      instance = createModalInstance(<ConfirmContent content={content} onCancel={handleCancel} onConfirm={handleConfirm} {...footerProps} />, { title });
    });
  }

  static confirm(title: string, content: string): Promise<[boolean, boolean]> {
    return Modal.#confirmBase(content, title);
  }

  static delete(content: string, options: DeleteOptions = {}): Promise<[boolean, boolean]> {
    return Modal.#confirmBase(content, options.title ?? '删除确认', { confirmText: '删除', danger: true });
  }

  static input(title: string, options: InputOptions = {}): Promise<[boolean, string | null]> {
    const { defaultValue = '', placeholder = '', okText = '确定' } = options;
    return new Promise((resolve) => {
      let instance: ModalInstance;
      const inputValue = ref(defaultValue);

      const handleCancel = (): void => {
        resolve([true, null]);
        instance.close();
      };
      const onConfirm = (): void => {
        resolve([false, inputValue.value || null]);
        instance.close();
      };

      instance = createModalInstance(
        <div>
          <Input
            value={inputValue.value}
            style={{ width: '100%', marginBottom: '16px' }}
            onUpdate:value={(val: string) => {
              inputValue.value = val;
            }}
            placeholder={placeholder}
            autofocus
            onPressEnter={onConfirm}
          />
          <FooterButtons onCancel={handleCancel} onConfirm={onConfirm} confirmText={okText} />
        </div>,
        { title }
      );
    });
  }
}
