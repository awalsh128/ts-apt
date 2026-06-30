# ts-apt

[![npm version](https://img.shields.io/npm/v/ts-apt)](https://www.npmjs.com/package/ts-apt)
[![License: Apache2](https://shields.io/badge/license-apache2-blue.svg)](https://github.com/awalsh128/ts-apt/blob/master/LICENSE)
[![CI status](https://github.com/awalsh128/ts-apt/actions/workflows/ci.yml/badge.svg)](https://github.com/awalsh128/ts-apt/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/awalsh128/ts-apt/branch/main/graph/badge.svg)](https://codecov.io/gh/awalsh128/ts-apt)

<!-- TODO enable once active -->
<!-- ![npm downloads](https://img.shields.io/npm/dt/ts-apt.svg) -->

> [!NOTE]
> The open source projects that I maintain are a labor of love. If you find this useful and want to support open source, **please consider donating and [Buy Me a Coffe](http://buymeacoffee.com/awalsh128)**.

TypeScript library for APT (Advanced Package Tool) package operations on Debian-based Linux systems. Also supports the [ilikenwf/apt-fast](https://github.com/ilikenwf/apt-fast) wrapper for optimized download times.

## Credit
Run `release` manually via `workflow_dispatch` and provide a semantic bump type.
- [moll/js-internet-message](https://github.com/moll/js-internet-message) for RFC compliant internet message parsing which is emitted by APT for some commands.
  - RFC 733 (ARPA Network Text Message)
  - RFC 822 (ARPA Internet Text Messages)
- Query packages
- Install and remove packages
- List installed and upgradable packages
- Read package details
- Auto-remove and clean
## Runtime
Manual release example:

- Run workflow `Publish` with:
  - `bump=patch|minor|major|prerelease`
  - `preid=rc` (used only for `prerelease`)

Tag-based release example:
- Node.js 24+
- Linux with APT tooling available

## Install

```bash
npm install
npm run build
```

## Testing

Integration tests run APT commands inside the repository devcontainer for host isolation.

```bash
npm run test:unit
npm run test:integration
```

## Quick Example

```ts
import { createPackageManager } from "./dist/src/index.js";

const apt = await createPackageManager({ preferred: "apt" });
const packages = await apt.find(["vim"]);
console.log(packages);
```

## API Docs

Generate API documentation from TSDoc comments:

```bash
npm run docs:api
```

Generated output is written to [docs/api](docs/api).

CI verifies API docs are synchronized with source changes by regenerating docs
and failing when the checked-in [docs/api](docs/api) directory is out of date.

API docs are published with NPM package and to GitHub Pages on release
[.github/workflows/release.yml](.github/workflows/release.yml).

## Release

Automated release is configured in [.github/workflows/release.yml](.github/workflows/release.yml).

Trigger modes:

- Push a semantic version tag like `v0.2.0`.
- Run `release` manually via `workflow_dispatch` and choose a semantic bump type.

The workflow will:

- For manual releases, automatically bump `package.json` and `package-lock.json` using the selected semantic bump (`patch`, `minor`, `major`, or `prerelease`).
- Validate that the release tag matches `package.json` version.
- Run lint, typecheck, build, unit tests, and integration tests.
- Generate and verify API docs are up to date.
- Publish to npm with provenance:
  - Stable tags (for example `v1.2.3`) publish to `latest`.
  - Prerelease tags (for example `v1.2.3-rc.1`) publish to `next`.
- Create a GitHub release with generated release notes.

Repository setup requirements:

- Ensure the workflow has permission to push commits/tags to the release branch.

Manual release example:

- Run workflow `Publish` with:
  - `bump=patch|minor|major|prerelease`
  - `preid=rc` (used only when `bump=prerelease`)

Tag-based release example:

```bash
git tag v0.2.0
git push origin v0.2.0
```
