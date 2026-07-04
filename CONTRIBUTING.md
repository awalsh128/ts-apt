# Contributing

This document contains maintainer-oriented notes that are intentionally separated from the user-facing README.

## Release Workflow

Release automation is defined in [.github/workflows/release.yml](.github/workflows/release.yml) and uses semantic-release.

- Releases are triggered from pushes to `main` and `next`, or from manual workflow dispatch.
- `main` publishes stable releases.
- `next` publishes prereleases.
- `workflow_dispatch` supports:
  - `preid` for prerelease suffix control (for example `rc`, `beta`, `alpha`)
  - `dry_run` for previewing release behavior without publishing

Release configuration is in [release.config.ts](release.config.ts).

## Conventional Commits

semantic-release determines version bump level from commit messages.

Examples:

```bash
git commit -m "fix(parser): handle empty package output"
git commit -m "feat(manager): add availability check"
git commit -m "feat!: remove deprecated API"
```

## CI and Quality Gates

Main CI workflow is [.github/workflows/ci.yml](.github/workflows/ci.yml).

Composite quality checks are in [.github/actions/codehealth/action.yml](.github/actions/codehealth/action.yml) and include:

- lint
- typecheck
- type coverage
- build
- tests
- docs validation

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
