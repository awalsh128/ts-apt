[**ts-apt v0.0.0-semantically-released**](../../README.md)

***

[ts-apt](../../README.md) / [types](../README.md) / CommandOptions

# Interface: CommandOptions

Defined in: [src/types.ts:46](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L46)

Process execution settings for command runner implementations.

## Properties

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [src/types.ts:48](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L48)

Maximum process runtime in milliseconds before timeout.

***

### env?

> `optional` **env?**: `string`[]

Defined in: [src/types.ts:50](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L50)

Additional KEY=VALUE environment variables applied to the process.
