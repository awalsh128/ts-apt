[**ts-apt v0.0.0-semantically-released**](../../README.md)

***

[ts-apt](../../README.md) / [types](../README.md) / PackageName

# Interface: PackageName

Defined in: [src/types.ts:11](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L11)

Package name that differentiates versioned and unversioned.

## Properties

### name

> **name**: `string`

Defined in: [src/types.ts:13](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L13)

Required name.

***

### version?

> `optional` **version?**: `string`

Defined in: [src/types.ts:15](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L15)

Optional version of package.

***

### distro?

> `optional` **distro?**: `string`

Defined in: [src/types.ts:17](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L17)

Optional distribution of package.

## Methods

### serialize()

> **serialize**(): `string`

Defined in: [src/types.ts:20](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L20)

Serializes the package name and version into an APT string representation.

#### Returns

`string`
