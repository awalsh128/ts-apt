/** Public type exports for consumers of the library. */
export * from "./types.js";

/** Custom error type exports. */
export * from "./errors.js";

/** APT manager implementations and factory export. */
export { createPackageManager } from "./manager.js";

/** Default process runner export. */
export { DefaultCommandRunner } from "./commandRunner.js";

/** APT package name transformation functions export. */
export {
  createPackageName,
  packageNameFromJSON,
  deserializePackageName,
} from "./package.js";
