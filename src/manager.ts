import { Mutex } from "async-mutex";
import { DefaultCommandRunner } from "./commandRunner.js";
import type {
  CommandResult,
  CommandRunner,
  PackageInfo,
  PackageManager,
  PackageName,
} from "./types.js";
import { AptOutputParser } from "./parser.js";
import { validatePackageName } from "./package.js";
import winston from "winston";
import path from "path/win32";

/** Environment overrides for non-interactive APT commands. */
export const APT_ENV = [
  "DEBIAN_FRONTEND=noninteractive",
  "DEBCONF_NONINTERACTIVE_SEEN=true",
] as const;

/** Common APT flags used across operations. */
export const APT_FLAGS = {
  assumeYes: "-y",
  fixBroken: "-f",
  autoRemove: "--autoremove",
} as const;

/** Operation-specific timeout values in milliseconds. */
export const TIMEOUTS = {
  install: 10 * 60_000,
  remove: 10 * 60_000,
  refresh: 5 * 60_000,
  search: 3 * 60_000,
  listInstalledFiles: 60_000,
  listInstalled: 3 * 60_000,
  listUpgradable: 3 * 60_000,
  upgrade: 15 * 60_000,
  clean: 5 * 60_000,
  getPackageInfo: 30_000,
  autoRemove: 10 * 60_000,
  availability: 5_000,
  dpkgStatus: 30_000,
} as const;

/** Lock TTL in milliseconds derived from the longest manager operation timeout. */
const GLOBAL_APT_LOCK_TTL_MS = Math.max(...Object.values(TIMEOUTS));

/** Max time in seconds to wait for the global lock before failing the command. */
export const GLOBAL_APT_LOCK_WAIT_SECONDS = String(
  Math.ceil(GLOBAL_APT_LOCK_TTL_MS / 1000),
);

export type BinaryName =
  | "apt"
  | "apt-cache"
  | "apt-fast"
  | "apt-get"
  | "dpkg-query";

interface BinaryMeta {
  name: BinaryName;
  path: string;
  defaultArgs: string[];
}

export const Binary = {
  Apt: {
    name: "apt",
    path: "/usr/bin/apt",
    defaultArgs: ["--quiet=0"],
  },
  AptCache: {
    name: "apt-cache",
    path: "/usr/bin/apt-cache",
    defaultArgs: ["--quiet=0", "--no-all-versions"],
  },
  AptFast: {
    name: "apt-fast",
    path: path.posix.join(__dirname, "..", "scripts", "apt-fast.sh"),
    defaultArgs: ["--quiet=0", APT_FLAGS.assumeYes],
  },
  AptGet: {
    name: "apt-get",
    path: "/usr/bin/apt-get",
    defaultArgs: ["--quiet=0", APT_FLAGS.assumeYes],
  },
  DpkgQuery: {
    name: "dpkg-query",
    path: "/usr/bin/dpkg-query",
    defaultArgs: [],
  },
} as const satisfies Record<string, BinaryMeta>;

/** APT operations require serialization since globally shared files like lock files are used. */
const globalRunLock = new Mutex();

/** Global cross-process lock file used to serialize APT operations across processes. */
const GLOBAL_APT_LOCK_FILE = "/tmp/ts-apt-manager.lock";

/**
 * APT-backed package manager implementation.
 *
 * IMPORTANT: All operations are serialized to avoid concurrent access to APT lock files.
 * This is achieved via a global mutex and flock-based locking for real command execution.
 */
export class AptPackageManager implements PackageManager {
  /** Whether to enable apt-fast for optimized package installation and upgrades. */
  protected readonly aptFastEnabled: boolean;
  /** Process runner used for all command execution. */
  protected readonly runner: CommandRunner;
  /** Output parser instance for interpreting command results. */
  protected readonly parser: AptOutputParser;
  /** Logger instance for application level logging. */
  protected readonly logger: winston.Logger;
  /** Binary used for mutating operations (install, remove, upgrade, update). */
  protected readonly mutatingBinary: BinaryMeta;
  /** Binary used for read-only apt operations (search, list). */
  protected readonly readBinary: BinaryMeta;
  /** Binary used for package metadata queries (show). */
  protected readonly cacheBinary: BinaryMeta;

  constructor(
    aptFastEnabled: boolean,
    runner: CommandRunner,
    parser: AptOutputParser,
    logger: winston.Logger,
  ) {
    this.runner = runner;
    this.parser = parser;
    this.logger = logger;
    this.aptFastEnabled = aptFastEnabled;
    this.mutatingBinary = aptFastEnabled ? Binary.AptFast : Binary.AptGet;
    this.readBinary = aptFastEnabled ? Binary.AptFast : Binary.Apt;
    this.cacheBinary = aptFastEnabled ? Binary.AptFast : Binary.AptCache;
    this.logger.info(`Using ${this.mutatingBinary.name} as package manager`);
  }

  /**
   * Returns the path to the currently used APT binary.
   *
   * This is either apt-fast or apt* depending on availability and configuration.
   *
   * @returns Path to the APT binary.
   */
  get aptPath(): string {
    return this.mutatingBinary.path;
  }

  /**
   * Cleans local apt cache data via `<mutating-binary> autoclean`.
   *
   * Example output:
   * ```text
   * Reading package lists... Done
   * Building dependency tree... Done
   * Del old downloaded archive files
   * ```
   */
  async autoClean(): Promise<void> {
    await this.runLockingAptCommand(
      this.mutatingBinary,
      ["autoclean"],
      TIMEOUTS.clean,
    );
  }

  /**
   * Removes orphaned dependencies via `<mutating-binary> autoremove`.
   *
   * Example output (parsed):
   * ```text
   * Removing libfoo1:amd64 (1.2.3-1ubuntu1) ...
   * Removing bar-data (0.9.0-2) ...
   * ```
   */
  async autoRemove(): Promise<PackageInfo[]> {
    const out = await this.runLockingAptCommand(
      this.mutatingBinary,
      ["autoremove"],
      TIMEOUTS.autoRemove,
    );
    return this.parser.parseRemoveOutput(out);
  }

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
   */
  async install(pkgs: PackageName[]): Promise<PackageInfo[]> {
    pkgs.forEach((pkg) => validatePackageName(pkg.serialize()));
    const result = await this.runLockingAptCommand(
      this.mutatingBinary,
      ["install", APT_FLAGS.fixBroken, ...pkgs.map((pkg) => pkg.serialize())],
      TIMEOUTS.install,
    );
    return this.parser.parseInstallOutput(result);
  }

  /**
   * Lists installed packages via `dpkg-query -W -f '${binary:Package}=${Version}\\n'`.
   *
   * Example output (parsed):
   * ```text
   * curl=8.5.0-2ubuntu10.6
   * libc6=2.39-0ubuntu8.4
   * ```
   */
  async listInstalled(): Promise<PackageInfo[]> {
    const result = await this.runLocklessAptCommand(
      Binary.DpkgQuery,
      ["-W", "-f", "${binary:Package}=${Version}\\n"],
      TIMEOUTS.listInstalled,
    );
    return this.parser.parseListInstalledOutput(result);
  }

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
   */
  async listInstalledFiles(pkg: PackageName): Promise<string[]> {
    validatePackageName(pkg.serialize());
    const result = await this.runLocklessAptCommand(
      Binary.DpkgQuery,
      ["-L", pkg.serialize()],
      TIMEOUTS.listInstalledFiles,
    );

    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /**
   * Lists upgradable packages via `apt list --upgradable`.
   *
   * Example output (parsed):
   * ```text
   * curl/jammy-updates,jammy-security 8.5.0-2ubuntu10.6 amd64 [upgradable from: 8.5.0-2ubuntu10.5]
   * ```
   */
  async listUpgradable(): Promise<PackageInfo[]> {
    const result = await this.runLocklessAptCommand(
      this.readBinary,
      ["list", "--upgradable"],
      TIMEOUTS.listUpgradable,
    );
    return this.parser.parseListUpgradableOutput(result);
  }

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
   */
  async remove(
    pkgs: PackageName[],
    autoremoveEnabled: boolean = true,
  ): Promise<PackageInfo[]> {
    pkgs.forEach((pkg) => validatePackageName(pkg.serialize()));
    const args = [
      "remove",
      APT_FLAGS.fixBroken,
      ...pkgs.map((pkg) => pkg.serialize()),
    ];
    if (autoremoveEnabled) {
      args.push(APT_FLAGS.autoRemove);
    }
    const result = await this.runLockingAptCommand(
      this.mutatingBinary,
      args,
      TIMEOUTS.remove,
    );
    return this.parser.parseRemoveOutput(result);
  }

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
  async search(
    keywords: string[],
    namesOnly: boolean = false,
  ): Promise<PackageInfo[]> {
    const baseArgs = namesOnly
      ? ["search", ...keywords, "--names-only"]
      : ["search", ...keywords];
    const result = await this.runLocklessAptCommand(
      this.readBinary,
      baseArgs,
      TIMEOUTS.search,
    );

    return this.parser.parseSearchOutput(result);
  }

  /**
   * Updates package index metadata via `<mutating-binary> update`.
   *
   * Example output (parsed):
   * ```text
   * 12 packages can be upgraded. Run 'apt list --upgradable' to see them.
   * ```
   */
  async update(): Promise<number> {
    return this.runLockingAptCommand(
      this.mutatingBinary,
      ["update"],
      TIMEOUTS.refresh,
    ).then((result) => {
      return this.parser.parseUpdateOutput(result);
    });
  }

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
   * @param pkgs Optional package names.
   */
  async upgrade(pkgs: PackageName[] = []): Promise<PackageInfo[]> {
    if (pkgs.length > 0) {
      pkgs.forEach((pkg) => validatePackageName(pkg.serialize()));
    } else {
      this.logger.info(
        "Upgrading all packages since no specific package names were provided",
      );
    }
    const args =
      pkgs.length > 0
        ? ["install", ...pkgs.map((pkg) => pkg.serialize())]
        : ["upgrade"];
    const out = await this.runLockingAptCommand(
      this.mutatingBinary,
      args,
      TIMEOUTS.upgrade,
    );
    return this.parser.parseInstallOutput(out);
  }

  /**
   * Upgrades all packages via `<mutating-binary> upgrade`.
   *
   * Example output (parsed):
   * ```text
   * Setting up openssl (3.0.13-0ubuntu3.5) ...
   * Setting up libc6:amd64 (2.39-0ubuntu8.4) ...
   * ```
   */
  async upgradeAll(): Promise<PackageInfo[]> {
    return await this.upgrade([]);
  }

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
  async getPackageInfo(pkgs: PackageName[]): Promise<PackageInfo[]> {
    pkgs.forEach((pkg) => validatePackageName(pkg.serialize()));
    const result = await this.runLocklessAptCommand(
      this.cacheBinary,
      ["show", ...pkgs.map((pkg) => pkg.serialize())],
      TIMEOUTS.getPackageInfo,
    );
    return this.parser.parseCacheShowOutput(result);
  }

  /**
   * Executes a lock free apt command with fixed non-interactive behavior.
   *
   * NOTE: Lock not required since this is a read-only operation and does not mutate any global state.
   *
   * Effective invocation:
   * `binary.path ...binary.defaultArgs ...baseArgs`
   *
   * Example composed command:
   * ```text
   * /usr/bin/apt-get --quiet=0 --force-yes show curl
   * ```
   *
   * @param binary Binary metadata (path plus default args).
   * @param baseArgs Command arguments before fixed flag expansion.
   * @param timeoutMs Command timeout in milliseconds.
   * @returns Command result with captured process output.
   */
  private async runLocklessAptCommand(
    binary: BinaryMeta,
    baseArgs: string[],
    timeoutMs: number,
  ): Promise<CommandResult> {
    return await this.runner.run(
      binary.path,
      [...binary.defaultArgs, ...baseArgs],
      {
        timeoutMs,
        env: [...APT_ENV],
      },
    );
  }

  /**
   * Executes a globally locked apt command with fixed non-interactive behavior.
   *
   * NOTE: Ensures that only one apt command is executed at a time across all processes via a
   * global lock, otherwise apt will fail with a lock acquisition error.
   *
   * Effective invocation:
   * `binary.path ...binary.defaultArgs ...baseArgs`
   *
   * Example composed command:
   * ```text
   * /usr/bin/apt-get --quiet=0 --force-yes install --fix-broken curl
   * ```
   *
   * @param binary Binary metadata (path plus default args).
   * @param baseArgs Command arguments before fixed flag expansion.
   * @param timeoutMs Command timeout in milliseconds.
   * @returns Command result with captured process output.
   */
  private async runLockingAptCommand(
    binary: BinaryMeta,
    baseArgs: string[],
    timeoutMs: number,
  ): Promise<CommandResult> {
    // Even though flock is holding the global lock, using an in process mutex is much faster than
    // spawning multiple processes for flock and waiting for lock acquisition.
    return await globalRunLock.runExclusive(async () => {
      const args = [...binary.defaultArgs, ...baseArgs];

      // Apply an OS-level lock for real command execution so concurrent processes
      // do not race on apt/apt-fast global lock files.
      const [command, commandArgs] =
        this.runner instanceof DefaultCommandRunner
          ? [
              "flock",
              [
                "-w",
                GLOBAL_APT_LOCK_WAIT_SECONDS,
                GLOBAL_APT_LOCK_FILE,
                binary.path,
                ...args,
              ],
            ]
          : [binary.path, args];

      const result = await this.runner.run(command, commandArgs, {
        timeoutMs,
        env: [...APT_ENV],
      });

      return result;
    });
  }
}

/**
 * Checks whether apt-fast can be used by verifying the aria2 dependency.
 *
 * Command executed:
 * `dpkg-query -W aria2`
 *
 * Example output:
 * ```text
 * desired=Unknown/Install/Remove/Purge/Hold
 * | Status=Not/Inst/Conf-files/Unpacked/half-conf/Half-inst/trig-aWait/Trig-pend
 * |/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)
 * ||/ Name   Version      Architecture Description
 * ii  aria2  1.36.0-1     amd64        High speed download utility
 * ```
 */
async function isAptFastAvailable(
  runner: CommandRunner,
  logger: winston.Logger,
): Promise<boolean> {
  const result = await runner.run("dpkg-query", ["-W", "aria2"], {
    env: [...APT_ENV],
  });
  if (result.exitCode === 0) {
    return true;
  }
  logger.warn(
    `apt-fast is unavailable since dependency aria2 is not installed. Using apt-get instead`,
  );
  return false;
}

/**
 * Creates a package manager instance.
 *
 * Commands executed during setup:
 * - Always: no external command (logger and runner are initialized in-process).
 * - When `enableAptFast` is true: `dpkg-query -W aria2` to verify apt-fast prerequisites.
 *
 * Example output parsed during apt-fast check:
 * ```text
 * ii  aria2  1.36.0-1 amd64 High speed download utility
 * ```
 *
 * @param enableAptFast Whether to enable APT-fast which is a wrapper for apt to speed up package downloads.
 * @param appLogger Logger instance for application logs.
 * @param commandExecLogger Logger instance for capturing APT commands execution.
 * @returns A configured PackageManager instance.
 */
export async function createPackageManager(
  enableAptFast: boolean,
  appLogger?: winston.Logger,
  commandExecLogger?: winston.Logger,
): Promise<PackageManager> {
  if (!appLogger) {
    appLogger = winston.createLogger({
      level: "info",
      format: winston.format.simple(),
      transports: [new winston.transports.Console()],
    });
  }
  if (!commandExecLogger) {
    commandExecLogger = winston.createLogger({
      level: "debug",
      format: winston.format.printf(({ message }) => {
        return String(message);
      }),
      transports: [new winston.transports.Console()],
    });
  }

  const runner = new DefaultCommandRunner(appLogger, commandExecLogger);

  return new AptPackageManager(
    enableAptFast && (await isAptFastAvailable(runner, appLogger)),
    runner,
    new AptOutputParser(appLogger),
    appLogger,
  );
}
