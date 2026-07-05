import { spawn } from "node:child_process";
import { CommandExecutionError } from "./errors.js";
import type { CommandOptions, CommandResult, CommandRunner } from "./types.js";
import winston from "winston";

/** Default process timeout for commands without an explicit timeout. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Production command runner backed by child_process spawn.
 */
export class DefaultCommandRunner implements CommandRunner {
  private readonly appLogger?: winston.Logger;
  private readonly execLogger?: winston.Logger;

  constructor(appLogger?: winston.Logger, execLogger?: winston.Logger) {
    this.appLogger = appLogger;
    this.execLogger = execLogger;
  }

  private getEnvMap(options: CommandOptions): {
    [key: string]: string | undefined;
  } {
    const env = { ...process.env };
    for (const pair of options.env ?? []) {
      const idx = pair.indexOf("=");
      if (idx <= 0) {
        continue;
      }
      const key = pair.slice(0, idx);
      const value = pair.slice(idx + 1);
      env[key] = value;
    }

    if (!env.LC_ALL) {
      env.LC_ALL = "C"; // Always force the english locale to avoid localized output that breaks parsing.
    }
    return env;
  }

  /** Determine exit code: use code if available, else map signal to 137 (SIGKILL) or 143 (SIGTERM) */
  private getFinalExitCode(
    code: number | null,
    signal: NodeJS.Signals | null,
  ): number {
    if (code !== null) {
      return code;
    } else if (signal === "SIGTERM") {
      return 143; // Standard for SIGTERM (128 + 14)
    } else if (signal === "SIGKILL") {
      return 137; // Standard for SIGKILL (128 + 9)
    }
    return 1; // Fallback for unknown signal
  }

  /**
   * Executes a command with optional environment and timeout.
   *
   * NOTE: Signalled terminations (e.g., SIGTERM, SIGKILL) are mapped to exit codes 143 and 137 respectively.
   *
   * WARNING: Some commands will buffer output when not attached to a terminal.
   * For those cases, stdbuf will need to be passed in.
   *
   * @param command Executable name.
   * @param args Command argument list.
   * @param options Execution options.
   * @returns Captured command output.
   * @throws CommandExecutionError On non-zero exit or timeout.
   */
  async run(
    command: string,
    args: string[] = [],
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const cmdLineText = `${command} ${args.join(" ")}`;
    this.appLogger?.info(`Executing command: ${cmdLineText}`);

    return await new Promise<CommandResult>((resolve, reject) => {
      const env = this.getEnvMap(options);

      // Wrap with 'stdbuf' to prevent buffering issues
      const child = spawn(command, args, {
        env,
        stdio: "pipe",
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      let timeoutId: NodeJS.Timeout | undefined;

      /**
       * Ensures promise resolution or rejection happens once.
       *
       * @param fn Finalizer callback to execute once settled.
       */
      const finalize = (fn: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        fn();
      };

      // 1. Attach 'error' FIRST (Critical for crash safety)
      child.on("error", (error) => {
        this.appLogger?.error(
          `Command '${cmdLineText}' failed with error:\n${JSON.stringify(error)}`,
        );
        finalize(() => reject(error));
      });

      // 2. Attach 'stdout' and 'stderr' stream listeners (Capture output)
      child.stdout?.on("data", (chunk: Buffer) => {
        const str = chunk.toString("utf8");
        stdout += str;
        this.execLogger?.info(str);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        const str = chunk.toString("utf8");
        stderr += str;
        this.execLogger?.error(str);
      });

      // 3. Attach 'timeout' logic (Handles long-running commands)
      timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
        this.appLogger?.error(
          `Command '${cmdLineText}' timed out after ${timeoutMs}ms sending SIGTERM.`,
        );
      }, timeoutMs);

      // 4. Attach 'close' last (Handles exit logic)
      child.on("close", (code, signal) => {
        // Handle signal-based termination (e.g., SIGTERM from timeout)
        if (signal) {
          this.appLogger?.warn(
            `Command '${cmdLineText}' terminated by signal: ${signal}`,
          );
        }

        finalize(() => {
          const finalExitCode = this.getFinalExitCode(code, signal);

          if (finalExitCode === 0) {
            resolve({
              command,
              args,
              stdout,
              stderr,
              exitCode: 0,
            });
          } else {
            reject(
              new CommandExecutionError({
                command,
                args,
                exitCode: finalExitCode,
                stdout,
                stderr,
              }),
            );
          }
        });
      });
    });
  }
}
