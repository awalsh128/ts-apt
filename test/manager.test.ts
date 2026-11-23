/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  CommandExecutionError,
  PackageNotInstallableError,
} from "../src/errors.js";
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
      ["-W", "-f", "${Package}:${Architecture}=${Version}\\n"],
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

  test.each([
    [true, Binary.AptFast.path],
    [false, Binary.AptGet.path],
  ])("aptPath aptFastEnabled %s returns %s", (aptFastEnabled, expected) => {
    expect(createManager(new MockCommandRunner(), aptFastEnabled).aptPath).toBe(
      expected,
    );
  });

  test("getNativeArchitecture dpkg output with newline returns trimmed arch", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(Binary.Dpkg.path, ["--print-architecture"], {
      stdout: "amd64\n",
      stderr: "",
      exitCode: 0,
    });

    const arch = await createManager(runner).getNativeArchitecture();

    expect(arch).toBe("amd64");
  });

  test("list installed files versioned package queries name and arch only", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(Binary.DpkgQuery.path, ["-L", "vim:amd64"], {
      stdout: "/usr/bin/vim\n",
      stderr: "",
      exitCode: 0,
    });

    const files = await createManager(runner).listInstalledFiles(
      pkg("vim:amd64=2:9.0"),
    );

    expect(runner.calls[0]?.args).toEqual(["-L", "vim:amd64"]);
    expect(files).toEqual(["/usr/bin/vim"]);
  });

  test("install of an uninstallable package throws PackageNotInstallableError naming it", async () => {
    const runner = new MockCommandRunner();
    runner.setError(
      aptPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "install", "-f", "-qq", "python"],
      new CommandExecutionError({
        command: aptPath,
        args: [],
        exitCode: 100,
        stdout:
          "Package python is not available, but is referred to by another package.\nHowever the following packages replace it:\n  python2 python-is-python3\n",
        stderr: "E: Package 'python' has no installation candidate\n",
      }),
    );

    const failure = createManager(runner, true).install([pkg("python")]);

    await expect(failure).rejects.toMatchObject({
      name: "PackageNotInstallableError",
      exitCode: 100,
      packages: [
        {
          name: "python",
          reason: "no-installation-candidate",
          alternatives: ["python2", "python-is-python3"],
        },
      ],
    });
    await expect(failure).rejects.toBeInstanceOf(PackageNotInstallableError);
  });

  test("install failing for another reason rethrows the original error", async () => {
    const runner = new MockCommandRunner();
    const original = new CommandExecutionError({
      command: aptPath,
      args: [],
      exitCode: 100,
      stdout: "",
      stderr: "E: Could not get lock /var/lib/dpkg/lock-frontend\n",
    });
    runner.setError(
      aptPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "install", "-f", "-qq", "vim"],
      original,
    );

    const failure = createManager(runner, true).install([pkg("vim")]);

    await expect(failure).rejects.toBe(original);
  });

  test("install simulate enabled passes simulate flag", async () => {
    const simulateArgs = ["--quiet=0", "-y", "--simulate", ...lockTimeoutArgs];
    const runner = new MockCommandRunner();
    runner.setResult(
      aptPath,
      [...simulateArgs, "install", "-f", "-qq", "vim"],
      {
        stdout: "",
        stderr: "",
        exitCode: 0,
      },
    );
    const manager = new AptPackageManager(
      true,
      runner,
      new AptOutputParser(logger),
      logger,
      true,
    );

    await manager.install([pkg("vim")]);

    expect(runner.calls[0]?.args.slice(0, 3)).toEqual([
      "--quiet=0",
      "-y",
      "--simulate",
    ]);
  });

  test("install after simulate manager created omits simulate flag", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "install", "-f", "-qq", "vim"],
      { stdout: "", stderr: "", exitCode: 0 },
    );
    new AptPackageManager(
      true,
      new MockCommandRunner(),
      new AptOutputParser(logger),
      logger,
      true,
    );

    await createManager(runner).install([pkg("vim")]);

    expect(runner.calls[0]?.args).not.toContain("--simulate");
  });

  test("install default timeout runs without a process timeout", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "install", "-f", "-qq", "vim"],
      { stdout: "", stderr: "", exitCode: 0 },
    );

    await createManager(runner, true).install([pkg("vim")]);

    expect(runner.calls[0]?.options.timeoutMs).toBe(-1);
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

  test("search with namesOnly passes names-only flag", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptPath,
      ["--quiet=0", "-y", "search", "vim", "--names-only"],
      {
        stdout: "vim/focal 2:8.1.2269-1ubuntu5 amd64\n  Vi IMproved\n",
        stderr: "",
        exitCode: 0,
      },
    );

    const out = await createManager(runner).search(["vim"], true);

    expect(out.map((pkg) => pkg.name.name)).toEqual(["vim"]);
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

  test("getPackageInfo stderr warning present ignores warning", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(aptPath, ["--quiet=0", "-y", "show", "vim"], {
      stdout: "Package: vim\nVersion: 2:9.0\nArchitecture: amd64\n\n",
      stderr:
        "W: Unable to read /etc/apt/apt.conf.d/99github-actions - open (13: Permission denied)\n",
      exitCode: 0,
    });

    const out = await createManager(runner).getPackageInfo([pkg("vim")]);

    expect(out).toHaveLength(1);
    expect(out[0]?.name).toMatchObject({ name: "vim", version: "2:9.0" });
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
      false,
      true,
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

describe("empty package lists", () => {
  test("install with no packages runs no command and returns an empty list", async () => {
    const runner = new MockCommandRunner();

    const out = await createManager(runner, false).install([]);

    expect(out).toEqual([]);
    expect(runner.calls).toEqual([]);
  });

  test("remove with no packages runs no command and returns an empty list", async () => {
    const runner = new MockCommandRunner();

    const out = await createManager(runner, false).remove([]);

    expect(out).toEqual([]);
    expect(runner.calls).toEqual([]);
  });
});

describe("apt-get privileges", () => {
  const aptEnvAssignments = debianConfEnv;

  test("apt-get as non-root runs through sudo without prompting", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      "sudo",
      [
        "-n",
        "env",
        ...aptEnvAssignments,
        aptGetPath,
        "--quiet=0",
        "-y",
        ...lockTimeoutArgs,
        "update",
      ],
      { stdout: "Reading package lists...", stderr: "", exitCode: 0 },
    );
    const manager = new AptPackageManager(
      false,
      runner,
      new AptOutputParser(logger),
      logger,
      false,
      false,
    );

    await manager.update();

    expect(runner.calls[0]?.command).toBe("sudo");
  });

  test("apt-get as root runs without sudo", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptGetPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "update"],
      { stdout: "Reading package lists...", stderr: "", exitCode: 0 },
    );
    const manager = new AptPackageManager(
      false,
      runner,
      new AptOutputParser(logger),
      logger,
      false,
      true,
    );

    await manager.update();

    expect(runner.calls[0]?.command).toBe(aptGetPath);
  });

  test("apt-fast as non-root runs without sudo since it elevates itself", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      aptPath,
      ["--quiet=0", "-y", ...lockTimeoutArgs, "update"],
      { stdout: "Reading package lists...", stderr: "", exitCode: 0 },
    );
    const manager = new AptPackageManager(
      true,
      runner,
      new AptOutputParser(logger),
      logger,
      false,
      false,
    );

    await manager.update();

    expect(runner.calls[0]?.command).toBe(aptPath);
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
    vi.spyOn(process, "getuid").mockReturnValue(0);
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

    vi.spyOn(process, "getuid").mockReturnValue(0);
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

describe("alternatives", () => {
  const updateAlternatives = Binary.UpdateAlternatives.path;
  const alternative = {
    name: "editor",
    link: "/usr/bin/editor",
    path: "/bin/nano",
    priority: 40,
    slaves: [
      {
        name: "editor.1.gz",
        link: "/usr/share/man/man1/editor.1.gz",
        path: "/usr/share/man/man1/nano.1.gz",
      },
    ],
  };
  const installArgs = [
    "--quiet",
    "--install",
    "/usr/bin/editor",
    "editor",
    "/bin/nano",
    "40",
    "--slave",
    "/usr/share/man/man1/editor.1.gz",
    "editor.1.gz",
    "/usr/share/man/man1/nano.1.gz",
  ];
  const createAlternativesManager = (
    runner: MockCommandRunner,
    isRoot: boolean,
  ) =>
    new AptPackageManager(
      false,
      runner,
      new AptOutputParser(logger),
      logger,
      false,
      isRoot,
    );

  test("listAlternatives queries each group from the selections in order", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(updateAlternatives, ["--get-selections"], {
      stdout: "editor auto /bin/nano\nawk auto /usr/bin/gawk\n",
      stderr: "",
      exitCode: 0,
    });
    runner.setResult(updateAlternatives, ["--query", "editor"], {
      stdout:
        "Name: editor\nLink: /usr/bin/editor\nStatus: auto\n\nAlternative: /bin/nano\nPriority: 40\n",
      stderr: "",
      exitCode: 0,
    });
    runner.setResult(updateAlternatives, ["--query", "awk"], {
      stdout:
        "Name: awk\nLink: /usr/bin/awk\nStatus: auto\n\nAlternative: /usr/bin/gawk\nPriority: 10\n",
      stderr: "",
      exitCode: 0,
    });

    const alternatives = await createAlternativesManager(
      runner,
      true,
    ).listAlternatives();

    expect(alternatives.map((item) => item.path)).toEqual([
      "/bin/nano",
      "/usr/bin/gawk",
    ]);
    expect(runner.calls.map((call) => call.args)).toEqual([
      ["--get-selections"],
      ["--query", "editor"],
      ["--query", "awk"],
    ]);
  });

  test("installAlternatives as root registers each alternative with its slaves", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(updateAlternatives, installArgs, {
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    await createAlternativesManager(runner, true).installAlternatives([
      alternative,
    ]);

    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]?.command).toBe(updateAlternatives);
    expect(runner.calls[0]?.args).toEqual(installArgs);
  });

  test("installAlternatives as non-root runs through sudo without prompting", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(
      "sudo",
      ["-n", "env", ...debianConfEnv, updateAlternatives, ...installArgs],
      { stdout: "", stderr: "", exitCode: 0 },
    );

    await createAlternativesManager(runner, false).installAlternatives([
      alternative,
    ]);

    expect(runner.calls[0]?.command).toBe("sudo");
  });

  test("installAlternatives empty list runs nothing", async () => {
    const runner = new MockCommandRunner();

    await createAlternativesManager(runner, true).installAlternatives([]);

    expect(runner.calls).toEqual([]);
  });

  test("listAlternatives as non-root runs without sudo", async () => {
    const runner = new MockCommandRunner();
    runner.setResult(updateAlternatives, ["--get-selections"], {
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    await createAlternativesManager(runner, false).listAlternatives();

    expect(runner.calls[0]?.command).toBe(updateAlternatives);
  });
});
