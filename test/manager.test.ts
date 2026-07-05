import { afterEach, describe, expect, test, vi } from "vitest";
import winston from "winston";
import { CommandExecutionError, ValidationError } from "../src/errors.js";
import { DefaultCommandRunner } from "../src/commandRunner.js";
import { AptOutputParser } from "../src/parser.js";
import {
  AptPackageManager,
  Binary,
  createPackageManager,
} from "../src/manager.js";
import type { PackageName } from "../src/types.js";
import { MockCommandRunner, getWorkspaceFilepath } from "./common.js";

const logger = winston.createLogger({
  level: "silent",
  transports: [new winston.transports.Console()],
});

function pkg(serializedName: string): PackageName {
  return {
    name: serializedName,
    serialize(): string {
      return serializedName;
    },
  };
}

function createManager(
  runner: MockCommandRunner,
  aptFastEnabled = false,
  aptLockTimeoutSeconds = -1,
): AptPackageManager {
  return new AptPackageManager(
    aptFastEnabled,
    runner,
    new AptOutputParser(logger),
    aptLockTimeoutSeconds,
    logger,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

const aptFastPath = getWorkspaceFilepath("scripts/apt-fast.sh");
const aptCachePath = Binary.AptCache.path;
const aptGetPath = Binary.AptGet.path;

describe("apt manager", () => {
  test("install builds expected command", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptGetPath,
      [
        "--quiet=0",
        "-y",
        "-o",
        "DPkg::Lock::Timeout=-1",
        "install",
        "-f",
        "vim",
      ],
      {
        stdout: "Setting up vim (2:9.0) ...\n",
        stderr: "",
        exitCode: 0,
      },
    );

    const out = await createManager(runner).install([pkg("vim")]);

    expect(out.success).toHaveLength(1);
    expect(runner.calls[0]?.command).toBe(aptGetPath);
    expect(runner.calls[0]?.args).toEqual([
      "--quiet=0",
      "-y",
      "-o",
      "DPkg::Lock::Timeout=-1",
      "install",
      "-f",
      "vim",
    ]);
  });

  test("auto clean executes mutating binary command", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptGetPath,
      ["--quiet=0", "-y", "-o", "DPkg::Lock::Timeout=-1", "autoclean"],
      {
        stdout: "Done",
        stderr: "",
        exitCode: 0,
      },
    );

    await createManager(runner).autoClean();

    expect(runner.calls[0]?.args).toEqual([
      "--quiet=0",
      "-y",
      "-o",
      "DPkg::Lock::Timeout=-1",
      "autoclean",
    ]);
  });

  test("auto remove parses removed packages", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptGetPath,
      ["--quiet=0", "-y", "-o", "DPkg::Lock::Timeout=-1", "autoremove"],
      {
        stdout: "Removing vim (2:9.0) ...\n",
        stderr: "",
        exitCode: 0,
      },
    );

    const out = await createManager(runner).autoRemove();

    expect(out).toEqual([
      { name: "vim", arch: undefined, version: "2:9.0", status: "available" },
    ]);
  });

  test("list installed returns dpkg-query parsed packages", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      Binary.DpkgQuery.path,
      ["-W", "-f", "${binary:Package}=${Version}\\n"],
      {
        stdout: "vim:amd64=2:9.0\n",
        stderr: "",
        exitCode: 0,
      },
    );

    const out = await createManager(runner).listInstalled();

    expect(out[0]).toMatchObject({
      name: "vim",
      arch: "amd64",
      version: "2:9.0",
      status: "installed",
    });
  });

  test("list installed files trims blank lines", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(Binary.DpkgQuery.path, ["-L", "vim"], {
      stdout: "/usr/bin/vim\n\n /usr/share/doc/vim \n",
      stderr: "",
      exitCode: 0,
    });

    const files = await createManager(runner).listInstalledFiles(pkg("vim"));

    expect(files).toEqual(["/usr/bin/vim", "/usr/share/doc/vim"]);
  });

  test("list upgradable parses apt output", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptGetPath,
      [
        "--quiet=0",
        "-y",
        "-o",
        "APT::Get::Show-User-Simulation-Note=false",
        "-V",
        "--simulate",
        "dist-upgrade",
      ],
      {
        stdout: "Inst vim [2:8.2] (2:9.0 Ubuntu:focal-updates [amd64])\n",
        stderr: "",
        exitCode: 0,
      },
    );

    const out = await createManager(runner).listUpgradable();

    expect(out.success[0]).toMatchObject({
      name: "vim",
      version: "2:8.2",
      arch: "amd64",
      status: "upgradeable",
    });
  });

  test("search parses apt results", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(aptCachePath, ["--quiet=0", "search", "vim"], {
      stdout: ["vim - editor", "foo - tool"].join("\n"),
      stderr: "",
      exitCode: 0,
    });

    const out = await createManager(runner).search(["vim"]);

    expect(out).toEqual([
      { name: "vim", description: "editor" },
      { name: "foo", description: "tool" },
    ]);
  });

  test("search propagates command failures", async () => {
    const runner = new MockCommandRunner();
    runner.setError(
      aptCachePath,
      ["--quiet=0", "search", "ghostpkg"],
      new CommandExecutionError({
        command: aptCachePath,
        args: ["--quiet=0", "search", "ghostpkg"],
        exitCode: 1,
        stdout: "",
        stderr: "E: unable to locate package ghostpkg",
      }),
    );

    await expect(
      createManager(runner).search(["ghostpkg"]),
    ).rejects.toBeInstanceOf(CommandExecutionError);
  });

  test("remove includes --autoremove by default", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptGetPath,
      [
        "--quiet=0",
        "-y",
        "-o",
        "DPkg::Lock::Timeout=-1",
        "remove",
        "-f",
        "vim",
        "--autoremove",
      ],
      {
        stdout: "Removing vim (2:9.0) ...\n",
        stderr: "",
        exitCode: 0,
      },
    );

    await createManager(runner).remove([pkg("vim")]);

    expect(runner.calls[0]?.args).toContain("--autoremove");
  });

  test("remove can disable --autoremove", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptGetPath,
      [
        "--quiet=0",
        "-y",
        "-o",
        "DPkg::Lock::Timeout=-1",
        "remove",
        "-f",
        "vim",
      ],
      {
        stdout: "Removing vim (2:9.0) ...\n",
        stderr: "",
        exitCode: 0,
      },
    );

    await createManager(runner).remove([pkg("vim")], false);

    expect(runner.calls[0]?.args).not.toContain("--autoremove");
  });

  test("update parses upgrade count", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      "flock",
      ["/var/lib/apt/lists/lock", aptGetPath, "update"],
      {
        stdout:
          "12 packages can be upgraded. Run 'apt list --upgradable' to see them.\n",
        stderr: "",
        exitCode: 0,
      },
    );

    const count = await createManager(runner).update();

    expect(count.success).toBe(12);
  });

  test("upgrade with specific packages calls install", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptGetPath,
      ["--quiet=0", "-y", "-o", "DPkg::Lock::Timeout=-1", "install", "vim"],
      {
        stdout: "Setting up vim (2:9.0) ...\n",
        stderr: "",
        exitCode: 0,
      },
    );

    const out = await createManager(runner).upgrade([pkg("vim")]);

    expect(out.success[0]).toMatchObject({ name: "vim", version: "2:9.0" });
  });

  test("upgrade without packages calls upgrade command", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptGetPath,
      ["--quiet=0", "-y", "-o", "DPkg::Lock::Timeout=-1", "upgrade"],
      {
        stdout: "Setting up vim (2:9.0) ...\n",
        stderr: "",
        exitCode: 0,
      },
    );

    await createManager(runner).upgrade();

    expect(runner.calls[0]?.args).toContain("upgrade");
  });

  test("getPackageInfo parses apt-cache output", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptCachePath,
      ["--quiet=0", "--no-all-versions", "show", "vim"],
      {
        stdout: "Package: vim\nVersion: 2:9.0\nArchitecture: amd64\n\n",
        stderr: "",
        exitCode: 0,
      },
    );

    const out = await createManager(runner).show([pkg("vim")]);

    expect(out.success[0]).toMatchObject({
      name: "vim",
      version: "2:9.0",
      arch: "amd64",
    });
  });

  test("uses apt-get command directly for real runner commands", async () => {
    const runSpy = vi
      .spyOn(DefaultCommandRunner.prototype, "run")
      .mockImplementation(async (command, args = []) => {
        if (command === aptGetPath) {
          expect(args).toEqual([
            "--quiet=0",
            "-y",
            "-o",
            "DPkg::Lock::Timeout=-1",
            "autoclean",
          ]);
        }

        return {
          command,
          args,
          stdout: "",
          stderr: "",
          exitCode: 0,
        };
      });

    const manager = new AptPackageManager(
      false,
      new DefaultCommandRunner(logger, logger),
      new AptOutputParser(logger),
      -1,
      logger,
    );
    await manager.autoClean();

    expect(runSpy).toHaveBeenCalledWith(
      aptGetPath,
      ["--quiet=0", "-y", "-o", "DPkg::Lock::Timeout=-1", "autoclean"],
      expect.objectContaining({ env: expect.any(Array) }),
    );
  });

  test("install validates package names", async () => {
    const runner = new MockCommandRunner();

    const badPackage: PackageName = {
      name: "bad",
      serialize: () => "bad package",
    };

    await expect(
      createManager(runner).install([badPackage]),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("createPackageManager", () => {
  test("uses apt-fast when aria2 is available", async () => {
    const runSpy = vi
      .spyOn(DefaultCommandRunner.prototype, "run")
      .mockImplementation(async (command, args = []) => {
        if (command === "dpkg-query") {
          return {
            command,
            args,
            stdout: "ii aria2 1.36.0-1 amd64",
            stderr: "",
            exitCode: 0,
          };
        }

        return {
          command,
          args,
          stdout: "",
          stderr: "",
          exitCode: 0,
        };
      });

    const manager = await createPackageManager(true, 0, logger, logger);
    await manager.autoClean();

    expect(runSpy).toHaveBeenCalledWith("dpkg-query", ["-W", "aria2"], {
      env: expect.arrayContaining([
        "DEBIAN_FRONTEND=noninteractive",
        "DEBCONF_NONINTERACTIVE_SEEN=true",
      ]),
    });
    expect(runSpy).toHaveBeenCalledWith(
      aptFastPath,
      ["--quiet=0", "-y", "autoclean"],
      expect.objectContaining({ env: expect.any(Array) }),
    );
  });

  test("falls back to apt-get when aria2 is unavailable", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    const runSpy = vi
      .spyOn(DefaultCommandRunner.prototype, "run")
      .mockImplementation(async (command, args = []) => {
        if (command === "dpkg-query") {
          return {
            command,
            args,
            stdout: "",
            stderr: "not installed",
            exitCode: 1,
          };
        }

        return {
          command,
          args,
          stdout: "",
          stderr: "",
          exitCode: 0,
        };
      });

    const manager = await createPackageManager(true, 0, logger, logger);
    await manager.autoClean();

    expect(warnSpy).toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalledWith(
      aptGetPath,
      ["--quiet=0", "-y", "autoclean"],
      expect.objectContaining({ env: expect.any(Array) }),
    );
  });

  test("creates default loggers when omitted", async () => {
    const runSpy = vi
      .spyOn(DefaultCommandRunner.prototype, "run")
      .mockImplementation(async (command, args = []) => ({
        command,
        args,
        stdout: "",
        stderr: "",
        exitCode: 0,
      }));

    const manager = await createPackageManager(false, 0);
    await manager.autoClean();

    expect(runSpy).toHaveBeenCalledWith(
      aptGetPath,
      ["--quiet=0", "-y", "autoclean"],
      expect.objectContaining({ env: expect.any(Array) }),
    );
  });
});
