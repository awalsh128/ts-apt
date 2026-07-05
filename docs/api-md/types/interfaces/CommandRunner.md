[**ts-apt v0.0.0-semantically-released**](../../README.md)

***

[ts-apt](../../README.md) / [types](../README.md) / CommandRunner

# Interface: CommandRunner

Defined in: [src/types.ts:72](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L72)

Abstraction over command execution used by package managers.

## Methods

### run()

> **run**(`command`, `args?`, `options?`): `Promise`\<[`CommandResult`](CommandResult.md)\>

Defined in: [src/types.ts:80](https://github.com/awalsh128/ts-apt/blob/chore/ci-pr-only-gating-main/src/types.ts#L80)

Executes a command and resolves with process output.

#### Parameters

##### command

`string`

Executable name.

##### args?

`string`[]

Command-line arguments.

##### options?

[`CommandOptions`](CommandOptions.md)

Process execution options.

#### Returns

`Promise`\<[`CommandResult`](CommandResult.md)\>
