[**ts-apt v0.0.0-semantically-released**](../../README.md)

***

[ts-apt](../../README.md) / [types](../README.md) / PackageName

# Interface: PackageName

Defined in: [src/types.ts:7](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L7)

Package name that differentiates versioned and unversioned.

## Properties

### name

> **name**: `string`

Defined in: [src/types.ts:9](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L9)

Required name.

***

### version?

> `optional` **version?**: `string`

Defined in: [src/types.ts:11](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L11)

Optional version of package.

***

### distro?

> `optional` **distro?**: `string`

Defined in: [src/types.ts:13](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L13)

Optional distribution of package.

## Methods

### serialize()

> **serialize**(): `string`

Defined in: [src/types.ts:16](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L16)

Serializes the package name and version into an APT string representation.

#### Returns

`string`
