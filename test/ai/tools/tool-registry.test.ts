/**
 * @file tool-registry.test.ts
 * @description 工具定义单一 registry 测试。
 */
import type { AIToolExecutor } from 'types/ai';
import { describe, expect, it } from 'vitest';
import * as runtimeTools from '@/ai/tools/catalog/runtimeTools';
import { createReadFileTool, READ_FILE_TOOL_NAME } from '@/ai/tools/catalog/runtimeTools';
import { TOOL_REGISTRY, getToolDefinitionByName, getToolNamesByExposure, getToolNamesByRuntimeGroup } from '../../../shared/ai/tools/toolRegistry.js';

/** runtimeTools 模块带工厂映射的测试视图。 */
type RuntimeToolsWithFactoryMap = typeof runtimeTools & {
  /** 按工具名称索引的 schema-only 工厂映射。 */
  RUNTIME_TOOL_FACTORIES?: Readonly<Record<string, () => AIToolExecutor>>;
};

describe('toolRegistry', (): void => {
  it('exposes the shared registry as the single source', (): void => {
    expect(TOOL_REGISTRY.length).toBeGreaterThan(0);
  });

  it('is the source of schema definitions used by runtimeTools factories', (): void => {
    const registryDefinition = getToolDefinitionByName(READ_FILE_TOOL_NAME);
    const runtimeTool = createReadFileTool();

    expect(registryDefinition).toBeDefined();
    expect(runtimeTool.definition).toEqual(registryDefinition);
  });

  it('derives runtimeTools factory map from every shared registry definition', (): void => {
    const factoryMap = (runtimeTools as RuntimeToolsWithFactoryMap).RUNTIME_TOOL_FACTORIES;
    const registryToolNames = TOOL_REGISTRY.map((entry) => entry.definition.name).sort();

    expect(factoryMap).toBeDefined();
    expect(Object.keys(factoryMap ?? {}).sort()).toEqual(registryToolNames);
    for (const entry of TOOL_REGISTRY) {
      expect(factoryMap?.[entry.definition.name]?.().definition).toEqual(entry.definition);
    }
  });

  it('can derive main-process tool names by runtime group', (): void => {
    const fileToolNames = getToolNamesByRuntimeGroup('main', 'file');

    expect(fileToolNames).toEqual(expect.arrayContaining(['read_file', 'read_directory', 'create_document', 'write_file', 'edit_file']));
  });

  it('can derive tool names by renderer exposure policy', (): void => {
    expect(getToolNamesByExposure('default-readonly')).toEqual(
      expect.arrayContaining([
        'read_current_document',
        'read_current_drawing',
        'read_current_webpage',
        'get_current_time',
        'read_file',
        'get_settings',
        'query_logs',
        'open_resource'
      ])
    );
    expect(getToolNamesByExposure('default-writable')).toEqual(
      expect.arrayContaining(['create_document', 'create_drawing', 'apply_drawing_operations', 'edit_file', 'write_file', 'update_settings'])
    );
    expect(getToolNamesByExposure('conditional-readonly')).toEqual(expect.arrayContaining(['read_directory', 'get_mcp_settings']));
    expect(getToolNamesByExposure('conditional-writable')).toEqual(
      expect.arrayContaining(['add_mcp_server', 'update_mcp_server', 'remove_mcp_server', 'refresh_mcp_discovery'])
    );
  });
});
