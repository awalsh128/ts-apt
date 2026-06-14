import { AvailabilityError } from "./errors.js";
import type {
  CommandRunner,
  CreateManagerOptions,
  PackageManager,
} from "./types.js";
import { AptPackageManager } from "./managers/apt/manager.js";
import { AptFastPackageManager } from "./managers/aptFast/manager.js";

/**
 * Detects available managers in the current environment.
 *
 * @param runner Optional command runner override.
 * @returns Ordered list of available manager identifiers.
 */
export async function getAvailableManagers(
  runner?: CommandRunner,
): Promise<Array<"apt" | "apt-fast">> {
  const apt = new AptPackageManager({ runner });
  const aptFast = new AptFastPackageManager({ runner });

  const [aptAvailable, aptFastAvailable] = await Promise.all([
    apt.isAvailable(),
    aptFast.isAvailable(),
  ]);

  const out: Array<"apt" | "apt-fast"> = [];
  if (aptAvailable) {
    out.push("apt");
  }
  if (aptFastAvailable) {
    out.push("apt-fast");
  }
  return out;
}

/**
 * Creates a package manager instance according to caller preference.
 *
 * @param options Manager selection and fallback options.
 * @returns Instantiated package manager implementation.
 * @throws AvailabilityError When the requested manager is unavailable.
 */
export async function createPackageManager(
  options: CreateManagerOptions = {},
): Promise<PackageManager> {
  const preferred = options.preferred ?? "apt";
  const aptFastFallback = options.aptFastFallbackToApt ?? false;

  if (preferred === "apt-fast") {
    const aptFast = new AptFastPackageManager({ runner: options.runner });
    if (await aptFast.isAvailable()) {
      return aptFast;
    }

    if (aptFastFallback) {
      const apt = new AptPackageManager({ runner: options.runner });
      if (await apt.isAvailable()) {
        return apt;
      }
    }

    throw new AvailabilityError(
      aptFastFallback
        ? "Neither apt-fast nor apt is available"
        : "apt-fast is not available and fallback is disabled",
    );
  }

  const apt = new AptPackageManager({ runner: options.runner });
  if (await apt.isAvailable()) {
    return apt;
  }
  throw new AvailabilityError("apt is not available");
}
