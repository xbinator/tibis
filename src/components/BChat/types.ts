export interface BChatProps {
  finished?: boolean;
  loading?: boolean;
  hideToBottomButton?: boolean;
}

export interface BChatExpose {
  scrollToBottom: (options?: { behavior?: 'smooth' | 'auto' }) => void;
}
