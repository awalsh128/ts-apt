import path from "path";
import { CommandExecutionError, ValidationError } from "../src/errors.js";
import { MockCommandRunner } from "./common.js";
import {
  AptPackageManager,
  Binary,
  createPackageManager,
  GLOBAL_APT_LOCK_WAIT_SECONDS,
} from "../src/manager.js";
import { AptOutputParser } from "../src/parser.js";
import { DefaultCommandRunner } from "../src/commandRunner.js";
import { PackageName } from "../src/types.js";
import winston from "winston";
import { afterEach, vi } from "vitest";

const logger = winston.createLogger({
  level: "info",
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
  aptFastEnabled: boolean = true,
): AptPackageManager {
  return new AptPackageManager(
    aptFastEnabled,
    runner,
    new AptOutputParser(logger),
    logger,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

const aptPath = Binary.AptFast.path;
const aptGetPath = Binary.AptGet.path;

describe("apt manager", () => {
  test("install builds expected command", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(aptPath, ["--quiet=0", "-y", "install", "-f", "vim"], {
      stdout: "Setting up vim (2:9.0) ...\n",
      stderr: "",
      exitCode: 0,
    });

    const manager = createManager(runner, true);
    const out = await manager.install([pkg("vim")]);

    expect(out).toHaveLength(1);
    expect(runner.calls[0]?.command).toBe(aptPath);
    expect(runner.calls[0]?.args).toEqual([
      "--quiet=0",
      "-y",
      "install",
      "-f",
      "vim",
    ]);
  });

  test("auto clean executes mutating binary command", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(aptPath, ["--quiet=0", "-y", "autoclean"], {
      stdout: "Done",
      stderr: "",
      exitCode: 0,
    });

    await createManager(runner).autoClean();

    expect(runner.calls[0]?.args).toEqual(["--quiet=0", "-y", "autoclean"]);
  });

  test("auto remove parses removed packages", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(aptPath, ["--quiet=0", "-y", "autoremove"], {
      stdout: "Removing vim (2:9.0) ...\n",
      stderr: "",
      exitCode: 0,
    });

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
    runner.setResult(aptPath, ["--quiet=0", "-y", "list", "--upgradable"], {
      stdout:
        "vim/focal-updates,focal-security 2:9.0 amd64 [upgradable from: 2:8.2]\n",
      stderr: "",
      exitCode: 0,
    });

    const out = await createManager(runner).listUpgradable();

    expect(out[0]).toMatchObject({
      name: "vim",
      version: "2:8.2",
      arch: "amd64",
      status: "upgradeable",
    });
    expect(out[0]?.metadata?.get("newVersion")).toBe("2:9.0");
  });

  test("remove includes --autoremove by default", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptPath,
      ["--quiet=0", "-y", "remove", "-f", "vim", "--autoremove"],
      {
        stdout: "Removing vim (2:9.0) ...\n",
        stderr: "",
        exitCode: 0,
      },
    );

    await createManager(runner).remove([pkg("vim")]);

    expect(runner.calls[0]?.args).toEqual([
      "--quiet=0",
      "-y",
      "remove",
      "-f",
      "vim",
      "--autoremove",
    ]);
  });

  test("remove can disable --autoremove", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(aptPath, ["--quiet=0", "-y", "remove", "-f", "vim"], {
      stdout: "Removing vim (2:9.0) ...\n",
      stderr: "",
      exitCode: 0,
    });

    await createManager(runner).remove([pkg("vim")], false);

    expect(runner.calls[0]?.args).toEqual([
      "--quiet=0",
      "-y",
      "remove",
      "-f",
      "vim",
    ]);
  });

  test("search parses apt results", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(aptPath, ["--quiet=0", "-y", "search", "vim"], {
      stdout: [
        "Sorting...",
        "Full Text Search...",
        "vim/stable 2:9.0 amd64",
        "editor",
        "",
        "foo/stable 1.0 amd64",
        "foo",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    });
    const out = await createManager(runner).search(["vim"]);

    expect(out.find((p) => p.name === "vim")?.version).toBe("2:9.0");
    expect(
      out.find((p) => p.name === "foo")?.metadata?.get("description"),
    ).toBe("foo");
  });

  test("search propagates command failures", async () => {
    const runner = new MockCommandRunner();
    runner.setError(
      aptPath,
      ["--quiet=0", "-y", "search", "ghostpkg"],
      new CommandExecutionError({
        command: aptPath,
        args: ["--quiet=0", "-y", "search", "ghostpkg"],
        exitCode: 1,
        stdout: "",
        stderr: "E: unable to locate package ghostpkg",
      }),
    );

    await expect(
      createManager(runner).search(["ghostpkg"]),
    ).rejects.toBeInstanceOf(CommandExecutionError);
  });

  test("update parses upgrade count", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(aptPath, ["--quiet=0", "-y", "update"], {
      stdout:
        "12 packages can be upgraded. Run 'apt list --upgradable' to see them.\n",
      stderr: "",
      exitCode: 0,
    });

    const count = await createManager(runner).update();

    expect(count).toBe(12);
  });

  test("upgrade with specific packages calls install", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(aptPath, ["--quiet=0", "-y", "install", "vim"], {
      stdout: "Setting up vim (2:9.0) ...\n",
      stderr: "",
      exitCode: 0,
    });

    const out = await createManager(runner).upgrade([pkg("vim")]);

    expect(out[0]).toMatchObject({ name: "vim", version: "2:9.0" });
    expect(runner.calls[0]?.args).toEqual([
      "--quiet=0",
      "-y",
      "install",
      "vim",
    ]);
  });

  test("upgrade without packages calls upgrade command", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(aptPath, ["--quiet=0", "-y", "upgrade"], {
      stdout: "Setting up vim (2:9.0) ...\n",
      stderr: "",
      exitCode: 0,
    });

    await createManager(runner).upgrade();

    expect(runner.calls[0]?.args).toEqual(["--quiet=0", "-y", "upgrade"]);
  });

  test("upgradeAll delegates to upgrade", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(aptPath, ["--quiet=0", "-y", "upgrade"], {
      stdout: "Setting up vim (2:9.0) ...\n",
      stderr: "",
      exitCode: 0,
    });

    const out = await createManager(runner).upgradeAll();

    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe("vim");
  });

  test("getPackageInfo parses apt-cache output", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(aptPath, ["--quiet=0", "-y", "show", "vim"], {
      stdout: "Package: vim\nVersion: 2:9.0\nArchitecture: amd64\n\n",
      stderr: "",
      exitCode: 0,
    });

    const out = await createManager(runner).getPackageInfo([pkg("vim")]);

    expect(out[0]).toMatchObject({
      name: "vim",
      version: "2:9.0",
      arch: "amd64",
    });
  });

  test("uses universal flock lock for real runner commands", async () => {
    const runSpy = vi
      .spyOn(DefaultCommandRunner.prototype, "run")
      .mockImplementation(async (command, args = []) => {
        if (command === "flock") {
          expect(args).toEqual([
            "-w",
            GLOBAL_APT_LOCK_WAIT_SECONDS,
            "/tmp/ts-apt-manager.lock",
            aptGetPath,
            "--quiet=0",
            "-y",
            "autoclean",
          ]);
          return {
            cmdLine: `${command} ${(args ?? []).join(" ")}`,
            stdout: "",
            stderr: "",
            exitCode: 0,
          };
        }

        throw new Error(
          `unexpected command: ${command} ${(args ?? []).join(" ")}`,
        );
      });

    const manager = new AptPackageManager(
      false,
      new DefaultCommandRunner(logger, logger),
      new AptOutputParser(logger),
      logger,
    );
    await manager.autoClean();

    expect(runSpy).toHaveBeenCalledWith(
      "flock",
      [
        "-w",
        GLOBAL_APT_LOCK_WAIT_SECONDS,
        "/tmp/ts-apt-manager.lock",
        aptGetPath,
        "--quiet=0",
        "-y",
        "autoclean",
      ],
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
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
  const managerLockFile = "/tmp/ts-apt-manager.lock";

  test("uses apt-fast when aria2 is available", async () => {
    const runSpy = vi
      .spyOn(DefaultCommandRunner.prototype, "run")
      .mockImplementation(async (command, args = []) => {
        if (command === "dpkg-query") {
          return {
            cmdLine: "dpkg-query -W aria2",
            stdout: "ii aria2 1.36.0-1 amd64",
            stderr: "",
            exitCode: 0,
          };
        }
        if (command === "flock") {
          expect(args).toEqual([
            "-w",
            GLOBAL_APT_LOCK_WAIT_SECONDS,
            managerLockFile,
            aptPath,
            "--quiet=0",
            "-y",
            "autoclean",
          ]);
          return {
            cmdLine: `${command} --quiet=0 -y autoclean`,
            stdout: "",
            stderr: "",
            exitCode: 0,
          };
        }
        throw new Error(
          `unexpected command: ${command} ${(args ?? []).join(" ")}`,
        );
      });

    const manager = await createPackageManager(true, logger, logger);
    await manager.autoClean();

    expect(runSpy).toHaveBeenCalledWith("dpkg-query", ["-W", "aria2"], {
      env: expect.arrayContaining([
        "DEBIAN_FRONTEND=noninteractive",
        "DEBCONF_NONINTERACTIVE_SEEN=true",
      ]),
    });
    expect(runSpy).toHaveBeenCalledWith(
      "flock",
      [
        "-w",
        GLOBAL_APT_LOCK_WAIT_SECONDS,
        managerLockFile,
        aptPath,
        "--quiet=0",
        "-y",
        "autoclean",
      ],
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  test("falls back to apt-get when aria2 is unavailable", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    const runSpy = vi
      .spyOn(DefaultCommandRunner.prototype, "run")
      .mockImplementation(async (command, args = []) => {
        if (command === "dpkg-query") {
          return {
            cmdLine: "dpkg-query -W aria2",
            stdout: "",
            stderr: "not installed",
            exitCode: 1,
          };
        }
        if (command === "flock") {
          expect(args).toEqual([
            "-w",
            GLOBAL_APT_LOCK_WAIT_SECONDS,
            managerLockFile,
            aptGetPath,
            "--quiet=0",
            "-y",
            "autoclean",
          ]);
          return {
            cmdLine: `${aptGetPath} --quiet=0 -y autoclean`,
            stdout: "",
            stderr: "",
            exitCode: 0,
          };
        }
        throw new Error(`unexpected command: ${command}`);
      });

    const manager = await createPackageManager(true, logger, logger);
    await manager.autoClean();

    expect(warnSpy).toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalledWith(
      "flock",
      [
        "-w",
        GLOBAL_APT_LOCK_WAIT_SECONDS,
        managerLockFile,
        aptGetPath,
        "--quiet=0",
        "-y",
        "autoclean",
      ],
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  test("creates default loggers when omitted", async () => {
    const runSpy = vi
      .spyOn(DefaultCommandRunner.prototype, "run")
      .mockImplementation(async function (this: DefaultCommandRunner) {
        (this as unknown as { execLogger: winston.Logger }).execLogger.info(
          "exec output",
        );
        return {
          cmdLine: `${aptPath} --quiet=0 -y autoclean`,
          stdout: "",
          stderr: "",
          exitCode: 0,
        };
      });

    const manager = await createPackageManager(false);
    await manager.autoClean();

    expect(runSpy).toHaveBeenCalledWith(
      "flock",
      [
        "-w",
        GLOBAL_APT_LOCK_WAIT_SECONDS,
        managerLockFile,
        aptGetPath,
        "--quiet=0",
        "-y",
        "autoclean",
      ],
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });
});
