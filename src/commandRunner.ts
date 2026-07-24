import { spawn } from "node:child_process";
import { CommandExecutionError } from "./errors.js";
import type { CommandOptions, CommandResult, CommandRunner } from "./types.js";
import winston from "winston";

/** Default process timeout for commands without an explicit timeout. */
const DEFAULT_TIMEOUT_MS = 30_000;

function getEnv(options: CommandOptions) {
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

  env.LC_ALL ??= "C";
  return env;
}

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
      const child = spawn(command, args, {
        env: getEnv(options),
        stdio: "pipe",
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      // eslint-disable-next-line prefer-const
      let timeoutId: NodeJS.Timeout | undefined;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        // Remove listeners to prevent memory leaks if process hangs
        child.removeAllListeners();
      };

      const execError = (exitCode: number, signal?: NodeJS.Signals) => {
        const error = new CommandExecutionError({
          command,
          args,
          exitCode,
          stdout,
          stderr,
          signal,
        });
        this.appLogger.error(
          `Command '${cmdLine}' failed with exit code ${exitCode}` +
            `${signal ? ` (signal: ${signal})` : ""}:\n${stderr}`,
        );
        return error;
      };

      /**
       * Ensures promise resolution or rejection happens once.
       *
       * @param fn Finalizer callback to execute once settled.
       */
      const finalize = (
        status: "success" | "error",
        result?: CommandResult,
        error?: Error,
      ) => {
        if (settled) return;
        settled = true;
        cleanup();

        if (status === "success" && result) {
          resolve(result);
        } else {
          reject(error ?? execError(1));
        }
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

      child.on("error", (error: Error) => {
        this.appLogger.error(
          `Command '${cmdLine}' failed with error:\n${JSON.stringify(error)}`,
        );
        finalize("error", undefined, error);
      });

      child.on("close", (code?: number, signal?: NodeJS.Signals) => {
        // Prevent double handling if timeout fired first
        if (settled) return;

        const exitCode = code ?? (signal ? 128 : 1); // Handle signal termination
        const isSuccess = exitCode === 0 && !signal;

        if (isSuccess) {
          finalize("success", { cmdLine, stdout, stderr, exitCode: 0 });
        } else {
          finalize("error", undefined, execError(exitCode, signal));
        }
      });

      timeoutId = setTimeout(() => {
        if (settled) return;

        const message = `Command '${cmdLine}' timed out after ${timeoutMs}ms`;
        this.appLogger.error(message);

        child.kill("SIGTERM");

        stderr ??= message;
        // Standard timeout exit code
        finalize("error", undefined, execError(124));
      }, timeoutMs);
    });
  }
}
