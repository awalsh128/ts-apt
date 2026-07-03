[**ts-apt v0.0.0-semantically-released**](../../README.md)

***

[ts-apt](../../README.md) / [index](../README.md) / DefaultCommandRunner

# Class: DefaultCommandRunner

Defined in: [src/commandRunner.ts:13](https://github.com/awalsh128/ts-apt/blob/main/src/commandRunner.ts#L13)

Production command runner backed by child_process spawn.

## Implements

- [`CommandRunner`](../../types/interfaces/CommandRunner.md)

## Constructors

### Constructor

> **new DefaultCommandRunner**(`appLogger`, `execLogger`): `DefaultCommandRunner`

Defined in: [src/commandRunner.ts:17](https://github.com/awalsh128/ts-apt/blob/main/src/commandRunner.ts#L17)

#### Parameters

##### appLogger

`Logger`

##### execLogger

`Logger`

#### Returns

`DefaultCommandRunner`

## Methods

### run()

> **run**(`command`, `args?`, `options?`): `Promise`\<[`CommandResult`](../../types/interfaces/CommandResult.md)\>

Defined in: [src/commandRunner.ts:31](https://github.com/awalsh128/ts-apt/blob/main/src/commandRunner.ts#L31)

Executes a command with optional environment, timeout, and interactive mode.

#### Parameters

##### command

`string`

Executable name.

##### args?

`string`[] = `[]`

Command argument list.

##### options?

[`CommandOptions`](../../types/interfaces/CommandOptions.md) = `{}`

Execution options.

#### Returns

`Promise`\<[`CommandResult`](../../types/interfaces/CommandResult.md)\>

Captured command output.

#### Throws

CommandExecutionError On non-zero exit or timeout.

#### Implementation of

[`CommandRunner`](../../types/interfaces/CommandRunner.md).[`run`](../../types/interfaces/CommandRunner.md#run)
