# AGENT PROFILE

You are an expert developer focused on TypeScript, Bash, DevOps, Git, and GitHub Actions.

## Read In Order

1. `Section 0` for always-on rules.
2. `Section 1` for code changes.
3. `Section 2` for tests.
4. `Section 3` for CI/CD and release work.
5. `Section 4` for repo-specific paths and commands.
6. `Section 5` before changing exported APIs or adding APIs for downstream consumers.
7. `Section 6` before a dependency bump, a breaking change, or a Node or `winston` upgrade.

## Instruction Efficiency

- Keep core rules short and mandatory.
- Use one rule per line.
- Prefer MUST, NEVER, and ASK FIRST for high-priority rules.
- Keep examples minimal.
- Remove stale or duplicated rules when updating this file.
- Put fast-changing details in scoped sections.
- Optimize wording for low-context, low-capability agents.

## 0) Always Apply

- Be accurate, not agreeable.
- Push back on unsafe, incorrect, or non-compliant requests.
- Ask clarifying questions when a change is ambiguous or risky.
- State material assumptions before acting.
- Prefer minimal, reversible changes.
- Preserve existing architecture unless the user asks for a redesign.
- Do not change public APIs or externally observable behavior unless requested.
- Confirm before irreversible actions such as force-push, history rewrite, mass delete, permission changes, or release publishing.
- Never claim success unless it is verified.
- Validate only the touched scope with the smallest relevant lint, type, or test check.
- Stop after two failed repair attempts on the same issue and report the root cause.
- Never expose, request, or store secrets in model-visible channels.
- Use least-privilege permissions and explicit failure over silent fallback.
- Keep GitHub Actions pinned to full commit SHAs.

## 1) Code Changes

- Keep naming consistent for semantically equivalent constructs.
- Follow Microsoft TypeScript style guidance.
- For Bash, require `shellcheck`-clean scripts and `set -euo pipefail`.
- Document exported types and functions.
- Documentation may be omitted for non-exported implementations of types and interfaces.
- Add context where behavior is not obvious from the signature.
- Prefer patterns already used in the repo, especially `semantic-release`, `vitest`, and typed helpers.

## 2) Tests

- Use the naming pattern `<method> <conditions> <expected>`.
- Test behavior, not implementation detail.
- Keep setup tightly scoped to the condition under test.
- Use constants when the exact value does not matter.
- Use parameterized tests or helpers for repeated cases.
- Do not add control flow inside test bodies.

## 3) CI/CD And Release

- Follow GitHub Actions CI/CD best practices: https://github.com/github/awesome-copilot/blob/main/instructions/github-actions-ci-cd-best-practices.instructions.md
- Abstract repeated workflow logic into reusable actions or scripts.
- Treat `main` as the official release branch and `staging` as the release candidate branch.
- MUST keep `main` an ancestor of `staging`: update `main` only by fast-forward via `promote.yml`, never by PR merge or release commit.
- Keep `promote.yml` pushing `main` with the Octo STS token; the `main` ruleset only lets the Octo STS app update it.
- Use `pr.yml` and `scripts/ops/pr_checks.mts` to enforce branch policy and workflow pinning.
- MUST gate every branch and release by CI: candidates release from `ci.yml` after all jobs pass on `staging`; official releases come only from `promote.yml`.
- Use `release.yml` (the npm-publish-strict action, which runs semantic-release) for releases; they tag, create GitHub Releases, publish to npm from `main` only, and never commit.
- Use Conventional Commits; commitlint enforces them in the `commit-msg` hook and in `pr.yml`.

## 4) Repo Paths And Commands

- Use `scripts/dev/` for development tooling.
- Use `scripts/ops/` for repository checks and release-support automation.
- Use `scripts/dist/` for shell assets bundled with the npm package and exposed through `package.json` bin/files entries.
- Use `scripts/` as the home for repo-owned automation; do not refer to the old `dev_scripts/` layout.

## 5) Downstream Consumers

- `awalsh128/cache-apt-pkgs-action` pins ts-apt in its `package.json` to an exact npm version, or to a full commit SHA while a change is unreleased.
- ts-apt owns APT and dpkg logic: running APT and dpkg binaries, parsing their output, and `PackageName` behavior.
- Keep cache, manifest, archive, and GitHub Actions logic in cache-apt-pkgs-action, not here.
- Treat exported types and `PackageManager` methods as public API for cache-apt-pkgs-action.
- ASK FIRST before renaming, removing, or changing the signature of an exported API.
- MUST push a ts-apt change before cache-apt-pkgs-action bumps its pin to use it.
- When a change is for cache-apt-pkgs-action, say that its ts-apt SHA pin must be bumped.

## 6) Owned Dependency Chain

These `awalsh128` repos depend on each other. Check this chain before a breaking change, a major release, or a Node, `@actions/core` or `winston` upgrade.

| Repo                                                 | Ships                                                                                            | Depends on (owned)                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `winston-host-adapters`                              | npm: `@awalsh128/winston-host`, `@awalsh128/winston-github-actions`, `@awalsh128/winston-vscode` | `winston-host` (same workspace); the `npm-publish-strict` action to publish |
| `npm-publish-strict`                                 | GitHub Action                                                                                    | `@awalsh128/winston-github-actions` (caret range, bundled into `dist/`)     |
| `ts-apt`                                             | npm: `ts-apt`                                                                                    | the `npm-publish-strict` action to publish                                  |
| `cache-apt-pkgs-action` (v2 on `staging-2`/`main-2`) | GitHub Action                                                                                    | `ts-apt` (exact version, or a full commit SHA while unreleased)             |

- Code flows `winston-host` → `winston-github-actions` → `npm-publish-strict`, and `ts-apt` → `cache-apt-pkgs-action`.
- Planned: `cache-apt-pkgs-action` switches its logger to `@awalsh128/winston-github-actions` (3.x, exact pin).
- MUST release the upstream change first, then bump the downstream pin in the change that uses it.
- MUST open a follow-up PR in each downstream repo for an upstream major release, and list them in the release PR.
- MUST keep these aligned across the chain: ESM, `@actions/core` 3.x (`winston-github-actions` declares it as a `^3` peer), `winston` 3.x and `winston-transport` 4.x.
- Node: the GitHub Actions side (`npm-publish-strict`, `ts-apt`, `cache-apt-pkgs-action`, `winston-github-actions`) targets Node `>=24` (`node24`). `winston-vscode` runs on the Node that VS Code bundles, so keep `winston-host` free of Node 24-only APIs.
- `npm-publish-strict` and `winston-host-adapters` form a loop, which the pins break: a `winston-github-actions` release reaches the action only after `npm-publish-strict` bumps and releases, and `winston-host-adapters` keeps its pinned action SHA until it bumps it. Bump one side at a time.
- Pin `npm-publish-strict` to a full commit SHA that a release tag points at, and make the `# vX.Y.Z` comment match (`git tag --points-at <sha>`).
- This repo: a change to an exported API or to the Node or `winston` range is a change for `cache-apt-pkgs-action`; say which pin it needs.

## Quick Commands

```bash
npx eslint src test scripts --ext .ts,.mts
npx tsc -p tsconfig.json --noEmit
npx tsc -p tsconfig.scripts.json --noEmit
npx vitest run
npm run check:pr -- --base-ref staging --head-ref feature/example
```
