[**ts-apt v0.1.0**](../../README.md)

***

[ts-apt](../../README.md) / [index](../README.md) / AptPackageManager

# Class: AptPackageManager

Defined in: [src/manager.ts:106](https://github.com/awalsh128/ts-apt/blob/dev/src/manager.ts#L106)

APT-backed package manager implementation.

IMPORTANT: All operations are serialized to avoid concurrent access to APT lock files.
This is achieved via a global mutex and flock-based locking for real command execution.

## Implements

- [`PackageManager`](../../types/interfaces/PackageManager.md)

## Constructors

### Constructor

> **new AptPackageManager**(`aptFastEnabled`, `runner`, `parser`, `logger`): `AptPackageManager`

Defined in: [src/manager.ts:122](https://github.com/awalsh128/ts-apt/blob/dev/src/manager.ts#L122)

#### Parameters

##### aptFastEnabled

`boolean`

##### runner

[`CommandRunner`](../../types/interfaces/CommandRunner.md)

##### parser

`AptOutputParser`

##### logger

`Logger`

#### Returns

`AptPackageManager`

## Accessors

### aptPath

#### Get Signature

> **get** **aptPath**(): `string`

Defined in: [src/manager.ts:145](https://github.com/awalsh128/ts-apt/blob/dev/src/manager.ts#L145)

Returns the path to the currently used APT binary.

This is either apt-fast or apt* depending on availability and configuration.

##### Returns

`string`

Path to the APT binary.

## Methods

### autoClean()

> **autoClean**(): `Promise`\<`void`\>

Defined in: [src/manager.ts:159](https://github.com/awalsh128/ts-apt/blob/dev/src/manager.ts#L159)

Cleans local apt cache data via `<mutating-binary> autoclean`.

Example output:
```text
Reading package lists... Done
Building dependency tree... Done
Del old downloaded archive files
```

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`PackageManager`](../../types/interfaces/PackageManager.md).[`autoClean`](../../types/interfaces/PackageManager.md#autoclean)

***

### autoRemove()

> **autoRemove**(): `Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

Defined in: [src/manager.ts:176](https://github.com/awalsh128/ts-apt/blob/dev/src/manager.ts#L176)

Removes orphaned dependencies via `<mutating-binary> autoremove`.

Example output (parsed):
```text
Removing libfoo1:amd64 (1.2.3-1ubuntu1) ...
Removing bar-data (0.9.0-2) ...
```

#### Returns

`Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

#### Implementation of

[`PackageManager`](../../types/interfaces/PackageManager.md).[`autoRemove`](../../types/interfaces/PackageManager.md#autoremove)

***

### install()

> **install**(`pkgs`): `Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

Defined in: [src/manager.ts:196](https://github.com/awalsh128/ts-apt/blob/dev/src/manager.ts#L196)

Installs one or more packages via `<mutating-binary> install --fix-broken <package...>`.

Example output (parsed):
```text
Setting up curl:amd64 (8.5.0-2ubuntu10.6) ...
Setting up ca-certificates (20240203) ...
```

#### Parameters

##### pkgs

[`PackageName`](../../types/interfaces/PackageName.md)[]

Package names.

#### Returns

`Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

#### Implementation of

[`PackageManager`](../../types/interfaces/PackageManager.md).[`install`](../../types/interfaces/PackageManager.md#install)

***

### listInstalled()

> **listInstalled**(): `Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

Defined in: [src/manager.ts:215](https://github.com/awalsh128/ts-apt/blob/dev/src/manager.ts#L215)

Lists installed packages via `dpkg-query -W -f '${binary:Package}=${Version}\\n'`.

Example output (parsed):
```text
curl=8.5.0-2ubuntu10.6
libc6=2.39-0ubuntu8.4
```

#### Returns

`Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

#### Implementation of

[`PackageManager`](../../types/interfaces/PackageManager.md).[`listInstalled`](../../types/interfaces/PackageManager.md#listinstalled)

***

### listInstalledFiles()

> **listInstalledFiles**(`pkg`): `Promise`\<`string`[]\>

Defined in: [src/manager.ts:237](https://github.com/awalsh128/ts-apt/blob/dev/src/manager.ts#L237)

Lists files installed by a package via `dpkg-query -L <package>`.

Example output:
```text
/.
/usr
/usr/bin/curl
/usr/share/doc/curl/changelog.Debian.gz
```

#### Parameters

##### pkg

[`PackageName`](../../types/interfaces/PackageName.md)

Package name.

#### Returns

`Promise`\<`string`[]\>

#### Implementation of

[`PackageManager`](../../types/interfaces/PackageManager.md).[`listInstalledFiles`](../../types/interfaces/PackageManager.md#listinstalledfiles)

***

### listUpgradable()

> **listUpgradable**(): `Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

Defined in: [src/manager.ts:259](https://github.com/awalsh128/ts-apt/blob/dev/src/manager.ts#L259)

Lists upgradable packages via `apt list --upgradable`.

Example output (parsed):
```text
curl/jammy-updates,jammy-security 8.5.0-2ubuntu10.6 amd64 [upgradable from: 8.5.0-2ubuntu10.5]
```

#### Returns

`Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

#### Implementation of

[`PackageManager`](../../types/interfaces/PackageManager.md).[`listUpgradable`](../../types/interfaces/PackageManager.md#listupgradable)

***

### remove()

> **remove**(`pkgs`, `autoremoveEnabled?`): `Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

Defined in: [src/manager.ts:279](https://github.com/awalsh128/ts-apt/blob/dev/src/manager.ts#L279)

Removes one or more packages via `<mutating-binary> remove --fix-broken <package...>`.

Example output (parsed):
```text
Removing curl (8.5.0-2ubuntu10.6) ...
Removing libcurl4:amd64 (8.5.0-2ubuntu10.6) ...
```

#### Parameters

##### pkgs

[`PackageName`](../../types/interfaces/PackageName.md)[]

Package names.

##### autoremoveEnabled?

`boolean` = `true`

#### Returns

`Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

#### Implementation of

[`PackageManager`](../../types/interfaces/PackageManager.md).[`remove`](../../types/interfaces/PackageManager.md#remove)

***

### search()

> **search**(`keywords`, `namesOnly?`): `Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

Defined in: [src/manager.ts:312](https://github.com/awalsh128/ts-apt/blob/dev/src/manager.ts#L312)

Searches package repositories via `apt search <keywords...>`.

Example output (parsed):
```text
curl/jammy-updates,jammy-security 8.5.0-2ubuntu10.6 amd64
  command line tool for transferring data with URL syntax
```

#### Parameters

##### keywords

`string`[]

Search terms.

##### namesOnly?

`boolean` = `false`

Whether to return only package names.

#### Returns

`Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

#### Implementation of

[`PackageManager`](../../types/interfaces/PackageManager.md).[`search`](../../types/interfaces/PackageManager.md#search)

***

### update()

> **update**(): `Promise`\<`number`\>

Defined in: [src/manager.ts:336](https://github.com/awalsh128/ts-apt/blob/dev/src/manager.ts#L336)

Updates package index metadata via `<mutating-binary> update`.

Example output (parsed):
```text
12 packages can be upgraded. Run 'apt list --upgradable' to see them.
```

#### Returns

`Promise`\<`number`\>

#### Implementation of

[`PackageManager`](../../types/interfaces/PackageManager.md).[`update`](../../types/interfaces/PackageManager.md#update)

***

### upgrade()

> **upgrade**(`pkgs?`): `Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

Defined in: [src/manager.ts:361](https://github.com/awalsh128/ts-apt/blob/dev/src/manager.ts#L361)

Upgrades selected packages or all packages when no names are provided.

Commands executed:
- Specific packages: `<mutating-binary> install <package...>`
- All packages: `<mutating-binary> upgrade`

Example output (parsed):
```text
Setting up openssl (3.0.13-0ubuntu3.5) ...
Setting up libc6:amd64 (2.39-0ubuntu8.4) ...
```

#### Parameters

##### pkgs?

[`PackageName`](../../types/interfaces/PackageName.md)[] = `[]`

Optional package names.

#### Returns

`Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

#### Implementation of

[`PackageManager`](../../types/interfaces/PackageManager.md).[`upgrade`](../../types/interfaces/PackageManager.md#upgrade)

***

### upgradeAll()

> **upgradeAll**(): `Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

Defined in: [src/manager.ts:390](https://github.com/awalsh128/ts-apt/blob/dev/src/manager.ts#L390)

Upgrades all packages via `<mutating-binary> upgrade`.

Example output (parsed):
```text
Setting up openssl (3.0.13-0ubuntu3.5) ...
Setting up libc6:amd64 (2.39-0ubuntu8.4) ...
```

#### Returns

`Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

#### Implementation of

[`PackageManager`](../../types/interfaces/PackageManager.md).[`upgradeAll`](../../types/interfaces/PackageManager.md#upgradeall)

***

### getPackageInfo()

> **getPackageInfo**(`pkgs`): `Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

Defined in: [src/manager.ts:407](https://github.com/awalsh128/ts-apt/blob/dev/src/manager.ts#L407)

Retrieves package metadata via `apt-cache --quiet=0 --no-all-versions show <package...>`.

Example output (parsed):
```text
Package: curl
Version: 8.5.0-2ubuntu10.6
Architecture: amd64
Description: command line tool for transferring data with URL syntax
```

#### Parameters

##### pkgs

[`PackageName`](../../types/interfaces/PackageName.md)[]

Package names.

#### Returns

`Promise`\<[`PackageInfo`](../../types/interfaces/PackageInfo.md)[]\>

#### Implementation of

[`PackageManager`](../../types/interfaces/PackageManager.md).[`getPackageInfo`](../../types/interfaces/PackageManager.md#getpackageinfo)
