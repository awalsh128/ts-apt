import type { CommandRunner } from "../../types.js";
import { AptPackageManager } from "../apt/manager.js";

/**
 * APT-fast manager implementation built on top of AptPackageManager.
 */
export class AptFastPackageManager extends AptPackageManager {
  /**
   * Creates an APT-fast manager.
   *
   * @param params Optional runner override.
   */
  constructor(params?: { runner?: CommandRunner }) {
    super({
      runner: params?.runner,
      executable: "apt-fast",
      packageManagerName: "apt-fast",
    });
  }
}
