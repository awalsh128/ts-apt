[**ts-apt v0.0.0-semantically-released**](../../README.md)

***

[ts-apt](../../README.md) / [types](../README.md) / CommandResult

# Interface: CommandResult

Defined in: [src/types.ts:56](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L56)

Captured command output returned by command runners.

## Properties

### command

> **command**: `string`

Defined in: [src/types.ts:58](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L58)

Command executed.

***

### args

> **args**: `string`[]

Defined in: [src/types.ts:60](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L60)

Command-line arguments to command.

***

### stdout

> **stdout**: `string`

Defined in: [src/types.ts:62](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L62)

Standard output text captured from the process.

***

### stderr

> **stderr**: `string`

Defined in: [src/types.ts:64](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L64)

Standard error text captured from the process.

***

### exitCode

> **exitCode**: `number`

Defined in: [src/types.ts:66](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L66)

Process exit code.
