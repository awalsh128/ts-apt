<p align="center">
  <img src="logo.png" alt="TypeScript APT logo" width="128" height="128">
</p>

<h1 align="center">TypeScript APT</h1>

<p align="center">
  TypeScript library for APT and <a href="https://github.com/ilikenwf/apt-fast">apt-fast</a> package operations on Debian-based Linux systems.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ts-apt"><img src="https://img.shields.io/npm/v/ts-apt" alt="npm version"></a>
  <a href="https://github.com/awalsh128/ts-apt/releases"><img src="https://img.shields.io/github/v/release/awalsh128/ts-apt?label=release" alt="GitHub release"></a>
  <a href="https://github.com/awalsh128/ts-apt/actions/workflows/ci.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/awalsh128/ts-apt/ci.yml?label=main&branch=main" alt="main CI"></a>
  <a href="https://github.com/awalsh128/ts-apt/actions/workflows/ci.yml?query=branch%3Astaging"><img src="https://img.shields.io/github/actions/workflow/status/awalsh128/ts-apt/ci.yml?label=staging&branch=staging" alt="staging CI"></a>
  <a href="https://codecov.io/gh/awalsh128/ts-apt"><img src="https://codecov.io/gh/awalsh128/ts-apt/branch/main/graph/badge.svg" alt="codecov"></a>
</p>

TypeScript library for APT package operations on Debian-based Linux systems. It supports both standard APT binaries and the [apt-fast](https://github.com/ilikenwf/apt-fast) bundled wrapper.

- 📦 Install, remove, upgrade and search packages, and read package metadata and installed file lists
- ⚡ Uses apt-fast when available, with automatic fallback to apt-get
- 🔌 Structured command execution through pluggable command runners
- 🧱 Typed errors for validation, availability and command failures
- 🔒 Safe locking for mutating operations, with parallelism for read-only ones

<!-- prettier-ignore -->
<p align="center">
  <a href="https://github.com/sponsors/awalsh128"><img src="https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Sponsor awalsh128"></a>
</p>

<p align="center">
  Free and open source, and kept up by one person.<br />
  If it saves you time, <a href="https://github.com/sponsors/awalsh128">sponsor it monthly</a> or
  <a href="https://github.com/sponsors/awalsh128?frequency=one-time">leave a small one-time tip</a>. Every bit
  helps.
</p>

> [!IMPORTANT]
> `sudo` is required for mutating operations. If the running user does not have sudo privilege the calls will
> fail.

## Quick Start

Requires Node.js 24+ and a Linux environment with APT tooling available.

```bash
npm install ts-apt
```

```ts
import { createPackageManager } from "ts-apt";

const manager = await createPackageManager(false);

const searchResults = await manager.search(["vim", "python"]);
const installed = await manager.listInstalled();

console.log(searchResults.length, installed.length);
```

## API Documentation

The API reference is at [awalsh128.com/ts-apt](https://www.awalsh128.com/ts-apt/). Generate it locally with
`npm run docs:api` (output goes to the uncommitted `docs/api`).

## Testing

```bash
npm run test:unit
npm run test:integration
```

Integration tests run against real APT tooling and are slower than unit tests.

## Credits

- [ilikenwf/apt-fast](https://github.com/ilikenwf/apt-fast) - Optimized fast APT downloads.
- [moll/js-internet-message](https://github.com/moll/js-internet-message) - RFC compliant parsing of some apt output to avoid brittle string parsing.

Development and release workflows are in [CONTRIBUTING.md](CONTRIBUTING.md).
