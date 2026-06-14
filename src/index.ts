/** Public type exports for consumers of the library. */
export type {
  PackageInfo,
  PackageManager,
  PackageManagerOptions,
  PackageStatus,
  CommandRunner,
  CommandOptions,
  CommandResult,
  CreateManagerOptions,
} from "./types.js";

/** APT manager implementation export. */
export { AptPackageManager } from "./managers/apt/manager.js";
/** APT-fast manager implementation export. */
export { AptFastPackageManager } from "./managers/aptFast/manager.js";
/** Factory helpers for manager discovery and creation. */
export { createPackageManager, getAvailableManagers } from "./factory.js";
/** Default process runner export. */
export { DefaultCommandRunner } from "./core/commandRunner.js";
/** Mock process runner export for tests. */
export { MockCommandRunner } from "./core/mockCommandRunner.js";
/** Custom error type exports. */
export {
  TsAptError,
  ValidationError,
  AvailabilityError,
  CommandExecutionError,
} from "./errors.js";
