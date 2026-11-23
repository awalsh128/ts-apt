/**
 * Base error type for library-specific failures.
 */
export class TsAptError extends Error {
  /**
   * Creates a library error with a descriptive message.
   *
   * @param message Human-readable error message.
   */
  constructor(message: string) {
    super(message);
    this.name = "TsAptError";
  }
}

/**
 * Error raised when unsafe or invalid input is provided.
 */
export class ValidationError extends TsAptError {
  /**
   * Creates a validation failure.
   *
   * @param message Validation failure details.
   */
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Error raised when no suitable package manager is available.
 */
export class AvailabilityError extends TsAptError {
  /**
   * Creates an availability failure.
   *
   * @param message Availability failure details.
   */
  constructor(message: string) {
    super(message);
    this.name = "AvailabilityError";
  }
}

/**
 * Error raised when command execution exits unsuccessfully.
 */
export class CommandExecutionError extends TsAptError {
  /** Executable name used for the failed command. */
  public readonly command: string;
  /** Argument list used for the failed command. */
  public readonly args: string[];
  /** Exit code returned by the failed process. */
  public readonly exitCode: number;
  /** Captured standard error output. */
  public readonly stderr: string;
  /** Captured standard output output. */
  public readonly stdout: string;
  /** Signal that caused the process to terminate, if any. */
  public readonly signal?: NodeJS.Signals;

  /**
   * Creates a command execution error.
   *
   * @param params Structured command failure details.
   */
  constructor(params: {
    command: string;
    args: string[];
    exitCode: number;
    stderr: string;
    stdout: string;
    signal?: NodeJS.Signals;
  }) {
    super(
      `Command failed: ${params.command} ${params.args.join(" ")}\n` +
        `  stdout: ${params.stdout}\n` +
        `  stderr: ${params.stderr}\n` +
        `  exit code: ${params.exitCode})`,
    );
    this.name = "CommandExecutionError";
    this.command = params.command;
    this.args = params.args;
    this.exitCode = params.exitCode;
    this.stderr = params.stderr;
    this.stdout = params.stdout;
    this.signal = params.signal;
  }
}

/** Why apt cannot install a requested package. */
export type NotInstallableReason = "not-found" | "no-installation-candidate";

/** A requested package apt cannot install, as reported by `apt-get install`. */
export interface NotInstallablePackage {
  /** Package name as apt printed it. */
  readonly name: string;
  /** Why apt cannot install it. */
  readonly reason: NotInstallableReason;
  /**
   * Packages apt offers instead: the ones that replace an obsolete package, or the providers of a virtual
   * package. Empty when apt names none.
   */
  readonly alternatives: readonly string[];
}

/**
 * Error raised when `apt-get install` fails because a requested package cannot be installed (it doesn't
 * exist, or it is virtual or obsolete with no installation candidate).
 *
 * It extends {@link CommandExecutionError}, so callers that catch the general failure still see it.
 */
export class PackageNotInstallableError extends CommandExecutionError {
  /** The requested packages apt cannot install. */
  public readonly packages: readonly NotInstallablePackage[];

  /**
   * Creates a not-installable failure from the failed command and the packages parsed from its output.
   *
   * @param params The failed command's details, as for {@link CommandExecutionError}.
   * @param packages The requested packages apt cannot install.
   */
  constructor(
    params: ConstructorParameters<typeof CommandExecutionError>[0],
    packages: readonly NotInstallablePackage[],
  ) {
    super(params);
    this.name = "PackageNotInstallableError";
    this.packages = packages;
    this.message = `Cannot install ${packages
      .map((entry) => {
        const reason =
          entry.reason === "not-found"
            ? "not found"
            : "no installation candidate";
        const instead =
          entry.alternatives.length > 0
            ? `; apt offers: ${entry.alternatives.join(", ")}`
            : "";
        return `${entry.name} (${reason}${instead})`;
      })
      .join(", ")}\n${this.message}`;
  }
}
