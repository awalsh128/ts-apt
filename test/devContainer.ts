import { resolve } from "path";
import type {
  CommandOptions,
  CommandResult,
  CommandRunner,
} from "../src/types.js";
import winston from "winston";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { DefaultCommandRunner } from "../src/commandRunner.js";

const workspaceFolder = resolve(__dirname, "..");
const devcontainerConfigPath = resolve(
  workspaceFolder,
  ".devcontainer",
  "jsnode-24.json",
);

type DevcontainerSupport = {
  supported: boolean;
  reason?: string;
  cliPath?: string;
};

function probeCommand(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, {
    stdio: "ignore",
  });
  return result.status === 0;
}

function resolveDevcontainerCli(): string | undefined {
  const envCliPath = process.env.DEVCONTAINER_CLI?.trim();
  if (envCliPath && existsSync(envCliPath)) {
    return envCliPath;
  }

  const localCliPath = resolve(
    workspaceFolder,
    "node_modules",
    ".bin",
    "devcontainer",
  );
  if (existsSync(localCliPath)) {
    return localCliPath;
  }

  const fromPath = spawnSync("bash", ["-lc", "command -v devcontainer"], {
    encoding: "utf8",
  });
  if (fromPath.status === 0) {
    const cliPath = fromPath.stdout.trim();
    if (cliPath.length > 0) {
      return cliPath;
    }
  }

  return undefined;
}

export function getDevcontainerSupport(): DevcontainerSupport {
  if (process.platform !== "linux") {
    return {
      supported: false,
      reason: "linux-only integration tests",
    };
  }

  if (!existsSync(devcontainerConfigPath)) {
    return {
      supported: false,
      reason: "missing .devcontainer/jsnode-24.json config",
    };
  }

  const cliPath = resolveDevcontainerCli();
  if (!cliPath) {
    return {
      supported: false,
      reason: "devcontainer CLI unavailable",
    };
  }

  if (!probeCommand("docker", ["info"])) {
    return {
      supported: false,
      reason: "docker daemon unavailable",
    };
  }

  return {
    supported: true,
    cliPath,
  };
}

class DevcontainerCommandRunner implements CommandRunner {
  private readonly delegate: DefaultCommandRunner;
  private readonly cliPath: string;

  constructor(
    cliPath: string,
    appLogger: winston.Logger,
    execLogger: winston.Logger,
  ) {
    this.cliPath = cliPath;
    this.delegate = new DefaultCommandRunner(appLogger, execLogger);
  }

  async run(
    command: string,
    args: string[] = [],
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    return await this.delegate.run(
      this.cliPath,
      [
        "exec",
        "--workspace-folder",
        workspaceFolder,
        "--config",
        devcontainerConfigPath,
        command,
        ...args,
      ],
      options,
    );
  }
}

async function ensureDevcontainerUp(
  cliPath: string,
  appLogger: winston.Logger,
  execLogger: winston.Logger,
): Promise<void> {
  const runner = new DefaultCommandRunner(appLogger, execLogger);
  await runner.run(
    cliPath,
    [
      "up",
      "--workspace-folder",
      workspaceFolder,
      "--config",
      devcontainerConfigPath,
    ],
    { timeoutMs: 300_000 },
  );
}

export async function createDevcontainerCommandRunner(
  appLogger: winston.Logger,
  execLogger: winston.Logger,
): Promise<DevcontainerCommandRunner> {
  const support = getDevcontainerSupport();
  if (!support.supported || !support.cliPath) {
    throw new Error(
      `Devcontainer support unavailable: ${support.reason ?? "unknown reason"}`,
    );
  }
  await ensureDevcontainerUp(support.cliPath, appLogger, execLogger);
  return new DevcontainerCommandRunner(support.cliPath, appLogger, execLogger);
}
