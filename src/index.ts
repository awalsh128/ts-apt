/** Public type exports for consumers of the library. */
export type {
  PackageInfo,
  PackageManager,
  PackageStatus,
  CommandRunner,
  CommandOptions,
  CommandResult,
} from "./types.js";

/** APT manager implementations and factory export. */
export { AptPackageManager, createPackageManager } from "./manager.js";

/** Default process runner export. */
export { DefaultCommandRunner } from "./commandRunner.js";

/** Custom error type exports. */
export {
  TsAptError,
  ValidationError,
  AvailabilityError,
  CommandExecutionError,
} from "./errors.js";
