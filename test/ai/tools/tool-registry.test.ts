/**
 * @file tool-registry.test.ts
 * @description 工具定义单一 registry 测试。
 */
import type { AIToolExecutor } from 'types/ai';
import { describe, expect, it } from 'vitest';
import * as runtimeTools from '@/ai/tools/catalog/runtimeTools';
import { createReadFileTool, READ_FILE_TOOL_NAME } from '@/ai/tools/catalog/runtimeTools';
import {
  OPERATE_WEBPAGE_TOOL_NAME,
  OPEN_RESOURCE_TOOL_NAME,
  TOOL_REGISTRY,
  getToolDefinitionByName,
  getToolNamesByExposure,
  getToolNamesByRuntimeGroup
} from '../../../shared/ai/tools/toolRegistry.js';

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

  it('can derive WebView tool names by runtime group', (): void => {
    const webviewToolNames = getToolNamesByRuntimeGroup('main', 'webview');

    expect(webviewToolNames).toEqual(expect.arrayContaining(['read_current_webpage', 'operate_webpage']));
  });

  it('prefers operate_webpage for active WebView navigation', (): void => {
    const operateDefinition = getToolDefinitionByName(OPERATE_WEBPAGE_TOOL_NAME);
    const openResourceDefinition = getToolDefinitionByName(OPEN_RESOURCE_TOOL_NAME);
    const actionSchema = operateDefinition?.parameters.properties.action as { oneOf?: Array<{ properties?: { type?: { enum?: string[] } } }> };
    const actionTypes = actionSchema.oneOf?.flatMap((schema) => schema.properties?.type?.enum ?? []) ?? [];

    expect(actionTypes).toContain('navigate');
    expect(String(operateDefinition?.description)).toContain('navigate');
    expect(String(openResourceDefinition?.description)).toContain('没有激活 WebView');
  });

  it('exposes operate_webpage press action in the public schema', (): void => {
    const operateDefinition = getToolDefinitionByName(OPERATE_WEBPAGE_TOOL_NAME);
    const actionSchema = operateDefinition?.parameters.properties.action as {
      oneOf?: Array<{ properties?: { type?: { enum?: string[] }; key?: { enum?: string[] } } }>;
    };
    const pressSchema = actionSchema.oneOf?.find((schema) => schema.properties?.type?.enum?.includes('press'));

    expect(pressSchema?.properties?.key?.enum).toEqual(expect.arrayContaining(['Enter']));
    expect(String(operateDefinition?.description)).toContain('press');
  });

  it('allows operate_webpage navigate without a snapshot id in the public schema', (): void => {
    const operateDefinition = getToolDefinitionByName(OPERATE_WEBPAGE_TOOL_NAME);
    const snapshotIdSchema = operateDefinition?.parameters.properties.snapshotId as { description?: string } | undefined;

    expect(operateDefinition?.parameters.required).toEqual(['action']);
    expect(snapshotIdSchema?.description).toContain('非 navigate');
  });

  it('documents navigate as address-bar navigation instead of a DOM action substitute', (): void => {
    const operateDefinition = getToolDefinitionByName(OPERATE_WEBPAGE_TOOL_NAME);
    const actionSchema = operateDefinition?.parameters.properties.action as {
      oneOf?: Array<{ properties?: { type?: { enum?: string[] }; url?: { description?: string } } }>;
    };
    const navigateSchema = actionSchema.oneOf?.find((schema) => schema.properties?.type?.enum?.includes('navigate'));

    expect(String(operateDefinition?.description)).toContain('navigate 仅用于用户明确提供 URL');
    expect(String(operateDefinition?.description)).toContain('页面内可操作项必须使用 read_current_webpage 返回的 [N]');
    expect(navigateSchema?.properties?.url?.description).toContain('不要替代页面内可操作项的 [N]');
  });

  it('can derive tool names by renderer exposure policy', (): void => {
    expect(getToolNamesByExposure('default-readonly')).toEqual(
      expect.arrayContaining(['read_current_document', 'read_current_drawing', 'get_current_time', 'read_file', 'get_settings', 'query_logs', 'open_resource'])
    );
    expect(getToolNamesByExposure('default-writable')).toEqual(
      expect.arrayContaining(['create_document', 'create_drawing', 'apply_drawing_operations', 'edit_file', 'write_file', 'update_settings'])
    );
    expect(getToolNamesByExposure('conditional-readonly')).toEqual(expect.arrayContaining(['read_directory', 'get_mcp_settings', 'read_current_webpage']));
    expect(getToolNamesByExposure('conditional-writable')).toEqual(
      expect.arrayContaining(['add_mcp_server', 'update_mcp_server', 'remove_mcp_server', 'refresh_mcp_discovery', 'operate_webpage'])
    );
  });
});
