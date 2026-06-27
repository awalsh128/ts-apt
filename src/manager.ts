import { AvailabilityError } from "./errors.js";
import { DefaultCommandRunner } from "./commandRunner.js";
import type {
  CommandResult,
  CommandRunner,
  PackageInfo,
  PackageManager,
} from "./types.js";
import { AptOutputParser, PACKAGE_NAME_REGEX } from "./parser.js";
import { APT_ENV, APT_FLAGS, TIMEOUTS } from "./options.js";
import winston from "winston";
import { ValidationError } from "./errors.js";

type BinaryName = "apt" | "apt-cache" | "apt-fast" | "apt-get" | "dpkg-query";
interface BinaryMeta {
  name: BinaryName;
  path: string;
  defaultArgs: string[];
}

const Binary = {
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
    path: "/usr/bin/apt-fast",
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

/**
 * Validates a single package name or keyword token.
 *
 * @param name Package name or keyword token.
 * @throws ValidationError When the value is empty, too long, or unsafe.
 */
function validatePackageName(name: string): void {
  if (name.length === 0) {
    throw new ValidationError("package name cannot be empty");
  }

  if (name.length > 255) {
    throw new ValidationError("package name too long (max 255 characters)");
  }

  if (!PACKAGE_NAME_REGEX.test(name)) {
    throw new ValidationError(
      "invalid package name: contains potentially dangerous characters",
    );
  }
}

/**
 * Validates multiple package names or keyword tokens.
 *
 * @param names Values to validate.
 * @throws ValidationError When any entry is invalid.
 */
function validatePackageNames(names: string[]): void {
  for (const name of names) {
    validatePackageName(name);
  }
}

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
  protected readonly logger: winston.Logger;
  /** Binary used for mutating operations (install, remove, upgrade). */
  protected readonly mutatingBinary: BinaryMeta;

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
    this.mutatingBinary = this.aptFastEnabled ? Binary.AptFast : Binary.AptGet;
    this.logger.info(
      `Using ${this.mutatingBinary.name} as package manager installer`,
    );
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
    await this.runAptCommand(
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
    const out = await this.runAptCommand(
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
  async install(pkgs: string[]): Promise<PackageInfo[]> {
    validatePackageNames(pkgs);
    const result = await this.runAptCommand(
      this.mutatingBinary,
      ["install", APT_FLAGS.fixBroken, ...pkgs],
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
    const result = await this.runAptCommand(
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
  async listInstalledFiles(pkg: string): Promise<string[]> {
    validatePackageName(pkg);
    const result = await this.runAptCommand(
      Binary.DpkgQuery,
      ["-L", pkg],
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
    const result = await this.runAptCommand(
      Binary.Apt,
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
    pkgs: string[],
    autoremoveEnabled: boolean = true,
  ): Promise<PackageInfo[]> {
    validatePackageNames(pkgs);
    const args = ["remove", APT_FLAGS.fixBroken, ...pkgs];
    if (autoremoveEnabled) {
      args.push(APT_FLAGS.autoRemove);
    }
    const result = await this.runAptCommand(
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
   */
  async search(keywords: string[]): Promise<PackageInfo[]> {
    validatePackageNames(keywords);

    const result = await this.runAptCommand(
      Binary.Apt,
      ["search", ...keywords],
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
    return this.runAptCommand(
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
  async upgrade(pkgs: string[] = []): Promise<PackageInfo[]> {
    if (pkgs.length > 0) {
      validatePackageNames(pkgs);
    } else {
      this.logger.info(
        "Upgrading all packages since no specific package names were provided",
      );
    }
    const args = pkgs.length > 0 ? ["install", ...pkgs] : ["upgrade"];
    const out = await this.runAptCommand(
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
  async getPackageInfo(pkgs: string[]): Promise<PackageInfo[]> {
    validatePackageNames(pkgs);
    const result = await this.runAptCommand(
      Binary.AptCache,
      ["show", ...pkgs],
      TIMEOUTS.getPackageInfo,
    );
    return this.parser.parseCacheShowOutput(result);
  }

  /**
   * Executes an apt command with fixed non-interactive behavior.
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
  protected async runAptCommand(
    binary: BinaryMeta,
    baseArgs: string[],
    timeoutMs: number,
  ): Promise<CommandResult> {
    const args = [...binary.defaultArgs, ...baseArgs];

    const result = await this.runner.run(binary.path, args, {
      timeoutMs,
      env: [...APT_ENV],
    });

    return result;
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
