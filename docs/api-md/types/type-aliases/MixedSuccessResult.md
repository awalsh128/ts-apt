[**ts-apt v0.0.0-semantically-released**](../../README.md)

***

[ts-apt](../../README.md) / [types](../README.md) / MixedSuccessResult

# Type Alias: MixedSuccessResult\<T\>

> **MixedSuccessResult**\<`T`\> = `object`

Defined in: [src/types.ts:88](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L88)

Zero exit code but contains APT notice, warning and error lines.

## Type Parameters

### T

`T`

## Properties

### success

> **success**: `T`

Defined in: [src/types.ts:90](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L90)

Items that were successfully processed.

***

### stderr

> **stderr**: `string`

Defined in: [src/types.ts:92](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L92)

Items that failed to process and output to stderr.
