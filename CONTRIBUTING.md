# Contributing

This document contains maintainer-oriented notes that are intentionally separated from the user-facing README.

## Workflow Concerns

### Quality and Security

Primary CI is defined in [.github/workflows/ci.yml](.github/workflows/ci.yml).

- Triggers: `pull_request`, nightly `schedule`, `workflow_dispatch`, and `release.published`.
- Job groups by concern:
  - Setup and build artifact reuse via [.github/actions/setup/action.yml](.github/actions/setup/action.yml).
  - Static quality gates: lint and typecheck.
  - Test quality gates: test suite and type coverage threshold.
  - Security gates: CodeQL analysis and dependency audit (`npm audit --audit-level=high --omit=dev`).
  - Coverage: Codecov upload from `coverage/lcov.info`.

### Pull Request Branch Policy

Pull request policy checks are defined in [.github/workflows/pr.yml](.github/workflows/pr.yml).

- Triggered on PR open/update/reopen/edited events.
- Runs `npm run check:pr` to enforce branch policy and pinned action ref validation.
- Pull requests into `main` must come from `staging`.
- Treat short-lived task branches as disposable and prefer deleting them after merge.

### Branch Sync and Merge Policy

Branch ancestry enforcement is defined in [.github/workflows/branch-sync.yml](.github/workflows/branch-sync.yml).

- Triggered on pushes to `main`, on a daily schedule, and manually via `workflow_dispatch`.
- Verifies that `staging` remains an ancestor of `main`.
- `staging` into `main` should preserve ancestry with a merge commit; squash and rebase merges break this guardrail.
- If `staging` ancestry is broken, repair it immediately with a merge-commit-based sync before taking further releases.

### Release and Publishing

Release automation is defined in [.github/workflows/release.yml](.github/workflows/release.yml) and uses semantic-release.

- Triggers: `release.published` and `workflow_dispatch`.
- `workflow_dispatch` supports `dry_run` for previewing behavior without publishing.
- Tag-based release flow can sync `package.json` and `package-lock.json` version fields.
- Publishes package releases and deploys docs to GitHub Pages when running from `main`.

Release configuration is in [release.config.ts](release.config.ts).

## Conventional Commits

semantic-release determines version bump level from commit messages.

Examples:

```bash
git commit -m "fix(parser): handle empty package output"
git commit -m "feat(manager): add availability check"
git commit -m "feat!: remove deprecated API"
```

## Development Scripts

Development scripts are in [dev_scripts](dev_scripts).

- [check_latest_action_pin.mjs](dev_scripts/check_latest_action_pin.mjs): checks whether pinned GitHub Action refs are up to date against upstream releases.
- [check_release_tag.mjs](dev_scripts/check_release_tag.mjs): validates `RELEASE_TAG` format and consistency with `package.json` version.
- [create_testcase_logs.mjs](dev_scripts/create_testcase_logs.mjs): regenerates command execution logs used by integration/parser fixtures.
- [hotfix_pr.mjs](dev_scripts/hotfix_pr.mjs): automates hotfix branch creation, sync branch creation, and PR creation/update flow.
- [lib.mjs](dev_scripts/lib.mjs): shared script utilities (logging, command wrappers, JSON helpers, repo paths, prompts).
- [node_ver.mjs](dev_scripts/node_ver.mjs): verifies or updates Node version alignment across repo files and local Node installation.
- [setup_devenv.mjs](dev_scripts/setup_devenv.mjs): bootstraps local developer dependencies, workspace settings, and npm audit remediation.
- [verify_configs.mjs](dev_scripts/verify_configs.mjs): enforces repository config invariants and blocks prohibited path edits.
- [wipe_commit_history.mjs](dev_scripts/wipe_commit_history.mjs): destructive history rewrite utility with backup branch/tag/mirror safeguards.

## Integration Test Notes

Integration test suite is [test/ubuntu.integration.test.ts](test/ubuntu.integration.test.ts).

- These tests execute real APT commands and are environment-sensitive.
- They are intentionally narrower than unit tests to keep runtime manageable.
- Mutating package operations should use locking for safety when applicable.

## Docs and Publishing

- API docs are generated into [docs/api](docs/api).
- Release workflow publishes package artifacts and deploys docs via GitHub Pages.

## Operational Concerns

- Node.js baseline is managed in [package.json](package.json) engines.
- Keep `package-lock.json` committed and synchronized with dependency changes.
- Prefer updating workflow action SHAs with care and validate in CI.
- Prefer full commit SHA pinning for all third-party GitHub Actions.
- Repository settings are tracked in [.github/repo-settings.json](.github/repo-settings.json) and can be applied with `npm run repo:settings:upload`.
