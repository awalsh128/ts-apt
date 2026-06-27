import { readFileSync } from "fs";
import { resolve } from "path";
import { CommandExecutionError } from "../src/errors.js";
import type {
  CommandOptions,
  CommandResult,
  CommandRunner,
} from "../src/types.js";
import winston from "winston";

export const nullLogger = winston.createLogger({
  level: "fatal",
  format: winston.format.printf(() => ""),
  transports: undefined,
});

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
        stderr: "",
        stdout: "",
        message: `no mock for command line: ${cmdLine}`,
      });
    }

    return result;
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
