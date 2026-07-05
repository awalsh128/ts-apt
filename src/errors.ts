/**
 * Base error type for library-specific failures.
 */
export class TsAptError extends Error {
  /**
   * Creates a library error with a descriptive message.
   *
   * @param message Human-readable error message.
   * @param cause Original error that caused this error.
   */
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    // Dynamically sets name to the actual class being instantiated
    this.name = new.target.name;
    // Allows for proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Automatically captures ALL own properties (enumerable or not),
   * including 'cause', 'stack', and child-class properties.
   */
  public toJSON() {
    const json: Record<string, any> = {};

    // Get all own property names (includes non-enumerable like 'cause', 'stack')
    const props = Object.keys(this);

    for (const key of props) {
      // Skip internal properties if desired
      if (key === "constructor") continue;

      // Access the value directly (works for enumerable and non-enumerable)
      const value = (this as any)[key];

      // Prevent circular references in 'cause' if needed
      if (key === "cause" && value instanceof Error) {
        json[key] = {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      } else {
        json[key] = value;
      }
    }

    // Ensure 'stack' and 'name' are always present (sometimes missed if not own props in some runtimes)
    if (!json.stack) json.stack = this.stack;
    if (!json.name) json.name = this.name;
    if (!json.message) json.message = this.message;

    return json;
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
   * @param cause Original error that caused this error.
   */
  constructor(message: string, cause?: Error) {
    super(message, cause);
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
   * @param cause Original error that caused this error.
   */
  constructor(message: string, cause?: Error) {
    super(message, cause);
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
   * @param cause Original error that caused this error.
   */
  constructor(
    params: {
      command: string;
      args: string[];
      exitCode: number;
      stderr: string;
      stdout: string;
    },
    cause?: Error,
  ) {
    super(`Command execution failed`, cause);
    this.command = params.command;
    this.args = params.args;
    this.exitCode = params.exitCode;
    this.stderr = params.stderr;
    this.stdout = params.stdout;
  }
}
