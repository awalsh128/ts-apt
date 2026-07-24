/**
 * Normalized package state used across APT and APT-fast operations.
 */
export type PackageStatus = "installed" | "upgradeable" | "available";

/** Internal use only. Brand the type to prevent external implementation. */
export const PackageNameBrand = Symbol("PackageNameBrand");

/** Package name that optionally supports version and release codename. */
export interface PackageName {
  /** Required name. */
  name: string;
  /** Optional version of package. */
  version?: string;
  /** Optional architecture of the package (e.g. amd64, arm64). */
  arch?: string;

  /** Internal use only, prevents invalid PackageName construction. */
  readonly [PackageNameBrand]: true;

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

  /** Custom JSON stringification to omit branding field. */
  toJSON(): { name: string; version?: string; arch?: string };
}

/**
 * Factory function type signature to create valid PackageName objects.
 * This is enforced with string format checks.
 */
export type CreatePackageNameFn = (
  name: string,
  version?: string,
  arch?: string,
) => PackageName;

/**
 * Deserialization function type signature to create valid PackageName objects.
 * This is enforced with schema and value format checks.
 */
export type DeserializePackageNameFn = (serialized: string) => PackageName;

/**
 * Deserialization function type signature to create valid PackageName objects from JSON.
 * This is enforced with schema and value format checks.
 */
export type PackageNameFromJSONFn = (json: unknown) => PackageName;

/**
 * Structured package metadata returned by manager operations.
 */
export interface PackageInfo {
  /** Package name as reported by the package manager. */
  name: PackageName;
  /** Current normalized package status. */
  status?: PackageStatus;
  /** Operation specific metadata if available. */
  metadata?: Map<string, string>;
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
