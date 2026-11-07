#!/usr/bin/env -S node --experimental-strip-types
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/// <reference types="node" />

import { spawn } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import process from "process";
import { ROOT_DIR, fail, logInfo, logSuccess } from "../devopslib.mts";

interface LogResult {
  cmdLine: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface TestLogEntry {
  filepath: string;
  execCmdLine: string;
  preExecCmdLine?: string[];
  postExecCmdLine?: string[];
}

const APT_GET_BINARY = "/usr/bin/apt-get";
const APT_BINARY = "/usr/bin/apt";
const APT_CACHE_BINARY = "/usr/bin/apt-cache";
const DPKG_QUERY_BINARY = "/usr/bin/dpkg-query";

const APT_GET_DEFAULT_ARGS = ["--quiet=0", "-y"] as const;
const APT_LOCK_TIMEOUT_ARGS = ["-o", "DPkg::Lock::Timeout=-1"] as const;
const APT_CACHE_DEFAULT_ARGS = ["--quiet=0", "--no-all-versions"] as const;

const APT_FLAGS = {
  fixBroken: "-f",
  autoRemove: "--autoremove",
  simulate: "--simulate",
} as const;

function buildAptGetMutatingCmd(
  operation: string,
  args: readonly string[] = [],
  options: { simulate?: boolean } = {},
): string {
  const commandArgs = [
    ...APT_GET_DEFAULT_ARGS,
    ...(options.simulate ? [APT_FLAGS.simulate] : []),
    ...APT_LOCK_TIMEOUT_ARGS,
    operation,
    ...args,
  ];

  return `${APT_GET_BINARY} ${commandArgs.join(" ")}`;
}

function buildAptReadCmd(
  operation: string,
  args: readonly string[] = [],
): string {
  return `${APT_BINARY} --quiet=0 ${[operation, ...args].join(" ")}`;
}

function buildAptCacheCmd(
  operation: string,
  args: readonly string[] = [],
): string {
  return `${APT_CACHE_BINARY} ${[
    ...APT_CACHE_DEFAULT_ARGS,
    operation,
    ...args,
  ].join(" ")}`;
}

function buildDpkgQueryCmd(args: readonly string[]): string {
  return `${DPKG_QUERY_BINARY} ${args.join(" ")}`;
}

function isNonSimulatedMutation(cmdLine: string): boolean {
  return (
    cmdLine.startsWith(`${APT_GET_BINARY} `) &&
    !cmdLine.includes(` ${APT_FLAGS.simulate} `)
  );
}

function toLog(result: LogResult): string {
  return `*** CMD_LINE ${result.cmdLine}\n*** EXIT_CODE ${result.exitCode}\n*** STDOUT\n${result.stdout}*** STDERR\n${result.stderr}`;
}

/** Determine exit code: use code if available, else map signal to 137 (SIGKILL) or 143 (SIGTERM) */
function getFinalExitCode(
  code: number | null,
  signal: NodeJS.Signals | null,
): number {
  if (code !== null) {
    return code;
  } else if (signal === "SIGTERM") {
    return 143; // Standard for SIGTERM (128 + 14)
  } else if (signal === "SIGKILL") {
    return 137; // Standard for SIGKILL (128 + 9)
  }
  return 1; // Fallback for unknown signal
}

async function execute(cmdLine: string): Promise<LogResult> {
  return await new Promise<LogResult>((resolve, reject) => {
    const parts = cmdLine.trim().split(/\s+/);
    const [command, ...args] = parts;
    if (!command) {
      reject(new Error("Command line cannot be empty."));
      return;
    }
    const env = { ...process.env };
    env.LC_ALL ??= "C";

    const commonEnv = {
      ...env,
      PATH: `${process.env.PATH}:/usr/bin`,
      DEBIAN_FRONTEND: "noninteractive",
      DEBCONF_NONINTERACTIVE_SEEN: "true",
    };

    const child = spawn(command, args, {
      env: commonEnv,
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    /**
     * Ensures promise resolution or rejection happens once.
     *
     * @param fn Finalizer callback to execute once settled.
     */
    const finalize = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      fn();
    };

    // 1. Attach 'error' FIRST (Critical for crash safety)
    child.on("error", (error: Error) => {
      finalize(() => reject(error));
    });

    // 2. Attach 'stdout' and 'stderr' stream listeners (Capture output)
    child.stdout?.on("data", (chunk: Buffer) => {
      const str = chunk.toString("utf8");
      stdout += str;
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const str = chunk.toString("utf8");
      stderr += str;
    });

    // 3. Attach 'close' last (Handles exit logic)
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (stderr.includes("Permission denied")) {
        finalize(() =>
          reject(
            new Error(`Permission denied error:
          - command: ${command}
          - args: ${args.join(" ")}
          - stdout: ${stdout}
          - stderr: ${stderr}
          - code: ${code}
          - signal: ${signal}
          `),
          ),
        );
        return;
      }
      finalize(() => {
        const finalExitCode = getFinalExitCode(code, signal);

        resolve({
          cmdLine,
          exitCode: finalExitCode,
          stdout,
          stderr,
        });
      });
    });
  });
}

async function writeLogFile(
  baseDir: string,
  relativePath: string,
  result: LogResult,
): Promise<string> {
  const outputPath = resolve(baseDir, `${relativePath}.log`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, toLog(result), "utf8");
  return outputPath;
}

async function main(): Promise<void> {
  const testDataDir = resolve(ROOT_DIR, "test/data");
  let written = 0;
  let artifactsLeft = false;

  const executeAndTrack = async (cmd: string): Promise<LogResult> => {
    if (isNonSimulatedMutation(cmd)) {
      artifactsLeft = true;
    }
    return await execute(cmd);
  };

  for (const entry of testLogFiles) {
    if (entry.preExecCmdLine) {
      for (const cmd of entry.preExecCmdLine) {
        await executeAndTrack(cmd);
      }
    }

    const result = await executeAndTrack(entry.execCmdLine);
    const outputPath = await writeLogFile(testDataDir, entry.filepath, result);
    if (entry.postExecCmdLine) {
      for (const cmd of entry.postExecCmdLine) {
        await executeAndTrack(cmd);
      }
    }

    written += 1;
    logInfo(`Wrote ${outputPath}`);
  }

  if (artifactsLeft) {
    await execute(buildAptGetMutatingCmd("upgrade"));
    await execute(buildAptGetMutatingCmd("autoremove"));
  } else {
    logInfo("Skipping cleanup because no artifacts were left.");
  }

  logSuccess(`Wrote ${written} command execution log(s).`);
}

const testLogFiles: TestLogEntry[] = [
  {
    filepath: "autoclean",
    execCmdLine: buildAptGetMutatingCmd("autoclean", [], { simulate: true }),
  },
  {
    filepath: "autoremove_found",
    preExecCmdLine: [
      buildAptGetMutatingCmd("install", [APT_FLAGS.fixBroken, "xdot"]),
      buildAptGetMutatingCmd("remove", [
        APT_FLAGS.fixBroken,
        "xdot",
        APT_FLAGS.autoRemove,
      ]),
    ],
    execCmdLine: buildAptGetMutatingCmd("autoremove", [], { simulate: true }),
  },
  {
    filepath: "autoremove_notfound",
    preExecCmdLine: [buildAptGetMutatingCmd("autoremove")],
    execCmdLine: buildAptGetMutatingCmd("autoremove", [], { simulate: true }),
  },
  {
    filepath: "cacheshow_mixedfoundnotfound",
    execCmdLine: buildAptCacheCmd("show", [
      "xdot",
      "python3",
      "nonexistentpackage",
    ]),
  },
  {
    filepath: "cacheshow_multiplefound",
    execCmdLine: buildAptCacheCmd("show", ["xdot", "python3"]),
  },
  {
    filepath: "cacheshow_singlefound",
    execCmdLine: buildAptCacheCmd("show", ["python3"]),
  },
  {
    filepath: "cacheshow_singlenotfound",
    execCmdLine: buildAptCacheCmd("show", ["nonexistentpackage"]),
  },
  {
    filepath: "cacheshow_virtualpackage",
    execCmdLine: buildAptCacheCmd("show", ["libvips"]),
  },
  {
    filepath: "cacheshow_virtualandnotpackages",
    execCmdLine: buildAptCacheCmd("show", ["libvips", "xdot"]),
  },
  {
    filepath: "cacheshowpkg_virtualpackage",
    execCmdLine: buildAptCacheCmd("showpkg", ["libvips"]),
  },
  {
    filepath: "install_mixedfoundnotfound",
    preExecCmdLine: [
      buildAptGetMutatingCmd("remove", [
        APT_FLAGS.fixBroken,
        "xdot",
        APT_FLAGS.autoRemove,
      ]),
    ],
    execCmdLine: buildAptGetMutatingCmd(
      "install",
      [APT_FLAGS.fixBroken, "xdot", "nonexistentpackage"],
      { simulate: true },
    ),
  },
  {
    filepath: "install_mixedinstallstatus",
    preExecCmdLine: [
      buildAptGetMutatingCmd("install", [APT_FLAGS.fixBroken, "xdot"]),
      buildAptGetMutatingCmd("remove", [
        APT_FLAGS.fixBroken,
        "rolldice",
        APT_FLAGS.autoRemove,
      ]),
      buildAptGetMutatingCmd("autoremove"),
    ],
    execCmdLine: buildAptGetMutatingCmd(
      "install",
      [APT_FLAGS.fixBroken, "rolldice", "xdot"],
      { simulate: true },
    ),
  },
  {
    filepath: "install_singleinstalled",
    preExecCmdLine: [
      buildAptGetMutatingCmd("install", [APT_FLAGS.fixBroken, "xdot"]),
    ],
    execCmdLine: buildAptGetMutatingCmd(
      "install",
      [APT_FLAGS.fixBroken, "xdot"],
      { simulate: true },
    ),
  },
  {
    filepath: "install_singlenotfound",
    execCmdLine: buildAptGetMutatingCmd(
      "install",
      [APT_FLAGS.fixBroken, "nonexistentpackage"],
      { simulate: true },
    ),
  },
  {
    filepath: "install_singlenotinstalled",
    preExecCmdLine: [
      buildAptGetMutatingCmd("remove", [
        APT_FLAGS.fixBroken,
        "xdot",
        APT_FLAGS.autoRemove,
      ]),
      buildAptGetMutatingCmd("autoremove"),
    ],
    execCmdLine: buildAptGetMutatingCmd(
      "install",
      [APT_FLAGS.fixBroken, "xdot"],
      { simulate: true },
    ),
  },
  {
    filepath: "listinstalled",
    execCmdLine: buildDpkgQueryCmd([
      "-W",
      "-f",
      "${Package}:${Architecture}=${Version}\\n",
    ]),
  },
  {
    filepath: "listinstalledfiles_found",
    execCmdLine: buildDpkgQueryCmd(["-L", "xdot"]),
  },
  {
    filepath: "listinstalledfiles_notfound",
    execCmdLine: buildDpkgQueryCmd(["-L", "nonexistentpackage"]),
  },
  {
    filepath: "listupgradable_found",
    preExecCmdLine: [
      buildAptGetMutatingCmd("remove", [
        APT_FLAGS.fixBroken,
        "firefox-locale-en",
        APT_FLAGS.autoRemove,
      ]),
      buildAptGetMutatingCmd("install", [
        APT_FLAGS.fixBroken,
        "firefox-locale-en=75.0+build3-0ubuntu1",
      ]),
      buildAptGetMutatingCmd("remove", [
        APT_FLAGS.fixBroken,
        "uuid-dev",
        APT_FLAGS.autoRemove,
      ]),
      buildAptGetMutatingCmd("install", [
        APT_FLAGS.fixBroken,
        "uuid-dev=2.34-0.1ubuntu9",
      ]),
    ],
    execCmdLine: buildAptReadCmd("list", ["--upgradable"]),
  },
  {
    filepath: "listupgradable_notfound",
    preExecCmdLine: [buildAptGetMutatingCmd("upgrade")],
    execCmdLine: buildAptReadCmd("list", ["--upgradable"]),
  },
  {
    filepath: "remove_mixedfoundnotfound",
    preExecCmdLine: [
      buildAptGetMutatingCmd("install", [APT_FLAGS.fixBroken, "xdot"]),
    ],
    execCmdLine: buildAptGetMutatingCmd(
      "remove",
      [APT_FLAGS.fixBroken, "xdot", "nonexistentpackage", APT_FLAGS.autoRemove],
      { simulate: true },
    ),
  },
  {
    filepath: "remove_mixedinstallstatus",
    preExecCmdLine: [
      buildAptGetMutatingCmd("install", [APT_FLAGS.fixBroken, "xdot"]),
      buildAptGetMutatingCmd("remove", [
        APT_FLAGS.fixBroken,
        "rolldice",
        APT_FLAGS.autoRemove,
      ]),
    ],
    execCmdLine: buildAptGetMutatingCmd(
      "remove",
      [APT_FLAGS.fixBroken, "rolldice", "xdot", APT_FLAGS.autoRemove],
      { simulate: true },
    ),
  },
  {
    filepath: "remove_singlenotinstalled",
    preExecCmdLine: [
      buildAptGetMutatingCmd("remove", [
        APT_FLAGS.fixBroken,
        "xdot",
        APT_FLAGS.autoRemove,
      ]),
    ],
    execCmdLine: buildAptGetMutatingCmd(
      "remove",
      [APT_FLAGS.fixBroken, "xdot", APT_FLAGS.autoRemove],
      { simulate: true },
    ),
  },
  {
    filepath: "remove_singlenotfound",
    execCmdLine: buildAptGetMutatingCmd(
      "remove",
      [APT_FLAGS.fixBroken, "nonexistentpackage", APT_FLAGS.autoRemove],
      { simulate: true },
    ),
  },
  {
    filepath: "remove_singleinstalled",
    preExecCmdLine: [
      buildAptGetMutatingCmd("install", [APT_FLAGS.fixBroken, "xdot"]),
    ],
    execCmdLine: buildAptGetMutatingCmd(
      "remove",
      [APT_FLAGS.fixBroken, "xdot", APT_FLAGS.autoRemove],
      { simulate: true },
    ),
  },
  {
    filepath: "search_multiplefound",
    execCmdLine: buildAptReadCmd("search", ["vim"]),
  },
  {
    filepath: "search_nonefound",
    execCmdLine: buildAptReadCmd("search", ["nonexistentpackage"]),
  },
  {
    filepath: "search_singlefound",
    execCmdLine: buildAptReadCmd("search", ["vim-vimerl-syntax"]),
  },
  {
    filepath: "update",
    execCmdLine: buildAptGetMutatingCmd("update", [], { simulate: true }),
  },
  {
    filepath: "upgrade_mixedfoundnotfound",
    preExecCmdLine: [
      buildAptGetMutatingCmd("remove", [
        APT_FLAGS.fixBroken,
        "xdot",
        APT_FLAGS.autoRemove,
      ]),
    ],
    execCmdLine: buildAptGetMutatingCmd(
      "install",
      ["xdot", "nonexistentpackage"],
      { simulate: true },
    ),
  },
  {
    filepath: "upgrade_mixedupgradestatus",
    preExecCmdLine: [
      buildAptGetMutatingCmd("install", [APT_FLAGS.fixBroken, "xdot"]),
      buildAptGetMutatingCmd("remove", [
        APT_FLAGS.fixBroken,
        "xxd",
        APT_FLAGS.autoRemove,
      ]),
      buildAptGetMutatingCmd("install", [
        APT_FLAGS.fixBroken,
        "xxd=2:8.1.2269-1ubuntu5.30",
      ]),
    ],
    execCmdLine: buildAptGetMutatingCmd("install", ["xxd", "xdot"], {
      simulate: true,
    }),
  },
  {
    filepath: "upgrade_singleupgraded",
    preExecCmdLine: [buildAptGetMutatingCmd("install", ["xdot"])],
    execCmdLine: buildAptGetMutatingCmd("upgrade", [], { simulate: true }),
  },
  {
    filepath: "upgrade_singlenotfound",
    execCmdLine: buildAptGetMutatingCmd("install", ["nonexistentpackage"], {
      simulate: true,
    }),
  },
  {
    filepath: "upgrade_singlenotupgraded",
    preExecCmdLine: [
      buildAptGetMutatingCmd("remove", [
        APT_FLAGS.fixBroken,
        "xxd",
        APT_FLAGS.autoRemove,
      ]),
      buildAptGetMutatingCmd("install", [
        APT_FLAGS.fixBroken,
        "xxd=2:8.1.2269-1ubuntu5.30",
      ]),
    ],
    execCmdLine: buildAptGetMutatingCmd("install", ["xxd"], {
      simulate: true,
    }),
  },
  {
    filepath: "upgrade_singleinstalled",
    preExecCmdLine: [
      buildAptGetMutatingCmd("install", [APT_FLAGS.fixBroken, "xdot"]),
    ],
    execCmdLine: buildAptGetMutatingCmd("install", ["xdot"], {
      simulate: true,
    }),
  },
];

await main().catch((error) => {
  fail(
    "Error occurred during log creation:\n" +
      String(error) +
      "\n" +
      (error.stack ?? "no stack trace available"),
  );
});
