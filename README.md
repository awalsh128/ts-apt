# ts-apt

[![npm version](https://img.shields.io/npm/v/ts-apt)](https://www.npmjs.com/package/ts-apt)
[![License: Apache2](https://shields.io/badge/license-apache2-blue.svg)](https://github.com/awalsh128/ts-apt/blob/master/LICENSE)
[![CI status](https://github.com/awalsh128/ts-apt/actions/workflows/ci.yml/badge.svg)](https://github.com/awalsh128/ts-apt/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/awalsh128/ts-apt/branch/main/graph/badge.svg)](https://codecov.io/gh/awalsh128/ts-apt)

TypeScript library for APT package operations on Debian-based Linux systems. It supports both standard APT binaries and the apt-fast wrapper.

> [!NOTE]
> If you find this project useful, please consider supporting ongoing maintenance: [Buy Me a Coffee](http://buymeacoffee.com/awalsh128)

## Features

- 90% coverage for APT operations
  - List installed packages and upgradable packages
  - Search package repositories
  - Get package metadata and installed file lists
  - Cache cleanup and autoremove operations
- Use `apt-fast` when available, with automatic fallback to `apt-get`
- Structured command execution via pluggable command runners
- Typed error model for validation, availability, and command failures
- Safe APT native locking support for mutating operations (e.g. remove, install, update)

## Runtime Requirements

- Node.js 24+
- Linux environment with APT tooling available

## Installation

```bash
npm install ts-apt
```

For local development in this repository:

```bash
npm install
npm run build
```

## Usage

```ts
import { createPackageManager } from "ts-apt";

const manager = await createPackageManager(false);

const searchResults = await manager.search(["vim"]);
const installed = await manager.listInstalled();

console.log(searchResults.length, installed.length);
```

## Testing

```bash
npm run test:unit
npm run test:integration
npm run test:integration:docker
```

Integration tests run against real APT tooling and are slower than unit tests.

- `test:integration` runs the readonly Ubuntu integration suite on the current host and includes environment-sensitive checks for search, show, installed files, and upgradable package parsing.
- `test:integration` also includes the mutating Ubuntu integration suite, but that suite is skipped unless devcontainer-backed execution is explicitly enabled and available.
- `test:integration:docker` forces both integration suites to run through the repository devcontainer when Docker and the devcontainer CLI are available.
- The devcontainer used for integration tests is based on `debian:stable-slim` with the Node devcontainer feature layered on top.

The integration harness lives in [test/ubuntu.integration.helpers.ts](test/ubuntu.integration.helpers.ts), with readonly scenarios in [test/ubuntu.integration.test.ts](test/ubuntu.integration.test.ts) and mutating scenarios in [test/ubuntu.mutating.integration.test.ts](test/ubuntu.mutating.integration.test.ts).

## API Documentation

Generate API docs:

```bash
npm run docs:api
```

Generated docs are written to [docs/api](docs/api).

## Credits

- [ilikenwf/apt-fast](https://github.com/ilikenwf/apt-fast)
- [moll/js-internet-message](https://github.com/moll/js-internet-message)

## Developer Notes

Maintainer-focused workflows, release details, and operational concerns are documented in [CONTRIBUTING.md](CONTRIBUTING.md).
