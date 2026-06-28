import path from "node:path";
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
  private readonly appLogger: winston.Logger;
  private readonly execLogger: winston.Logger;

  constructor(appLogger: winston.Logger, execLogger: winston.Logger) {
    this.appLogger = appLogger;
    this.execLogger = execLogger;
  }

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
    const cmdLine = `${command} ${args.join(" ")}`;
    this.appLogger.info(`Executing command: ${cmdLine}`);

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

      if (!env.LC_ALL) {
        env.LC_ALL = "C";
      }

      const child = spawn(command, args, {
        env,
        stdio: "pipe",
      });

      let stdout = "";
      let stderr = "";
      let combinedOut = "";
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

      child.stdout?.on("data", (chunk: Buffer) => {
        const str = chunk.toString("utf8");
        stdout += str;
        this.execLogger.info(str);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        const str = chunk.toString("utf8");
        stderr += str;
        this.execLogger.error(str);
      });

      child.on("error", (error) => {
        this.appLogger.error(
          `Command '${cmdLine}' failed with error:\n${JSON.stringify(error)}`,
        );
        finalize(() => reject(error));
      });

      child.on("close", (code) => {
        const exitCode = code ?? 1;
        finalize(() => {
          if (exitCode === 0) {
            resolve({
              cmdLine,
              stdout,
              stderr,
              exitCode,
            });
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
        const message = `Command '${cmdLine}' timed out after ${timeoutMs}ms`;
        this.appLogger.error(message);
        finalize(() => {
          reject(
            new CommandExecutionError({
              command,
              args,
              exitCode: 124,
              stdout,
              stderr,
              message,
            }),
          );
        });
      }, timeoutMs);
    });
  }
}
