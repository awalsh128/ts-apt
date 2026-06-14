import { CommandExecutionError } from "../errors.js";
import type { CommandOptions, CommandResult, CommandRunner } from "../types.js";

/**
 * In-memory runner for deterministic unit tests.
 */
export class MockCommandRunner implements CommandRunner {
  /** Map of command keys to successful command results. */
  private readonly outputs = new Map<string, CommandResult>();
  /** Map of command keys to forced errors. */
  private readonly errors = new Map<string, Error>();
  /** Ordered call log for assertion in tests. */
  public readonly calls: Array<{
    /** Executable name used in the call. */
    command: string;
    /** Argument list used in the call. */
    args: string[];
    /** Execution options used in the call. */
    options: CommandOptions;
  }> = [];

  /**
   * Registers a successful mocked result.
   *
   * @param command Executable name.
   * @param args Command argument list.
   * @param result Result to return when matched.
   */
  setResult(command: string, args: string[], result: CommandResult): void {
    this.outputs.set(this.key(command, args), result);
  }

  /**
   * Registers a forced error for a command key.
   *
   * @param command Executable name.
   * @param args Command argument list.
   * @param error Error to throw when matched.
   */
  setError(command: string, args: string[], error: Error): void {
    this.errors.set(this.key(command, args), error);
  }

  /**
   * Executes a mocked command and records the call.
   *
   * @param command Executable name.
   * @param args Command argument list.
   * @param options Runner options.
   * @returns Mocked command result.
   */
  async run(
    command: string,
    args: string[] = [],
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    this.calls.push({ command, args, options });

    const key = this.key(command, args);
    const err = this.errors.get(key);
    if (err) {
      throw err;
    }

    const result = this.outputs.get(key);
    if (!result) {
      throw new CommandExecutionError({
        command,
        args,
        exitCode: 1,
        stderr: "",
        stdout: "",
        message: `no mock for command: ${key}`,
      });
    }

    return result;
  }

  /**
   * Builds a deterministic map key from command and arguments.
   *
   * @param command Executable name.
   * @param args Command argument list.
   * @returns Canonical command key string.
   */
  private key(command: string, args: string[]): string {
    return `${command} ${args.join(" ")}`.trim();
  }
}
