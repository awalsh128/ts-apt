# ts-apt

[![npm version](https://img.shields.io/npm/v/ts-apt)](https://www.npmjs.com/package/ts-apt)
[![License: Apache2](https://shields.io/badge/license-apache2-blue.svg)](https://github.com/awalsh128/ts-apt/blob/master/LICENSE)
[![CI status](https://github.com/awalsh128/ts-apt/actions/workflows/ci.yml/badge.svg)](https://github.com/awalsh128/ts-apt/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/awalsh128/ts-apt/branch/main/graph/badge.svg)](https://codecov.io/gh/awalsh128/ts-apt)

TypeScript library for APT package operations on Debian-based Linux systems. It supports both standard APT binaries and the apt-fast wrapper.

> [!NOTE]
> If you find this project useful, please consider supporting ongoing maintenance: [Buy Me a Coffee](http://buymeacoffee.com/awalsh128)

## Features

- Install, remove, and upgrade packages
- Search package repositories
- List installed packages and upgradable packages
- Get package metadata and installed file lists
- Run cache cleanup and autoremove operations
- Use apt-fast when available, with automatic fallback to apt-get
- Structured command execution via pluggable command runners
- Typed error model for validation, availability, and command failures
- Safe locking support for mutating operations

## Runtime Requirements

- Node.js 24+
- Linux environment with APT tooling available

## Installation

```bash
npm install ts-apt
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
```

Integration tests run against real APT tooling and are slower than unit tests.

## API Documentation

Generate API docs:

```bash
npm run docs:api
```

Generated docs are written to [docs/api](docs/api).

## Credits

- [ilikenwf/apt-fast](https://github.com/ilikenwf/apt-fast)
- [moll/js-internet-message](https://github.com/moll/js-internet-message)

## Maintainer Notes

Development workflows, CI/release behavior, and repository maintenance guidance are documented in [CONTRIBUTING.md](CONTRIBUTING.md).
