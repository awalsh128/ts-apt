import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:os";
import { CommandExecutionError } from "./errors.js";
import type { CommandOptions, CommandResult, CommandRunner } from "./types.js";
import winston from "winston";

/** Default process timeout for commands without an explicit timeout. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Standard exit code for a command that timed out. */
const TIMEOUT_EXIT_CODE = 124;

/** Time a timed out command has to exit after SIGTERM before it gets SIGKILL. */
const KILL_GRACE_MS = 5_000;

interface Output {
  stdout: string;
  stderr: string;
}

interface Exit {
  exitCode: number;
  signal?: NodeJS.Signals;
  timedOut: boolean;
}

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

/** Accumulates child output while mirroring it to the exec logger. */
function captureOutput(
  child: ChildProcess,
  execLogger: winston.Logger,
): Output {
  const output: Output = { stdout: "", stderr: "" };
  child.stdout?.on("data", (chunk: Buffer) => {
    const str = chunk.toString("utf8");
    output.stdout += str;
    execLogger.info(str);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const str = chunk.toString("utf8");
    output.stderr += str;
    execLogger.error(str);
  });
  return output;
}

/**
 * Waits for the child to finish, killing it if it exceeds the timeout.
 *
 * A timed out child gets SIGTERM, then SIGKILL if it is still running after
 * {@link KILL_GRACE_MS}.
 *
 * Rejects on spawn or stdin errors. Events after the first settlement are
 * no-ops because a promise settles only once.
 */
function waitForExit(child: ChildProcess, timeoutMs: number): Promise<Exit> {
  return new Promise<Exit>((resolve, reject) => {
    let timedOut = false;
    let killId: NodeJS.Timeout | undefined;
    // A timeout of zero or less means the command can run indefinitely.
    const timeoutId =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            killId = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
          }, timeoutMs)
        : undefined;
    const clearTimers = () => {
      clearTimeout(timeoutId);
      clearTimeout(killId);
    };

    child.on("error", (error) => {
      clearTimers();
      reject(error);
    });
    // A command can exit before reading all input; its exit code is reported
    // on exit, so the broken pipe is not an error.
    child.stdin?.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") reject(error);
    });
    // A killed process can leave descendants holding its output pipes open,
    // which delays "close", so a timed out command settles on "exit".
    child.on("exit", () => {
      clearTimers();
      if (timedOut) {
        resolve({ exitCode: TIMEOUT_EXIT_CODE, timedOut });
      }
    });
    // Node reports either an exit code or a terminating signal, never neither.
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (signal !== null) {
        resolve({
          exitCode: 128 + constants.signals[signal],
          signal,
          timedOut,
        });
      } else {
        resolve({ exitCode: code ?? 1, timedOut });
      }
    });
  });
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
   * Executes a command with optional environment, timeout, and standard input.
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

    const child = spawn(command, args, { env: getEnv(options), stdio: "pipe" });
    const output = captureOutput(child, this.execLogger);
    if (options.input !== undefined) {
      child.stdin?.end(options.input);
    }

    let exit: Exit;
    try {
      exit = await waitForExit(child, timeoutMs);
    } catch (error) {
      this.appLogger.error(
        `Command '${cmdLine}' failed with error:\n${JSON.stringify(error)}`,
      );
      throw error;
    }

    if (exit.exitCode === 0 && !exit.signal) {
      return { cmdLine, ...output, exitCode: 0 };
    }

    if (exit.timedOut) {
      const message = `Command '${cmdLine}' timed out after ${timeoutMs}ms`;
      this.appLogger.error(message);
      output.stderr +=
        (output.stderr && !output.stderr.endsWith("\n") ? "\n" : "") + message;
    }
    this.appLogger.error(
      `Command '${cmdLine}' failed with exit code ${exit.exitCode}` +
        `${exit.signal ? ` (signal: ${exit.signal})` : ""}:\n${output.stderr}`,
    );
    throw new CommandExecutionError({
      command,
      args,
      exitCode: exit.exitCode,
      stdout: output.stdout,
      stderr: output.stderr,
      signal: exit.signal,
    });
  }
}
