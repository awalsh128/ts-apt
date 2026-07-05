[**ts-apt v0.0.0-semantically-released**](../../README.md)

***

[ts-apt](../../README.md) / [types](../README.md) / PackageManager

# Interface: PackageManager

Defined in: [src/types.ts:98](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L98)

Package manager contract implemented by APT and APT-fast managers.

## Methods

### install()

> **install**(`pkgs`): `Promise`\<[`MixedSuccessResult`](../type-aliases/MixedSuccessResult.md)\<[`PackageInfo`](PackageInfo.md)[]\>\>

Defined in: [src/types.ts:100](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L100)

Installs one or more packages.

#### Parameters

##### pkgs

[`PackageName`](PackageName.md)[]

#### Returns

`Promise`\<[`MixedSuccessResult`](../type-aliases/MixedSuccessResult.md)\<[`PackageInfo`](PackageInfo.md)[]\>\>

***

### remove()

> **remove**(`pkgs`): `Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

Defined in: [src/types.ts:103](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L103)

Removes one or more packages.

#### Parameters

##### pkgs

[`PackageName`](PackageName.md)[]

#### Returns

`Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

***

### search()

> **search**(`keywords`): `Promise`\<`object`[]\>

Defined in: [src/types.ts:106](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L106)

Searches package repositories by one or more keywords and returns name-description pairs.

#### Parameters

##### keywords

`string`[]

#### Returns

`Promise`\<`object`[]\>

***

### listInstalledFiles()

> **listInstalledFiles**(`pkg`): `Promise`\<`string`[]\>

Defined in: [src/types.ts:109](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L109)

Lists files installed by a package.

#### Parameters

##### pkg

[`PackageName`](PackageName.md)

#### Returns

`Promise`\<`string`[]\>

***

### listInstalled()

> **listInstalled**(): `Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

Defined in: [src/types.ts:112](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L112)

Lists currently installed packages.

#### Returns

`Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

***

### listUpgradable()

> **listUpgradable**(): `Promise`\<[`MixedSuccessResult`](../type-aliases/MixedSuccessResult.md)\<[`PackageInfo`](PackageInfo.md)[]\>\>

Defined in: [src/types.ts:115](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L115)

Lists upgradable packages.

#### Returns

`Promise`\<[`MixedSuccessResult`](../type-aliases/MixedSuccessResult.md)\<[`PackageInfo`](PackageInfo.md)[]\>\>

***

### show()

> **show**(`pkgs`): `Promise`\<[`MixedSuccessResult`](../type-aliases/MixedSuccessResult.md)\<[`PackageInfo`](PackageInfo.md)[]\>\>

Defined in: [src/types.ts:118](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L118)

Returns metadata for one or more packages.

#### Parameters

##### pkgs

[`PackageName`](PackageName.md)[]

#### Returns

`Promise`\<[`MixedSuccessResult`](../type-aliases/MixedSuccessResult.md)\<[`PackageInfo`](PackageInfo.md)[]\>\>

***

### upgrade()

> **upgrade**(`pkgs`): `Promise`\<[`MixedSuccessResult`](../type-aliases/MixedSuccessResult.md)\<[`PackageInfo`](PackageInfo.md)[]\>\>

Defined in: [src/types.ts:121](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L121)

Upgrades all packages or a selected package set.

#### Parameters

##### pkgs

[`PackageName`](PackageName.md)[]

#### Returns

`Promise`\<[`MixedSuccessResult`](../type-aliases/MixedSuccessResult.md)\<[`PackageInfo`](PackageInfo.md)[]\>\>

***

### upgradeAll()

> **upgradeAll**(): `Promise`\<[`MixedSuccessResult`](../type-aliases/MixedSuccessResult.md)\<[`PackageInfo`](PackageInfo.md)[]\>\>

Defined in: [src/types.ts:124](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L124)

Upgrades all packages managed by this package manager.

#### Returns

`Promise`\<[`MixedSuccessResult`](../type-aliases/MixedSuccessResult.md)\<[`PackageInfo`](PackageInfo.md)[]\>\>

***

### update()

> **update**(): `Promise`\<[`MixedSuccessResult`](../type-aliases/MixedSuccessResult.md)\<`number`\>\>

Defined in: [src/types.ts:127](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L127)

Refreshes repository indexes and returns number of packages that can be upgraded.

#### Returns

`Promise`\<[`MixedSuccessResult`](../type-aliases/MixedSuccessResult.md)\<`number`\>\>

***

### autoClean()

> **autoClean**(): `Promise`\<`void`\>

Defined in: [src/types.ts:130](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L130)

Cleans local package cache data.

#### Returns

`Promise`\<`void`\>

***

### autoRemove()

> **autoRemove**(): `Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

Defined in: [src/types.ts:133](https://github.com/awalsh128/ts-apt/blob/chore/ci-push-trigger/src/types.ts#L133)

Removes unused dependency packages.

#### Returns

`Promise`\<[`PackageInfo`](PackageInfo.md)[]\>
