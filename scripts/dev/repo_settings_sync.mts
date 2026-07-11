#!/usr/bin/env -S node --experimental-strip-types

/**
 * Sync GitHub repository settings using GitHub CLI.
 *
 * Description:
 * - `download` fetches non-secret repository settings and writes them to JSON.
 * - `upload` reads the JSON file and PATCHes those settings back to the repository.
 *
 * Examples:
 *   npm run repo:settings:download
 *   npm run repo:settings:upload -- --dry-run
 *   npm run repo:settings:upload
 */

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineCommand, defineOptions } from "@robingenz/zli";
import { z } from "zod";
import {
  REPO_NAME,
  REPO_OWNER,
  commandExists,
  createCliConfig,
  fail,
  logInfo,
  logSuccess,
  runCli,
  runMain,
} from "../devopslib.mts";

type RepoSettings = {
  name?: string;
  description?: string | null;
  homepage?: string | null;
  default_branch?: string;
  has_issues?: boolean;
  has_projects?: boolean;
  has_wiki?: boolean;
  is_template?: boolean;
  allow_squash_merge?: boolean;
  allow_merge_commit?: boolean;
  allow_rebase_merge?: boolean;
  allow_auto_merge?: boolean;
  delete_branch_on_merge?: boolean;
  allow_update_branch?: boolean;
  web_commit_signoff_required?: boolean;
  squash_merge_commit_title?: string;
  squash_merge_commit_message?: string;
  merge_commit_title?: string;
  merge_commit_message?: string;
  security_and_analysis?: {
    advanced_security?: { status?: string };
    secret_scanning?: { status?: string };
    secret_scanning_push_protection?: { status?: string };
  };
};

type SettingsFile = {
  owner: string;
  repo: string;
  exportedAt: string;
  settings: RepoSettings;
};

const SETTINGS_KEYS: Array<keyof RepoSettings> = [
  "name",
  "description",
  "homepage",
  "default_branch",
  "has_issues",
  "has_projects",
  "has_wiki",
  "is_template",
  "allow_squash_merge",
  "allow_merge_commit",
  "allow_rebase_merge",
  "allow_auto_merge",
  "delete_branch_on_merge",
  "allow_update_branch",
  "web_commit_signoff_required",
  "squash_merge_commit_title",
  "squash_merge_commit_message",
  "merge_commit_title",
  "merge_commit_message",
  "security_and_analysis",
];

function runGh(args: string[], input?: string): string {
  const result = spawnSync("gh", args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
    input,
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || "unknown error";
    fail(`gh ${args.join(" ")} failed: ${stderr}`);
  }

  return result.stdout ?? "";
}

function pickSettings(repoJson: Record<string, unknown>): RepoSettings {
  const settings: RepoSettings = {};
  for (const key of SETTINGS_KEYS) {
    if (!(key in repoJson)) {
      continue;
    }
    (settings as Record<string, unknown>)[key] = repoJson[key] as unknown;
  }
  return settings;
}

function writeSettingsFile(filePath: string, payload: SettingsFile): void {
  const absPath = path.resolve(filePath);
  const dir = path.dirname(absPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  logSuccess(`Wrote repository settings to ${absPath}`);
  logInfo(`Directory: ${dir}`);
}

function readSettingsFile(filePath: string): SettingsFile {
  const absPath = path.resolve(filePath);
  const raw = readFileSync(absPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<SettingsFile>;

  if (!parsed || typeof parsed !== "object") {
    fail(`Invalid JSON in ${absPath}`);
  }
  const settings = parsed.settings;
  if (!settings || typeof settings !== "object") {
    fail(`Missing 'settings' object in ${absPath}`);
  }

  return {
    owner: parsed.owner ?? REPO_OWNER,
    repo: parsed.repo ?? REPO_NAME,
    exportedAt: parsed.exportedAt ?? new Date(0).toISOString(),
    settings: settings as RepoSettings,
  };
}

function buildPatchPayload(settings: RepoSettings): RepoSettings {
  const payload: RepoSettings = {};
  for (const key of SETTINGS_KEYS) {
    const value = settings[key];
    if (value === undefined) {
      continue;
    }
    (payload as Record<string, unknown>)[key] = value;
  }
  return payload;
}

function downloadSettings(owner: string, repo: string, filePath: string): void {
  logInfo(`Downloading repository settings for ${owner}/${repo}...`);
  const output = runGh(["api", `repos/${owner}/${repo}`]);
  const repoJson = JSON.parse(output) as Record<string, unknown>;
  const settings = pickSettings(repoJson);

  const payload: SettingsFile = {
    owner,
    repo,
    exportedAt: new Date().toISOString(),
    settings,
  };

  writeSettingsFile(filePath, payload);
}

function uploadSettings(
  owner: string,
  repo: string,
  filePath: string,
  dryRun: boolean,
): void {
  const settingsFile = readSettingsFile(filePath);
  const payload = buildPatchPayload(settingsFile.settings);

  if (Object.keys(payload).length === 0) {
    fail("Settings payload is empty. Nothing to upload.");
  }

  logInfo(`Uploading repository settings to ${owner}/${repo}...`);

  if (dryRun) {
    logInfo("Dry-run mode enabled. Payload that would be uploaded:");
    console.log(JSON.stringify(payload, null, 2));
    logSuccess("Dry-run complete. No remote changes were made.");
    return;
  }

  const tempDir = mkdtempSync(path.join(tmpdir(), "ts-apt-repo-settings-"));
  const payloadFile = path.join(tempDir, "payload.json");

  try {
    writeFileSync(payloadFile, JSON.stringify(payload), "utf8");
    runGh([
      "api",
      "-X",
      "PATCH",
      `repos/${owner}/${repo}`,
      "--input",
      payloadFile,
    ]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  logSuccess(`Uploaded repository settings to ${owner}/${repo}`);
}

function ensurePrerequisites(): void {
  if (!commandExists("gh")) {
    fail("GitHub CLI ('gh') is required.");
  }

  const authCheck = spawnSync("gh", ["auth", "status"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (authCheck.status !== 0) {
    fail("GitHub CLI is not authenticated. Run 'gh auth login' first.");
  }
}

const sharedOptions = defineOptions(
  z.object({
    owner: z.string().default(REPO_OWNER).describe("GitHub repository owner"),
    repo: z.string().default(REPO_NAME).describe("GitHub repository name"),
    file: z
      .string()
      .default(".github/repo-settings.json")
      .describe("Settings JSON path"),
    dryRun: z
      .boolean()
      .default(false)
      .describe("Print the upload payload without applying changes"),
  }),
  { o: "owner", r: "repo", f: "file", d: "dryRun" },
);

const downloadCommand = defineCommand({
  description: "Download repository settings to a JSON file",
  options: sharedOptions,
  action: async (options) => {
    downloadSettings(options.owner, options.repo, options.file);
  },
});

const uploadCommand = defineCommand({
  description: "Upload repository settings from a JSON file",
  options: sharedOptions,
  action: async (options) => {
    uploadSettings(options.owner, options.repo, options.file, options.dryRun);
  },
});

const cliConfig = createCliConfig({
  importMetaUrl: import.meta.url,
  description: "Sync GitHub repository settings",
  commands: {
    download: downloadCommand,
    upload: uploadCommand,
  },
});

async function main(): Promise<void> {
  ensurePrerequisites();
  await runCli(cliConfig);
}

await runMain(main);
