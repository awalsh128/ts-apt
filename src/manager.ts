import { Mutex } from "async-mutex";
import { DefaultCommandRunner } from "./commandRunner.js";
import type {
  CommandResult,
  CommandRunner,
  MixedSuccessResult,
  PackageInfo,
  PackageManager,
  PackageName,
} from "./types.js";
import fsSync from "node:fs";
import { AvailabilityError } from "./errors.js";
import { AptOutputParser } from "./parser.js";
import { validatePackageName } from "./package.js";
import winston from "winston";
import path from "node:path";

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
  quiet: "--quiet=0",
} as const;

/** Only supported APT-related binaries that are lock safe via command argument
 * 'DPkg::Lock::Timeout "<timeout seconds>".
 */
export type BinaryName =
  | "apt"
  | "apt-cache"
  | "apt-fast"
  | "apt-get"
  | "dpkg-query";

export interface BinaryMeta {
  name: BinaryName;
  path: string;
  defaultArgs: string[];
  lockOperations: Set<string>;
}

/** Per-binary metadata for APT-related commands.
 *
 * NOTE: Other binaries are not supported since they are not CLI output script friendly or do not support lock
 * timeout arguments for mutating operations.
 */
export const Binary = {
  AptCache: {
    name: "apt-cache",
    path: "/usr/bin/apt-cache",
    defaultArgs: [APT_FLAGS.quiet],
    lockOperations: new Set(),
  },
  AptGet: {
    name: "apt-get",
    path: "/usr/bin/apt-get",
    defaultArgs: [APT_FLAGS.quiet, APT_FLAGS.assumeYes],
    lockOperations: new Set([
      "install",
      "remove",
      "purge",
      "upgrade",
      "dist-upgrade",
      "full-upgrade",
      "autoremove",
    ]),
  },
  DpkgQuery: {
    name: "dpkg-query",
    path: "/usr/bin/dpkg-query",
    defaultArgs: [],
    lockOperations: new Set(),
  },
} as const satisfies Record<string, BinaryMeta>;

/**
 * APT-backed package manager implementation.
 */
export class AptPackageManager implements PackageManager {
  /** Whether to enable apt-fast for optimized package installation and upgrades. */
  protected readonly aptFastEnabled: boolean;
  /** Process runner used for all command execution. */
  protected readonly runner: CommandRunner;
  /** Output parser instance for interpreting command results. */
  protected readonly parser: AptOutputParser;
  /** Logger instance for application level logging. */
  protected readonly logger?: winston.Logger;
  /** Binary used for apt-get operations */
  protected readonly aptFastOrGet: BinaryMeta;
  /** Timeout for acquiring the APT lock in seconds. */
  protected readonly aptLockTimeoutSeconds: number;
  /**
   * APT timeout arguments for acquiring the APT lock in seconds.
   *
   * If set to -1, the default APT lock timeout is used found in /etc/apt/apt.conf.d/*.
   * If set to 0, the command will fail immediately if the lock cannot be acquired.
   *
   * NOTE: This is only required for operations that hold the APT lock (e.g., install, remove, upgrade).
   */
  protected readonly aptLockTimeoutArgs: string[];

  constructor(
    aptFastEnabled: boolean,
    runner: CommandRunner,
    parser: AptOutputParser,
    aptLockTimeoutSeconds: number = -1,
    logger?: winston.Logger,
  ) {
    this.aptFastEnabled = aptFastEnabled;
    this.runner = runner;
    this.parser = parser;
    this.logger = logger;
    this.aptFastOrGet = aptFastEnabled
      ? {
          ...Binary.AptGet,
          name: "apt-fast",
          path: path.posix.join(__dirname, "..", "scripts", "apt-fast.sh"),
        }
      : Binary.AptGet;

    this.aptLockTimeoutSeconds = aptLockTimeoutSeconds;
    if (aptLockTimeoutSeconds > 0 || aptLockTimeoutSeconds === -1) {
      this.aptLockTimeoutArgs = [
        `-o`,
        `DPkg::Lock::Timeout=${aptLockTimeoutSeconds}`,
      ];
    } else {
      this.aptLockTimeoutArgs = [];
    }

    this.logger?.info(
      `Using ${this.aptFastOrGet.name} as package manager for apt-get locking operations`,
    );
  }

  /**
   * Cleans local apt cache data via `apt-[get,fast] autoclean`.
   *
   * Example output:
   * ```text
   * Reading package lists... Done
   * Building dependency tree... Done
   * Del old downloaded archive files
   * ```
   */
  async autoClean(): Promise<void> {
    await this.runAptBinary(this.aptFastOrGet, [
      ...this.aptLockTimeoutArgs,
      "autoclean",
    ]);
  }

  /**
   * Removes orphaned dependencies via `apt-[get,fast] autoremove`.
   *
   * Example output (parsed):
   * ```text
   * Removing libfoo1:amd64 (1.2.3-1ubuntu1) ...
   * Removing bar-data (0.9.0-2) ...
   * ```
   */
  async autoRemove(): Promise<PackageInfo[]> {
    const out = await this.runAptBinary(this.aptFastOrGet, [
      ...this.aptLockTimeoutArgs,
      "autoremove",
    ]);
    return this.parser.parseRemoveOutput(out);
  }

  /**
   * Installs one or more packages via `apt-[get,fast] install --fix-broken <package...>`.
   *
   * Example output (parsed):
   * ```text
   * Setting up curl:amd64 (8.5.0-2ubuntu10.6) ...
   * Setting up ca-certificates (20240203) ...
   * ```
   *
   * @param pkgs Package names.
   */
  async install(
    pkgs: PackageName[],
  ): Promise<MixedSuccessResult<PackageInfo[]>> {
    pkgs.forEach((pkg) => validatePackageName(pkg.serialize()));
    const result = await this.runAptBinary(this.aptFastOrGet, [
      ...this.aptLockTimeoutArgs,
      "install",
      APT_FLAGS.fixBroken,
      ...pkgs.map((pkg) => pkg.serialize()),
    ]);
    return {
      success: this.parser.parseInstallOutput(result),
      stderr: result.stderr,
    };
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
    const result = await this.runAptBinary(Binary.DpkgQuery, [
      "-W",
      "-f",
      "${binary:Package}=${Version}\\n",
    ]);
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
    const result = await this.runAptBinary(Binary.DpkgQuery, [
      "-L",
      pkg.serialize(),
    ]);

    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /**
   * Lists upgradable packages via `apt-get -o "APT::Get::Show-User-Simulation-Note=false" -V --simulate dist-upgrade`.
   *
   * NOTE: This is used instead of `apt list --upgradable` because the simulation output has
   * a more stable machine-parseable `Inst ...` line format.
   *
   * Fixture examples:
   * - `test/data/listupgradable_found.log`
   * - `test/data/listupgradable_notfound.log`
   *
   * Example line parsed:
   * ```text
   * Inst firefox-locale-en [75.0+build3-0ubuntu1] (136.0+build3-0ubuntu0.20.04.1 Ubuntu:20.04/focal-updates, Ubuntu:20.04/focal-security [amd64])
   * ```
   */
  async listUpgradable(): Promise<MixedSuccessResult<PackageInfo[]>> {
    const result = await this.runAptBinary(Binary.AptGet, [
      "-o",
      // Reduce noise by not emitting the "User simulation" note.
      "APT::Get::Show-User-Simulation-Note=false",
      // Verbose to not truncate the line output.
      "-V",
      "--simulate",
      "dist-upgrade",
    ]);
    return {
      success: this.parser.parseSimulateDistUpgrade(result),
      stderr: result.stderr,
    };
  }

  /**
   * Removes one or more packages via `apt-[get,fast] remove --fix-broken <package...>`.
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
      ...this.aptLockTimeoutArgs,
      "remove",
      APT_FLAGS.fixBroken,
      ...pkgs.map((pkg) => pkg.serialize()),
    ];
    if (autoremoveEnabled) {
      args.push(APT_FLAGS.autoRemove);
    }
    const result = await this.runAptBinary(this.aptFastOrGet, args);
    return this.parser.parseRemoveOutput(result);
  }

  /**
   * Searches package repositories and returns normalized `{ name, description }` entries.
   *
   * Fixture examples:
   * - `test/data/search_multiplefound.log`
   * - `test/data/search_singlefound.log`
   *
   * Example line parsed:
   * ```text
   * firefox - Safe and easy web browser from Mozilla
   * ```
   *
   * @param keywords Search terms.
   */
  async search(
    keywords: string[],
  ): Promise<{ name: string; description: string }[]> {
    const result = await this.runner.run(
      Binary.AptCache.path,
      [APT_FLAGS.quiet, "search", ...keywords],
      {
        env: [...APT_ENV],
      },
    );

    return this.parser.parseSearchOutput(result);
  }

  /**
   * Returns the command line prefixes to wait execution on any lock file.
   *
   * NOTE: This is a fallback mechanism. The much faster APT locking should be used when at all possible.
   *
   * Flock is a command for observing file locks and waiting for them to be released (typically system call
   * fcntl()). More information at https://linux.die.net/man/1/flock
   */
  private getFlockCommandLine(lockFilepath: string): {
    command: string;
    args: string[];
  } {
    const flockArgs =
      this.aptLockTimeoutSeconds >= 0
        ? [`-w`, `${this.aptLockTimeoutSeconds}`]
        : [];
    return {
      command: "flock",
      args: [...flockArgs, lockFilepath],
    };
  }

  /**
   * Updates package index metadata via `apt-[get,fast] update` and returns the number of candidates.
   *
   * NOTE: This operation does not have APT native locking, so it uses a fallback mechanism with `flock`.
   *
   * Example output (parsed):
   * ```text
   * 12 packages can be upgraded. Run 'apt list --upgradable' to see them.
   * ```
   */
  async update(): Promise<MixedSuccessResult<number>> {
    const { command, args } = this.getFlockCommandLine(
      "/var/lib/apt/lists/lock",
    );
    const binary = Binary.AptGet;
    return this.runner
      .run(command, [...args, binary.path, "update"], {
        env: [...APT_ENV],
      })
      .then((result) => {
        return this.parser.parseUpdateOutput(result);
      });
  }

  /**
   * Upgrades selected packages or all packages when no names are provided.
   *
   * Commands executed:
   * - Specific packages: `apt-[get,fast] install <package...>`
   * - All packages: `apt-[get,fast] upgrade`
   *
   * Example output (parsed):
   * ```text
   * Setting up openssl (3.0.13-0ubuntu3.5) ...
   * Setting up libc6:amd64 (2.39-0ubuntu8.4) ...
   * ```
   *
   * @param pkgs Optional package names.
   */
  async upgrade(
    pkgs: PackageName[] = [],
  ): Promise<MixedSuccessResult<PackageInfo[]>> {
    if (pkgs.length > 0) {
      pkgs.forEach((pkg) => validatePackageName(pkg.serialize()));
    } else {
      this.logger?.info(
        "Upgrading all packages since no specific package names were provided",
      );
    }
    const args =
      pkgs.length > 0
        ? [
            ...this.aptLockTimeoutArgs,
            "install",
            ...pkgs.map((pkg) => pkg.serialize()),
          ]
        : [...this.aptLockTimeoutArgs, "upgrade"];
    const out = await this.runAptBinary(this.aptFastOrGet, args);
    return {
      success: this.parser.parseInstallOutput(out),
      stderr: out.stderr,
    };
  }

  /**
   * Upgrades all packages via `apt-[get,fast] upgrade`.
   *
   * Example output (parsed):
   * ```text
   * Setting up openssl (3.0.13-0ubuntu3.5) ...
   * Setting up libc6:amd64 (2.39-0ubuntu8.4) ...
   * ```
   */
  async upgradeAll(): Promise<MixedSuccessResult<PackageInfo[]>> {
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
  async show(pkgs: PackageName[]): Promise<MixedSuccessResult<PackageInfo[]>> {
    pkgs.forEach((pkg) => validatePackageName(pkg.serialize()));
    const result = await this.runAptBinary(Binary.AptCache, [
      "--no-all-versions",
      "show",
      ...pkgs.map((pkg) => pkg.serialize()),
    ]);
    return {
      success: this.parser.parseCacheShowOutput(result),
      stderr: result.stderr,
    };
  }

  /**
   * Runs the binary command in a simplified signature.
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
  private async runAptBinary(
    binary: BinaryMeta,
    baseArgs: string[],
  ): Promise<CommandResult> {
    return await this.runner.run(
      binary.path,
      [...binary.defaultArgs, ...baseArgs],
      {
        env: [...APT_ENV],
      },
    );
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
  logger?: winston.Logger,
): Promise<boolean> {
  const result = await runner.run("dpkg-query", ["-W", "aria2"], {
    env: [...APT_ENV],
  });
  if (result.exitCode === 0) {
    return true;
  }
  logger?.warn(
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
 * @param aptLockTimeoutSeconds Timeout for APT lock wait in seconds. The lock is set by APT itself.
 * @param appLogger Logger instance for application logs or passthrough if null.
 * @param commandExecLogger Logger instance for capturing APT commands execution or passthrough if null.
 * @returns A configured PackageManager instance.
 */
export async function createPackageManager(
  enableAptFast: boolean,
  aptLockTimeoutSeconds: number = -1,
  appLogger?: winston.Logger,
  commandExecLogger?: winston.Logger,
): Promise<PackageManager> {
  const missing: BinaryMeta[] = Object.values(Binary).filter(
    (meta) => !fsSync.existsSync(meta.path),
  );
  if (missing.length > 0) {
    const missingPaths = missing.map((meta) => meta.path).join("\n");
    throw new AvailabilityError(
      `Missing required APT binaries:\n${missingPaths}\nThis does not appear to be a Debian/Ubuntu system.`,
    );
  }

  const runner = new DefaultCommandRunner(appLogger, commandExecLogger);
  return new AptPackageManager(
    enableAptFast && (await isAptFastAvailable(runner, appLogger)),
    runner,
    new AptOutputParser(appLogger),
    aptLockTimeoutSeconds,
    appLogger,
  );
}
