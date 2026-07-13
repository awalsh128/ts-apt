#!/usr/bin/env -S node --experimental-strip-types

/**
 * Sync GitHub repository ruleset bypass actors using GitHub CLI.
 *
 * Description:
 * - `download` fetches the current rulesets for the repository and writes
 *   them to the rulesets JSON file alongside the existing bypass-actor config.
 * - `upload` reads the rulesets JSON file and ensures every app listed in
 *   `appsBypassActors` is present as a bypass actor on every ruleset.
 *
 * Finding the app slug:
 *   Run `download` first — the output includes currently installed apps.
 *   Alternatively, inspect the "Generate Release Bot Token" step in the
 *   release workflow; the `app-slug` output is printed in the annotations.
 *
 * Examples:
 *   npm run repo:rulesets:download
 *   npm run repo:rulesets:upload -- --dry-run
 *   npm run repo:rulesets:upload
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  logWarn,
  runCli,
  runMain,
} from "../devopslib.mts";

/** A single bypass actor entry as returned or accepted by the GitHub API. */
type BypassActor = {
  actor_id: number;
  actor_type:
    | "RepositoryRole"
    | "Team"
    | "Integration"
    | "OrganizationAdmin"
    | "DeployKey";
  bypass_mode: "always" | "pull_request";
};

/** A ruleset as returned by GET /repos/{owner}/{repo}/rulesets/{id}. */
type Ruleset = {
  id: number;
  name: string;
  target: string;
  enforcement: string;
  bypass_actors: BypassActor[];
};

/** Desired bypass configuration for a GitHub App (Integration). */
type AppBypassConfig = {
  /**
   * The GitHub App slug (URL-safe lowercase name visible on
   * https://github.com/apps/{slug}).  Run `download` to discover installed
   * app slugs, or check the `app-slug` output of the release workflow's
   * "Generate Release Bot Token" step.
   */
  appSlug: string;
  /** Whether the bypass applies to all pushes or only pull requests. */
  bypassMode: "always" | "pull_request";
};

/** Shape of `.github/rulesets.json`. */
type RulesetsFile = {
  owner: string;
  repo: string;
  exportedAt: string;
  /**
   * GitHub Apps that should be bypass actors on every ruleset in this
   * repository.  Populated by the maintainer; applied by `upload`.
   */
  appsBypassActors: AppBypassConfig[];
  /**
   * Snapshot of the repository rulesets as fetched by `download`.
   * Leave empty when committing the initial config; run `download` to
   * populate.
   */
  rulesets: Ruleset[];
};

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

function readRulesetsFile(filePath: string): RulesetsFile {
  const absPath = path.resolve(filePath);
  const raw = readFileSync(absPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<RulesetsFile>;

  if (!parsed || typeof parsed !== "object") {
    fail(`Invalid JSON in ${absPath}`);
  }

  return {
    owner: parsed.owner ?? REPO_OWNER,
    repo: parsed.repo ?? REPO_NAME,
    exportedAt: parsed.exportedAt ?? new Date(0).toISOString(),
    appsBypassActors: parsed.appsBypassActors ?? [],
    rulesets: parsed.rulesets ?? [],
  };
}

function writeRulesetsFile(filePath: string, payload: RulesetsFile): void {
  const absPath = path.resolve(filePath);
  const dir = path.dirname(absPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  logSuccess(`Wrote rulesets to ${absPath}`);
}

/** Resolve a GitHub App slug to its installation ID for the given repo. */
function resolveInstallationId(
  appSlug: string,
  owner: string,
  repo: string,
): number | null {
  try {
    const raw = runGh([
      "api",
      `/repos/${owner}/${repo}/installation`,
      "--jq",
      ".id",
    ]);
    const id = parseInt(raw.trim(), 10);
    if (!Number.isNaN(id)) {
      return id;
    }
  } catch {
    // Fall through to user installations lookup.
  }

  try {
    const raw = runGh([
      "api",
      "/user/installations",
      "--paginate",
      "--jq",
      `.installations[] | select(.app_slug == "${appSlug}") | .id`,
    ]);
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 0) {
      const id = parseInt(lines[0] ?? "", 10);
      if (!Number.isNaN(id)) {
        return id;
      }
    }
  } catch {
    // Fall through.
  }

  return null;
}

/** Fetch the full details of all repository rulesets. */
function fetchRulesets(owner: string, repo: string): Ruleset[] {
  const listRaw = runGh(["api", `/repos/${owner}/${repo}/rulesets`]);
  const list = JSON.parse(listRaw) as Array<{ id: number }>;

  return list.map((entry) => {
    const detailRaw = runGh([
      "api",
      `/repos/${owner}/${repo}/rulesets/${entry.id}`,
    ]);
    return JSON.parse(detailRaw) as Ruleset;
  });
}

function downloadRulesets(owner: string, repo: string, filePath: string): void {
  logInfo(`Downloading rulesets for ${owner}/${repo}...`);
  const rulesets = fetchRulesets(owner, repo);

  const existing = (() => {
    try {
      return readRulesetsFile(filePath);
    } catch {
      return null;
    }
  })();

  const payload: RulesetsFile = {
    owner,
    repo,
    exportedAt: new Date().toISOString(),
    appsBypassActors: existing?.appsBypassActors ?? [],
    rulesets,
  };

  writeRulesetsFile(filePath, payload);
  logInfo(`Found ${rulesets.length} ruleset(s).`);
}

function uploadRulesets(
  owner: string,
  repo: string,
  filePath: string,
  dryRun: boolean,
): void {
  const config = readRulesetsFile(filePath);

  if (config.appsBypassActors.length === 0) {
    logWarn("No appsBypassActors configured; nothing to apply.");
    return;
  }

  logInfo(`Fetching current rulesets for ${owner}/${repo}...`);
  const rulesets = fetchRulesets(owner, repo);

  if (rulesets.length === 0) {
    logWarn("No rulesets found in the repository.");
    return;
  }

  for (const cfg of config.appsBypassActors) {
    logInfo(`Resolving installation ID for app slug "${cfg.appSlug}"...`);
    const installationId = resolveInstallationId(cfg.appSlug, owner, repo);

    if (installationId === null) {
      fail(
        `Could not resolve installation ID for app slug "${cfg.appSlug}". ` +
          `Verify the slug with 'gh api /user/installations --jq ".installations[].app_slug"' ` +
          `or check the release workflow's "Generate Release Bot Token" step output.`,
      );
    }

    const resolvedId = installationId as number;
    logInfo(`Resolved "${cfg.appSlug}" → installation ID ${resolvedId}.`);

    for (const ruleset of rulesets) {
      const alreadyBypassed = ruleset.bypass_actors.some(
        (a) => a.actor_id === resolvedId && a.actor_type === "Integration",
      );

      if (alreadyBypassed) {
        logInfo(
          `Ruleset "${ruleset.name}" (${ruleset.id}): ` +
            `"${cfg.appSlug}" is already a bypass actor.`,
        );
        continue;
      }

      const updated: BypassActor[] = [
        ...ruleset.bypass_actors,
        {
          actor_id: resolvedId,
          actor_type: "Integration",
          bypass_mode: cfg.bypassMode,
        },
      ];

      logInfo(
        `Ruleset "${ruleset.name}" (${ruleset.id}): ` +
          `adding "${cfg.appSlug}" as bypass actor (${cfg.bypassMode})...`,
      );

      if (dryRun) {
        logInfo(
          "Dry-run mode: would PATCH with " +
            JSON.stringify({ bypass_actors: updated }, null, 2),
        );
        continue;
      }

      runGh(
        [
          "api",
          "-X",
          "PATCH",
          `/repos/${owner}/${repo}/rulesets/${ruleset.id}`,
          "--input",
          "-",
        ],
        JSON.stringify({ bypass_actors: updated }),
      );

      logSuccess(
        `Ruleset "${ruleset.name}" (${ruleset.id}): ` +
          `"${cfg.appSlug}" added as bypass actor.`,
      );
    }
  }

  if (!dryRun) {
    logSuccess("Ruleset bypass actors applied successfully.");
  } else {
    logSuccess("Dry-run complete. No remote changes were made.");
  }
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
      .default(".github/repo-rulesets.json")
      .describe("Rulesets JSON path"),
    dryRun: z
      .boolean()
      .default(false)
      .describe("Print changes without applying them"),
  }),
  { o: "owner", r: "repo", f: "file", d: "dryRun" },
);

const downloadCommand = defineCommand({
  description:
    "Download current repository rulesets (including bypass actors) to a JSON file",
  options: sharedOptions,
  action: async (options) => {
    downloadRulesets(options.owner, options.repo, options.file);
  },
});

const uploadCommand = defineCommand({
  description:
    "Apply appsBypassActors from the JSON file to all repository rulesets",
  options: sharedOptions,
  action: async (options) => {
    uploadRulesets(options.owner, options.repo, options.file, options.dryRun);
  },
});

const cliConfig = createCliConfig({
  importMetaUrl: import.meta.url,
  description: "Sync GitHub repository ruleset bypass actors",
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
