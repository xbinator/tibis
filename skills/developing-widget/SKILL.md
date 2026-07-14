---
name: developing-widget
description: Use when creating, generating, authoring, validating, or installing a Tibis Widget package, widget.json file, Widget element tree, data binding, interaction script, or importable Widget directory or ZIP.
---

# Developing Widget

Create complete, validated Tibis Widget packages. A package is a directory with `widget.json` at its root and optional resource files that can later be imported as JSON or ZIP.

## Required Workflow

1. Read `references/widget-format.md` before creating or changing `widget.json`.
2. If the Widget contains elements, styles, groups, loops, bindings, images, or buttons, read `references/elements-and-bindings.md`.
3. If `execute.code`, lifecycle methods, HTTP, messages, logger, or button actions are involved, read `references/runtime-api.md`.
4. Start from `assets/widget-template/widget.json` when creating a new package, then replace fields deliberately.
5. Write a complete Widget directory. The root `widget.json` MUST include the top-level `WidgetData` shape: `name`, `description`, `inputSchema`, `outputSchema`, `dataSchema`, `execute`, `metadata`, and `elements`. Include any local resources referenced by `image.src` and any `assets/` files needed at runtime.
6. Run `node scripts/validate-widget.js <widget-directory>` and fix every error.
7. Deliver the package path, validation command, and any remaining warnings.

## Authoring Rules

- Treat the current repository source as the source of truth if it conflicts with these references.
- Do not install generated packages into a user home Widget directory unless the user explicitly asks.
- When the user does ask the agent to install or persist a widget, the file MUST be written to `~/.tibis/widgets/<id>/widget.json` (note the **plural** `widgets/` segment). Never write to `~/.tibis/<id>/widget.json` or `~/.tibis/widget/<id>/widget.json` — those paths are outside the scanner root and the widget will not be discovered. See `references/widget-format.md` → "Install Location" for the full rule.
- Do not execute untrusted `execute.code`; validation is static.
- Do not invent top-level `widget.json` fields. Use the `WidgetData` shape from `references/widget-format.md`.
- Keep schema `required` arrays aligned with `properties`; unknown required fields are warnings that should usually be fixed.
- Use globally unique element IDs, including inside nested groups.
- Use only supported element names: `rect`, `text`, `image`, `button`, and `group`.
- Ensure every button action method exists in `execute.code`.
- Prefer HTTP or data URL image sources unless the host integration is known to serve packaged resources.
- Never claim the Widget is ready until the validator exits with status 0.

## Output Contract

When finished, provide:

- the Widget directory path;
- a concise summary of the important files;
- the exact validator command and result;
- warnings, if any, with the reason they remain.
