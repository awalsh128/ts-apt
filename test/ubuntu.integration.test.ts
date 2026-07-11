import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { AptPackageManager, Binary } from "../src/manager.js";
import { AptOutputParser } from "../src/parser.js";
import { createPackageName } from "../src/package.js";
import { nullLogger } from "./common.js";
import { CommandRunner } from "../src/index.js";
import { DefaultCommandRunner } from "../src/commandRunner.js";
import type { CommandOptions, CommandResult } from "../src/types.js";
import {
  canRunIntegration,
  createIntegrationContext,
  installTestPackage,
  packageName,
  removeTestPackage,
  runWithTimeout,
} from "./ubuntu.integration.common.js";

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
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

(canRunIntegration ? describe : describe.skip)(
  "ubuntu integration for readonly operations",
  () => {
    let manager: AptPackageManager;
    let runner: CommandRunner;

    beforeAll(async () => {
      ({ manager, runner } = await createIntegrationContext());
      await installTestPackage(runner);
    }, 600_000);

    afterAll(async () => {
      if (!runner) {
        return;
      }
      await removeTestPackage(runner);
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
      const info = await manager.getPackageInfo([
        createPackageName(packageName),
      ]);

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
  },
);

describe("ubuntu integration for parallel execution semantics", () => {
  let manager: AptPackageManager;
  let runner: TrackingNoopDefaultRunner;

  beforeEach(() => {
    runner = new TrackingNoopDefaultRunner(125);
    manager = new AptPackageManager(
      false,
      runner,
      new AptOutputParser(nullLogger),
      nullLogger,
    );
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
      Promise.all([
        manager.autoClean(),
        manager.autoClean(),
        manager.autoClean(),
      ]),
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
