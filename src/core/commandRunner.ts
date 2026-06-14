import { spawn } from "node:child_process";
import { CommandExecutionError } from "../errors.js";
import type { CommandOptions, CommandResult, CommandRunner } from "../types.js";

/** Default process timeout for commands without an explicit timeout. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Production command runner backed by child_process spawn.
 */
export class DefaultCommandRunner implements CommandRunner {
  /**
   * Executes a command with optional environment, timeout, and interactive mode.
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
    const interactive = options.interactive ?? false;

    return await new Promise<CommandResult>((resolve, reject) => {
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

      if (!interactive && !env.LC_ALL) {
        env.LC_ALL = "C";
      }

      const child = spawn(command, args, {
        env,
        stdio: interactive ? "inherit" : "pipe",
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

      if (!interactive) {
        child.stdout?.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });
      }

      child.on("error", (error) => {
        finalize(() => reject(error));
      });

      child.on("close", (code) => {
        const exitCode = code ?? 1;
        finalize(() => {
          if (exitCode === 0) {
            resolve({ stdout, stderr, exitCode });
            return;
          }
          reject(
            new CommandExecutionError({
              command,
              args,
              exitCode,
              stdout,
              stderr,
            }),
          );
        });
      });

      timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
        finalize(() => {
          reject(
            new CommandExecutionError({
              command,
              args,
              exitCode: 124,
              stdout,
              stderr,
              message: `Command timed out after ${timeoutMs}ms: ${command}`,
            }),
          );
        });
      }, timeoutMs);
    });
  }
}
