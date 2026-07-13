import { afterEach, describe, expect, test, vi } from "vitest";
import { CommandRunner } from "../src/types.js";
import { CommandExecutionError } from "../src/errors.js";
import { createRealCommandRunner, nullLogger } from "./common.js";

async function createDefaultCommandRunner(): Promise<CommandRunner> {
  return createRealCommandRunner(nullLogger, nullLogger);
}

describe("default command runner", () => {
  test("captures stdout stderr and env", async () => {
    const runner = await createDefaultCommandRunner();
    const result = await runner.run(
      "bash",
      ["-lc", "echo out:$TEST_ENV; echo errline 1>&2"],
      { env: ["TEST_ENV=ok"] },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("out:ok");
    expect(result.stderr).toContain("errline");
  });

  test("ignores malformed env entries", async () => {
    const runner = await createDefaultCommandRunner();
    const result = await runner.run(
      "bash",
      ["-lc", "echo ${GOOD_ENV:-missing}"],
      { env: ["NOT_A_PAIR", "GOOD_ENV=present"] },
    );

    expect(result.stdout.trim()).toBe("present");
  });

  test("respects explicitly provided LC_ALL", async () => {
    const runner = await createDefaultCommandRunner();
    const result = await runner.run("bash", ["-lc", 'printf %s "$LC_ALL"'], {
      env: ["LC_ALL=C.UTF-8"],
    });

    expect(result.stdout).toBe("C.UTF-8");
  });

  test("throws CommandExecutionError on non-zero exit", async () => {
    const runner = await createDefaultCommandRunner();

    await expect(
      runner.run("bash", ["-lc", "echo fail 1>&2; exit 7"]),
    ).rejects.toMatchObject({
      name: "CommandExecutionError",
      exitCode: 7,
      command: "bash",
    } as Partial<CommandExecutionError>);
  });

  test("throws timeout error when command exceeds timeout", async () => {
    const runner = await createDefaultCommandRunner();

    await expect(
      runner.run("bash", ["-lc", "sleep 2"], { timeoutMs: 50 }),
    ).rejects.toMatchObject({
      name: "CommandExecutionError",
      exitCode: 124,
    } as Partial<CommandExecutionError>);
  });

  test("propagates spawn errors for missing executables", async () => {
    const runner = await createDefaultCommandRunner();

    await expect(
      runner.run("/definitely/missing-command"),
    ).rejects.toBeInstanceOf(Error);
  });

  test("propagates stdout and stderr to loggers", async () => {
    const infoSpy = vi.spyOn(nullLogger, "info");
    const errorSpy = vi.spyOn(nullLogger, "error");
    const runner = await createRealCommandRunner(nullLogger, nullLogger);

    await runner.run("bash", ["-lc", "echo test_out; echo test_err 1>&2"]);

    expect(infoSpy).toHaveBeenCalledWith(
      "Executing command: bash -lc echo test_out; echo test_err 1>&2",
    );
    expect(infoSpy).toHaveBeenCalledWith("test_out\n");
    expect(errorSpy).toHaveBeenCalledWith("test_err\n");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
