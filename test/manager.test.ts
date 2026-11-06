/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { CommandExecutionError } from "../src/errors.js";
import { MockCommandRunner } from "./common.js";
import {
  AptPackageManager,
  Binary,
  createPackageManager,
} from "../src/manager.js";
import { AptOutputParser } from "../src/parser.js";
import { DefaultCommandRunner } from "../src/commandRunner.js";
import { PackageName, tsAptMetaKeys } from "../src/types.js";
import winston from "winston";
import { afterEach, vi } from "vitest";
import { deserializePackageName } from "../src/package.ts";

const logger = winston.createLogger({
  level: "info",
  transports: [new winston.transports.Console()],
});

const pkg = (serializedName: string): PackageName => {
  const result = deserializePackageName(serializedName);
  if (result === null) {
    throw new Error(`Failed to deserialize package name: ${serializedName}`);
  }
  return result;
};

const debianConfEnv = [
  "DEBIAN_FRONTEND=noninteractive",
  "DEBCONF_NONINTERACTIVE_SEEN=true",
];

function createManager(
  runner: MockCommandRunner,
  aptFastEnabled = true,
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
const lockTimeoutArgs = ["-o", "DPkg::Lock::Timeout=-1"];

describe("apt manager", () => {
  test("install builds expected command", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "install", "-f", "-qq", "vim"],
      {
        stdout: "Inst vim (2:9.0 Ubuntu:24.04/noble [amd64])\n",
        stderr: "",
        exitCode: 0,
      },
    );

    const manager = createManager(runner, true);
    const out = await manager.install([pkg("vim")]);

    expect(out).toHaveLength(1);
    expect(runner.calls[0]?.command).toBe(aptPath);
    expect(runner.calls[0]?.args).toEqual([
      "--quiet=0",
      "-y",
      ...lockTimeoutArgs,
      "install",
      "-f",
      "-qq",
      "vim",
    ]);
  });

  test("auto clean executes mutating binary command", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "autoclean"],
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
      ...lockTimeoutArgs,
      "autoclean",
    ]);
  });

  test("auto remove parses removed packages", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "autoremove"],
      {
        stdout: "Remv vim [2:9.0] [base-files:amd64 ]\n",
        stderr: "",
        exitCode: 0,
      },
    );

    const out = await createManager(runner).autoRemove();

    expect(out).toEqual([
      expect.objectContaining({
        name: expect.objectContaining({ name: "vim", version: "2:9.0" }),
        status: "available",
      }),
    ]);
  });

  test("list installed returns dpkg-query parsed packages", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      Binary.DpkgQuery.path,
      ["-W", "-f", "${binary:Package}:${Architecture}=${Version}\\n"],
      {
        stdout: "vim:amd64=2:9.0\n",
        stderr: "",
        exitCode: 0,
      },
    );

    const out = await createManager(runner).listInstalled();

    expect(out[0]).toMatchObject({
      name: expect.objectContaining({
        name: "vim",
        arch: "amd64",
        version: "2:9.0",
      }),
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
      name: expect.objectContaining({
        name: "vim",
        version: "2:8.2",
        arch: "amd64",
      }),
      status: "upgradeable",
      metadata: {
        [tsAptMetaKeys.listUpgradeableNewVersion]: "2:9.0",
      },
    });
  });

  test("remove includes --autoremove by default", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptPath,
      [
        "--quiet=0",
        "-y",
        ...lockTimeoutArgs,
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

    expect(runner.calls[0]?.args).toEqual([
      "--quiet=0",
      "-y",
      ...lockTimeoutArgs,
      "remove",
      "-f",
      "vim",
      "--autoremove",
    ]);
  });

  test("remove can disable --autoremove", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "remove", "-f", "vim"],
      {
        stdout: "Removing vim (2:9.0) ...\n",
        stderr: "",
        exitCode: 0,
      },
    );

    await createManager(runner).remove([pkg("vim")], false);

    expect(runner.calls[0]?.args).toEqual([
      "--quiet=0",
      "-y",
      ...lockTimeoutArgs,
      "remove",
      "-f",
      "vim",
    ]);
  });

  test("search parses apt results", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(aptPath, ["--quiet=0", "-y", "search", "vim"], {
      stdout: [
        "Sorting... Done",
        "Full Text Search... Done",
        "vim-vimerl/focal 1.4.1+git20120509.89111c7-2 all",
        "  Erlang plugin for Vim",
        "",
        "vim-vimerl-syntax/focal 1.4.1+git20120509.89111c7-2 all",
        "  Erlang syntax for Vim",
        "",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    });
    const out = await createManager(runner).search(["vim"]);

    expect(out).toContainEqual({
      metadata: {
        "tsapt-search-description": "Erlang plugin for Vim",
        "tsapt-search-release-codename": "focal",
      },
      name: {
        arch: "all",
        name: "vim-vimerl",
        version: "1.4.1+git20120509.89111c7-2",
      },
      status: "available",
    });
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
    runner.setResult(
      aptPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "update"],
      {
        stdout:
          "12 packages can be upgraded. Run 'apt list --upgradable' to see them.\n",
        stderr: "",
        exitCode: 0,
      },
    );

    const count = await createManager(runner).update();

    expect(count).toBe(12);
  });

  test("upgrade with specific packages calls install", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "install", "vim"],
      {
        stdout: "Inst vim (2:9.0 Ubuntu:24.04/noble [amd64])\n",
        stderr: "",
        exitCode: 0,
      },
    );

    const out = await createManager(runner).upgrade([pkg("vim")]);

    expect(out[0]).toMatchObject({
      name: expect.objectContaining({ name: "vim", version: "2:9.0" }),
    });
    expect(runner.calls[0]?.args).toEqual([
      "--quiet=0",
      "-y",
      ...lockTimeoutArgs,
      "install",
      "vim",
    ]);
  });

  test("upgrade without packages calls upgrade command", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "upgrade"],
      {
        stdout: "Inst vim [2:9.0] (2:9.1 Ubuntu:24.04/noble-updates [amd64])\n",
        stderr: "",
        exitCode: 0,
      },
    );

    await createManager(runner).upgrade();

    expect(runner.calls[0]?.args).toEqual([
      "--quiet=0",
      "-y",
      ...lockTimeoutArgs,
      "upgrade",
    ]);
  });

  test("upgradeAll delegates to upgrade", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "upgrade"],
      {
        stdout: "Setting up vim (2:9.0) ...\n",
        stderr: "",
        exitCode: 0,
      },
    );

    const out = await createManager(runner).upgradeAll();

    expect(out).toHaveLength(1);
    expect(out[0]?.name.name).toBe("vim");
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
      name: expect.objectContaining({
        name: "vim",
        version: "2:9.0",
        arch: "amd64",
      }),
    });
  });

  test("passes DPkg::Lock::Timeout for mutating commands", async () => {
    const runSpy = vi
      .spyOn(DefaultCommandRunner.prototype, "run")
      .mockImplementation(async (command, args = []) => {
        if (command === aptGetPath) {
          expect(args).toEqual([
            "--quiet=0",
            "-y",
            ...lockTimeoutArgs,
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
      aptGetPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "autoclean"],
      expect.objectContaining({
        env: expect.arrayContaining(debianConfEnv),
      }),
    );
  });
});

describe("createPackageManager", () => {
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
        if (command === aptPath) {
          expect(args).toEqual([
            "--quiet=0",
            "-y",
            ...lockTimeoutArgs,
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
      env: expect.arrayContaining(debianConfEnv),
    });
    const dpkgQueryCall = runSpy.mock.calls.find(
      ([command]) => command === "dpkg-query",
    );
    expect(dpkgQueryCall?.[1]).toEqual(["-W", "aria2"]);
    expect(dpkgQueryCall?.[1]).not.toContain("DPkg::Lock::Timeout=-1");
    expect(runSpy).toHaveBeenCalledWith(
      aptPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "autoclean"],
      expect.objectContaining({
        env: expect.arrayContaining(debianConfEnv),
      }),
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
        if (command === aptGetPath) {
          expect(args).toEqual([
            "--quiet=0",
            "-y",
            ...lockTimeoutArgs,
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
      aptGetPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "autoclean"],
      expect.objectContaining({
        env: expect.arrayContaining(debianConfEnv),
      }),
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
      aptGetPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "autoclean"],
      expect.objectContaining({
        env: expect.arrayContaining(debianConfEnv),
      }),
    );
  });
});
