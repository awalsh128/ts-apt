import type {
  CommandResult,
  MixedSuccessResult,
  PackageInfo,
  PackageStatus,
} from "./types.js";
import { ValidationError } from "./errors.js";
import winston from "winston";
import { parseMessage } from "./internetMessage.js";

// NOTE: Package names and versions use [^\s]+ to be as permissive as possible, since some packages have
// unusual names or versions. It is always assumed a space will follow which is why negation is used.

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
 * Matches package lines emitted by apt-get -o "APT::Get::Show-User-Simulation-Note=false" -V --simulate dist-upgrade
 * 'Inst <pkg> [<current version>|<empty if broken>] (<new version> <repository>, ..., [<arch>])' format.
 */
const SIMULATE_UPGRADEABLE_REGEX =
  /^Inst\s+(\S+)\s+\[([^\]]*)\]\s+\((\S+).*\[([^\]]+)\]\)$/gm;

function normText(text: string): string {
  return text.replace(/\r\n/g, "\n").trimEnd();
}

/**
 * Concrete implementation of AptOutputParser for system package output parsing.
 */
export class AptOutputParser {
  private readonly logger?: winston.Logger;

  constructor(logger?: winston.Logger) {
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
    this.logger?.error(message);
    throw new ValidationError(message);
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
    this.logger?.debug(`Found ${stanzas.length} stanzas in cache show output`);
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
   * Parse output of `apt-get -o "APT::Get::Show-User-Simulation-Note=false" -V --simulate <upgrade|dist-upgrade>`
   * to extract upgradable package names and versions.
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
  parseSimulateDistUpgrade(result: CommandResult): PackageInfo[] {
    return Array.from(
      normText(result.stdout).matchAll(SIMULATE_UPGRADEABLE_REGEX),
    ).map((match) => {
      const [, name, version, newVersion, arch] = match;
      return {
        name: name!,
        arch,
        version: version || "",
        status: version ? "upgradeable" : "broken",
        metadata: new Map([["newVersion", newVersion!]]),
      };
    });
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
    const lines = normText(result.stdout).split("\n");

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
   * Parse output of search commands to extract normalized name-description entries.
   *
   * This parser consumes one line at a time using the `name - description` split pattern,
   * returning `{ name, description }` records.
   *
   * Fixture examples:
   * - `test/data/search_multiplefound.log`
   * - `test/data/search_singlefound.log`
   * - `test/data/search_nonefound.log`
   *
   * Example line parsed:
   * ```text
   * firefox - Safe and easy web browser from Mozilla
   * ```
   */
  parseSearchOutput(
    result: CommandResult,
  ): { name: string; description: string }[] {
    return normText(result.stdout)
      .split("\n")
      .map((line) => {
        const [name, description] = line.trim().split(" - ", 2);
        return { name: name ?? "", description: description ?? "" };
      })
      .filter((pkg) => pkg.name.length > 0);
  }

  /**
   * Parse output of `apt update` to extract the number of upgradable packages.
   *
   * Example output parsed:
   * ```text
   * 12 packages can be upgraded. Run 'apt list --upgradable' to see them.
   * ```
   */
  parseUpdateOutput(result: CommandResult): MixedSuccessResult<number> {
    const lines = normText(result.stdout).split("\n");
    const lastLine = lines[lines.length - 1] ?? "";
    const match = lastLine.match(/(\d+) packages can be upgraded/);
    return {
      success: match ? parseInt(match[1]!, 10) : 0,
      stderr: result.stderr,
    };
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
    const lines = normText(result.stdout).split("\n");

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
