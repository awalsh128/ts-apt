/**
 * Normalized package state used across APT and APT-fast operations.
 */
export type PackageStatus = "installed" | "upgradeable" | "available";

/**
 * Structured package metadata returned by manager operations.
 */
export interface PackageInfo {
  /** Package name as reported by the package manager. */
  name: string;
  /** Installed version when present. */
  version: string;
  /** Current normalized package status. */
  status?: PackageStatus;
  /** Package architecture, for example amd64 or arm64 if specified. */
  arch?: string;
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
  /** Installs one or more packages. */
  install(pkgs: string[]): Promise<PackageInfo[]>;

  /** Removes one or more packages. */
  remove(pkgs: string[]): Promise<PackageInfo[]>;

  /** Searches package repositories by one or more keywords and returns name-description pairs. */
  search(keywords: string[]): Promise<PackageInfo[]>;

  /** Lists files installed by a package. */
  listInstalledFiles(pkg: string): Promise<string[]>;

  /** Lists currently installed packages. */
  listInstalled(): Promise<PackageInfo[]>;

  /** Lists upgradable packages. */
  listUpgradable(): Promise<PackageInfo[]>;

  /** Upgrades all packages or a selected package set. */
  upgrade(pkgs: string[]): Promise<PackageInfo[]>;

  /** Upgrades all packages managed by this package manager. */
  upgradeAll(): Promise<PackageInfo[]>;

  /** Refreshes repository indexes and returns number of packages that can be upgraded. */
  update(): Promise<number>;

  /** Returns metadata for one or more packages. */
  getPackageInfo(pkgs: string[]): Promise<PackageInfo[]>;

  /** Cleans local package cache data. */
  autoClean(): Promise<void>;

  /** Removes unused dependency packages. */
  autoRemove(): Promise<PackageInfo[]>;
}
