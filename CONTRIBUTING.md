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

## Commit Messages

This project uses semantic-release to determine version numbers and generate changelogs from commit messages. Contributions should follow the Conventional Commits specification.

### Release Mapping

- `feat` triggers a minor release.
- `fix` and `perf` trigger a patch release.
- `docs`, `style`, `refactor`, `test`, `chore`, `build`, and `ci` do not trigger a release unless they include a breaking change.
- Any commit type can trigger a major release by either:
  - appending `!` after the type or scope, for example `feat(api)!: change response format`
  - adding a `BREAKING CHANGE:` footer in the commit body

### Commit Format

Every commit message must adhere to the following format:

```text
<type>(<scope>): <subject>

<body>

<footer>
```

- The header is `<type>(<scope>): <subject>`.
- Valid types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`.
- Scope is optional.
- The subject should be imperative, lowercase-first, and should not end with a period.
- Use the footer for `BREAKING CHANGE:` notes or issue references.

### Examples

```text
feat(auth): add OAuth2 support

Implemented Google and GitHub login providers.
Closes #123
```

```text
fix(api): correct pagination offset calculation

Resolved issue where page 2 returned duplicate items.
```

```text
feat(api)!: change user response format

The user object now nests profile data.
```

```text
chore(deps): upgrade minimum Node version to 18

BREAKING CHANGE: This project no longer supports Node 16.
Users must upgrade their runtime environment.
```

```text
docs(readme): update installation instructions
refactor(core): simplify validation logic
```

### Development Workflow

1. Stage changes with `git add`.
2. Create a Conventional Commit message.
3. Push to your feature branch.
4. After merge to a release branch such as `main`, CI runs `semantic-release`.

## CI and Quality Gates

Main CI workflow is [.github/workflows/ci.yml](.github/workflows/ci.yml).

Current CI is split into setup, CodeQL, linting, unit testing, and integration testing jobs.

- The unit-test job runs `npm run test:unit`, type coverage, coverage upload, and dependency audit.
- The integration job runs `npm run test:integration:docker` so integration coverage uses the forced devcontainer path when available.

## Integration Tests

Integration coverage is split across:

- [test/ubuntu.integration.test.ts](test/ubuntu.integration.test.ts) for readonly manager scenarios.
- [test/ubuntu.mutating.integration.test.ts](test/ubuntu.mutating.integration.test.ts) for mutating manager scenarios.
- [test/ubuntu.integration.helpers.ts](test/ubuntu.integration.helpers.ts) for shared runner setup, package lifecycle helpers, and timeout/assertion utilities.
- These tests execute real APT commands and are environment-sensitive.
- They are intentionally narrower than unit tests to keep runtime manageable.
- The default `npm run test:integration` path runs the readonly suite on the host runner and skips the mutating suite unless forced devcontainer execution is available.
- Use `npm run test:integration:docker` to force execution through the repository devcontainer for isolation and CI consistency.
- The integration devcontainer uses the `debian:stable-slim` base image plus the Node feature version selected by `.node_ver`.
- The mutating suite is intentionally devcontainer-gated so package install/remove/autoremove coverage does not mutate the host environment.
- Shared setup uses the repository `scripts/apt-fast.sh` wrapper plus a flock-protected helper to serialize package lifecycle operations.
- Mutating package operations should use locking for safety when applicable.

## Docs and Publishing

- API docs are generated into [docs/api](docs/api).
- Release workflow publishes package artifacts and deploys docs via GitHub Pages.

## Operational Concerns

- Node.js baseline is managed in [package.json](package.json) engines.
- Keep `package-lock.json` committed and synchronized with dependency changes.
- Prefer updating workflow action SHAs with care and validate in CI.
