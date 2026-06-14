import { ValidationError } from "../errors.js";

/** Whitelist regex used to validate package names and keyword tokens. */
const PACKAGE_NAME_REGEX = /^[a-zA-Z0-9\-_.+=:/]+$/;

/**
 * Validates a single package name or keyword token.
 *
 * @param name Package name or keyword token.
 * @throws ValidationError When the value is empty, too long, or unsafe.
 */
export function validatePackageName(name: string): void {
  if (name.length === 0) {
    throw new ValidationError("package name cannot be empty");
  }

  if (name.length > 255) {
    throw new ValidationError("package name too long (max 255 characters)");
  }

  if (!PACKAGE_NAME_REGEX.test(name)) {
    throw new ValidationError(
      "invalid package name: contains potentially dangerous characters",
    );
  }
}

/**
 * Validates multiple package names or keyword tokens.
 *
 * @param names Values to validate.
 * @throws ValidationError When any entry is invalid.
 */
export function validatePackageNames(names: string[]): void {
  for (const name of names) {
    validatePackageName(name);
  }
}
