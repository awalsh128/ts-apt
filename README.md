# <img src="logo.png" alt="Description" height="60" align="center"> Typescript APT Library

![npm version](https://img.shields.io/npm/v/ts-apt)
[![Main CI](https://img.shields.io/github/actions/workflow/status/awalsh128/ts-apt/ci.yml?label=CI%20Main&branch=main)](https://github.com/awalsh128/ts-apt/actions/workflows/ci.yml?query=branch%3Amain)
[![Staging CI](https://img.shields.io/github/actions/workflow/status/awalsh128/ts-apt/ci.yml?label=CI%20Staging&branch=staging)](https://github.com/awalsh128/ts-apt/actions/workflows/ci.yml?query=branch%3Astaging)
[![codecov](https://codecov.io/gh/awalsh128/ts-apt/branch/main/graph/badge.svg)](https://codecov.io/gh/awalsh128/ts-apt)
[![License: Apache2](https://shields.io/badge/license-apache2-blue.svg)](https://github.com/awalsh128/ts-apt/blob/main/LICENSE)

TypeScript library for APT package operations on Debian-based Linux systems. It supports both standard APT binaries and the [apt-fast](https://github.com/ilikenwf/apt-fast) bundled wrapper.

> [!TIP]
> If you find this project useful, please consider supporting it [as a sponsor and show some ❤️ for open source maintainers](https://github.com/sponsors/awalsh128).

## Features

- Install, remove, and upgrade packages
- Search package repositories
- List installed packages and upgradable packages
- Get package metadata and installed file lists
- Run cache cleanup and autoremove operations
- Use apt-fast when available, with automatic fallback to apt-get
- Structured command execution via pluggable command runners
- Typed error model for validation, availability, and command failures
- Safe locking support for mutating operations and parallelism for read-only operations

## Runtime Requirements

- Node.js 24+
- Linux environment with APT tooling available

## Installation

```bash
npm install ts-apt
```

## Usage

> [!IMPORTANT]
> `sudo` is required for mutating operations. If the running user does not have sudo privilege the calls will
> fail.

```ts
import { createPackageManager } from "ts-apt";

const manager = await createPackageManager(false);

const searchResults = await manager.search(["vim", "python"]);
const installed = await manager.listInstalled();

console.log(searchResults.length, installed.length);
```

## Testing

```bash
npm run test:unit
npm run test:integration
```

Integration tests run against real APT tooling and are slower than unit tests.

## API Documentation

Generate API docs:

```bash
npm run docs:api
```

Generated docs are written to [docs/api](docs/api).

## Credits

- [ilikenwf/apt-fast](https://github.com/ilikenwf/apt-fast) - Optimized fast APT downloads.
- [moll/js-internet-message](https://github.com/moll/js-internet-message) - RFC compliant parsing of some apt output to avoid brittle string parsing.

## Maintainer Notes

Development workflows, CI/release behavior, and repository maintenance guidance are documented in [CONTRIBUTING.md](CONTRIBUTING.md).
PRs are gated by branch policy checks, and releases are published from `main` and `staging` via semantic-release.
