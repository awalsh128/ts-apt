import type { PackageManagerOptions } from "../../types.js";

/** Environment overrides for non-interactive APT commands. */
export const APT_ENV = [
  "DEBIAN_FRONTEND=noninteractive",
  "DEBCONF_NONINTERACTIVE_SEEN=true",
] as const;

/** Common APT flags used across operations. */
export const APT_FLAGS = {
  assumeYes: "-y",
  dryRun: "--dry-run",
  fixBroken: "-f",
  autoRemove: "--autoremove",
} as const;

/** Operation-specific timeout values in milliseconds. */
export const TIMEOUTS = {
  install: 10 * 60_000,
  remove: 10 * 60_000,
  refresh: 5 * 60_000,
  find: 3 * 60_000,
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

/**
 * Converts partial options into fully populated defaults.
 *
 * @param opts Optional caller-provided options.
 * @returns Options object with all fields defined.
 */
export function normalizeOptions(
  opts?: PackageManagerOptions,
): Required<PackageManagerOptions> {
  return {
    interactive: opts?.interactive ?? false,
    dryRun: opts?.dryRun ?? false,
    verbose: opts?.verbose ?? false,
    assumeYes: opts?.assumeYes ?? false,
    debug: opts?.debug ?? false,
    customCommandArgs: opts?.customCommandArgs ?? [],
  };
}
