import { defineConfig } from "vitest/config";
import { describe, expect, test } from "vitest";
import {
  AptPackageManager,
  GLOBAL_APT_LOCK_WAIT_SECONDS,
  TIMEOUTS,
} from "../src/manager.js";
import { AptOutputParser } from "../src/parser.js";
import { createPackageName } from "../src/package.js";
import {
  createRealCommandRunner,
  getWorkspaceFilepath,
  nullLogger,
} from "./common.js";
import { CommandRunner } from "../src/index.js";
import { Mutex } from "async-mutex";

// TODO: Add a way to force devcontainer usage for testing with auto Docker setup. Added benefit are tests without APT side effects for mutating calls.
const forceDevcontainer = false; // Set to true to force devcontainer usage for testing

const packageName = "xdot"; // A small package that is likely to be present in most Ubuntu installations
const aptFastPath = getWorkspaceFilepath("scripts/apt-fast.sh"); // Path to the apt-fast script relative to the test file
const managerLockPath = "/tmp/ts-apt-manager.lock";
const integrationAptTimeoutMs = TIMEOUTS.install;

describe("ubuntu integration for readonly operations", () => {
  let manager: AptPackageManager;
  let runner: CommandRunner;

  const runLock = new Mutex(); // Mutex to serialize test execution due to shared APT lock files

  async function run(filepath: string, args: string[] = []): Promise<void> {
    await runLock.runExclusive(async () => {
      await runner.run(
        "flock",
        [
          "-w",
          GLOBAL_APT_LOCK_WAIT_SECONDS,
          managerLockPath,
          "sudo",
          "bash",
          filepath,
          ...args,
        ],
        { timeoutMs: integrationAptTimeoutMs },
      );
    });
  }

  beforeAll(async () => {
    runner = await createRealCommandRunner(
      nullLogger,
      nullLogger,
      forceDevcontainer,
    );
    await run(aptFastPath, ["install", "-y", packageName]); // Ensure package cache is up to date
    manager = new AptPackageManager(
      false,
      runner,
      new AptOutputParser(nullLogger),
      nullLogger,
    );
  }, 600_000);

  afterAll(async () => {
    await run(aptFastPath, ["remove", "-y", packageName]);
    await run(aptFastPath, ["autoremove", "-y"]); // Clean up any packages installed during tests
  }, 600_000);

  test("lists installed packages", async () => {
    const installed = await manager.listInstalled();

    expect(installed.length).toBeGreaterThan(0);
    expect(installed.some((pkg) => pkg.name.length > 0)).toBe(true);
  });

  test(`searches for ${packageName}`, async () => {
    let found = await manager.search([packageName], true);

    expect(found.length).toBeGreaterThan(0);
    expect(found.some((pkg) => pkg.name.includes(packageName))).toBe(true);
  });

  test(`gets ${packageName} package info`, async () => {
    const info = await manager.getPackageInfo([createPackageName(packageName)]);

    expect(info.length).toBeGreaterThan(0);
    expect(info[0]?.name).toBe(packageName);
    expect(info[0]?.version).toMatch(/\S/);
  });

  test(`lists files installed by ${packageName}`, async () => {
    const files = await manager.listInstalledFiles(
      createPackageName(packageName),
    );

    expect(files.length).toBeGreaterThan(0);
    expect(files.some((file) => file.includes(packageName))).toBe(true);
  });
});
