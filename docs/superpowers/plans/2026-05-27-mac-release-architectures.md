# Mac Release Architectures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build separate macOS Intel and Apple Silicon release assets.

**Architecture:** Keep the existing electron-builder configuration and split only the GitHub Actions macOS build matrix. The workflow selects the correct runner and appends the matching electron-builder architecture flag for each macOS architecture.

**Tech Stack:** GitHub Actions, pnpm, electron-builder.

---

### Task 1: Split macOS release builds by architecture

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `changelog/2026-05-27.md`

- [x] **Step 1: Update the build matrix**

In `.github/workflows/release.yml`, replace the current single macOS matrix entry with two macOS entries:

```yaml
          - name: macOS-arm64
            os: macos-latest
            build_args: --mac --arm64
          - name: macOS-x64
            os: macos-15-intel
            build_args: --mac --x64
```

Keep the Windows and Linux entries, and give them empty `build_args` values so the shared build command can stay simple.

- [x] **Step 2: Pass architecture arguments into electron-builder**

Change the build command in `.github/workflows/release.yml` to:

```yaml
        run: pnpm electron:build -- ${{ matrix.build_args }}
```

This preserves the existing local `pnpm electron:build` script while letting the release workflow request macOS `arm64` and `x64` packages explicitly.

- [x] **Step 3: Record the release workflow change**

Add this entry under `## Changed` in `changelog/2026-05-27.md`:

```markdown
- Release 工作流改为分别构建 macOS arm64 与 x64 产物，避免只生成单一 mac 架构包。
```

- [x] **Step 4: Verify workflow syntax and diff**

Run:

```bash
pnpm exec yaml-lint .github/workflows/release.yml
git diff -- .github/workflows/release.yml changelog/2026-05-27.md
```

If `yaml-lint` is unavailable, use a local YAML parser already present in the dependency tree to parse `.github/workflows/release.yml`.
