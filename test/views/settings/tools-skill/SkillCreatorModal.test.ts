/**
 * @file SkillCreatorModal.test.ts
 * @description 验证 SkillCreatorModal 三步流程渲染与交互。
 */
/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Mock electron API
vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: () => ({
    ensureDir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    renameFile: vi.fn().mockResolvedValue(undefined),
    trashFile: vi.fn().mockResolvedValue(undefined),
    getHomeDir: vi.fn().mockResolvedValue('/home/user'),
    getPathStatus: vi.fn().mockResolvedValue({ exists: false, isFile: false, isDirectory: false })
  })
}));

// Mock skill store
vi.mock('@/stores/ai/skill', () => ({
  useSkillStore: () => ({
    skills: [],
    rescan: vi.fn().mockResolvedValue(undefined)
  })
}));

// Mock message
vi.mock('ant-design-vue', () => ({
  message: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

describe('SkillCreatorModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders upload step by default when open', async () => {
    const SkillCreatorModal = await import('@/views/settings/tools/skill/components/SkillCreator.vue');

    const wrapper = mount(SkillCreatorModal.default, {
      props: { open: true, 'onUpdate:open': () => {} },
      global: {
        stubs: {
          BModal: {
            template: '<div><slot /><slot name="footer" /></div>',
            props: ['title', 'width', 'closable', 'maskClosable', 'mainStyle']
          },
          BUpload: {
            template: '<div class="upload-stub"><slot /></div>',
            props: ['accept']
          },
          BButton: { template: '<button class="btn-stub" @click="$emit(\'click\')"><slot /></button>', props: ['type', 'size', 'loading', 'disabled'] },
          ASpin: { template: '<div class="spin-stub" />', props: ['size'] },
          Icon: { template: '<i class="icon-stub" />', props: ['icon', 'width'] }
        }
      }
    });

    expect(wrapper.text()).toContain('拖拽');
    expect(wrapper.text()).toContain('.skill');
    expect(wrapper.text()).toContain('.zip');
    expect(wrapper.text()).toContain('5MB');
  });

  it('has a cancel button in upload step', async () => {
    const SkillCreatorModal = await import('@/views/settings/tools/skill/components/SkillCreator.vue');

    const wrapper = mount(SkillCreatorModal.default, {
      props: { open: true, 'onUpdate:open': () => {} },
      global: {
        stubs: {
          BModal: {
            template: '<div><slot /><slot name="footer" /></div>',
            props: ['title', 'width', 'closable', 'maskClosable', 'mainStyle']
          },
          BUpload: {
            template: '<div class="upload-stub"><slot /></div>',
            props: ['accept']
          },
          BButton: { template: '<button class="btn-stub" @click="$emit(\'click\')"><slot /></button>', props: ['type', 'size', 'loading', 'disabled'] },
          ASpin: { template: '<div class="spin-stub" />', props: ['size'] },
          Icon: { template: '<i class="icon-stub" />', props: ['icon', 'width'] }
        }
      }
    });

    const cancelBtn = wrapper.findAll('.btn-stub').find((b) => b.text() === '取消');
    expect(cancelBtn).toBeTruthy();
  });
});
