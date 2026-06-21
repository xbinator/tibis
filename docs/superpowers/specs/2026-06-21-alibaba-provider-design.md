# Alibaba Provider Design

## Goal

Add Alibaba Cloud DashScope as a first-class AI provider type so the built-in Alibaba provider and custom providers can use Alibaba-specific reasoning controls.

## Architecture

The main process will add an `AlibabaProvider` implementation under `electron/main/modules/ai/providers/`. It will use `@ai-sdk/alibaba` instead of the generic OpenAI-compatible provider so Alibaba's `reasoning_content` stream chunks become AI SDK `reasoning-delta` chunks and continue through the existing thinking channel.

`AIRequestOptions.reasoning.enabled` will be mapped in `AlibabaProvider.createProviderOptions()` to `providerOptions.alibaba.enableThinking`. The mapper will only emit provider options when the caller explicitly sets `reasoning.enabled`; missing reasoning config will preserve the SDK and service default behavior.

## Data Flow

Settings storage will recognize `alibaba` as an `AIProviderType`. The built-in Alibaba provider keeps its existing DashScope-compatible `baseUrl` and changes only its request format from `openai` to `alibaba`.

When the user invokes an Alibaba model, `AIService.buildBaseOptions()` passes the generic request to `AIProviderRegistry`, which creates the Alibaba model and injects `{ alibaba: { enableThinking } }` when needed.

## Testing

Tests will cover the provider option mapping, built-in provider metadata, settings normalization for the new type, and the registry's ability to route Alibaba requests.
