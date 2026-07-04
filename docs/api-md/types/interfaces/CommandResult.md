[**ts-apt v0.0.0-semantically-released**](../../README.md)

***

[ts-apt](../../README.md) / [types](../README.md) / CommandResult

# Interface: CommandResult

Defined in: [src/types.ts:48](https://github.com/awalsh128/ts-apt/blob/staging/src/types.ts#L48)

Captured command output returned by command runners.

## Properties

### cmdLine

> **cmdLine**: `string`

Defined in: [src/types.ts:50](https://github.com/awalsh128/ts-apt/blob/staging/src/types.ts#L50)

Full command line executed.

***

### stdout

> **stdout**: `string`

Defined in: [src/types.ts:52](https://github.com/awalsh128/ts-apt/blob/staging/src/types.ts#L52)

Standard output text captured from the process.

***

### stderr

> **stderr**: `string`

Defined in: [src/types.ts:54](https://github.com/awalsh128/ts-apt/blob/staging/src/types.ts#L54)

Standard error text captured from the process.

***

### exitCode

> **exitCode**: `number`

Defined in: [src/types.ts:56](https://github.com/awalsh128/ts-apt/blob/staging/src/types.ts#L56)

Process exit code.
