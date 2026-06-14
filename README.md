# ts-apt

[![License: Apache2](https://shields.io/badge/license-apache2-blue.svg)](https://github.com/awalsh128/ts-apt/blob/master/LICENSE)
[![Master Test status](https://github.com/awalsh128/ts-apt/actions/workflows/master_test.yml/badge.svg)](https://github.com/awalsh128/cache-apt-pkgs-action-ci/actions/workflows/master_test.yml)
[![Dev Test status](https://github.com/awalsh128/cache-apt-pkgs-action-ci/actions/workflows/dev_test.yml/badge.svg)](https://github.com/awalsh128/cache-apt-pkgs-action-ci/actions/workflows/dev_test.yml)

TypeScript library for APT and APT-fast package operations on Debian-based Linux systems.

This package is library-only (no bundled CLI executable).

## Scope

- Query packages
- Install and remove packages
- Refresh and upgrade package metadata/packages
- List installed and upgradable packages
- Read package details
- Auto-remove and clean

## Runtime

- Node.js 20+
- Linux with APT tooling available

## Install

```bash
npm install
npm run build
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

API docs can be published to GitHub Pages using
[.github/workflows/docs-pages.yml](.github/workflows/docs-pages.yml).

GitHub Pages setup:

- In repository settings, set Pages source to GitHub Actions.
- Push to `main` or `master`, or trigger `docs-pages` manually.
- The workflow deploys the generated [docs/api](docs/api) output.

## Release

Automated release is configured in [.github/workflows/release.yml](.github/workflows/release.yml).

Trigger modes:

- Push a semantic version tag like `v0.2.0`.
- Run `release` manually via `workflow_dispatch` and provide a tag.

The workflow will:

- Validate that the release tag matches `package.json` version.
- Run lint, typecheck, unit tests, and build.
- Generate and verify API docs are up to date.
- Publish to npm with provenance:
  - Stable tags (for example `v1.2.3`) publish to `latest`.
  - Prerelease tags (for example `v1.2.3-rc.1`) publish to `next`.
- Create a GitHub release with generated release notes.

Repository setup requirements:

- Add repository secret `NPM_TOKEN` with publish access to npm.
- Ensure package version in `package.json` matches the release tag.

Tag-based release example:

```bash
git tag v0.2.0
git push origin v0.2.0
```
