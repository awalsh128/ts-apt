/** Package name that optionally supports version and release codename.
 *
 * NOTE: No validation is performed on the name, version, or architecture.
 * The actual APT commands will handle this and provide errors if validation fails.
 */
export interface PackageName {
  /** Required name. */
  name: string;
  /** Optional version of package. */
  version?: string;
  /** Optional architecture of the package (e.g. amd64, arm64). */
  arch?: string;

  /** Compares this package name with another package name to determine order. */
  compareTo(other: PackageName): number;

  /**
   * Serializes the package name, architecture, and version into an APT string representation.
   *
   * Format: `name[:arch][=version]`
   *
   * Example outputs:
   * - "curl" (only name)
   * - "curl:amd64" (name and architecture)
   * - "curl=8.5.0-2ubuntu10.6" (name and version)
   * - "curl:amd64=8.5.0-2ubuntu10.6" (name, architecture, and version)
   */
  serialize(): string;
}

/**
 * Normalized package state used across APT and APT-fast operations.
 */
export type PackageStatus = "installed" | "upgradeable" | "available";

/**
 * Custom ts-apt keys created while parsing APT command output not directly represented by the `apt-cache`
 * standard [InternetMessage] format.
 */
export const tsAptMetaKeys = {
  /**
   * Indicates whether for each package in `apt-get install <package...>` the action is for unpacking the
   * package or configuring it (i.e. Inst, Const).
   */
  installActions: "tsapt-install-actions",
  /**
   * Indicates the repositories from which a package is being installed as reported by
   * `apt-get install <package...>`.
   */
  installRepositories: "tsapt-install-repositories",
  /**
   * Indicates the new version available for an upgradeable package as reported by `apt list --upgradable`.
   */
  listUpgradeableNewVersion: "tsapt-listupgradeable-new-version",
  /**
   * Indicates the dependencies for a package that is being removed as reported by
   * `apt-get remove <package...>`.
   */
  removeDependencies: "tsapt-remove-dependencies",
  /** Indicates the description field for a package as listed by `apt search <keywords...>`. */
  searchDescription: "tsapt-search-description",
  /** Indicates the release codename field for a package as listed by `apt search <keywords...>`. */
  searchReleaseCodename: "tsapt-search-release-codename",
} as const;

/** Strong type for the keys used in package info metadata, corresponding to the custom [tsAptMetaKeys]. */
export type TsAptMetaKey = (typeof tsAptMetaKeys)[keyof typeof tsAptMetaKeys];

/**
 * Type alias for package info metadata that can accept a `[string, string]` or `[TsAptMetaKey, string]`
 * key-value pair.
 */
export type MetadataRecord = Partial<Record<TsAptMetaKey, string>> &
  Record<string, string>;

/**
 * Structured package metadata returned by manager operations.
 */
export interface PackageInfo {
  /** Package name as reported by the package manager. */
  name: PackageName;
  /** Current normalized package status. */
  status?: PackageStatus;
  /**
   * Operation specific metadata if available.
   *
   * Some are extracted from commands like `apt-cache show <package>` or `apt-get remove <package...>`, while
   * others are extracted from the command output itself with ts-apt's custom defined keys [TsAptMetaKeys].
   *
   * Example records:
   * - `{"Description": "command line tool for transferring data with URL syntax"}`
   * - `{"Architecture": "amd64", "Version": "8.5.0-2ubuntu10.6"}`
   * - `{"tsapt-install-repositories": "Ubuntu:20.04/focal [security], Ubuntu:20.04/focal-updates"}` with runtime key [TsAptMetaKeys.installRepositories]
   * - `{"tsapt-remove-dependencies": "wajig:amd64 xfsprogs:amd64 ufw:amd64 ubuntu-pro-client-l10n:amd64"}` with runtime key [TsAptMetaKeys.removeDependencies]
   * - `{"tsapt-install-actions": "Inst Conf"}` with runtime key [TsAptMetaKeys.installActions]
   * - `{"tsapt-install-actions": "Conf"}` with runtime key [TsAptMetaKeys.installActions]
   */
  metadata?: MetadataRecord;
}

/**
 * Process execution settings for command runner implementations.
 */
export interface CommandOptions {
  /** Maximum process runtime in milliseconds before timeout. */
  timeoutMs?: number;
  /** Additional KEY=VALUE environment variables applied to the process. */
  env?: string[];
}

/**
 * Captured command output returned by command runners.
 */
export interface CommandResult {
  /** Full command line executed. */
  cmdLine: string;
  /** Standard output text captured from the process. */
  stdout: string;
  /** Standard error text captured from the process. */
  stderr: string;
  /** Process exit code. */
  exitCode: number;
}

/**
 * Abstraction over command execution used by package managers.
 */
export interface CommandRunner {
  /**
   * Executes a command and resolves with process output.
   *
   * @param command Executable name.
   * @param args Command-line arguments.
   * @param options Process execution options.
   */
  run(
    command: string,
    args?: string[],
    options?: CommandOptions,
  ): Promise<CommandResult>;
}

/**
 * Package manager contract implemented by APT and APT-fast managers.
 */
export interface PackageManager {
  /**
   * Installs one or more packages via `<mutating-binary> install --fix-broken <package...>`.
   *
   * Example output (parsed):
   * ```text
   * Setting up curl:amd64 (8.5.0-2ubuntu10.6) ...
   * Setting up ca-certificates (20240203) ...
   * ```
   *
   * @param pkgs Package names.
   * @param timeoutMs Command timeout in milliseconds, default is -1 for no timeout.
   * @returns List of installed packages.
   */
  install(
    pkgs: readonly PackageName[],
    timeoutMs?: number,
  ): Promise<PackageInfo[]>;

  /**
   * Removes one or more packages via `<mutating-binary> remove --fix-broken <package...>`.
   *
   * Example output (parsed):
   * ```text
   * Removing curl (8.5.0-2ubuntu10.6) ...
   * Removing libcurl4:amd64 (8.5.0-2ubuntu10.6) ...
   * ```
   *
   * @param pkgs Package names.
   * @param autoremoveEnabled Whether to also remove orphaned dependencies. Defaults to true.
   * @param timeoutMs Command timeout in milliseconds, default is -1 for no timeout.
   * @returns List of removed packages.
   */
  remove(
    pkgs: readonly PackageName[],
    autoremoveEnabled?: boolean,
    timeoutMs?: number,
  ): Promise<PackageInfo[]>;

  /**
   * Searches package repositories via `apt search <keywords...>`.
   *
   * Example output (parsed):
   * ```text
   * curl/jammy-updates,jammy-security 8.5.0-2ubuntu10.6 amd64
   *   command line tool for transferring data with URL syntax
   * ```
   *
   * @param keywords Search terms.
   * @param namesOnly Whether to return only package names.
   */
  search(keywords: string[], namesOnly?: boolean): Promise<PackageInfo[]>;

  /**
   * Lists files installed by a package via `dpkg-query -L <package>`.
   *
   * Example output:
   * ```text
   * /.
   * /usr
   * /usr/bin/curl
   * /usr/share/doc/curl/changelog.Debian.gz
   * ```
   *
   * @param pkg Package name.
   * @returns List of installed file paths for the package.
   */
  listInstalledFiles(pkg: PackageName): Promise<string[]>;

  /**
   * Lists installed packages via `dpkg-query -W -f '${binary:Package}=${Version}\\n'`.
   *
   * Example output (parsed):
   * ```text
   * curl=8.5.0-2ubuntu10.6
   * libc6=2.39-0ubuntu8.4
   * ```
   *
   * @returns List of installed packages.
   */
  listInstalled(): Promise<PackageInfo[]>;

  /**
   * Lists upgradable packages via `apt list --upgradable`.
   *
   * Example output (parsed):
   * ```text
   * curl/jammy-updates,jammy-security 8.5.0-2ubuntu10.6 amd64 [upgradable from: 8.5.0-2ubuntu10.5]
   * ```
   *
   * @returns List of upgradable packages.
   */
  listUpgradable(): Promise<PackageInfo[]>;

  /**
   * Upgrades selected packages or all packages when no names are provided.
   *
   * Commands executed:
   * - Specific packages: `<mutating-binary> install <package...>`
   * - All packages: `<mutating-binary> upgrade`
   *
   * Example output (parsed):
   * ```text
   * Setting up openssl (3.0.13-0ubuntu3.5) ...
   * Setting up libc6:amd64 (2.39-0ubuntu8.4) ...
   * ```
   *
   * @param timeoutMs Command timeout in milliseconds, default is -1 for no timeout.
   * @param pkgs Optional package names.
   */
  upgrade(
    pkgs?: readonly PackageName[],
    timeoutMs?: number,
  ): Promise<PackageInfo[]>;

  /**
   * Upgrades all packages via `<mutating-binary> upgrade`.
   *
   * Example output (parsed):
   * ```text
   * Setting up openssl (3.0.13-0ubuntu3.5) ...
   * Setting up libc6:amd64 (2.39-0ubuntu8.4) ...
   * ```
   *
   * @param timeoutMs Command timeout in milliseconds, default is -1 for no timeout.
   * @returns List of upgraded packages.
   */
  upgradeAll(timeoutMs?: number): Promise<PackageInfo[]>;

  /**
   * Updates package index metadata via `<mutating-binary> update`.
   *
   * Example output (parsed):
   * ```text
   * 12 packages can be upgraded. Run 'apt list --upgradable' to see them.
   * ```
   *
   * @param timeoutMs Command timeout in milliseconds, default is -1 for no timeout.
   * @returns Number of packages that can be upgraded.
   */
  update(timeoutMs?: number): Promise<number>;

  /**
   * Retrieves package metadata via `apt-cache --quiet=0 --no-all-versions show <package...>`.
   *
   * Example output (parsed):
   * ```text
   * Package: curl
   * Version: 8.5.0-2ubuntu10.6
   * Architecture: amd64
   * Description: command line tool for transferring data with URL syntax
   * ```
   *
   * @param pkgs Package names.
   */
  getPackageInfo(pkgs: readonly PackageName[]): Promise<PackageInfo[]>;

  /**
   * Cleans local apt cache data via `<mutating-binary> autoclean`.
   *
   * Example output:
   * ```text
   * Reading package lists... Done
   * Building dependency tree... Done
   * Del old downloaded archive files
   * ```
   *
   * @param timeoutMs Command timeout in milliseconds, default is -1 for no timeout.
   */
  autoClean(timeoutMs?: number): Promise<void>;

  /**
   * Removes orphaned dependencies via `<mutating-binary> autoremove`.
   *
   * Example output (parsed):
   * ```text
   * Removing libfoo1:amd64 (1.2.3-1ubuntu1) ...
   * Removing bar-data (0.9.0-2) ...
   * ```
   *
   * @param timeoutMs Command timeout in milliseconds, default is -1 for no timeout.
   * @returns List of removed packages.
   */
  autoRemove(timeoutMs?: number): Promise<PackageInfo[]>;
}
