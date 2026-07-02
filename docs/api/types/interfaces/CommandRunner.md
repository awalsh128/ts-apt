[**ts-apt v0.1.0**](../../README.md)

***

[ts-apt](../../README.md) / [types](../README.md) / CommandRunner

# Interface: CommandRunner

Defined in: [src/types.ts:62](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L62)

Abstraction over command execution used by package managers.

## Methods

### run()

> **run**(`command`, `args?`, `options?`): `Promise`\<[`CommandResult`](CommandResult.md)\>

Defined in: [src/types.ts:70](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L70)

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
