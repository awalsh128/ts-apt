[**ts-apt v0.0.0-semantically-released**](../../README.md)

***

[ts-apt](../../README.md) / [types](../README.md) / PackageInfo

# Interface: PackageInfo

Defined in: [src/types.ts:22](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L22)

Structured package metadata returned by manager operations.

## Properties

### name

> **name**: `string`

Defined in: [src/types.ts:24](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L24)

Package name as reported by the package manager.

***

### version

> **version**: `string`

Defined in: [src/types.ts:26](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L26)

Installed version when present.

***

### status?

> `optional` **status?**: [`PackageStatus`](../type-aliases/PackageStatus.md)

Defined in: [src/types.ts:28](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L28)

Current normalized package status.

***

### arch?

> `optional` **arch?**: `string`

Defined in: [src/types.ts:30](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L30)

Package architecture, for example amd64 or arm64 if specified.

***

### metadata?

> `optional` **metadata?**: `Map`\<`string`, `string`\>

Defined in: [src/types.ts:32](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L32)

Operation specific metadata if available.
