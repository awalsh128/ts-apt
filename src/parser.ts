import type { CommandResult, PackageInfo, PackageStatus } from "./types.js";
import { ValidationError } from "./errors.js";
import winston from "winston";
import { parseMessage } from "./internetMessage.js";

// NOTE: Package names and versions use [^\s]+ to be as permissive as possible, since some packages have
// unusual names or versions. It is always assumed a space will follow which is why negation is used.

/** Matches the cache search line emitted by apt search in '<name>/<repos> <version> <arch>\n<description>' format. */
const SEARCH_REGEX =
  /^([^ \n\/]+)\/([^\s]+)\s+([^\s]+)\s+(\w+)\n\s*(.+?)(?=\n\n|\n[^ \n]|$)/gm;
/** Matches the prefix of a stanza in apt-cache show output in order to separate stanzas for parsing. */
const CACHE_SHOW_STANZA_REGEX = /.+?((?:\r\n|\r|\n)\s*(?:\r\n|\r|\n))|.+$/gs;

/** Matches package removal lines emitted by apt remove/autoremove. */
const REMOVE_REGEX = /^Removing\s+(\S+?)(?::(\S+))?\s+\(([^)]+)\)/;
/** Matches package installation lines emitted by apt install/upgrade. */
const INSTALL_OR_UPDATE_REGEX =
  /^Setting up\s+([^\s:]+)(?::([^\s]+))?\s+\(([^)]+)\)/;
/**
 * Matches package lines emitted by dpkg-query in format
 * "${binary:Package}:${Architecture}=${Version}" format.
 */
const DPKG_QUERY_LIST_INSTALLED_REGEX = /(.+):(.*)\=(.*)/;

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
    this.logger.error(`Failed to parse ${name} in line: '${line}'`);
    throw new ValidationError(`Failed to parse ${name} in line: '${line}'`);
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
      return {
        name,
        version: isInstalled
          ? message.getHeader("Installed")!
          : message.getHeader("Candidate")!,
        status: isInstalled ? "installed" : "available",
        metadata: new Map(Object.entries(message.headers.toObject())),
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
    includeMetadata: boolean = false,
  ): PackageInfo[] {
    const stanzas =
      normText(result.stdout).match(CACHE_SHOW_STANZA_REGEX) ?? [];
    this.logger.debug(`Found ${stanzas.length} stanzas in cache show output`);
    return stanzas
      .map((stanza) => parseMessage(stanza.trimEnd() + "\n\n"))
      .map((message): PackageInfo => {
        return {
          name: message.getHeader("Package") ?? "",
          version: message.getHeader("Version") ?? "",
          arch: message.getHeader("Architecture") ?? undefined,
          status: message.getHeader("Status")?.includes("installed")
            ? "installed"
            : "available",
          metadata: includeMetadata
            ? new Map(Object.entries(message.headers.toObject()))
            : undefined,
        };
      });
  }

  /**
   * Parse output of `apt install <package...>` to extract package names and versions.
   *
   * Example output parsed:
   * ```text
   * Setting up curl:amd64 (8.5.0-2ubuntu10.6) ...
   * Setting up ca-certificates (20240203) ...
   * ```
   */
  parseInstallOutput(result: CommandResult): PackageInfo[] {
    const packages: PackageInfo[] = [];
    const lines = normText(result.stdout).split("\n");

    for (const line of lines) {
      const match = INSTALL_OR_UPDATE_REGEX.exec(line);
      if (!match) {
        continue;
      }

      const [, name, archPart, version] = match;
      packages.push({
        name: name!,
        arch: archPart,
        version: version!,
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
   * Removing curl (8.5.0-2ubuntu10.6) ...
   * Removing libcurl4:amd64 (8.5.0-2ubuntu10.6) ...
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

      const [, name, arch = undefined, version] = match;
      packages.push({
        name: name!,
        arch,
        version: version!,
        status: "available",
      });
    }

    return packages;
  }

  /**
   * Parse output of `dpkg-query -W -f='${binary:Package}:${Architecture}=${Version}\n'`
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
      if (!line.trim()) {
        continue;
      }
      const match = DPKG_QUERY_LIST_INSTALLED_REGEX.exec(line.trim());
      if (!match) {
        continue;
      }

      const [, name, arch, version] = match;

      this.assertNotEmpty("name", name, line);
      this.assertNotEmpty("version", version, line);

      packages.push({
        name: name!,
        arch,
        version: version!,
        status: "installed",
      });
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
        name: name!,
        arch,
        version: oldVersion!,
        status: "upgradeable",
        metadata: new Map([["newVersion", newVersion!]]),
      });
    }

    return packages;
  }

  /**
   * Parse output of `dpkg-query -W -f='${binary:Package}:${Architecture}=${Version}\n'`
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
      const trimmedLine = line.trim();
      const matched = DPKG_QUERY_LIST_INSTALLED_REGEX.exec(trimmedLine);
      if (!matched) {
        continue;
      }
      const [, name, arch, version] = matched;

      packages.push({
        name: name!,
        arch,
        version: version!,
        status: "installed",
      });
    }

    return packages;
  }

  /**
   * Parse output of `apt search <query>` to extract package information.
   *
   * Example output parsed:
   * ```text
   * curl/jammy-updates,jammy-security 8.5.0-2ubuntu10.6 amd64
   *   command line tool for transferring data with URL syntax
   * ```
   */
  parseSearchOutput(result: CommandResult): PackageInfo[] {
    const packages: PackageInfo[] = [];
    for (const match of normText(result.stdout).matchAll(SEARCH_REGEX)) {
      const [, name, repos, version, arch, description] = match;
      packages.push({
        name: name!,
        version: version!,
        arch: arch!,
        metadata: new Map([
          ["description", description!],
          ["repos", repos!],
        ]),
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
    const lines = normText(result.stdout)
      .replace(/\r\n/g, "\n")
      .trimEnd()
      .split("\n");
    const lastLine = lines[lines.length - 1] ?? "";
    const match = lastLine.match(/(\d+) packages can be upgraded/);
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
      const match = INSTALL_OR_UPDATE_REGEX.exec(line);
      if (!match) {
        continue;
      }

      const [, name, arch, version] = match;

      packages.push({
        name: name!,
        arch,
        version: version!,
        status: "installed",
      });
    }

    return packages;
  }
}
