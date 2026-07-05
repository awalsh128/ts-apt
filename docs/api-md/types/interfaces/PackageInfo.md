[**ts-apt v0.0.0-semantically-released**](../../README.md)

***

[ts-apt](../../README.md) / [types](../README.md) / PackageInfo

# Interface: PackageInfo

Defined in: [src/types.ts:26](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L26)

Structured package metadata returned by manager operations.

## Properties

### name

> **name**: `string`

Defined in: [src/types.ts:28](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L28)

Package name as reported by the package manager.

***

### version

> **version**: `string`

Defined in: [src/types.ts:34](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L34)

Installed version when present.

NOTE: If package is broken, this field will be empty and the status will be "broken".

***

### status?

> `optional` **status?**: [`PackageStatus`](../type-aliases/PackageStatus.md)

Defined in: [src/types.ts:36](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L36)

Current normalized package status.

***

### arch?

> `optional` **arch?**: `string`

Defined in: [src/types.ts:38](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L38)

Package architecture, for example amd64 or arm64 if specified.

***

### metadata?

> `optional` **metadata?**: `Map`\<`string`, `string`\>

Defined in: [src/types.ts:40](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L40)

Operation specific metadata if available.
