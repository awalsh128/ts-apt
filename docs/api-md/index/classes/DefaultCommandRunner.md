[**ts-apt v0.0.0-semantically-released**](../../README.md)

***

[ts-apt](../../README.md) / [index](../README.md) / DefaultCommandRunner

# Class: DefaultCommandRunner

Defined in: [src/commandRunner.ts:12](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/commandRunner.ts#L12)

Production command runner backed by child_process spawn.

## Implements

- [`CommandRunner`](../../types/interfaces/CommandRunner.md)

## Constructors

### Constructor

> **new DefaultCommandRunner**(`appLogger?`, `execLogger?`): `DefaultCommandRunner`

Defined in: [src/commandRunner.ts:16](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/commandRunner.ts#L16)

#### Parameters

##### appLogger?

`Logger`

##### execLogger?

`Logger`

#### Returns

`DefaultCommandRunner`

## Methods

### run()

> **run**(`command`, `args?`, `options?`): `Promise`\<[`CommandResult`](../../types/interfaces/CommandResult.md)\>

Defined in: [src/commandRunner.ts:70](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/commandRunner.ts#L70)

Executes a command with optional environment and timeout.

NOTE: Signalled terminations (e.g., SIGTERM, SIGKILL) are mapped to exit codes 143 and 137 respectively.

WARNING: Some commands will buffer output when not attached to a terminal.
For those cases, stdbuf will need to be passed in.

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
