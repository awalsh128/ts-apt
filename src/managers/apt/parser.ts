import type { PackageInfo, PackageStatus } from "../../types.js";

/** Matches package removal lines emitted by apt remove/autoremove. */
const REMOVE_REGEX = /^Removing\s+(\S+?)(?::(\S+))?\s+\(([^)]+)\)/;
/** Matches package installation lines emitted by apt install/upgrade. */
const INSTALL_REGEX = /Setting up ([\w\d.-]+):?([\w\d]+)? \(([\w\d.+:~\-]+)\)/;

/**
 * Builds an empty package info object with manager identity pre-filled.
 *
 * @param manager Manager name, for example apt or apt-fast.
 * @returns Empty package info template.
 */
function defaultPackageInfo(manager: string): PackageInfo {
  return {
    name: "",
    version: "",
    newVersion: "",
    status: "unknown",
    category: "",
    arch: "",
    packageManager: manager,
  };
}

/**
 * Parses apt install-like output into installed package records.
 *
 * @param msg Raw command output.
 * @param manager Manager name for emitted records.
 * @param verbose Enables line logging.
 * @returns Installed package records.
 */
export function parseInstallOutput(
  msg: string,
  manager: string,
  verbose = false,
): PackageInfo[] {
  const packages: PackageInfo[] = [];
  const lines = msg.replace(/\r\n/g, "\n").trimEnd().split("\n");

  for (const line of lines) {
    if (verbose) {
      console.log(`${manager}: ${line}`);
    }
    const match = INSTALL_REGEX.exec(line);
    if (!match) {
      continue;
    }

    const [, name, archPart, version] = match;
    if (!name) {
      continue;
    }

    packages.push({
      ...defaultPackageInfo(manager),
      name,
      arch: archPart ?? "",
      version: version ?? "",
      newVersion: version ?? "",
      status: "installed",
    });
  }

  return packages;
}

/**
 * Parses apt remove/autoremove output into removed package records.
 *
 * @param msg Raw command output.
 * @param manager Manager name for emitted records.
 * @param verbose Enables line logging.
 * @returns Removed package records normalized to available status.
 */
export function parseDeletedOutput(
  msg: string,
  manager: string,
  verbose = false,
): PackageInfo[] {
  const packages: PackageInfo[] = [];
  const lines = msg.replace(/\r\n/g, "\n").trimEnd().split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (verbose) {
      console.log(`${manager}: ${line}`);
    }

    const match = REMOVE_REGEX.exec(line);
    if (!match) {
      continue;
    }

    const [, name, arch = "", version] = match;
    if (!name) {
      continue;
    }

    packages.push({
      ...defaultPackageInfo(manager),
      name,
      arch,
      version: version ?? "",
      newVersion: "",
      status: "available",
    });
  }

  return packages;
}

/**
 * Parses apt search output into a name-indexed map of candidate packages.
 *
 * @param msg Raw search output.
 * @param manager Manager name for emitted records.
 * @returns Package map keyed by package name.
 */
export function parseSearchEntries(
  msg: string,
  manager: string,
): Record<string, PackageInfo> {
  const normalized = msg
    .replace(/\r\n/g, "\n")
    .replace(/^Sorting\.\.\.\nFull Text Search\.\.\.\n/, "")
    .trim();

  if (!normalized) {
    return {};
  }

  const entries = normalized.split("\n\n");
  const out: Record<string, PackageInfo> = {};

  for (const entry of entries) {
    const lines = entry.split("\n");
    const first = lines[0]?.trim() ?? "";
    if (!/^[^\s]+\/[^\s]+/.test(first)) {
      continue;
    }

    const parts = first.split(/\s+/);
    if (parts.length < 3) {
      continue;
    }

    const nameCategory = parts[0] ?? "";
    const newVersion = parts[1] ?? "";
    const arch = parts[2] ?? "";
    const [name, category = ""] = nameCategory.split("/");
    if (!name) {
      continue;
    }

    out[name] = {
      ...defaultPackageInfo(manager),
      name,
      newVersion,
      category,
      arch,
    };
  }

  return out;
}

/**
 * Parses dpkg-query list output into installed package records.
 *
 * @param msg Raw dpkg-query output.
 * @param manager Manager name for emitted records.
 * @returns Installed package records.
 */
export function parseListInstalledOutput(
  msg: string,
  manager: string,
): PackageInfo[] {
  const packages: PackageInfo[] = [];
  const lines = msg.replace(/\r\n/g, "\n").trimEnd().split("\n");

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) {
      continue;
    }

    const nameArch = parts[0] ?? "";
    const version = parts[1] ?? "";
    const [name, arch = ""] = nameArch.split(":");

    packages.push({
      ...defaultPackageInfo(manager),
      name: name ?? "",
      arch,
      version,
      status: "installed",
    });
  }

  return packages;
}

/**
 * Parses apt list --upgradable output into upgradable package records.
 *
 * @param msg Raw apt output.
 * @param manager Manager name for emitted records.
 * @returns Upgradable package records.
 */
export function parseListUpgradableOutput(
  msg: string,
  manager: string,
): PackageInfo[] {
  const packages: PackageInfo[] = [];
  const lines = msg.replace(/\r\n/g, "\n").trimEnd().split("\n");

  for (const line of lines) {
    if (!line.trim() || line.startsWith("Listing...")) {
      continue;
    }

    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) {
      continue;
    }

    const nameCategory = parts[0] ?? "";
    const newVersion = parts[1] ?? "";
    const arch = parts[2] ?? "";
    const [name, category = ""] = nameCategory.split("/");
    const version = parts[5]?.replace(/]$/, "") ?? "";

    packages.push({
      ...defaultPackageInfo(manager),
      name: name ?? "",
      category,
      arch,
      version,
      newVersion,
      status: "upgradable",
    });
  }

  return packages;
}

/**
 * Parses apt-cache show output into a single package metadata record.
 *
 * @param msg Raw package info output.
 * @param manager Manager name for emitted records.
 * @returns Package metadata record.
 */
export function parsePackageInfoOutput(
  msg: string,
  manager: string,
): PackageInfo {
  const pkg = defaultPackageInfo(manager);
  const lines = msg.replace(/\r\n/g, "\n").trimEnd().split("\n");

  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx <= 0) {
      continue;
    }

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();

    if (key === "Package") {
      pkg.name = value;
    } else if (key === "Version") {
      pkg.version = value;
      pkg.newVersion = value;
    } else if (key === "Architecture") {
      pkg.arch = value;
    } else if (key === "Section") {
      pkg.category = value;
    }
  }

  pkg.status = pkg.version ? "available" : "unknown";
  return pkg;
}

/**
 * Parses dpkg-query status output and merges results with search candidates.
 *
 * @param msg Raw dpkg-query output.
 * @param inputPackages Search candidate map keyed by package name.
 * @param manager Manager name for emitted records.
 * @returns Merged package records with normalized statuses.
 */
export function parseDpkgStatusOutput(
  msg: string,
  inputPackages: Record<string, PackageInfo>,
  manager: string,
): PackageInfo[] {
  const packagesMap: Record<string, PackageInfo> = { ...inputPackages };
  const out: PackageInfo[] = [];
  const lines = msg.replace(/\r\n/g, "\n").trim().split("\n");

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) {
      continue;
    }

    let name = parts[0] ?? "";
    if (name.startsWith("dpkg-query:")) {
      name = parts[parts.length - 1] ?? "";
    }
    if (name.includes(":")) {
      name = name.split(":")[0] ?? name;
    }
    if (!name) {
      continue;
    }

    const existing = packagesMap[name];
    const pkg: PackageInfo = existing
      ? { ...existing }
      : {
          ...defaultPackageInfo(manager),
          name,
        };
    delete packagesMap[name];

    const maybeStatus = parts[parts.length - 2] ?? "";
    const versionRaw = parts[parts.length - 1] ?? "";
    const version = /^\d/.test(versionRaw) ? versionRaw : "";

    let status: PackageStatus;
    if (line.startsWith("dpkg-query:")) {
      status = "unknown";
    } else if (maybeStatus === "installed") {
      status = "installed";
    } else if (maybeStatus === "config-files") {
      status = "available";
    } else {
      status = "available";
    }

    pkg.status = status;
    if (version) {
      pkg.version = version;
    }

    out.push(pkg);
  }

  for (const pkg of Object.values(packagesMap)) {
    out.push({ ...pkg, status: "available" });
  }

  return out;
}
