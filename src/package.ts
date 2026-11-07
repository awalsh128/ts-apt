import { PackageName } from "./types.js";
import { z } from "zod";
import { ValidationError } from "./errors.js";

/** Naive split of input name into not yet validated components. */
function splitInputName(input: string): {
  name: string;
  version?: string;
  arch?: string;
} {
  if (!input) {
    throw new ValidationError("Package name must not be empty.");
  }

  const splitOnce = (text: string, separator: string): [string, string?] => {
    const index = text.indexOf(separator);
    if (index === -1) {
      return [text];
    }
    return [text.slice(0, index), text.slice(index + separator.length)];
  };

  const [identity, version] = splitOnce(input, "=");
  const [name, arch] = splitOnce(identity, ":");
  return { name, version, arch };
}

class AptPackageName implements PackageName {
  readonly name: string;
  readonly version?: string;
  readonly arch?: string;

  private constructor(name: string, version?: string, arch?: string) {
    if (!name) {
      throw new ValidationError("Package name must not be empty.");
    }
    this.name = name;
    this.version = version;
    this.arch = arch;
  }

  compareTo(other: PackageName): number {
    return this.serialize().localeCompare(other.serialize());
  }

  static create(name: string, version?: string, arch?: string): PackageName {
    return new AptPackageName(name, version, arch);
  }

  static fromJSON(json: unknown): PackageName {
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
  }

  static deserialize(text: string): PackageName {
    const { name, version, arch } = splitInputName(text);
    return new AptPackageName(name, version, arch);
  }

  serialize(): string {
    const archPart = this.arch ? `:${this.arch}` : "";
    const versionPart = this.version ? `=${this.version}` : "";
    return `${this.name}${archPart}${versionPart}`;
  }
}

/** Create a [PackageName] with validated values. */
export function createPackageName(
  name: string,
  version?: string,
  arch?: string,
): PackageName {
  return AptPackageName.create(name, version, arch);
}

/** Deserialize a JSON object to a [PackageName]. */
export function packageNameFromJSON(json: unknown): PackageName {
  return AptPackageName.fromJSON(json);
}

/** Parses the APT text syntax (name[:arch][=version]) to a [PackageName]. */
export function deserializePackageName(text: string): PackageName {
  return AptPackageName.deserialize(text);
}
