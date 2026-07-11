#!/usr/bin/env -S node --experimental-strip-types

import process from "node:process";
import {
  ROOT_DIR,
  assertNonEmpty,
  confirmPrompt,
  fail,
  logInfo,
  logSuccess,
  run,
  runCaptureOutput,
  tryRun,
  usage,
} from "../devopslib.mts";

type BranchName = string;

const issueId = process.argv[2] ?? "";
const base = process.argv[3] ?? "";
const usageMessage = usage(
  process.argv[1] ?? "hotfix_pr.mts",
  "<issue ID> <target branch>",
);

assertNonEmpty(issueId, "Issue ID is empty", usageMessage);
assertNonEmpty(base, "Target branch is empty", usageMessage);

if (!/^\d+$/.test(issueId)) {
  fail("Issue ID must be an integer.");
}

const branchSuffix = `issue-${issueId}`;
const hotfixBranch = `hotfix/${branchSuffix}`;

function branchExistsOnOrigin(branch: BranchName): boolean {
  return tryRun(
    "git",
    ["ls-remote", "--exit-code", "--heads", "origin", branch],
    { cwd: ROOT_DIR },
  ).ok;
}

function createOrCheckoutBranch(
  checkoutBranch: BranchName,
  baseBranch: BranchName,
): void {
  if (branchExistsOnOrigin(checkoutBranch)) {
    logInfo(
      `Branch ${checkoutBranch} exists. Checking out and merging ${baseBranch}...`,
    );
    run("git", ["checkout", checkoutBranch], { cwd: ROOT_DIR });
    run("git", ["pull", "origin", checkoutBranch], { cwd: ROOT_DIR });
    run("git", ["merge", baseBranch], { cwd: ROOT_DIR });
  } else {
    logInfo(`Creating hotfix branch for issue ${issueId}...`);
    run("git", ["checkout", baseBranch], { cwd: ROOT_DIR });
    run("git", ["checkout", "-b", checkoutBranch], { cwd: ROOT_DIR });
    run("git", ["merge", baseBranch], { cwd: ROOT_DIR });
  }
}

function commitIfNeeded(message: string): void {
  run("git", ["add", "."], { cwd: ROOT_DIR });
  const commit = tryRun("git", ["commit", "-m", message], { cwd: ROOT_DIR });
  if (commit.ok) {
    return;
  }

  const combined = `${commit.stdout}\n${commit.stderr}`;
  if (/nothing to commit|no changes added to commit/i.test(combined)) {
    logSuccess("No local changes to commit.");
    return;
  }

  process.stderr.write(commit.stderr);
  process.exit(commit.status ?? 1);
}

function pushChanges(
  fixType: string,
  syncBranch: BranchName,
  syncBase: BranchName,
): void {
  const message = `${fixType}: resolve critical production issue in #${issueId}`;
  commitIfNeeded(message);

  const prUrl = runCaptureOutput(
    "gh",
    [
      "pr",
      "list",
      "--head",
      syncBranch,
      "--base",
      syncBase,
      "--state",
      "open",
      "--json",
      "url",
      "--jq",
      ".[0].url",
    ],
    { cwd: ROOT_DIR },
  );

  if (prUrl) {
    logSuccess(`PR already exists: ${prUrl}`);
  } else {
    logInfo("No PR found. Creating new PR...");
    run(
      "gh",
      [
        "pr",
        "create",
        "--head",
        syncBranch,
        "--base",
        syncBase,
        "--title",
        message,
      ],
      { cwd: ROOT_DIR },
    );
  }

  logInfo(`Pushing changes from ${syncBase} to ${syncBranch}...`);
  run("git", ["push", "origin", syncBranch], { cwd: ROOT_DIR });
}

async function main(): Promise<void> {
  createOrCheckoutBranch(hotfixBranch, base);

  await confirmPrompt(
    "Edit files and confirm to continue. This can always be rerun to pickup where you left off. Continue?",
  );

  pushChanges("fix", hotfixBranch, base);

  const syncBranch = `sync/staging-${branchSuffix}`;
  createOrCheckoutBranch(syncBranch, hotfixBranch);
  pushChanges("sync", syncBranch, "staging");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
