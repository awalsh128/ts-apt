[**ts-apt v0.0.0-semantically-released**](../../README.md)

***

[ts-apt](../../README.md) / [index](../README.md) / createPackageManager

# Function: createPackageManager()

> **createPackageManager**(`enableAptFast`, `appLogger?`, `commandExecLogger?`): `Promise`\<[`PackageManager`](../../types/interfaces/PackageManager.md)\>

Defined in: [src/manager.ts:553](https://github.com/awalsh128/ts-apt/blob/main/src/manager.ts#L553)

Creates a package manager instance.

Commands executed during setup:
- Always: no external command (logger and runner are initialized in-process).
- When `enableAptFast` is true: `dpkg-query -W aria2` to verify apt-fast prerequisites.

Example output parsed during apt-fast check:
```text
ii  aria2  1.36.0-1 amd64 High speed download utility
```

## Parameters

### enableAptFast

`boolean`

Whether to enable APT-fast which is a wrapper for apt to speed up package downloads.

### appLogger?

`Logger`

Logger instance for application logs.

### commandExecLogger?

`Logger`

Logger instance for capturing APT commands execution.

## Returns

`Promise`\<[`PackageManager`](../../types/interfaces/PackageManager.md)\>

A configured PackageManager instance.
