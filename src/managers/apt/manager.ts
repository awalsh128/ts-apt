import { AvailabilityError, CommandExecutionError } from "../../errors.js";
import {
  validatePackageName,
  validatePackageNames,
} from "../../core/validation.js";
import { DefaultCommandRunner } from "../../core/commandRunner.js";
import type {
  CommandRunner,
  PackageInfo,
  PackageManager,
  PackageManagerOptions,
} from "../../types.js";
import { APT_ENV, APT_FLAGS, TIMEOUTS, normalizeOptions } from "./options.js";
import {
  parseDeletedOutput,
  parseDpkgStatusOutput,
  parseInstallOutput,
  parseListInstalledOutput,
  parseListUpgradableOutput,
  parsePackageInfoOutput,
  parseSearchEntries,
} from "./parser.js";

/**
 * APT-backed package manager implementation.
 */
export class AptPackageManager implements PackageManager {
  /** Process runner used for all command execution. */
  protected readonly runner: CommandRunner;
  /** Executable name used for package operations. */
  protected readonly executable: string;
  /** Public manager identifier attached to returned records. */
  protected readonly packageManagerName: string;

  /**
   * Creates an APT manager.
   *
   * @param params Optional dependency and identifier overrides.
   */
  constructor(params?: {
    runner?: CommandRunner;
    executable?: string;
    packageManagerName?: string;
  }) {
    this.runner = params?.runner ?? new DefaultCommandRunner();
    this.executable = params?.executable ?? "apt";
    this.packageManagerName = params?.packageManagerName ?? "apt";
  }

  /** Returns the manager identifier. */
  getPackageManager(): string {
    return this.packageManagerName;
  }

  /** Checks whether required executables are present and functional. */
  async isAvailable(): Promise<boolean> {
    const aptPath = await this.commandExists(this.executable);
    if (!aptPath) {
      return false;
    }
    const dpkgPath = await this.commandExists("dpkg");
    if (!dpkgPath) {
      return false;
    }

    try {
      const result = await this.runner.run(this.executable, ["--version"], {
        timeoutMs: TIMEOUTS.availability,
      });
      const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
      return output.includes("apt") && !output.includes("java");
    } catch {
      return false;
    }
  }

  /**
   * Installs one or more packages.
   *
   * @param pkgs Package names.
   * @param opts Operation options.
   */
  async install(
    pkgs: string[],
    opts?: PackageManagerOptions,
  ): Promise<PackageInfo[]> {
    validatePackageNames(pkgs);
    const o = normalizeOptions(opts);
    const args = ["install", APT_FLAGS.fixBroken, ...pkgs];
    const out = await this.executeApt(args, o, TIMEOUTS.install);
    if (o.interactive) {
      return [];
    }
    return parseInstallOutput(out, this.packageManagerName, o.verbose);
  }

  /**
   * Removes one or more packages and auto-removable dependencies.
   *
   * @param pkgs Package names.
   * @param opts Operation options.
   */
  async remove(
    pkgs: string[],
    opts?: PackageManagerOptions,
  ): Promise<PackageInfo[]> {
    validatePackageNames(pkgs);
    const o = normalizeOptions(opts);
    const args = ["remove", APT_FLAGS.fixBroken, APT_FLAGS.autoRemove, ...pkgs];
    const out = await this.executeApt(args, o, TIMEOUTS.remove);
    if (o.interactive) {
      return [];
    }
    return parseDeletedOutput(out, this.packageManagerName, o.verbose);
  }

  /**
   * Refreshes package index metadata.
   *
   * @param opts Operation options.
   */
  async refresh(opts?: PackageManagerOptions): Promise<void> {
    const o = normalizeOptions(opts);
    await this.executeApt(["update"], o, TIMEOUTS.refresh);
  }

  /**
   * Searches package repositories and resolves installation status via dpkg-query.
   *
   * @param keywords Search terms.
   * @param opts Operation options.
   */
  async find(
    keywords: string[],
    opts?: PackageManagerOptions,
  ): Promise<PackageInfo[]> {
    validatePackageNames(keywords);
    const o = normalizeOptions(opts);

    const result = await this.runner.run(
      this.executable,
      ["search", ...keywords],
      {
        timeoutMs: TIMEOUTS.find,
        env: [...APT_ENV],
      },
    );

    const found = parseSearchEntries(result.stdout, this.packageManagerName);
    const names = Object.keys(found);
    if (names.length === 0) {
      return [];
    }

    const args = [
      "-W",
      "--showformat",
      "${binary:Package} ${Status} ${Version}\\n",
      ...names,
    ];
    try {
      const statusResult = await this.runner.run("dpkg-query", args, {
        timeoutMs: TIMEOUTS.dpkgStatus,
        env: [...APT_ENV],
      });
      return parseDpkgStatusOutput(
        statusResult.stdout,
        found,
        this.packageManagerName,
      ).map((pkg) => ({
        ...pkg,
        status: pkg.status === "unknown" ? "available" : pkg.status,
      }));
    } catch (error) {
      if (error instanceof CommandExecutionError && error.exitCode === 1) {
        const combined = `${error.stdout}\n${error.stderr}`;
        return parseDpkgStatusOutput(
          combined,
          found,
          this.packageManagerName,
        ).map((pkg) => ({
          ...pkg,
          status: pkg.status === "unknown" ? "available" : pkg.status,
        }));
      }
      throw error;
    }
  }

  /**
   * Lists files installed by a package.
   *
   * @param pkg Package name.
   */
  async listInstalledFiles(pkg: string): Promise<string[]> {
    validatePackageName(pkg);
    const result = await this.runner.run("dpkg-query", ["-L", pkg], {
      timeoutMs: TIMEOUTS.listInstalledFiles,
      env: [...APT_ENV],
    });

    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /**
   * Lists installed packages from dpkg-query.
   *
   * @param _opts Reserved for API compatibility.
   */
  async listInstalled(_opts?: PackageManagerOptions): Promise<PackageInfo[]> {
    const result = await this.runner.run(
      "dpkg-query",
      ["-W", "-f", "${binary:Package} ${Version}\\n"],
      {
        timeoutMs: TIMEOUTS.listInstalled,
        env: [...APT_ENV],
      },
    );
    return parseListInstalledOutput(result.stdout, this.packageManagerName);
  }

  /**
   * Lists upgradable packages from apt list.
   *
   * @param _opts Reserved for API compatibility.
   */
  async listUpgradable(_opts?: PackageManagerOptions): Promise<PackageInfo[]> {
    const result = await this.runner.run(
      this.executable,
      ["list", "--upgradable"],
      {
        timeoutMs: TIMEOUTS.listUpgradable,
        env: [...APT_ENV],
      },
    );
    return parseListUpgradableOutput(result.stdout, this.packageManagerName);
  }

  /**
   * Upgrades selected packages or all packages when no names are provided.
   *
   * @param pkgs Optional package names.
   * @param opts Operation options.
   */
  async upgrade(
    pkgs: string[] = [],
    opts?: PackageManagerOptions,
  ): Promise<PackageInfo[]> {
    if (pkgs.length > 0) {
      validatePackageNames(pkgs);
    }
    const o = normalizeOptions(opts);
    const args = pkgs.length > 0 ? ["install", ...pkgs] : ["upgrade"];
    const out = await this.executeApt(args, o, TIMEOUTS.upgrade);
    if (o.interactive) {
      return [];
    }
    return parseInstallOutput(out, this.packageManagerName, o.verbose);
  }

  /**
   * Upgrades all packages.
   *
   * @param opts Operation options.
   */
  async upgradeAll(opts?: PackageManagerOptions): Promise<PackageInfo[]> {
    return await this.upgrade([], opts);
  }

  /**
   * Cleans local apt cache data.
   *
   * @param opts Operation options.
   */
  async clean(opts?: PackageManagerOptions): Promise<void> {
    const o = normalizeOptions(opts);
    await this.executeApt(["autoclean"], o, TIMEOUTS.clean);
  }

  /**
   * Retrieves package metadata using apt-cache show.
   *
   * @param pkg Package name.
   * @param _opts Reserved for API compatibility.
   */
  async getPackageInfo(
    pkg: string,
    _opts?: PackageManagerOptions,
  ): Promise<PackageInfo> {
    validatePackageName(pkg);
    const result = await this.runner.run("apt-cache", ["show", pkg], {
      timeoutMs: TIMEOUTS.getPackageInfo,
      env: [...APT_ENV],
    });
    return parsePackageInfoOutput(result.stdout, this.packageManagerName);
  }

  /**
   * Removes orphaned dependencies.
   *
   * @param opts Operation options.
   */
  async autoRemove(opts?: PackageManagerOptions): Promise<PackageInfo[]> {
    const o = normalizeOptions(opts);
    const out = await this.executeApt(["autoremove"], o, TIMEOUTS.autoRemove);
    if (o.interactive) {
      return [];
    }
    return parseDeletedOutput(out, this.packageManagerName, o.verbose);
  }

  /**
   * Executes an apt command with normalized option behavior.
   *
   * @param baseArgs Command arguments before option expansion.
   * @param opts Required operation options.
   * @param timeoutMs Command timeout in milliseconds.
   * @returns Command stdout for non-interactive operations.
   */
  protected async executeApt(
    baseArgs: string[],
    opts: Required<PackageManagerOptions>,
    timeoutMs: number,
  ): Promise<string> {
    const args = [...baseArgs];
    if (opts.dryRun) {
      args.push(APT_FLAGS.dryRun);
    }
    if (!opts.interactive || opts.assumeYes) {
      args.push(APT_FLAGS.assumeYes);
    }
    if (opts.customCommandArgs.length > 0) {
      args.push(...opts.customCommandArgs);
    }

    const result = await this.runner.run(this.executable, args, {
      timeoutMs,
      env: [...APT_ENV],
      interactive: opts.interactive,
    });

    if (opts.interactive) {
      return "";
    }

    if (opts.verbose && result.stdout) {
      console.log(result.stdout);
    }
    return result.stdout;
  }

  /**
   * Checks whether an executable is resolvable on PATH.
   *
   * @param command Executable name.
   * @returns True when the command is available.
   */
  private async commandExists(command: string): Promise<boolean> {
    try {
      await this.runner.run("which", [command], {
        timeoutMs: TIMEOUTS.availability,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Throws when the manager is unavailable.
   *
   * @throws AvailabilityError When manager binaries are missing or unusable.
   */
  async assertAvailable(): Promise<void> {
    if (!(await this.isAvailable())) {
      throw new AvailabilityError(
        `${this.packageManagerName} is not available on this system`,
      );
    }
  }
}
