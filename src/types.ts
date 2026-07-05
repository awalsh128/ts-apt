/**
 * Normalized package state used across APT and APT-fast operations.
 */
export type PackageStatus =
  | "broken"
  | "installed"
  | "upgradeable"
  | "available";

/** Package name that differentiates versioned and unversioned. */
export interface PackageName {
  /** Required name. */
  name: string;
  /** Optional version of package. */
  version?: string;
  /** Optional distribution of package. */
  distro?: string;

  /** Serializes the package name and version into an APT string representation. */
  serialize(): string;
}

/**
 * Structured package metadata returned by manager operations.
 */
export interface PackageInfo {
  /** Package name as reported by the package manager. */
  name: string;
  /**
   * Installed version when present.
   *
   * NOTE: If package is broken, this field will be empty and the status will be "broken".
   */
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
  /** Command executed. */
  command: string;
  /** Command-line arguments to command. */
  args: string[];
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

/** Zero exit code but contains APT notice, warning and error lines. */
export type MixedSuccessResult<T> = {
  /** Items that were successfully processed. */
  success: T;
  /** Items that failed to process and output to stderr. */
  stderr: string;
};

/**
 * Package manager contract implemented by APT and APT-fast managers.
 */
export interface PackageManager {
  /** Installs one or more packages. */
  install(pkgs: PackageName[]): Promise<MixedSuccessResult<PackageInfo[]>>;

  /** Removes one or more packages. */
  remove(pkgs: PackageName[]): Promise<PackageInfo[]>;

  /** Searches package repositories by one or more keywords and returns name-description pairs. */
  search(keywords: string[]): Promise<{ name: string; description: string }[]>;

  /** Lists files installed by a package. */
  listInstalledFiles(pkg: PackageName): Promise<string[]>;

  /** Lists currently installed packages. */
  listInstalled(): Promise<PackageInfo[]>;

  /** Lists upgradable packages. */
  listUpgradable(): Promise<MixedSuccessResult<PackageInfo[]>>;

  /** Returns metadata for one or more packages. */
  show(pkgs: PackageName[]): Promise<MixedSuccessResult<PackageInfo[]>>;

  /** Upgrades all packages or a selected package set. */
  upgrade(pkgs: PackageName[]): Promise<MixedSuccessResult<PackageInfo[]>>;

  /** Upgrades all packages managed by this package manager. */
  upgradeAll(): Promise<MixedSuccessResult<PackageInfo[]>>;

  /** Refreshes repository indexes and returns number of packages that can be upgraded. */
  update(): Promise<MixedSuccessResult<number>>;

  /** Cleans local package cache data. */
  autoClean(): Promise<void>;

  /** Removes unused dependency packages. */
  autoRemove(): Promise<PackageInfo[]>;
}
