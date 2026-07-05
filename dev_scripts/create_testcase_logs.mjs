#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ROOT_DIR, fail, logInfo, logSuccess } from "./lib.mjs";

function toLog(result) {
  return `*** CMD_LINE ${result.cmdLine}\n*** EXIT_CODE ${result.exitCode}\n*** STDOUT\n${result.stdout}*** STDERR\n${result.stderr}`;
}

/** Determine exit code: use code if available, else map signal to 137 (SIGKILL) or 143 (SIGTERM) */
function getFinalExitCode(code, signal) {
  if (code !== null) {
    return code;
  } else if (signal === "SIGTERM") {
    return 143; // Standard for SIGTERM (128 + 14)
  } else if (signal === "SIGKILL") {
    return 137; // Standard for SIGKILL (128 + 9)
  }
  return 1; // Fallback for unknown signal
}

async function execute(cmdLine) {
  return await new Promise((resolve, reject) => {
    const parts = cmdLine.trim().split(/\s+/);
    const command = parts[0]; // "apt-get"
    const args = parts.slice(1);
    const env = { ...process.env };
    if (!env.LC_ALL) {
      env.LC_ALL = "C";
    }

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
    const finalize = (fn) => {
      if (settled) {
        return;
      }
      settled = true;
      fn();
    };

    // 1. Attach 'error' FIRST (Critical for crash safety)
    child.on("error", (error) => {
      finalize(() => reject(error));
    });

    // 2. Attach 'stdout' and 'stderr' stream listeners (Capture output)
    child.stdout?.on("data", (chunk) => {
      const str = chunk.toString("utf8");
      stdout += str;
    });
    child.stderr?.on("data", (chunk) => {
      const str = chunk.toString("utf8");
      stderr += str;
    });

    // 3. Attach 'close' last (Handles exit logic)
    child.on("close", (code, signal) => {
      if (stderr.includes("Permission denied")) {
        reject(
          new Error(`Permission denied error:
          - command: ${command}
          - args: ${args.join(" ")}
          - stdout: ${stdout}
          - stderr: ${stderr}
          - code: ${code}
          - signal: ${signal}
          `),
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

async function writeLogFile(baseDir, relativePath, result) {
  const outputPath = resolve(baseDir, `${relativePath}.log`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, toLog(result), "utf8");
  return outputPath;
}

const PERMISSION_DENIED_EXIT_CODE = 100;

async function main() {
  const testDataDir = resolve(ROOT_DIR, "test/data");
  let written = 0;

  for (const entry of testLogFiles) {
    if (entry.preExecCmdLine) {
      for (const cmd of entry.preExecCmdLine) {
        await execute(cmd);
      }
    }

    const result = await execute(entry.execCmdLine);
    const outputPath = await writeLogFile(testDataDir, entry.filepath, result);
    if (entry.postExecCmdLine) {
      for (const cmd of entry.postExecCmdLine) {
        await execute(cmd);
      }
    }

    written += 1;
    logInfo(`Wrote ${outputPath}`);
  }

  await execute("apt-get upgrade -y");
  await execute("apt-get autoremove -y");

  logSuccess(`Wrote ${written} command execution log(s).`);
}

const testLogFiles = [
  {
    filepath: "autoclean",
    execCmdLine: "apt-get autoclean",
  },
  {
    filepath: "autoremove_found",
    preExecCmdLine: ["apt-get install -y xdot", "apt-get remove -y xdot"],
    execCmdLine: "apt-get autoremove -y",
  },
  {
    filepath: "autoremove_notfound",
    preExecCmdLine: ["apt-get autoremove -y"],
    execCmdLine: "apt-get autoremove -y",
  },
  {
    filepath: "cacheshow_mixedfoundnotfound",
    execCmdLine: "apt-cache show --quiet=0 xdot python3 nonexistentpackage",
  },
  {
    filepath: "cacheshow_multiplefound",
    execCmdLine: "apt-cache show --quiet=0 xdot python3",
  },
  {
    filepath: "cacheshow_singlefound",
    execCmdLine: "apt-cache show --quiet=0 python3",
  },
  {
    filepath: "cacheshow_singlenotfound",
    execCmdLine: "apt-cache show --quiet=0 nonexistentpackage",
  },
  {
    filepath: "cacheshow_virtualpackage",
    execCmdLine: "apt-cache show --quiet=0 libvips",
  },
  {
    filepath: "cacheshow_virtualandnotpackages",
    execCmdLine: "apt-cache show --quiet=0 libvips xdot",
  },
  {
    filepath: "cacheshowpkg_virtualpackage",
    execCmdLine: "apt-cache showpkg --quiet=0 libvips",
  },
  {
    filepath: "install_mixedfoundnotfound",
    preExecCmdLine: ["apt-get remove -y xdot"],
    execCmdLine: "apt-get install -y xdot nonexistentpackage",
  },
  {
    filepath: "install_mixedinstallstatus",
    preExecCmdLine: [
      "apt-get install -y xdot",
      "apt-get remove -y rolldice",
      "apt-get autoremove -y",
    ],
    execCmdLine: "apt-get install -y rolldice xdot",
  },
  {
    filepath: "install_singleinstalled",
    preExecCmdLine: ["apt-get install -y xdot"],
    execCmdLine: "apt-get install -y xdot",
  },
  {
    filepath: "install_singlenotfound",
    execCmdLine: "apt-get install -y nonexistentpackage",
  },
  {
    filepath: "install_singlenotinstalled",
    preExecCmdLine: ["apt-get remove -y xdot", "apt-get autoremove -y"],
    execCmdLine: "apt-get install -y xdot",
  },
  {
    filepath: "listinstalled",
    execCmdLine: "dpkg-query -W -f ${binary:Package}=${Version}\\n",
  },
  {
    filepath: "listinstalledfiles_found",
    execCmdLine: "dpkg-query -L xdot",
  },
  {
    filepath: "listinstalledfiles_notfound",
    execCmdLine: "dpkg-query -L nonexistentpackage",
  },
  {
    filepath: "listupgradable_found",
    preExecCmdLine: [
      "apt-get remove -y firefox-locale-en",
      "apt-get install -y firefox-locale-en=75.0+build3-0ubuntu1",
      "apt-get remove -y uuid-dev",
      "apt-get install -y uuid-dev=2.34-0.1ubuntu9",
    ],
    execCmdLine: "apt list --upgradeable",
  },
  {
    filepath: "listupgradable_notfound",
    preExecCmdLine: ["apt-get upgrade -y"],
    execCmdLine: "apt list --upgradeable",
  },
  {
    filepath: "remove_mixedfoundnotfound",
    preExecCmdLine: ["apt-get install -y xdot"],
    execCmdLine: "apt-get remove -y xdot nonexistentpackage",
  },
  {
    filepath: "remove_mixedinstallstatus",
    preExecCmdLine: ["apt-get install -y xdot", "apt-get remove -y rolldice"],
    execCmdLine: "apt-get remove -y rolldice xdot",
  },
  {
    filepath: "remove_singlenotinstalled",
    preExecCmdLine: ["apt-get remove -y xdot"],
    execCmdLine: "apt-get remove -y xdot",
  },
  {
    filepath: "remove_singlenotfound",
    execCmdLine: "apt-get remove -y nonexistentpackage",
  },
  {
    filepath: "remove_singleinstalled",
    preExecCmdLine: ["apt-get install -y xdot"],
    execCmdLine: "apt-get remove -y xdot",
  },
  {
    filepath: "search_multiplefound",
    execCmdLine: "apt search vim",
  },
  {
    filepath: "search_nonefound",
    execCmdLine: "apt search nonexistentpackage",
  },
  {
    filepath: "search_singlefound",
    execCmdLine: "apt search vim-vimerl-syntax",
  },
  {
    filepath: "search_namesonlysinglefound",
    execCmdLine: "apt search --names-only bash",
  },
  {
    filepath: "update",
    execCmdLine: "apt-get update -y",
  },
  {
    filepath: "upgrade_mixedfoundnotfound",
    preExecCmdLine: ["apt-get remove -y xdot"],
    execCmdLine: "apt-get upgrade -y xdot nonexistentpackage",
  },
  {
    filepath: "upgrade_mixedupgradestatus",
    preExecCmdLine: [
      "apt-get install -y xdot",
      "apt-get remove -y xxd",
      "apt-get install -y xxd=2:8.1.2269-1ubuntu5.30",
    ],
    execCmdLine: "apt-get upgrade -y xxd xdot",
  },
  {
    filepath: "upgrade_singleupgraded",
    preExecCmdLine: ["apt-get upgrade -y xdot"],
    execCmdLine: "apt-get upgrade -y xdot",
  },
  {
    filepath: "upgrade_singlenotfound",
    execCmdLine: "apt-get upgrade -y nonexistentpackage",
  },
  {
    filepath: "upgrade_singlenotupgraded",
    preExecCmdLine: [
      "apt-get remove -y xxd",
      "apt-get install -y xxd=2:8.1.2269-1ubuntu5.30",
    ],
    execCmdLine: "apt-get upgrade -y xxd",
  },
  {
    filepath: "upgrade_singleupgraded",
    preExecCmdLine: ["apt-get install xdot"],
    execCmdLine: "apt-get upgrade xdot",
  },
];

await main().catch((error) => {
  fail(
    "Error occurred during log creation:\n" +
      String(error) +
      "\n" +
      (error.stack || ""),
  );
});
