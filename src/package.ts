import {
  CreatePackageNameFn,
  DeserializePackageNameFn,
  PackageName,
  PackageNameBrand,
  PackageNameFromJSONFn,
} from "./types.js";
import { z } from "zod";
import { ValidationError } from "./errors.js";

// Official APT package name rules:

// Package Name: Lowercase alphanum start, then alphanum/+/. /-, min 2 chars total,
// and contain only valid chars in between (no consecutive dots/hyphens)
const NAME_REGEX =/^[a-z0-9](?:[a-z0-9+.]|[+.-](?![.+.-]))*[a-z0-9]$/;

// Architecture: Alphanumeric start, then alphanum/-, case-insensitive
// Note: Official docs don't specify exact length, but 2+ is safe practice
const ARCH_REGEX = /^[0-9a-zA-Z][0-9a-zA-Z-]*$/;

// Version: [epoch:]upstream[-revision]
const VERSION_REGEX =
  /^(?:[0-9]+:)?[0-9A-Za-z+~][0-9A-Za-z.+~-]*(?:-[0-9A-Za-z+~][0-9A-Za-z.+~-]*)?$/;

/** Naive split of input name into not yet validated components. */
function splitInputName(input: string): {
  name: string;
  version?: string;
  arch?: string;
} {
  if (!input) {
    throw new ValidationError("Package name must not be empty.");
  }

  const [identity, version] = input.split("=", 2);
  const lastColonIndex = identity!.lastIndexOf(":");
  let name: string;
  let arch: string | undefined;

  if (lastColonIndex === -1) {
    name = identity!;
  } else {
    name = identity!.substring(0, lastColonIndex);
    arch = identity!.substring(lastColonIndex + 1);
  }

  return { name, version, arch };
}

/**
 * Parses the serialized package name by splitting delimiters rather than using a single RegEx.
 *
 * This approach is preferred because:
 * 1. It cleanly separates the logic for name, architecture, and version, avoiding ambiguity
 *    between colons in 'name:arch' and epochs in 'version' (e.g., '2:9.0').
 * 2. It enables precise error reporting (e.g., distinguishing invalid architectures from invalid versions).
 * 3. It is more maintainable and readable than a complex, monolithic regular expression.
 *
 * Note: While modern JS/TS engines support lookbehind assertions, they do not simplify this
 * specific parsing challenge significantly enough to justify the complexity of a single regex.
 */
function validateAndCreateName(
  name: string,
  version?: string,
  arch?: string,
): PackageName {
  // 3. Validate Components
  if (name.length > 255) {
    throw new ValidationError(
      `Invalid package name: "${name.substring(0, 255)}...". Must be 255 characters or less.`,
    );
  }

  if (!NAME_REGEX.test(name)) {
    throw new ValidationError(
      `Invalid package name: "${name}". Must be a valid APT package name pattern of ${NAME_REGEX.source}.`,
    );
  }

  if (arch && !ARCH_REGEX.test(arch)) {
    throw new ValidationError(
      `Invalid architecture: "${arch}". Must be a valid APT architecture pattern of ${ARCH_REGEX.source} (e.g. amd64, arm64).`,
    );
  }

  if (version && !VERSION_REGEX.test(version)) {
    throw new ValidationError(
      `Invalid version: "${version}". Must be a valid APT version pattern of ${VERSION_REGEX.source}.`,
    );
  }

  return AptPackageName.create(name, version, arch);
}

class AptPackageName implements PackageName {
  readonly name: string;
  readonly version?: string;
  readonly arch?: string;

  readonly [PackageNameBrand] = true as const; // Internal implementation

  private constructor(name: string, version?: string, arch?: string) {
    this.name = name;
    this.version = version;
    this.arch = arch;
  }

  compareTo(other: PackageName): number {
    return this.serialize().localeCompare(other.serialize());
  }

  static create: CreatePackageNameFn = (
    name: string,
    version?: string,
    arch?: string,
  ): PackageName => {
    return validateAndCreateName(name, version, arch);
  };

  static fromJSON: PackageNameFromJSONFn = (json: unknown): PackageName => {
    const schema = z.object({
      name: z.string(),
      version: z.string().optional(),
      arch: z.string().optional(),
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Invalid JSON for PackageName: ${JSON.stringify(json)}`);
    }
    const { name, version, arch } = parsed.data;
    return AptPackageName.create(name, version, arch);
  };

  static deserialize: DeserializePackageNameFn = (
    text: string,
  ): PackageName => {
    const { name, version, arch } = splitInputName(text);
    return validateAndCreateName(name, version, arch);
  };

  serialize(): string {
    const archPart = this.arch ? `:${this.arch}` : "";
    const versionPart = this.version ? `=${this.version}` : "";
    return `${this.name}${archPart}${versionPart}`;
  }

  /** Custom JSON stringification to omit branding field. */
  toJSON() {
    return {
      name: this.name,
      version: this.version,
      arch: this.arch,
    };
  }
}

/** Create a [PackageName] with validated values. */
export const createPackageName = AptPackageName.create;

/** Deserialize a JSON object to a [PackageName]. */
export const packageNameFromJSON = AptPackageName.fromJSON;

/**
 * Parses the APT text syntax (name[:arch][=version]) to a PackageName.
 * Returns null for any invalid input instead of throwing.
 */
export const deserializePackageName = (text: string): PackageName | null => {
  try {
    return AptPackageName.deserialize(text);
  } catch {
    return null;
  }
};

/**
 * Validates a package name string in name[:arch][=version] form.
 *
 * @throws ValidationError When the value is empty, too long, or not a valid APT package name.
 */
export function validatePackageName(name: string): void {
  validateAndCreateName(name);
}
