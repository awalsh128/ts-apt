[**ts-apt v0.1.0**](../../README.md)

***

[ts-apt](../../README.md) / [types](../README.md) / CommandOptions

# Interface: CommandOptions

Defined in: [src/types.ts:38](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L38)

Process execution settings for command runner implementations.

## Properties

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [src/types.ts:40](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L40)

Maximum process runtime in milliseconds before timeout.

***

### env?

> `optional` **env?**: `string`[]

Defined in: [src/types.ts:42](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L42)

Additional KEY=VALUE environment variables applied to the process.
