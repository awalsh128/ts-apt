import { readFileSync } from "fs";
import path, { dirname, resolve } from "path";
import { CommandExecutionError } from "../src/errors.js";
import type {
  CommandOptions,
  CommandResult,
  CommandRunner,
} from "../src/types.js";
import { Binary, BinaryName } from "../src/manager.js";
import winston from "winston";
import { DefaultCommandRunner } from "../src/commandRunner.js";
import {
  createDevcontainerCommandRunner,
  getDevcontainerSupport,
} from "./devContainer.js";
import { fileURLToPath } from "url";
export { createDevcontainerCommandRunner, getDevcontainerSupport };

export const nullLogger = winston.createLogger({
  level: "debug",
  silent: true, // Disables all logging
  transports: [
    new winston.transports.Console(), // Transport exists but writes nothing
  ],
});

export function getWorkspaceFilepath(workspaceFilepath: string): string {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    workspaceFilepath,
  );
}

/**
 * In-memory runner for deterministic unit tests.
 */
export class FakeCommandRunner implements CommandRunner {
  private readonly cmdLineToResult: Map<string, CommandResult>;

  constructor(cmdLineToResult: Map<string, CommandResult>) {
    this.cmdLineToResult = cmdLineToResult;
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
    const cmdLine = `${command} ${args.join(" ")}`.trim();
    const result = this.cmdLineToResult.get(cmdLine);

    if (!result) {
      throw new CommandExecutionError({
        command,
        args,
        exitCode: 1,
        stderr: `no mock for command line: ${cmdLine}`,
        stdout: "",
      });
    }

    return result;
  }
}

type CommandCall = {
  command: string;
  args: string[];
  options: CommandOptions;
};

/**
 * Mutable in-memory runner for tests that need to script responses per command line.
 */
export class MockCommandRunner implements CommandRunner {
  readonly calls: CommandCall[] = [];
  private readonly cmdLineToResult = new Map<string, CommandResult>();
  private readonly cmdLineToError = new Map<string, Error>();

  setResult(
    command: string,
    args: string[],
    result: Omit<CommandResult, "cmdLine">,
  ): void {
    const cmdLine = `${command} ${args.join(" ")}`.trim();
    this.cmdLineToResult.set(cmdLine, { ...result, cmdLine });
  }

  setError(command: string, args: string[], error: Error): void {
    const cmdLine = `${command} ${args.join(" ")}`.trim();
    this.cmdLineToError.set(cmdLine, error);
  }

  async run(
    command: string,
    args: string[] = [],
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    this.calls.push({ command, args, options });
    const cmdLine = `${command} ${args.join(" ")}`.trim();

    const error = this.cmdLineToError.get(cmdLine);
    if (error) {
      throw error;
    }

    const result = this.cmdLineToResult.get(cmdLine);
    if (result) {
      return result;
    }

    throw new CommandExecutionError({
      command,
      args,
      exitCode: 1,
      stderr: `no mock for command line: ${cmdLine}`,
      stdout: "",
    });
  }
}

function getFileText(filename: string): string {
  const testDataDir = resolve(__dirname, "data");
  return readFileSync(resolve(testDataDir, filename), "utf8");
}

export function deserializeCommandResult(filepath: string): CommandResult {
  const text = getFileText(filepath);

  const cmdLine = text.match(/^\*\*\*\sCMD_LINE\s(.+)/)?.[1]?.trim();
  const exitCodeStr = text.match(/\*\*\*\sEXIT_CODE\s(\d+)/)?.[1]?.trim();
  const stdout = text.match(
    /\*\*\*\sSTDOUT\r?\n([\s\S]*?)\r?\n?\*\*\*\sSTDERR/,
  )?.[1];
  const stderr = text.match(/\*\*\*\sSTDERR\r?\n([\s\S]*)/)?.[1];

  if (!cmdLine) {
    throw new Error(`${filepath}: CMD_LINE section not found in log file`);
  }

  if (!exitCodeStr) {
    throw new Error(`${filepath}: EXIT_CODE section not found in log file`);
  }

  const exitCode = parseInt(exitCodeStr, 10);
  if (isNaN(exitCode)) {
    throw new Error(
      `${filepath}: EXIT_CODE ${exitCodeStr} is not a valid number`,
    );
  }

  if (stdout === undefined) {
    throw new Error(`${filepath}: STDOUT section not found in log file`);
  }

  if (stderr === undefined) {
    throw new Error(`${filepath}: STDERR section not found in log file`);
  }

  return {
    cmdLine: cmdLine,
    exitCode: exitCode,
    stdout: stdout,
    stderr: stderr,
  };
}

export function createFakeCommandRunner(filename: string): CommandRunner {
  return new FakeCommandRunner(
    new Map(
      Object.entries(
        JSON.parse(getFileText(filename)) as Record<string, CommandResult>,
      ),
    ),
  );
}

export async function createRealCommandRunner(
  appLogger: winston.Logger,
  execLogger: winston.Logger,
  forceDevcontainer: boolean = false,
): Promise<CommandRunner> {
  if (process.env.GITHUB_ACTIONS === "true") {
    appLogger.info(
      "Running in GitHub Actions, using DefaultCommandRunner instead of DevcontainerCommandRunner",
    );
    return new DefaultCommandRunner(appLogger, execLogger);
  }
  try {
    return await createDevcontainerCommandRunner(appLogger, execLogger);
  } catch (err) {
    if (forceDevcontainer) {
      throw err;
    }
    appLogger.warn(
      `Failed to create DevcontainerCommandRunner, falling back to DefaultCommandRunner: ${err}`,
    );
    return new DefaultCommandRunner(appLogger, execLogger);
  }
}
