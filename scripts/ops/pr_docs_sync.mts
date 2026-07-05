#!/usr/bin/env -S node --experimental-strip-types
// @ts-nocheck

import {
  assertNonEmpty,
  fail,
  logError,
  logInfo,
  logSuccess,
  run,
  tryRun,
  usage,
} from "../devopslib.mts";

function main(argv: string[]): void {
  const headRef = argv[2] ?? "";
  assertNonEmpty(
    headRef,
    "Missing required PR head ref.",
    usage(argv[1] ?? "pr_docs_sync.mts", "<pr-head-ref>"),
  );

  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", [
    "config",
    "user.email",
    "github-actions[bot]@users.noreply.github.com",
  ]);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    logInfo(`Docs sync attempt ${attempt}/3`);

    run("npm", ["run", "docs:api"]);
    run("git", ["add", "docs/"]);

    const hasStagedChanges = !tryRun("git", ["diff", "--staged", "--quiet"]).ok;
    if (!hasStagedChanges) {
      logInfo("No doc changes to commit.");
      return;
    }

    run("git", ["commit", "-m", "docs: auto-update generated docs"]);

    const pushResult = tryRun("git", ["push", "origin", `HEAD:${headRef}`]);
    if (pushResult.ok) {
      logSuccess("Docs sync push succeeded.");
      return;
    }

    logInfo(
      "Push rejected; refreshing from remote branch and regenerating docs...",
    );
    run("git", ["reset", "--hard", "HEAD~1"]);
    run("git", ["fetch", "origin", headRef]);
    run("git", ["reset", "--hard", `origin/${headRef}`]);
  }

  fail("Docs sync failed after 3 attempts due to ongoing remote updates.");
}

try {
  main(process.argv);
} catch (error) {
  logError(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
