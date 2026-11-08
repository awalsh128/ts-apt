# Contributing

This document contains maintainer-oriented notes that are intentionally separated from the user-facing [README](README.md).

## Development Environment

> [!NOTE]
> Typescript version is 6.0.3 (most recent and stable). If you get conflicts your local global version of TS
> may be outdated. Ensure all type checks are performed with `npx tsc` and that `npm install` is executed so
> this version is installed in the context of your project.

`./scripts/dev` containing all development related concerns. To get started after cloning the repository you
can run `./scripts/dev/setup_devenv.mts run --ide [your IDE]`. This will setup some of the common settings and
extensions typically used. You do not have to use this though.

To quickly establish credentials you can run `./scripts/dev/gh_auth.sh`. It is just a helper script to get you
authenticated with GitHub.

## Workflow Concerns

### Quality and Security

Primary CI is defined in [.github/workflows/ci.yml](.github/workflows/ci.yml).

- Triggers: `pull_request`, nightly `schedule`, and `workflow_dispatch`.
- This workflow is the merge gate for PRs; it does not publish releases.
- Job groups by concern:
  - Setup and build artifact reuse via [.github/actions/setup/action.yml](.github/actions/setup/action.yml).
  - Static quality gates: lint and typecheck.
  - Test quality gates: test suite and type coverage threshold.
  - Security gates: CodeQL analysis and dependency audit (`npm audit --audit-level=high --omit=dev`).
  - Coverage: Codecov upload from `coverage/lcov.info`.

### Pull Request Branch Policy

- Branch policy is enforced by [.github/workflows/pr.yml](.github/workflows/pr.yml) and [scripts/ops/pr_checks.mts](scripts/ops/pr_checks.mts).
- Feature branches target `staging`.
- The `staging` ruleset requires a pull request with passing `linters`, `testing`, `codeql` and
  `check-branch` checks, and blocks force pushes and deletion.
- Pull requests into `main` are rejected; `main` is only updated by [promotion](#promotion-and-branch-policy).

Pull request policy checks are defined in [.github/workflows/pr.yml](.github/workflows/pr.yml).

- Triggered on PR open/update/reopen/edited events.
- Runs `npm run check:pr` to enforce branch policy and pinned action ref validation.
- Runs commitlint on every commit in the PR, so each one must follow [Conventional Commits](#conventional-commits).
- Treat short-lived task branches as disposable and prefer deleting them after merge.

### Promotion and Branch Policy

`main` is always an ancestor of `staging`: it only ever points at a commit that is already on
`staging`, and never has commits of its own.

- Promote with the "Promote staging to main" workflow ([.github/workflows/promote.yml](.github/workflows/promote.yml)),
  run manually.
- It requires a successful CI run on `staging`'s latest commit, fast-forwards `main` to that commit,
  then starts the official release.
- It fails rather than force-pushing if `main` has commits that `staging` doesn't.
- The `main` ruleset blocks every update except from the release-bot GitHub App, whose token the
  promote workflow uses (`RELEASE_BOT_APP_ID` variable and `RELEASE_BOT_PK` secret).
- Rulesets can be downloaded with `npm run repo:rulesets:download` and updated with
  `npm run repo:rulesets:upload`.
- Never merge into `main` with a pull request: merge, squash and rebase merges all add a commit to
  `main` that `staging` doesn't have.

### Release and Publishing

Release automation is defined in [.github/workflows/release.yml](.github/workflows/release.yml) and
uses semantic-release, following [Semantic Versioning](https://semver.org).

Every release is gated by CI on the exact commit being released.

| Branch    | Releases                   | Example      | Started by                                                 |
| --------- | -------------------------- | ------------ | ---------------------------------------------------------- |
| `staging` | Release candidates         | `1.2.0-rc.1` | The last CI job on a `staging` push, after all others pass |
| `main`    | Official (stable) releases | `1.2.0`      | The promote workflow only                                  |

- Manual runs of the release workflow first require a successful CI run for the commit.
- Each release candidate increments the `rc` number until the version is promoted. The official
  release is tagged on the same commit as the last candidate.
- Immutable releases are on, so a version tag that a release has used is reserved forever, even after
  the release is deleted. Pushing it fails with `GH013 ... Cannot create ref due to creations being
restricted`. `v1.0.0-rc.1` and `v1.0.0` are reserved this way, so the initial commit carries a
  `v1.0.1` tag with no release as the version baseline. Don't delete it.
- Releases create a `vX.Y.Z` git tag and a GitHub Release with the notes. They never commit, so
  the committed `package.json` keeps its placeholder version and there is no `CHANGELOG.md`.
  semantic-release writes the real version into `package.json` in the CI workspace only.
- Official releases publish to npm through trusted publishing (OIDC), with provenance. npm trusts
  only `release.yml`, so release candidates are not published to npm. cache-apt-pkgs-action still
  installs ts-apt from a git commit SHA.
- Official releases also deploy the API docs to GitHub Pages.
- Run the release workflow manually with `dry-run: true` to preview the next version without tagging.

Release configuration is in [release.config.ts](release.config.ts).

## Conventional Commits

semantic-release determines version bump level from commit messages.

| Type                                                                  | Release |
| --------------------------------------------------------------------- | ------- |
| `feat`                                                                | minor   |
| `fix`, `perf`                                                         | patch   |
| `!` after the type, or a `BREAKING CHANGE:` footer                    | major   |
| `build`, `chore`, `ci`, `docs`, `refactor`, `revert`, `style`, `test` | none    |

A husky `commit-msg` hook runs commitlint ([commitlint.config.js](commitlint.config.js)) and rejects
commits without a type. `npm install` sets it up through the `prepare` script. CI runs the same
check on pull requests, since `git commit --no-verify` skips the hook.

Examples:

```bash
git commit -m "fix(parser): handle empty package output"
git commit -m "feat(manager): add availability check"
git commit -m "feat!: remove deprecated API"
```

## Repository Scripts

Repository scripts are grouped under [scripts/dev](scripts/dev) and [scripts/ops](scripts/ops).

- [check_latest_action_pin.mts](scripts/ops/check_latest_action_pin.mts): checks whether pinned GitHub Action refs are up to date against upstream releases.
- [check_release_tag.mts](scripts/ops/check_release_tag.mts): validates release tag format and consistency with `package.json` version.
- [create_testcase_logs.mts](scripts/dev/create_testcase_logs.mts): regenerates command execution logs used by integration/parser fixtures.
- [hotfix_pr.mts](scripts/dev/hotfix_pr.mts): automates hotfix branch creation and PR creation/update flow.
- [gh_sync.mts](scripts/dev/gh_sync.mts): synchronizes repository settings, rulesets, variables, and tags JSON. **These are not for source control** since they leak information.
- [setup_devenv.mts](scripts/dev/setup_devenv.mts): bootstraps local developer dependencies, workspace settings, and npm audit remediation.
- [node_ver.mts](scripts/dev/node_ver.mts): verifies or updates Node version alignment across repo files and local Node installation.

## Integration Test Notes

Integration test suite is [test/ubuntu.integration.test.ts](test/ubuntu.integration.test.ts).

- These tests execute real APT commands and are environment-sensitive.
- They are intentionally narrower than unit tests to keep runtime manageable.
- Mutating package operations should use locking for safety when applicable.

## Docs and Publishing

- API docs are generated into [docs/api](docs/api) and are generated during the release process, not
  committed to source.
- Release workflow publishes package artifacts and deploys docs via GitHub Pages.

## Operational Concerns

- Node.js baseline is managed in [package.json](package.json) engines.
- Keep `package-lock.json` committed and synchronized with dependency changes.
- Prefer updating workflow action SHAs with care and validate in CI.
- Prefer full commit SHA pinning for all third-party GitHub Actions.
- Repository settings, rulesets, variables, and tags are synchronized via `scripts/dev/gh_sync.mts`.
- Repository settings are tracked in [.github/repo-settings.json](.github/repo-settings.json) and can be applied with `npm run repo:settings:upload`.
- Repository rulesets are tracked in [.github/repo-rulesets.json](.github/repo-rulesets.json) and can be applied with `npm run repo:rulesets:upload`.
- Repository variables are tracked in `.github/repo-vars.json` and can be applied with `npm run repo:vars:upload`.
- Repository tags are tracked in `.github/repo-tags.json` and can be applied with `npm run repo:tags:upload`.
- Use `npm run repo:all:download` and `npm run repo:all:upload` to synchronize every tracked GitHub metadata target in one pass.
- Prefer explicit status checks and branch protections over informal merge discipline.
- Keep release automation branch-based and semantic-release driven.
