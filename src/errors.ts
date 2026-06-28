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
  }
}
