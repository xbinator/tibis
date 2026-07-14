/**
 * @file command-panel-model-entry.test.ts
 * @description 验证 BChat 全局模型入口使用 BCommandPanel 的模型 scope。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chatSource = readFileSync(new URL('../../../src/components/BChat/index.vue', import.meta.url), 'utf8');

describe('BChat command panel model entry', (): void => {
  it('opens the global command panel store in model scope', (): void => {
    expect(chatSource).toContain("import { useCommandPanelStore } from '@/stores/ui/commandPanel';");
    expect(chatSource).toContain('const commandPanelStore = useCommandPanelStore();');
    expect(chatSource).toContain('commandPanelStore.openModel({');
    expect(chatSource).toContain('onClose: (): void => promptEditorRef.value?.focus()');
    expect(chatSource).not.toContain('<BCommandPanel');
    expect(chatSource).not.toContain("import BCommandPanel from '@/components/BCommandPanel/index.vue';");
    expect(chatSource).not.toContain("import BModelSelect from '@/components/BModel/select.vue';");
    expect(chatSource).not.toContain('modelSelectOpen');
  });
});
