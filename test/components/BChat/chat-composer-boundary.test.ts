/**
 * @file chat-composer-boundary.test.ts
 * @description 校验 BChat 入口组件与 useChatComposer 的编辑器依赖边界。
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const chatSourcePath = 'src/components/BChat/index.vue';
const composerSourcePath = 'src/components/BChat/hooks/useChatComposer.ts';
const imageUploadSourcePath = 'src/components/BChat/hooks/useImageUpload.ts';

/**
 * 读取仓库源码文本，便于约束组合层之间的依赖形状。
 * @param path - 仓库相对路径
 * @returns 源码文本
 */
async function readSource(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

describe('BChat composer boundary', (): void => {
  it('passes the prompt editor ref into the composer', async (): Promise<void> => {
    const chatSource = await readSource(chatSourcePath);
    const composerSource = await readSource(composerSourcePath);

    expect(chatSource).toContain('promptEditorRef,');
    expect(chatSource).not.toContain('editor: {');
    expect(composerSource).toContain('type EditorInstance = InstanceType<typeof BSmartEditor> & BSmartEditorExpose;');
    expect(composerSource).toContain('promptEditorRef: Ref<EditorInstance | undefined>;');
  });

  it('passes the interaction api into the composer', async (): Promise<void> => {
    const chatSource = await readSource(chatSourcePath);
    const composerSource = await readSource(composerSourcePath);
    const imageUploadSource = await readSource(imageUploadSourcePath);

    expect(chatSource).toContain('interactionAPI,');
    expect(chatSource).not.toContain('showToast: interactionAPI.showToast');
    expect(composerSource).toContain('interactionAPI: InteractionAPI;');
    expect(composerSource).not.toContain('showToast: options.interactionAPI.showToast');
    expect(imageUploadSource).toContain('interactionAPI: InteractionAPI;');
    expect(imageUploadSource).not.toContain('showToast: (options: ToastOptions) => void;');
  });

  it('passes clear input without wrapping it', async (): Promise<void> => {
    const chatSource = await readSource(chatSourcePath);

    expect(chatSource).toContain('clearInput: inputEvents.clear,');
    expect(chatSource).not.toContain('clearInput: (): void => inputEvents.clear()');
  });
});
