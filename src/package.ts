import { PackageName } from "./types.js";
import { ValidationError } from "./errors.js";

const PACKAGE_NAME_REGEX =
  /^([a-z0-9][a-z0-9+.-]*)(?:\/([a-zA-Z0-9_-]+))?(?:=([a-zA-Z0-9.+:~-]+))?$/;
const LEGAL_CHARS_REGEX = /[^\w.+:~=-]/;

class AptPackageName implements PackageName {
  name: string;
  version?: string;
  distro?: string;

  constructor(name: string, version?: string, distro?: string) {
    this.name = name;
    this.version = version;
    this.distro = distro;
  }

  serialize(): string {
    const prefix = this.distro ? `${this.name}/${this.distro}` : `${this.name}`;
    return this.version ? `${prefix}=${this.version}` : `${prefix}`;
  }
}

export function createPackageName(
  name: string,
  version?: string,
  distro?: string,
): PackageName {
  const item = new AptPackageName(name, version, distro);
  validatePackageName(item.serialize());
  return item;
}

export function deserializePackageName(text: string): PackageName | null {
  const [_, name, distro, version] = text.match(PACKAGE_NAME_REGEX) || [];
  if (!name) {
    return null;
  }
  return new AptPackageName(name, version, distro);
}

/**
 * Validates a single package name or keyword token.
 *
 * @param name Package name or keyword token.
 * @throws ValidationError When the value is empty, too long, or unsafe.
 */
export function validatePackageName(serializedName: string): void {
  if (!serializedName) {
    throw new ValidationError(
      `Invalid package name: "${serializedName}". Must not be empty.`,
    );
  }
  const [_, name, _distro, _version] =
    serializedName.match(PACKAGE_NAME_REGEX) || [];
  if (!name) {
    throw new ValidationError(
      `Invalid package name: "${serializedName}". Must be a valid APT package name or keyword.`,
    );
  }
  if (serializedName.length > 255) {
    throw new ValidationError(
      `Invalid package name: "${serializedName}". Must be 255 characters or less.`,
    );
  }
  if (/[^\w.+:~=-]/.test(serializedName)) {
    throw new ValidationError(
      `Invalid package name: "${serializedName}". Must not contain unsafe characters.`,
    );
  }
}
