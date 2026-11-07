import { DefaultCommandRunner } from "./commandRunner.js";
import type {
  CommandResult,
  CommandRunner,
  PackageInfo,
  PackageManager,
  PackageName,
} from "./types.js";
import { AptOutputParser } from "./parser.js";
import winston from "winston";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Environment overrides for non-interactive APT commands. */
export const aptEnv = [
  "DEBIAN_FRONTEND=noninteractive",
  "DEBCONF_NONINTERACTIVE_SEEN=true",
] as const;

/** Common APT flags used across operations. */
export const aptFlags = {
  assumeYes: "-y",
  fixBroken: "-f",
  autoRemove: "--autoremove",
} as const;

/** Available APT commands that can be used by the package manager implementation. */
export type BinaryName =
  "apt" | "apt-cache" | "apt-fast" | "apt-get" | "dpkg" | "dpkg-query";

/** Metadata information for an APT binary defining its location and standard arguments. */
interface BinaryMeta {
  name: BinaryName;
  path: string;
  defaultArgs: string[];
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function resolveBundledPath(scriptName: BinaryName): string {
  const candidates = [
    path.resolve(moduleDir, "..", "scripts", "dist", `${scriptName}.sh`),
    path.resolve(moduleDir, "..", "..", "scripts", "dist", `${scriptName}.sh`),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Keep deterministic behavior even when the script is not present at startup.
  return candidates[0] ?? path.resolve("scripts", "dist", `${scriptName}.sh`);
}

/** Binary metadata for APT-related executables. */
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
    path: resolveBundledPath("apt-fast"),
    defaultArgs: ["--quiet=0", aptFlags.assumeYes],
  },
  AptGet: {
    name: "apt-get",
    path: "/usr/bin/apt-get",
    defaultArgs: ["--quiet=0", aptFlags.assumeYes],
  },
  Dpkg: {
    name: "dpkg",
    path: "/usr/bin/dpkg",
    defaultArgs: [],
  },
  DpkgQuery: {
    name: "dpkg-query",
    path: "/usr/bin/dpkg-query",
    defaultArgs: [],
  },
} as const satisfies Record<string, BinaryMeta>;

/** APT-backed package manager implementation. */
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
  /** Whether to simulate mutating operations without making actual changes. */
  protected readonly simulate: boolean;

  constructor(
    aptFastEnabled: boolean,
    runner: CommandRunner,
    parser: AptOutputParser,
    logger: winston.Logger,
    simulate = false,
  ) {
    this.aptFastEnabled = aptFastEnabled;
    this.runner = runner;
    this.parser = parser;
    this.logger = logger;
    this.simulate = simulate;

    const mutatingBinary = aptFastEnabled ? Binary.AptFast : Binary.AptGet;
    // Copy rather than mutate the shared Binary entry, so simulation stays
    // scoped to this instance.
    this.mutatingBinary = this.simulate
      ? {
          ...mutatingBinary,
          defaultArgs: [...mutatingBinary.defaultArgs, "--simulate"],
        }
      : mutatingBinary;
    if (this.simulate) {
      this.logger.info(
        `Simulation mode enabled: mutating operations will not make actual changes`,
      );
    }

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

  async autoClean(timeoutMs = -1): Promise<void> {
    await this.run(this.mutatingBinary, ["autoclean"], timeoutMs);
  }

  async autoRemove(timeoutMs = -1): Promise<PackageInfo[]> {
    const out = await this.run(this.mutatingBinary, ["autoremove"], timeoutMs);
    return this.parser.parseRemoveOutput(out);
  }

  async install(
    pkgs: readonly PackageName[],
    timeoutMs = -1,
  ): Promise<PackageInfo[]> {
    const result = await this.run(
      this.mutatingBinary,
      [
        "install",
        aptFlags.fixBroken,
        "-qq", // Machine readable format
        ...pkgs.map((pkg) => pkg.serialize()),
      ],
      timeoutMs,
    );
    return this.parser.parseInstallOutput(result);
  }

  async listInstalled(): Promise<PackageInfo[]> {
    const result = await this.run(Binary.DpkgQuery, [
      "-W",
      "-f",
      // ${Package} never has an arch qualifier, unlike ${binary:Package}, which already ends in
      // ":arch" for Multi-Arch "same" and foreign packages. Lines then read name:arch=version,
      // the same form as PackageName.serialize.
      "${Package}:${Architecture}=${Version}\\n",
    ]);
    return this.parser.parseListInstalledOutput(result);
  }

  async getNativeArchitecture(): Promise<string> {
    const result = await this.run(Binary.Dpkg, ["--print-architecture"]);
    return result.stdout.trim();
  }

  async listInstalledFiles(pkg: PackageName): Promise<string[]> {
    // dpkg-query only accepts name[:arch], not a version.
    const specifier = pkg.arch ? `${pkg.name}:${pkg.arch}` : pkg.name;
    const result = await this.run(Binary.DpkgQuery, ["-L", specifier]);

    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  async listUpgradable(): Promise<PackageInfo[]> {
    const result = await this.run(this.readBinary, ["list", "--upgradable"]);
    return this.parser.parseListUpgradableOutput(result);
  }

  async remove(
    pkgs: readonly PackageName[],
    autoremoveEnabled = true,
    timeoutMs = -1,
  ): Promise<PackageInfo[]> {
    const args = [
      "remove",
      aptFlags.fixBroken,
      ...pkgs.map((pkg) => pkg.serialize()),
    ];
    if (autoremoveEnabled) {
      args.push(aptFlags.autoRemove);
    }
    const result = await this.run(this.mutatingBinary, args, timeoutMs);
    return this.parser.parseRemoveOutput(result);
  }

  async search(keywords: string[], namesOnly = false): Promise<PackageInfo[]> {
    const baseArgs = ["search", ...keywords];
    if (namesOnly) {
      baseArgs.push("--names-only");
    }
    const result = await this.run(this.readBinary, baseArgs);

    return this.parser.parseSearchOutput(result);
  }

  async update(timeoutMs = -1): Promise<number> {
    return this.run(this.mutatingBinary, ["update"], timeoutMs).then(
      (result) => {
        return this.parser.parseUpdateOutput(result);
      },
    );
  }

  async upgrade(
    pkgs: readonly PackageName[] = [],
    timeoutMs = -1,
  ): Promise<PackageInfo[]> {
    if (pkgs.length == 0) {
      this.logger.info(
        "Upgrading all packages since no specific package names were provided",
      );
    }
    const args =
      pkgs.length > 0
        ? ["install", ...pkgs.map((pkg) => pkg.serialize())]
        : ["upgrade"];
    const out = await this.run(this.mutatingBinary, args, timeoutMs);
    return this.parser.parseInstallOutput(out);
  }

  async upgradeAll(timeoutMs = -1): Promise<PackageInfo[]> {
    return await this.upgrade([], timeoutMs);
  }

  async getPackageInfo(pkgs: readonly PackageName[]): Promise<PackageInfo[]> {
    const result = await this.run(this.cacheBinary, [
      "show",
      ...pkgs.map((pkg) => pkg.serialize()),
    ]);
    return this.parser.parseCacheShowOutput(result);
  }

  /**
   * Executes an APT command with support for global locking and optional timeout for mutating operations.
   *
   * Effective invocation:
   * `binary.path ...binary.defaultArgs [-o DPkg::Lock::Timeout=${mutationTimeoutMs}] ...baseArgs`
   *
   * Example composed commands:
   * ```text
   * /usr/bin/apt-get --quiet=0 --force-yes -o DPkg::Lock::Timeout=-1 install --fix-broken curl
   * /usr/bin/apt-cache --quiet=0 show xdot
   * ```
   *
   * @param binary Binary metadata (path plus default args).
   * @param baseArgs Command arguments before fixed flag expansion.
   * @param mutationTimeoutMs Command timeout in milliseconds, default is -1 for no timeout. This is only for
   *  mutating operations that require a lock, read-only operations do not require a timeout and will throw an
   *  error if used.
   * @returns Command result with captured process output.
   */
  private async run(
    binary: BinaryMeta,
    baseArgs: string[],
    mutationTimeoutMs?: number,
  ): Promise<CommandResult> {
    const lockArgs = mutationTimeoutMs
      ? ["-o", `DPkg::Lock::Timeout=${mutationTimeoutMs}`]
      : [];
    const args = [...binary.defaultArgs, ...lockArgs, ...baseArgs];
    return this.runner.run(binary.path, args, {
      env: [...aptEnv],
      // Mutating commands (e.g. install) can take minutes, so they use the
      // caller's timeout (-1 for none) instead of the runner default.
      ...(mutationTimeoutMs === undefined
        ? {}
        : { timeoutMs: mutationTimeoutMs }),
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
    env: [...aptEnv],
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
 * @param simulate Whether to simulate mutating operations without making actual changes.
 * @returns A configured PackageManager instance.
 */
export async function createPackageManager(
  enableAptFast: boolean,
  appLogger?: winston.Logger,
  commandExecLogger?: winston.Logger,
  simulate = false,
): Promise<PackageManager> {
  appLogger ??= winston.createLogger({
    level: "info",
    format: winston.format.simple(),
    transports: [new winston.transports.Console()],
  });

  commandExecLogger ??= winston.createLogger({
    level: "debug",
    format: winston.format.printf(({ message }) => {
      return String(message);
    }),
    transports: [new winston.transports.Console()],
  });

  const runner = new DefaultCommandRunner(appLogger, commandExecLogger);

  return new AptPackageManager(
    enableAptFast && (await isAptFastAvailable(runner, appLogger)),
    runner,
    new AptOutputParser(appLogger),
    appLogger,
    simulate,
  );
}
