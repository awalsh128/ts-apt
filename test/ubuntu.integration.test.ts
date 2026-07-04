import { defineConfig } from "vitest/config";
import { beforeEach, describe, expect, test } from "vitest";
import {
  AptPackageManager,
  Binary,
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
import { DefaultCommandRunner } from "../src/commandRunner.js";
import type { CommandOptions, CommandResult } from "../src/types.js";

// TODO: Add a way to force devcontainer usage for testing with auto Docker setup. Added benefit are tests without APT side effects for mutating calls.
const forceDevcontainer = false; // Set to true to force devcontainer usage for testing

const packageName = "xdot"; // A small package that is likely to be present in most Ubuntu installations
const aptFastPath = getWorkspaceFilepath("scripts/apt-fast.sh"); // Path to the apt-fast script relative to the test file
const managerLockPath = "/tmp/ts-apt-manager.lock";
const integrationAptTimeoutMs = TIMEOUTS.install;

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function runWithTimeout<T>(
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

class TrackingNoopDefaultRunner extends DefaultCommandRunner {
  public inFlight = 0;
  public maxInFlight = 0;
  public readCalls = 0;
  public writeCalls = 0;

  constructor(private readonly artificialDelayMs: number) {
    super(nullLogger, nullLogger);
  }

  override async run(
    command: string,
    args: string[] = [],
    _options: CommandOptions = {},
  ): Promise<CommandResult> {
    const isWrite =
      command === "flock" &&
      args[2] === managerLockPath &&
      [Binary.AptGet.path, Binary.AptFast.path].includes(args[3] ?? "");
    if (isWrite) {
      this.writeCalls += 1;
    } else {
      this.readCalls += 1;
    }

    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      await sleep(this.artificialDelayMs);
      const cmdLine = `${command} ${args.join(" ")}`.trim();

      if (command === Binary.DpkgQuery.path && args[0] === "-W") {
        return {
          cmdLine,
          stdout: "bash:amd64=5.2.21-2ubuntu4\n",
          stderr: "",
          exitCode: 0,
        };
      }

      return {
        cmdLine,
        stdout: "",
        stderr: "",
        exitCode: 0,
      };
    } finally {
      this.inFlight -= 1;
    }
  }
}

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

describe("ubuntu integration for parallel execution semantics", () => {
  let manager: AptPackageManager;
  let runner: TrackingNoopDefaultRunner;

  beforeEach(() => {
    runner = new TrackingNoopDefaultRunner(125);
    manager = new AptPackageManager(false, runner, new AptOutputParser(nullLogger), nullLogger);
  });

  test("only reads run in parallel and do not hang", async () => {
    const results = await runWithTimeout(
      Promise.all([
        manager.listInstalled(),
        manager.listInstalled(),
        manager.listInstalled(),
      ]),
      5_000,
      "parallel read operations",
    );

    expect(results.every((pkgs) => pkgs.length > 0)).toBe(true);
    expect(runner.writeCalls).toBe(0);
    expect(runner.maxInFlight).toBeGreaterThan(1);
  });

  test("only writes are serialized by the global lock and mutex", async () => {
    await runWithTimeout(
      Promise.all([manager.autoClean(), manager.autoClean(), manager.autoClean()]),
      5_000,
      "parallel write operations",
    );

    expect(runner.readCalls).toBe(0);
    expect(runner.writeCalls).toBe(3);
    expect(runner.maxInFlight).toBe(1);
  });

  test("mixed reads and writes do not hang and preserve lock semantics", async () => {
    const [, installed] = await runWithTimeout(
      Promise.all([manager.autoClean(), manager.listInstalled()]),
      5_000,
      "mixed read/write operations",
    );

    expect(installed.length).toBeGreaterThan(0);
    expect(runner.readCalls).toBe(1);
    expect(runner.writeCalls).toBe(1);
    expect(runner.maxInFlight).toBeGreaterThan(1);
  });
});
