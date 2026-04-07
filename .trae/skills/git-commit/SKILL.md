---
name: "git-commit"
description: "Generates conventional commit messages and executes git commit. Invoke when user wants to commit changes or mentions git commit."
---

# Git Commit Skill

This skill helps you create well-structured git commits following conventional commit standards.

## When to Invoke

Invoke this skill when:
- User asks to commit changes
- User mentions "git commit" or "commit"
- User wants to save their work with a commit message

## Workflow

### 1. Check Git Status

First, check the current git status to understand what changes need to be committed:

```bash
git status
```

### 2. Review Changes

If there are uncommitted changes, review them to understand the nature of the modifications:

```bash
git diff
git diff --staged
```

### 3. Generate Commit Message

Based on the changes, generate a commit message following the Conventional Commits specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Commit Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools
- `ci`: Changes to CI configuration files and scripts

### 4. Stage Changes

If changes are not already staged, stage them:

```bash
git add <files>
# or
git add .
```

### 5. Execute Commit

Execute the commit with the generated message:

```bash
git commit -m "<commit message>"
```

## Best Practices

1. **Atomic Commits**: Each commit should represent a single logical change
2. **Clear Messages**: Write clear, concise commit messages that explain what and why, not how
3. **Present Tense**: Use present tense in commit messages ("add feature" not "added feature")
4. **No Secrets**: Never commit sensitive information like API keys or passwords
5. **Review Before Commit**: Always review the changes before committing

## Example

For a change that refactors a function to improve code clarity:

```bash
git add src/utils/helpers.ts
git commit -m "refactor(helpers): simplify date formatting logic

- Extract common date formatting patterns
- Remove redundant null checks
- Improve code readability"
```

## Important Notes

- Always check if there are any sensitive files that should not be committed
- Ensure the commit message accurately reflects the changes
- If the project has a specific commit message format, follow that instead
- Consider if the changes should be split into multiple commits for better history
