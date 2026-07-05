#!/usr/bin/env -S node --experimental-strip-types
// @ts-nocheck

/**
 * Sync GitHub repository settings using GitHub CLI.
 *
 * Description:
 * - `download` fetches non-secret repository settings and writes them to JSON.
 * - `upload` reads the JSON file and PATCHes those settings back to the repository.
 *
 * Usage:
 *   node --experimental-strip-types ./scripts/dev/repo_settings_sync.mts <download|upload> [options]
 *
 * Options:
 *   --owner <owner>  GitHub repository owner (default: value from devopslib.mts)
 *   --repo <repo>    GitHub repository name (default: value from devopslib.mts)
 *   --file <path>    Settings JSON path (default: .github/repo-settings.json)
 *   --dry-run        For upload only; prints payload without applying changes
 *
 * Examples:
 *   npm run repo:settings:download
 *   npm run repo:settings:upload -- --dry-run
 *   npm run repo:settings:upload
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  REPO_NAME,
  REPO_OWNER,
  assertNonEmpty,
  commandExists,
  fail,
  logInfo,
  logSuccess,
  usage,
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

function isSyncCommand(
  value: string | undefined,
): value is "download" | "upload" {
  return value === "download" || value === "upload";
}

function parseArgs(argv: string[]): {
  command: "download" | "upload";
  owner: string;
  repo: string;
  file: string;
  dryRun: boolean;
} {
  const cmd = argv[2]?.trim();
  if (!isSyncCommand(cmd)) {
    console.error(
      usage(
        process.argv[1] ?? "repo_settings_sync.mts",
        "<download|upload> [--owner <owner>] [--repo <repo>] [--file <path>] [--dry-run]",
      ),
    );
    fail("Command must be either 'download' or 'upload'.");
    throw new Error("unreachable");
  }

  let owner = REPO_OWNER;
  let repo = REPO_NAME;
  let file = ".github/repo-settings.json";
  let dryRun = false;

  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--owner") {
      owner = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg === "--repo") {
      repo = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg === "--file") {
      file = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }

  assertNonEmpty(owner, "--owner cannot be empty");
  assertNonEmpty(repo, "--repo cannot be empty");
  assertNonEmpty(file, "--file cannot be empty");

  return { command: cmd, owner, repo, file, dryRun };
}

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

function main(): void {
  ensurePrerequisites();
  const { command, owner, repo, file, dryRun } = parseArgs(process.argv);

  if (command === "download") {
    downloadSettings(owner, repo, file);
    return;
  }

  uploadSettings(owner, repo, file, dryRun);
}

main();
