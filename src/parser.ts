/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import {
  type CommandResult,
  type PackageInfo,
  type PackageName,
  tsAptMetaKeys,
} from "./types.js";
import { createPackageName, deserializePackageName } from "./package.js";
import { ValidationError } from "./errors.js";
import winston from "winston";
import { parseMessage } from "./internetMessage.js";

// NOTE: Package names and versions use [^\s]+ to be as permissive as possible, since some packages have
// unusual names or versions. It is always assumed a space will follow which is why negation is used.

/** Matches the cache search line emitted by apt search in '<name>/<release codename> <version> <arch> [\[installed\]]\n<description>' format. */
const SEARCH_REGEX =
  /^([^ \n\/]+)\/([^\s]+)\s+([^\s]+)\s+(\w+)\n\s*(.+?)(\s+\[installed\])?(?=\n\n|\n[^ \n]|$)/gm;
/** Matches the prefix of a stanza in apt-cache show output in order to separate stanzas for parsing. */
const CACHE_SHOW_STANZA_REGEX = /.+?((?:\r\n|\r|\n)\s*(?:\r\n|\r|\n))|.+$/gs;

/** Matches package removal lines emitted by apt remove/autoremove. */
const REMOVE_REGEX = /^Remv\s+(\S+)\s\[([^\]]+)\](?:\s\[([^\]]+)\])?$/;
/**
 * Matches simulated package installation lines emitted by apt-get install or upgrade.
 *
 * Captures name, version, repositories and arch. The name's `:arch` suffix on
 * foreign-arch packages and the `[old-version]` on upgrades are skipped, since
 * the bracketed arch and new version inside the parentheses take precedence.
 *
 * Example lines:
 * ```text
 * Inst rolldice (1.16-1build1 Ubuntu:20.04/focal [amd64])
 * Inst libc6:i386 (2.31-0ubuntu9.2 Ubuntu:20.04/focal-updates [i386])
 * Inst vim [2:8.1.2269-1ubuntu5.31] (2:8.1.2269-1ubuntu5.32 Ubuntu:20.04/focal-updates [amd64])
 * ```
 */
const INSTALL_REGEX =
  /^Inst\s+([^\s:]+)(?::\S+)?(?:\s+\[[^\]]+\])?\s+\((\S+)\s+([^\]]+)\s\[([^\]]+)\]\)$/;
/** Matches package lines emitted by apt-get upgrade. */
const UPDATE_REGEX = /^Inst\s+([^\s:]+)(?::([^\s]+))?\s+\(([^)]+)\)/;
/** Matches package installation/upgrade lines emitted during non-simulated runs. */
const SETTING_UP_REGEX =
  /^Setting up\s+([^\s:]+)(?::([^\s]+))?\s+\(([^)]+)\)\s+\.\.\.$/;

/**
 * Matches package lines emitted by apt list --upgradable in format
 * '<name>/<category> <newVersion> <arch> [upgradable from: <oldVersion>]'
 */
const LIST_UPGRADEABLE_REGEX =
  /^([^\/\s]+)\/[\w\-]+,\S+\s+([^\s]+)\s+(\w+)\s+\[upgradable from:\s+([^\s]+)\]/;

function normText(text: string): string {
  return text.replace(/\r\n/g, "\n").trimEnd();
}

/**
 * Concrete implementation of AptOutputParser for system package output parsing.
 */
export class AptOutputParser {
  private readonly logger: winston.Logger;

  constructor(logger: winston.Logger) {
    this.logger = logger;
  }

  private assertNotEmpty(
    name: string,
    value: string | undefined,
    line: string,
  ): void {
    if (value) {
      return;
    }
    const message = `Failed to parse ${name} in line: '${line}'`;
    this.logger.error(message);
    throw new ValidationError(message);
  }

  /**
   * Parses one `dpkg-query` line printed as `${Package}:${Architecture}=${Version}`, which is the
   * same `name[:arch][=version]` form as {@link PackageName.serialize}.
   *
   * @returns The package name, or undefined for lines without a version separator.
   * @throws ValidationError When the version is empty.
   */
  private parseDpkgQueryLine(line: string): PackageName | undefined {
    const trimmed = line.trim();
    if (!trimmed.includes("=")) {
      return undefined;
    }
    const name = deserializePackageName(trimmed);
    this.assertNotEmpty("version", name.version, line);
    return name;
  }

  /**
   * Parse output of `apt-cache policy <package...>` to extract package information.
   *
   * Example output parsed:
   * ```text
   * curl:
   *   Installed: 8.5.0-2ubuntu10.6
   *   Candidate: 8.5.0-2ubuntu10.6
   *   Version table:
   *  *** 8.5.0-2ubuntu10.6 500
   * ```
   */
  parseCachePolicyOutput(result: CommandResult): PackageInfo[] {
    const stanzas = Array.from(
      normText(result.stdout).matchAll(/^([^:\n]+):\n((?:^[ \t].*\n?)*)/gm),
    );
    return stanzas.map((match): PackageInfo => {
      const name = match[1]!.trim();
      const bodyRaw = match[2] ?? "";
      const body = bodyRaw.endsWith("\n") ? bodyRaw : `${bodyRaw}\n`;
      const message = parseMessage(body);
      const isInstalled = message.getHeader("Installed") !== "(none)";
      const version = isInstalled
        ? message.getHeader("Installed")!
        : message.getHeader("Candidate")!;
      return {
        name: createPackageName(name, version),
        status: isInstalled ? "installed" : "available",
        metadata: Object.fromEntries(message.headers),
      };
    });
  }

  /**
   * Parse output of `apt-cache show <package...>` to extract package information.
   *
   * Example output parsed:
   * ```text
   * Package: curl
   * Version: 8.5.0-2ubuntu10.6
   * Architecture: amd64
   * Description: command line tool for transferring data with URL syntax
   * ```
   */
  parseCacheShowOutput(
    result: CommandResult,
    includeMetadata = false,
  ): PackageInfo[] {
    const stanzas =
      normText(result.stdout).match(CACHE_SHOW_STANZA_REGEX) ?? [];
    this.logger.debug(`Found ${stanzas.length} stanzas in cache show output`);
    return stanzas
      .map((stanza) => parseMessage(stanza.trimEnd() + "\n\n"))
      .map((message): PackageInfo => {
        const nameStr = message.getHeader("Package") ?? "";
        const versionStr = message.getHeader("Version") ?? undefined;
        const archStr = message.getHeader("Architecture") ?? undefined;
        return {
          name: createPackageName(nameStr, versionStr, archStr),
          status: message.getHeader("Status")?.includes("installed")
            ? "installed"
            : "available",
          metadata: includeMetadata
            ? Object.fromEntries(message.headers)
            : undefined,
        };
      });
  }

  /**
   * Parse output of `apt-get install <package...>` to extract package names and versions.
   *
   * Example output parsed:
   * ```text
   * Inst gir1.2-pango-1.0 (1.44.7-2ubuntu4 Ubuntu:20.04/focal [amd64])
   * Inst gir1.2-gtk-3.0 (3.24.20-0ubuntu1.2 Ubuntu:20.04/focal-updates, Ubuntu:20.04/focal-security [amd64])
   * ```
   */
  parseInstallOutput(result: CommandResult): PackageInfo[] {
    const packages: PackageInfo[] = [];
    const lines = normText(result.stdout).split("\n");

    for (const line of lines) {
      const match = INSTALL_REGEX.exec(line);
      if (match) {
        const [, name, version, repositories, arch] = match;
        const info: PackageInfo = {
          name: createPackageName(name!, version!, arch),
          status: "installed",
          metadata: repositories
            ? { [tsAptMetaKeys.installRepositories]: repositories }
            : undefined,
        };
        packages.push(info);
        continue;
      }

      const settingUpMatch = SETTING_UP_REGEX.exec(line);
      if (!settingUpMatch) {
        continue;
      }

      const [, name, arch, version] = settingUpMatch;
      packages.push({
        name: createPackageName(name!, version!, arch),
        status: "installed",
      });
    }

    return packages;
  }

  /**
   * Parse output of `apt remove <package...>` or `apt autoremove` to extract package names and versions.
   *
   * Example output parsed:
   * ```text
   * Remv python3-zope.interface [4.7.1-1] [wajig:amd64 xfsprogs:amd64 ufw:amd64 ubuntu-pro-client-l10n:amd64 ]
   * Remv ubuntu-pro-client-l10n [37.1ubuntu0~20.04.1] [wajig:amd64 xfsprogs:amd64 ufw:amd64 ]
   * ```
   */
  parseRemoveOutput(result: CommandResult): PackageInfo[] {
    const packages: PackageInfo[] = [];
    const lines = normText(result.stdout).split("\n");

    for (const rawLine of lines) {
      const line = rawLine.trim();

      const match = REMOVE_REGEX.exec(line);
      if (!match) {
        continue;
      }

      const [, name, version, dependencies] = match;
      packages.push({
        name: createPackageName(name!, version!),
        status: "available",
        metadata: dependencies
          ? { [tsAptMetaKeys.removeDependencies]: dependencies }
          : undefined,
      });
    }

    return packages;
  }

  /**
   * Parse output of `dpkg-query -W -f='${Package}:${Architecture}=${Version}\n'`
   * to extract installed package names and versions.
   *
   * Example output parsed:
   * ```text
   * curl:amd64=8.5.0-2ubuntu10.6
   * libc6:amd64=2.39-0ubuntu8.4
   * ```
   */
  parseListInstalledOutput(result: CommandResult): PackageInfo[] {
    const packages: PackageInfo[] = [];
    const lines = normText(result.stdout)
      .replace(/\r\n/g, "\n")
      .trimEnd()
      .split("\n");

    for (const line of lines) {
      const name = this.parseDpkgQueryLine(line);
      if (name) {
        packages.push({ name, status: "installed" });
      }
    }

    return packages;
  }

  /**
   * Parse output of `apt list --upgradable` to extract package names and versions.
   *
   * Example output parsed:
   * ```text
   * curl/jammy-updates,jammy-security 8.5.0-2ubuntu10.6 amd64 [upgradable from: 8.5.0-2ubuntu10.5]
   * ```
   */
  parseListUpgradableOutput(result: CommandResult): PackageInfo[] {
    const packages: PackageInfo[] = [];
    const lines = normText(result.stdout)
      .replace(/\r\n/g, "\n")
      .trimEnd()
      .split("\n");

    for (const line of lines) {
      const matched = LIST_UPGRADEABLE_REGEX.exec(line.trim());
      if (!matched) {
        continue;
      }
      const [, name, newVersion, arch, oldVersion] = matched;

      packages.push({
        name: createPackageName(name!, oldVersion!, arch),
        status: "upgradeable",
        metadata: { [tsAptMetaKeys.listUpgradeableNewVersion]: newVersion! },
      });
    }

    return packages;
  }

  /**
   * Parse output of `dpkg-query -W -f='${Package}:${Architecture}=${Version}\n'`
   * to extract package information.
   *
   * Example output parsed:
   * ```text
   * openssl:amd64=3.0.13-0ubuntu3.5
   * zlib1g:amd64=1:1.3.dfsg-3.1ubuntu2.1
   * ```
   */
  parseQueryOutput(result: CommandResult): PackageInfo[] {
    const packages: PackageInfo[] = [];
    const lines = normText(result.stdout)
      .replace(/\r\n/g, "\n")
      .trim()
      .split("\n");

    for (const line of lines) {
      const name = this.parseDpkgQueryLine(line);
      if (name) {
        packages.push({ name, status: "installed" });
      }
    }

    return packages;
  }

  /**
   * Parse output of `apt search <query>` to extract package information.
   *
   * Example output parsed:
   * ```text
   * curl/jammy-updates,jammy-security 8.5.0-2ubuntu10.6 amd64 [installed]
   *   command line tool for transferring data with URL syntax
   * ```
   */
  parseSearchOutput(result: CommandResult): PackageInfo[] {
    const packages: PackageInfo[] = [];
    for (const match of normText(result.stdout).matchAll(SEARCH_REGEX)) {
      const [, name, release_codename, version, arch, description, installed] =
        match;
      packages.push({
        name: createPackageName(name!, version!, arch!),
        status: installed ? "installed" : "available",
        metadata: {
          [tsAptMetaKeys.searchDescription]: description!,
          [tsAptMetaKeys.searchReleaseCodename]: release_codename!,
        },
      });
    }

    return packages;
  }

  /**
   * Parse output of `apt update` to extract the number of upgradable packages.
   *
   * Example output parsed:
   * ```text
   * 12 packages can be upgraded. Run 'apt list --upgradable' to see them.
   * ```
   */
  parseUpdateOutput(result: CommandResult): number {
    const lines = normText(result.stdout).trimEnd().split("\n");
    const lastLine = lines[lines.length - 1] ?? "";
    const match = /(\d+) packages can be upgraded/.exec(lastLine);
    return match ? parseInt(match[1]!, 10) : 0;
  }

  /**
   * Parse output of `apt upgrade` to extract package names and versions.
   *
   * Example output parsed:
   * ```text
   * Setting up openssl (3.0.13-0ubuntu3.5) ...
   * Setting up libc6:amd64 (2.39-0ubuntu8.4) ...
   * ```
   */
  parseUpgradeOutput(result: CommandResult): PackageInfo[] {
    const packages: PackageInfo[] = [];
    const lines = normText(result.stdout)
      .replace(/\r\n/g, "\n")
      .trimEnd()
      .split("\n");

    for (const line of lines) {
      const installMatch = INSTALL_REGEX.exec(line);
      if (installMatch) {
        const [, name, version, , arch] = installMatch;

        packages.push({
          name: createPackageName(name!, version!, arch),
          status: "installed",
        });
        continue;
      }

      const match = UPDATE_REGEX.exec(line);
      if (match) {
        const [, name, arch, version] = match;

        packages.push({
          name: createPackageName(name!, version!, arch),
          status: "installed",
        });
        continue;
      }

      const settingUpMatch = SETTING_UP_REGEX.exec(line);
      if (!settingUpMatch) {
        continue;
      }

      const [, name, arch, version] = settingUpMatch;
      packages.push({
        name: createPackageName(name!, version!, arch),
        status: "installed",
      });
    }

    return packages;
  }
}
