import { Mutex } from "async-mutex";
import { expect } from "vitest";
import { AptPackageManager } from "../src/manager.js";
import { AptOutputParser } from "../src/parser.js";
import type { CommandRunner } from "../src/index.js";
import {
  createRealCommandRunner,
  getDevcontainerSupport,
  getWorkspaceFilepath,
  nullLogger,
} from "./common.js";

export const forceDevcontainer =
  process.env.TS_APT_FORCE_DEVCONTAINER === "true";

export const packageName = "xdot";
export const secondaryPackageName = "python3";
export const missingPackageName = "nonexistentpackage";
export const virtualPackageName = "libvips";
export const multiSearchKeyword = "vim";
export const aptFastPath = getWorkspaceFilepath("scripts/dist/apt-fast.sh");
export const integrationAptTimeoutMs = 120_000;

const managerLockPath = "/tmp/tsapt-integration-tests.lock";
const devcontainerSupport = getDevcontainerSupport();
const runLock = new Mutex();

export const canRunIntegration =
  !forceDevcontainer || devcontainerSupport.supported;
export const canRunMutatingIntegration =
  forceDevcontainer && devcontainerSupport.supported;

export type IntegrationContext = {
  manager: AptPackageManager;
  runner: CommandRunner;
};

export async function runWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function createIntegrationContext(): Promise<IntegrationContext> {
  const runner = await createRealCommandRunner(
    nullLogger,
    nullLogger,
    forceDevcontainer,
  );
  const manager = new AptPackageManager(
    false,
    runner,
    new AptOutputParser(nullLogger),
    -1,
    nullLogger,
  );
  return { manager, runner };
}

export async function runScript(
  runner: CommandRunner,
  filepath: string,
  args: string[] = [],
): Promise<void> {
  await runLock.runExclusive(async () => {
    const shellArgs = forceDevcontainer
      ? ["bash", filepath, ...args]
      : ["sudo", "bash", filepath, ...args];
    await runner.run("flock", ["-w", "120", managerLockPath, ...shellArgs], {
      timeoutMs: integrationAptTimeoutMs,
    });
  });
}

export async function installTestPackage(runner: CommandRunner): Promise<void> {
  await runScript(runner, aptFastPath, ["install", "-y", packageName]);
}

export async function removeTestPackage(runner: CommandRunner): Promise<void> {
  await runScript(runner, aptFastPath, ["remove", "-y", packageName]);
  await runScript(runner, aptFastPath, ["autoremove", "-y"]);
}

export async function ensurePackageMissing(
  runner: CommandRunner,
): Promise<void> {
  await runScript(runner, aptFastPath, ["remove", "-y", packageName]);
  await runScript(runner, aptFastPath, ["autoremove", "-y"]);
}

export function expectNamedEntries<T extends { name: string }>(
  entries: T[],
  expectedNames: string[],
): void {
  expect(entries).toEqual(
    expect.arrayContaining(
      expectedNames.map((name) => expect.objectContaining({ name })),
    ),
  );
}
