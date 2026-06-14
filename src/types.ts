/**
 * Normalized package state used across APT and APT-fast operations.
 */
export type PackageStatus =
  | "installed"
  | "upgradable"
  | "available"
  | "unknown"
  | "config-files";

/**
 * Structured package metadata returned by manager operations.
 */
export interface PackageInfo {
  /** Package name as reported by the package manager. */
  name: string;
  /** Installed version when present. */
  version: string;
  /** Candidate or newly applied version depending on operation type. */
  newVersion: string;
  /** Current normalized package status. */
  status: PackageStatus;
  /** Distribution component or package section. */
  category: string;
  /** Package architecture, for example amd64 or arm64. */
  arch: string;
  /** Source manager identifier, for example apt or apt-fast. */
  packageManager: string;
  /** Optional manager-specific metadata map. */
  additionalData?: Record<string, string>;
}

/**
 * Runtime behavior options applied to package operations.
 */
export interface PackageManagerOptions {
  /** Enables interactive command execution with inherited stdio. */
  interactive?: boolean;
  /** Simulates operations without applying package changes. */
  dryRun?: boolean;
  /** Enables verbose parsing and command output logging. */
  verbose?: boolean;
  /** Forces non-interactive yes behavior where supported. */
  assumeYes?: boolean;
  /** Enables additional diagnostic behavior in selected code paths. */
  debug?: boolean;
  /** Appends extra command arguments to underlying package operations. */
  customCommandArgs?: string[];
}

/**
 * Process execution settings for command runner implementations.
 */
export interface CommandOptions {
  /** Maximum process runtime in milliseconds before timeout. */
  timeoutMs?: number;
  /** Additional KEY=VALUE environment variables applied to the process. */
  env?: string[];
  /** Enables inherited stdio for interactive command execution. */
  interactive?: boolean;
}

/**
 * Captured command output returned by command runners.
 */
export interface CommandResult {
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
  /** Checks whether the manager is available in the current runtime environment. */
  isAvailable(): Promise<boolean>;
  /** Returns the manager identifier, for example apt or apt-fast. */
  getPackageManager(): string;
  /** Installs one or more packages. */
  install(pkgs: string[], opts?: PackageManagerOptions): Promise<PackageInfo[]>;
  /** Removes one or more packages. */
  remove(pkgs: string[], opts?: PackageManagerOptions): Promise<PackageInfo[]>;
  /** Searches package repositories by one or more keywords. */
  find(
    keywords: string[],
    opts?: PackageManagerOptions,
  ): Promise<PackageInfo[]>;
  /** Lists files installed by a package. */
  listInstalledFiles(pkg: string): Promise<string[]>;
  /** Lists currently installed packages. */
  listInstalled(opts?: PackageManagerOptions): Promise<PackageInfo[]>;
  /** Lists upgradable packages. */
  listUpgradable(opts?: PackageManagerOptions): Promise<PackageInfo[]>;
  /** Upgrades all packages or a selected package set. */
  upgrade(
    pkgs?: string[],
    opts?: PackageManagerOptions,
  ): Promise<PackageInfo[]>;
  /** Upgrades all packages managed by this package manager. */
  upgradeAll(opts?: PackageManagerOptions): Promise<PackageInfo[]>;
  /** Refreshes repository indexes. */
  refresh(opts?: PackageManagerOptions): Promise<void>;
  /** Returns metadata for a single package. */
  getPackageInfo(
    pkg: string,
    opts?: PackageManagerOptions,
  ): Promise<PackageInfo>;
  /** Cleans local package cache data. */
  clean(opts?: PackageManagerOptions): Promise<void>;
  /** Removes unused dependency packages. */
  autoRemove(opts?: PackageManagerOptions): Promise<PackageInfo[]>;
}

/**
 * Factory-level options used when creating package manager instances.
 */
export interface CreateManagerOptions {
  /** Preferred manager to instantiate. */
  preferred?: "apt" | "apt-fast";
  /** Allows fallback from apt-fast to apt when apt-fast is unavailable. */
  aptFastFallbackToApt?: boolean;
  /** Optional runner implementation used for command execution. */
  runner?: CommandRunner;
}
