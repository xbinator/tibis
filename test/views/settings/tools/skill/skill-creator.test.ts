/**
 * @file skill-creator.test.ts
 * @description Skill 创建弹窗安装资源文件测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SkillCreator from '@/views/settings/tools/skill/components/SkillCreator.vue';

/** Electron API mock。 */
const electronAPIMock = vi.hoisted(() => ({
  ensureDir: vi.fn<(path: string) => Promise<void>>(),
  getHomeDir: vi.fn<() => Promise<string>>(),
  getPathStatus: vi.fn<(path: string) => Promise<{ exists: boolean }>>(),
  renameFile: vi.fn<(oldPath: string, newPath: string) => Promise<void>>(),
  saveBinaryFile: vi.fn<(content: ArrayBuffer, path?: string) => Promise<string | null>>(),
  trashFile: vi.fn<(path: string) => Promise<void>>(),
  writeFile: vi.fn<(path: string, content: string) => Promise<void>>()
}));

/** Skill store rescan mock。 */
const rescanMock = vi.hoisted(() => vi.fn<() => Promise<void>>());

/** Ant Design message mock。 */
const messageMock = vi.hoisted(() => ({
  error: vi.fn<(content: string) => void>(),
  success: vi.fn<(content: string) => void>()
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: () => electronAPIMock
}));

vi.mock('@/stores/ai/skill', () => ({
  useSkillStore: () => ({
    skills: [],
    rescan: rescanMock
  })
}));

vi.mock('ant-design-vue', () => ({
  message: messageMock
}));

vi.mock('@iconify/vue', () => ({
  Icon: {
    name: 'Icon',
    props: {
      icon: { type: String, required: true }
    },
    template: '<i class="icon-stub" :data-icon="icon"></i>'
  }
}));

/** Worker 成功响应资源。 */
interface WorkerResourceFixture {
  /** 资源路径。 */
  relativePath: string;
  /** 二进制内容。 */
  content: ArrayBuffer;
  /** 预览内容。 */
  previewContent: string;
}

/** Worker 成功响应。 */
interface WorkerSuccessFixture {
  /** 响应类型。 */
  type: 'success';
  /** Skill 解析结果。 */
  skill: {
    /** Skill 名称。 */
    name: string;
    /** Skill 描述。 */
    description: string;
  };
  /** 原始 SKILL.md 内容。 */
  rawSkillMd: string;
  /** 资源文件。 */
  resources: WorkerResourceFixture[];
  /** 警告列表。 */
  warnings: string[];
}

/** Worker 测试响应。 */
const workerSuccessResponse: WorkerSuccessFixture = {
  type: 'success',
  skill: {
    name: 'demo-skill',
    description: 'Demo skill'
  },
  rawSkillMd: '---\nname: demo-skill\ndescription: Demo skill\n---\n',
  resources: [
    {
      relativePath: 'assets/icon.bin',
      content: new Uint8Array([5, 6, 7]).buffer,
      previewContent: '二进制资源，无法预览（3 bytes）'
    }
  ],
  warnings: []
};

/**
 * Worker 测试替身。
 */
class WorkerStub {
  /** 成功消息回调。 */
  onmessage: ((event: MessageEvent<WorkerSuccessFixture>) => void) | null = null;

  /** 错误消息回调。 */
  onerror: ((event: ErrorEvent) => void) | null = null;

  /**
   * 发送解析请求。
   */
  postMessage(): void {
    this.onmessage?.({ data: workerSuccessResponse } as MessageEvent<WorkerSuccessFixture>);
  }

  /**
   * 终止 Worker。
   */
  terminate(): void {
    // 测试替身无需清理真实线程。
  }
}

/**
 * 弹窗测试替身。
 */
const BModalStub = defineComponent({
  name: 'BModal',
  props: {
    open: { type: Boolean, required: true },
    title: { type: String, default: '' }
  },
  emits: ['update:open', 'close'],
  template: '<section v-if="open"><h3>{{ title }}</h3><slot /><footer><slot name="footer" /></footer></section>'
});

/**
 * 上传组件测试替身。
 */
const BUploadStub = defineComponent({
  name: 'BUpload',
  emits: ['change', 'update:dragOver'],
  setup(_props, { emit }) {
    /**
     * 转发原生文件选择事件。
     * @param event - 原生变更事件
     */
    function handleChange(event: Event): void {
      if (event.target instanceof HTMLInputElement && event.target.files) {
        emit('change', event.target.files);
      }
    }

    return { handleChange };
  },
  template: '<div><slot></slot><input type="file" @change="handleChange" /></div>'
});

/**
 * 按钮测试替身。
 */
const BButtonStub = defineComponent({
  name: 'BButton',
  props: {
    loading: { type: Boolean, default: false },
    type: { type: String, default: 'primary' }
  },
  emits: ['click'],
  template: '<button type="button" :disabled="loading" @click="$emit(\'click\', $event)"><slot /></button>'
});

/**
 * Skill 预览测试替身。
 */
const SkillPreviewStub = defineComponent({
  name: 'SkillPreview',
  props: {
    virtualFiles: { type: Array, default: () => [] },
    initialFilePath: { type: String, default: '' }
  },
  template: '<div class="skill-preview-stub"></div>'
});

/**
 * 挂载 Skill 创建弹窗。
 * @returns 组件包装器
 */
function mountSkillCreator(): VueWrapper {
  return mount(SkillCreator, {
    props: {
      open: true
    },
    global: {
      components: {
        BUpload: BUploadStub
      },
      stubs: {
        ASpin: true,
        BButton: BButtonStub,
        BModal: BModalStub,
        SkillPreview: SkillPreviewStub
      }
    }
  });
}

/**
 * 查找指定文本按钮。
 * @param wrapper - 组件包装器
 * @param text - 按钮文本
 * @returns 按钮包装器
 */
function findButtonByText(wrapper: VueWrapper, text: string): DOMWrapper<HTMLButtonElement> {
  const button = wrapper.findAll<HTMLButtonElement>('button').find((item: DOMWrapper<HTMLButtonElement>): boolean => item.text().trim() === text);

  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}

/**
 * 上传测试文件。
 * @param wrapper - 组件包装器
 */
async function uploadSkillPackage(wrapper: VueWrapper): Promise<void> {
  const input = wrapper.find<HTMLInputElement>('input[type="file"]');
  const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'demo.skill', { type: 'application/zip' });

  Object.defineProperty(input.element, 'files', {
    value: [file],
    configurable: true
  });
  await input.trigger('change');
  await flushPromises();
}

describe('SkillCreator', (): void => {
  beforeEach((): void => {
    vi.stubGlobal('Worker', WorkerStub);
    electronAPIMock.ensureDir.mockReset();
    electronAPIMock.getHomeDir.mockReset();
    electronAPIMock.getPathStatus.mockReset();
    electronAPIMock.renameFile.mockReset();
    electronAPIMock.saveBinaryFile.mockReset();
    electronAPIMock.trashFile.mockReset();
    electronAPIMock.writeFile.mockReset();
    rescanMock.mockReset();
    messageMock.error.mockReset();
    messageMock.success.mockReset();
    electronAPIMock.ensureDir.mockResolvedValue(undefined);
    electronAPIMock.getHomeDir.mockResolvedValue('/Users/test');
    electronAPIMock.getPathStatus.mockResolvedValue({ exists: false });
    electronAPIMock.renameFile.mockResolvedValue(undefined);
    electronAPIMock.saveBinaryFile.mockResolvedValue(null);
    electronAPIMock.trashFile.mockResolvedValue(undefined);
    electronAPIMock.writeFile.mockResolvedValue(undefined);
    rescanMock.mockResolvedValue(undefined);
  });

  it('writes imported resources as binary files during install', async (): Promise<void> => {
    const wrapper = mountSkillCreator();

    await uploadSkillPackage(wrapper);
    await findButtonByText(wrapper, '确认安装').trigger('click');
    await flushPromises();

    const saveBinaryFileCall = electronAPIMock.saveBinaryFile.mock.calls[0];
    const savedContent = saveBinaryFileCall?.[0] ?? new ArrayBuffer(0);

    expect(electronAPIMock.writeFile).toHaveBeenCalledWith(expect.stringContaining('/SKILL.md'), workerSuccessResponse.rawSkillMd);
    expect(saveBinaryFileCall?.[1]).toMatch(/\/assets\/icon\.bin$/u);
    expect(Array.from(new Uint8Array(savedContent))).toEqual([5, 6, 7]);
  });
});
