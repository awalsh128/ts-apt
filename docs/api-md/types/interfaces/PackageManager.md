[**ts-apt v0.0.0-semantically-released**](../../README.md)

***

[ts-apt](../../README.md) / [types](../README.md) / PackageManager

# Interface: PackageManager

Defined in: [src/types.ts:80](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L80)

Package manager contract implemented by APT and APT-fast managers.

## Methods

### install()

> **install**(`pkgs`): `Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

Defined in: [src/types.ts:82](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L82)

Installs one or more packages.

#### Parameters

##### pkgs

[`PackageName`](PackageName.md)[]

#### Returns

`Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

***

### remove()

> **remove**(`pkgs`): `Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

Defined in: [src/types.ts:85](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L85)

Removes one or more packages.

#### Parameters

##### pkgs

[`PackageName`](PackageName.md)[]

#### Returns

`Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

***

### search()

> **search**(`keywords`): `Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

Defined in: [src/types.ts:88](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L88)

Searches package repositories by one or more keywords and returns name-description pairs.

#### Parameters

##### keywords

`string`[]

#### Returns

`Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

***

### listInstalledFiles()

> **listInstalledFiles**(`pkg`): `Promise`\<`string`[]\>

Defined in: [src/types.ts:91](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L91)

Lists files installed by a package.

#### Parameters

##### pkg

[`PackageName`](PackageName.md)

#### Returns

`Promise`\<`string`[]\>

***

### listInstalled()

> **listInstalled**(): `Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

Defined in: [src/types.ts:94](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L94)

Lists currently installed packages.

#### Returns

`Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

***

### listUpgradable()

> **listUpgradable**(): `Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

Defined in: [src/types.ts:97](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L97)

Lists upgradable packages.

#### Returns

`Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

***

### upgrade()

> **upgrade**(`pkgs`): `Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

Defined in: [src/types.ts:100](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L100)

Upgrades all packages or a selected package set.

#### Parameters

##### pkgs

[`PackageName`](PackageName.md)[]

#### Returns

`Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

***

### upgradeAll()

> **upgradeAll**(): `Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

Defined in: [src/types.ts:103](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L103)

Upgrades all packages managed by this package manager.

#### Returns

`Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

***

### update()

> **update**(): `Promise`\<`number`\>

Defined in: [src/types.ts:106](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L106)

Refreshes repository indexes and returns number of packages that can be upgraded.

#### Returns

`Promise`\<`number`\>

***

### getPackageInfo()

> **getPackageInfo**(`pkgs`): `Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

Defined in: [src/types.ts:109](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L109)

Returns metadata for one or more packages.

#### Parameters

##### pkgs

[`PackageName`](PackageName.md)[]

#### Returns

`Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

***

### autoClean()

> **autoClean**(): `Promise`\<`void`\>

Defined in: [src/types.ts:112](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L112)

Cleans local package cache data.

#### Returns

`Promise`\<`void`\>

***

### autoRemove()

> **autoRemove**(): `Promise`\<[`PackageInfo`](PackageInfo.md)[]\>

Defined in: [src/types.ts:115](https://github.com/awalsh128/ts-apt/blob/dev/src/types.ts#L115)

Removes unused dependency packages.

#### Returns

`Promise`\<[`PackageInfo`](PackageInfo.md)[]\>
