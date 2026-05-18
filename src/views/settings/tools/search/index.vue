<!--
  @file index.vue
  @description 搜索工具设置页，负责管理 Tavily 的启用状态与默认参数。
-->
<template>
  <BSettingsPage title="网络搜索">
    <BSettingsSection title="基础配置">
      <div class="search-tools-settings__item">
        <div class="search-tools-settings__meta">
          <div class="search-tools-settings__label">启用 Tavily 工具</div>
          <div class="search-tools-settings__description">启用后，聊天工具链才会向模型暴露 Tavily 搜索与正文提取工具。</div>
        </div>
        <ASwitch :checked="store.tavily.enabled" @change="handleEnabledChange" />
      </div>

      <div class="search-tools-settings__item">
        <div class="search-tools-settings__meta">
          <div class="search-tools-settings__label">Tavily API Key</div>
        </div>
        <div class="search-tools-settings__input">
          <AInputPassword :value="store.tavily.apiKey" placeholder="请输入 Tavily API Key" @update:value="handleApiKeyChange" />
        </div>
      </div>
    </BSettingsSection>

    <BSettingsSection title="Tavily Search 默认配置">
      <div class="search-tools-settings__item">
        <div class="search-tools-settings__meta">
          <div class="search-tools-settings__label">搜索深度</div>
        </div>
        <BSelect :value="store.tavily.searchDefaults.searchDepth" :options="tavilySearchDepthOptions" :width="280" @change="handleSearchDepthChange" />
      </div>

      <div class="search-tools-settings__item">
        <div class="search-tools-settings__meta">
          <div class="search-tools-settings__label">主题</div>
        </div>
        <BSelect :value="store.tavily.searchDefaults.topic" :options="tavilyTopicOptions" :width="280" @change="handleTopicChange" />
      </div>

      <div class="search-tools-settings__item">
        <div class="search-tools-settings__meta">
          <div class="search-tools-settings__label">时间范围</div>
        </div>
        <BSelect :value="store.tavily.searchDefaults.timeRange" :options="tavilyTimeRangeOptions" :width="280" @change="handleTimeRangeChange" />
      </div>

      <div class="search-tools-settings__item">
        <div class="search-tools-settings__meta">
          <div class="search-tools-settings__label">国家</div>
          <div class="search-tools-settings__description">仅在主题为“通用”时生效。</div>
        </div>
        <BSelect :value="store.tavily.searchDefaults.country" :options="tavilyCountryOptions" :width="280" @change="handleCountryChange" />
      </div>

      <div class="search-tools-settings__item">
        <div class="search-tools-settings__meta">
          <div class="search-tools-settings__label">最大结果数</div>
        </div>
        <AInputNumber :value="store.tavily.searchDefaults.maxResults" :min="1" :max="20" @update:value="handleMaxResultsChange" />
      </div>

      <div class="search-tools-settings__item">
        <div class="search-tools-settings__meta">
          <div class="search-tools-settings__label">包含 AI 摘要</div>
        </div>
        <ASwitch :checked="store.tavily.searchDefaults.includeAnswer" @change="handleIncludeAnswerChange" />
      </div>

      <div class="search-tools-settings__item">
        <div class="search-tools-settings__meta">
          <div class="search-tools-settings__label">包含图片</div>
        </div>
        <ASwitch :checked="store.tavily.searchDefaults.includeImages" @change="handleIncludeImagesChange" />
      </div>

      <div class="search-tools-settings__item search-tools-settings__item--stacked">
        <div class="search-tools-settings__meta">
          <div class="search-tools-settings__label">限定域名</div>
          <div class="search-tools-settings__description">使用英文逗号分隔，仅接受裸域名，例如 `example.com`。</div>
        </div>
        <div>
          <AInput :value="includeDomainsInput" placeholder="example.com, docs.example.com" @update:value="handleIncludeDomainsInput" />
        </div>
      </div>

      <div class="search-tools-settings__item search-tools-settings__item--stacked">
        <div class="search-tools-settings__meta">
          <div class="search-tools-settings__label">排除域名</div>
          <div class="search-tools-settings__description">使用英文逗号分隔，仅接受裸域名。</div>
        </div>
        <div>
          <AInput :value="excludeDomainsInput" placeholder="ads.example.com" @update:value="handleExcludeDomainsInput" />
        </div>
      </div>
    </BSettingsSection>

    <BSettingsSection title="Tavily Extract 默认配置">
      <div class="search-tools-settings__item">
        <div class="search-tools-settings__meta">
          <div class="search-tools-settings__label">提取深度</div>
        </div>
        <BSelect :value="store.tavily.extractDefaults.extractDepth" :options="tavilySearchDepthOptions" :width="280" @change="handleExtractDepthChange" />
      </div>

      <div class="search-tools-settings__item">
        <div class="search-tools-settings__meta">
          <div class="search-tools-settings__label">输出格式</div>
        </div>
        <BSelect :value="store.tavily.extractDefaults.format" :options="tavilyExtractFormatOptions" :width="280" @change="handleExtractFormatChange" />
      </div>

      <div class="search-tools-settings__item">
        <div class="search-tools-settings__meta">
          <div class="search-tools-settings__label">包含图片</div>
        </div>
        <ASwitch :checked="store.tavily.extractDefaults.includeImages" @change="handleExtractIncludeImagesChange" />
      </div>
    </BSettingsSection>
  </BSettingsPage>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TavilyExtractDepth, TavilyExtractFormat, TavilySearchDepth, TavilySearchTopic, TavilyTimeRange } from '@/shared/storage/tool-settings';
import { useToolSettingsStore } from '@/stores/ai/toolSettings';
import { tavilyCountryOptions, tavilyExtractFormatOptions, tavilySearchDepthOptions, tavilyTimeRangeOptions, tavilyTopicOptions } from './constants';

const store = useToolSettingsStore();

/**
 * 将域名数组映射为输入框字符串。
 */
const includeDomainsInput = computed((): string => store.tavily.searchDefaults.includeDomains.join(', '));

/**
 * 将排除域名数组映射为输入框字符串。
 */
const excludeDomainsInput = computed((): string => store.tavily.searchDefaults.excludeDomains.join(', '));

/**
 * 解析域名输入框内容。
 * @param value - 输入框原始值
 * @returns 解析后的域名数组
 */
function toCanonicalDomain(value: string): string[] {
  return value
    .split(',')
    .map((item: string) => item.trim())
    .filter((item: string) => item.length > 0);
}

/**
 * 处理 Tavily 启用状态更新。
 * @param value - 开关值
 */
function handleEnabledChange(value: boolean | string | number): void {
  store.setTavilyEnabled(Boolean(value));
}

/**
 * 处理 API Key 更新。
 * @param value - 新 API Key
 */
function handleApiKeyChange(value: string): void {
  store.setTavilyApiKey(value);
}

/**
 * 处理 Search 深度更新。
 * @param value - 新深度
 */
function handleSearchDepthChange(value: string | number): void {
  store.updateTavilySearchDefaults({ searchDepth: value as TavilySearchDepth });
}

/**
 * 处理主题更新。
 * @param value - 新主题
 */
function handleTopicChange(value: string | number): void {
  store.updateTavilySearchDefaults({ topic: value as TavilySearchTopic });
}

/**
 * 处理时间范围更新。
 * @param value - 新时间范围
 */
function handleTimeRangeChange(value: string | number | null): void {
  store.updateTavilySearchDefaults({ timeRange: value as TavilyTimeRange });
}

/**
 * 处理国家更新。
 * @param value - 新国家
 */
function handleCountryChange(value: string | number): void {
  store.updateTavilySearchDefaults({ country: String(value) });
}

/**
 * 处理最大结果数更新。
 * @param value - 新结果数
 */
function handleMaxResultsChange(value: string | number | null): void {
  const nextValue = typeof value === 'number' ? value : Number(value ?? store.tavily.searchDefaults.maxResults);
  store.updateTavilySearchDefaults({ maxResults: nextValue });
}

/**
 * 处理 Search 摘要开关更新。
 * @param value - 开关值
 */
function handleIncludeAnswerChange(value: boolean | string | number): void {
  store.updateTavilySearchDefaults({ includeAnswer: Boolean(value) });
}

/**
 * 处理 Search 图片开关更新。
 * @param value - 开关值
 */
function handleIncludeImagesChange(value: boolean | string | number): void {
  store.updateTavilySearchDefaults({ includeImages: Boolean(value) });
}

/**
 * 处理限定域名输入更新。
 * @param value - 输入框值
 */
function handleIncludeDomainsInput(value: string): void {
  store.updateTavilySearchDefaults({ includeDomains: toCanonicalDomain(value) });
}

/**
 * 处理排除域名输入更新。
 * @param value - 输入框值
 */
function handleExcludeDomainsInput(value: string): void {
  store.updateTavilySearchDefaults({ excludeDomains: toCanonicalDomain(value) });
}

/**
 * 处理 Extract 深度更新。
 * @param value - 新深度
 */
function handleExtractDepthChange(value: string | number): void {
  store.updateTavilyExtractDefaults({ extractDepth: value as TavilyExtractDepth });
}

/**
 * 处理 Extract 输出格式更新。
 * @param value - 新格式
 */
function handleExtractFormatChange(value: string | number): void {
  store.updateTavilyExtractDefaults({ format: value as TavilyExtractFormat });
}

/**
 * 处理 Extract 图片开关更新。
 * @param value - 开关值
 */
function handleExtractIncludeImagesChange(value: boolean | string | number): void {
  store.updateTavilyExtractDefaults({ includeImages: Boolean(value) });
}
</script>

<style scoped lang="less">
.search-tools-settings__item {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  padding: 0 16px;
  transition: background 0.2s ease;

  & + & {
    border-top: 1px solid var(--border-tertiary);
  }

  &:hover,
  &:focus-within {
    background: var(--bg-hover);
  }
}

.search-tools-settings__item--stacked {
  flex-direction: column;
  align-items: stretch;
  padding-top: 12px;
  padding-bottom: 12px;
}

.search-tools-settings__meta {
  flex: 1;
  min-width: 0;
}

.search-tools-settings__input {
  width: 280px;
}

.search-tools-settings__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  user-select: none;
}

.search-tools-settings__description {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

@media (width <= 720px) {
  .search-tools-settings__item {
    flex-direction: column;
    align-items: flex-start;
  }

  .search-tools-settings__item :deep(.b-select) {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .search-tools-settings__item {
    transition: none;
  }
}
</style>
