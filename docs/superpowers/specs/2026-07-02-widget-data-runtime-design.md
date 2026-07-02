# 2026-07-02 Widget Data Runtime Design

## Background

Widget scripts currently expose runtime state through `WidgetState`, `this.$state`, `this.$setState(...)`, `{{ state.xxx }}`, `renderContext.state`, and `stateSchema`. The new API should consistently use `data` instead of `state`, without preserving old public names or old serialized field names.

## Goals

- Support `Widget({ data: {} })` as the initial runtime data declaration.
- Replace script reads and writes with `this.$data` and `this.$setData(path, value)`.
- Replace element bindings with `{{ data.xxx }}`.
- Replace editor declarations and inferred schema names from state to data.
- Replace protocol and persisted Widget fields from `renderContext.state` / `stateSchema` to `renderContext.data` / `dataSchema`.
- Update tests, examples, default code, and documentation references in the touched Widget areas.

## Non-Goals

- No compatibility alias for `this.$state`, `this.$setState`, or `{{ state.xxx }}`.
- No migration layer for old `renderContext.state` or `stateSchema` data.
- No unrelated Widget editor UI redesign.

## Runtime Contract

`Widget({ data })` declares the default data object for a Widget runtime session. When a Widget is mounted, the runtime starts from this declared data and then applies script mutations through `this.$setData`. Lifecycle hooks and interaction methods read a cloned snapshot through `this.$data`.

The runtime only accepts plain object data declarations. Invalid or missing `data` is treated as an empty object. If code uses removed names such as `this.$state` or `this.$setState`, it should fail naturally because those names are no longer exposed in the script context.

## Implementation Areas

- `types/widget.d.ts` and `types/chat.d.ts`: rename runtime context and contract fields to `data` / `dataSchema`.
- `src/components/BChat/utils/widgetRuntime.ts`: rename payload/result fields, adapter internals, runtime context getters, and mutation function to data terminology.
- `src/views/widget/constants/methodScriptExtraLib.ts`: expose `WidgetData`, `$data`, `$setData`, and `WidgetConfig.data`.
- `src/components/BWidget/utils/widgetStateSchema.ts`: convert the schema inference utility to infer Widget data schema from `Widget({ data })` and `this.$setData(...)`.
- `src/components/BWidget/utils/widgetBindings.ts` and `src/components/BWidget/hooks/useElementVariables.ts`: use `data` as the binding root.
- Widget editor/view files and tests: update examples, assertions, helper names, and fixture payloads.

## Testing

Add or update focused tests for:

- `Widget({ data })` initializes runtime data on mount.
- `this.$setData` updates mounted, interaction, and unmounted data.
- `this.$data` reads the latest runtime data.
- Schema inference includes both initial `data` literals and `$setData` calls.
- Element variables and binding evaluation use `data` rather than `state`.
- Removed state API names are not part of the editor type declarations.
