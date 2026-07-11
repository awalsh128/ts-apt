#!/usr/bin/env -S node --experimental-strip-types

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  COLORS,
  fail,
  GITHUB_API_BASE_URL,
  GITHUB_USER_AGENT,
  log,
  logError,
  logInfo,
  logSuccess,
  logWarn,
  runCaptureOutput,
  usage,
} from "../devopslib.mts";

type ScanInput =
  | { mode: "scan"; rootDir: string }
  | { mode: "single"; actionPath: string; currentRef: string };

type ActionPin = {
  filePath: string;
  lineNumber: number;
  actionPath: string;
  currentRef: string;
};

type GitHubRelease = {
  tag_name: string;
  html_url?: string;
};

type RepoData = {
  tagMap: Map<string, string>;
  latestRelease: GitHubRelease | null;
  releases: GitHubRelease[];
};

type ActionAnalysis = {
  actionPath: string;
  repoSlug: string;
  currentRef: string;
  currentSha: string;
  currentRelease: GitHubRelease | null;
  latestRelease: GitHubRelease | null;
  latestSha: string | null;
  notPinned: boolean;
  isCurrent: boolean;
};

const usageMessage = usage(
  process.argv[1] ?? "check_latest_action_pin.mts",
  "<owner/repo[/path]@ref | owner/repo[/path] ref | --scan [directory]>",
);

function parseInput(argv: string[]): ScanInput {
  const firstArg = argv[0] ?? "";
  if (firstArg === "--scan") {
    return {
      mode: "scan",
      rootDir: argv[1] ?? ".github",
    };
  }

  if (argv.length === 1) {
    if (firstArg.length === 0) {
      fail(usageMessage);
    }
    const singleArg = firstArg;

    const atIndex = singleArg.lastIndexOf("@");
    if (atIndex <= 0 || atIndex === singleArg.length - 1) {
      fail(usageMessage);
    }

    return {
      mode: "single",
      actionPath: singleArg.slice(0, atIndex),
      currentRef: singleArg.slice(atIndex + 1),
    };
  }

  if (argv.length === 2) {
    const actionPath = argv[0] ?? "";
    const currentRef = argv[1] ?? "";
    if (actionPath.length === 0 || currentRef.length === 0) {
      fail(usageMessage);
    }

    return {
      mode: "single",
      actionPath,
      currentRef,
    };
  }

  fail(usageMessage);
  throw new Error("unreachable");
}

function parseRepoSlug(actionPath: string): string {
  const parts = actionPath.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error(
      `Action path '${actionPath}' must include at least owner/repo.`,
    );
  }

  return `${parts[0]}/${parts[1]}`;
}

function git(args: string[]): string {
  return runCaptureOutput("git", args, {
    cwd: process.cwd(),
  });
}

function buildTagMap(repoSlug: string): Map<string, string> {
  const remoteUrl = `https://github.com/${repoSlug}.git`;
  const output = git(["ls-remote", "--tags", remoteUrl]);
  const tagMap = new Map<string, string>();

  for (const line of output.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    const [sha, ref] = line.split(/\s+/);
    const prefix = "refs/tags/";
    if (!sha || !ref || !ref.startsWith(prefix)) {
      continue;
    }

    const rawTag = ref.slice(prefix.length);
    const isPeeled = rawTag.endsWith("^{}");
    const tag = isPeeled ? rawTag.slice(0, -3) : rawTag;
    if (isPeeled || !tagMap.has(tag)) {
      tagMap.set(tag, sha.toLowerCase());
    }
  }

  return tagMap;
}

function resolveRefSha(
  repoSlug: string,
  ref: string,
  tagMap: Map<string, string>,
): string {
  const normalizedRef = ref.toLowerCase();
  if (/^[0-9a-f]{40}$/.test(normalizedRef)) {
    return normalizedRef;
  }

  if (tagMap.has(ref)) {
    return tagMap.get(ref) ?? ref;
  }

  const remoteUrl = `https://github.com/${repoSlug}.git`;
  const output = git(["ls-remote", remoteUrl, ref]);
  const firstLine = output.split("\n")[0] ?? "";
  const [sha] = firstLine.split(/\s+/);
  if (!sha) {
    throw new Error(`Unable to resolve ref '${ref}' for ${repoSlug}.`);
  }

  return sha.toLowerCase();
}

async function fetchJson(url: string): Promise<unknown | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": GITHUB_USER_AGENT,
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(url, { headers });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${body}`);
  }

  return response.json();
}

async function getLatestRelease(
  repoSlug: string,
): Promise<GitHubRelease | null> {
  const release = await fetchJson(
    `${GITHUB_API_BASE_URL}/repos/${repoSlug}/releases/latest`,
  );
  return release && typeof release === "object"
    ? (release as GitHubRelease)
    : null;
}

async function getReleases(repoSlug: string): Promise<GitHubRelease[]> {
  const releases = await fetchJson(
    `${GITHUB_API_BASE_URL}/repos/${repoSlug}/releases?per_page=100`,
  );
  return Array.isArray(releases) ? releases : [];
}

function findReleaseBySha(
  releases: GitHubRelease[],
  tagMap: Map<string, string>,
  sha: string,
): GitHubRelease | null {
  return (
    releases.find(
      (release) => tagMap.get(release.tag_name)?.toLowerCase() === sha,
    ) ?? null
  );
}

function walkFiles(rootDir: string): string[] {
  const results: string[] = [];

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
      continue;
    }

    if (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")) {
      results.push(fullPath);
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

function findActionPins(rootDir: string): ActionPin[] {
  const results: ActionPin[] = [];
  const usesPattern = /^\s*uses:\s*["']?([^"'\s#]+)["']?/;

  for (const filePath of walkFiles(rootDir)) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const match = usesPattern.exec(line);
      if (!match) {
        continue;
      }

      const spec = match[1] ?? "";
      if (
        !spec.includes("@") ||
        spec.startsWith("./") ||
        spec.startsWith("docker://")
      ) {
        continue;
      }

      const atIndex = spec.lastIndexOf("@");
      const actionPath = spec.slice(0, atIndex);
      const currentRef = spec.slice(atIndex + 1);
      if (!actionPath || !currentRef) {
        continue;
      }

      results.push({
        filePath,
        lineNumber: index + 1,
        actionPath,
        currentRef,
      });
    }
  }

  return results;
}

const repoCache = new Map<string, Promise<RepoData>>();

async function getRepoData(repoSlug: string): Promise<RepoData> {
  const cached = repoCache.get(repoSlug);
  if (cached) {
    return cached;
  }

  const promise = (async (): Promise<RepoData> => {
    const tagMap = buildTagMap(repoSlug);
    const [latestRelease, releases] = await Promise.all([
      getLatestRelease(repoSlug),
      getReleases(repoSlug),
    ]);
    return { tagMap, latestRelease, releases };
  })();

  repoCache.set(repoSlug, promise);
  return promise;
}

async function analyzeAction(
  actionPath: string,
  currentRef: string,
): Promise<ActionAnalysis> {
  const repoSlug = parseRepoSlug(actionPath);
  const { tagMap, latestRelease, releases } = await getRepoData(repoSlug);
  const currentSha = resolveRefSha(repoSlug, currentRef, tagMap);
  const currentRelease = findReleaseBySha(releases, tagMap, currentSha);
  const latestSha = latestRelease
    ? (tagMap.get(latestRelease.tag_name) ?? null)
    : null;
  const isCurrent = latestSha !== null && latestSha === currentSha;

  return {
    actionPath,
    repoSlug,
    currentRef,
    currentSha,
    currentRelease,
    latestRelease,
    latestSha,
    notPinned: latestSha === null,
    isCurrent,
  };
}

function printAnalysis(analysis: ActionAnalysis): number {
  const logFieldValue = (field: string, value: string) => {
    log(`${COLORS.cyan}${field}:${COLORS.reset} ${value}`, {
      indent: 3,
    });
  };
  logFieldValue("Action", analysis.actionPath);
  logFieldValue("Repository", analysis.repoSlug);
  logFieldValue("Current ref", analysis.currentRef);
  logFieldValue("Current sha", analysis.currentSha);
  logFieldValue("Current release", analysis.currentRelease?.tag_name ?? "none");
  logFieldValue(
    "Current release URL",
    analysis.currentRelease?.html_url ?? "none",
  );
  logFieldValue("Latest release", analysis.latestRelease?.tag_name ?? "none");
  logFieldValue(
    "Latest pin",
    analysis.latestSha
      ? `${analysis.actionPath}@${analysis.latestSha}`
      : "none",
  );
  logFieldValue(
    "Latest release URL",
    analysis.latestRelease?.html_url ?? "none",
  );
  if (analysis.latestSha === null) {
    logError(`Status: no release found`);
    return 1;
  }
  if (analysis.isCurrent) {
    logSuccess(`Status: up to date`);
  } else {
    logWarn(`Status: update available`);
  }
  return 0;
}

async function main(): Promise<void> {
  const input = parseInput(process.argv.slice(2));

  if (input.mode === "scan") {
    const rootDir = path.resolve(process.cwd(), input.rootDir);
    const pins = findActionPins(rootDir);
    if (pins.length === 0) {
      logInfo(`No pinned GitHub Actions found under ${input.rootDir}.`);
      return;
    }

    let updateCount = 0;
    for (const pin of pins) {
      const analysis = await analyzeAction(pin.actionPath, pin.currentRef);
      logInfo(`File: ${pin.filePath}:${pin.lineNumber}`, {
        color: COLORS.yellow,
      });
      printAnalysis(analysis);
      console.log("");
      if (analysis.latestSha && !analysis.isCurrent) {
        updateCount += 1;
      }
    }

    logSuccess(`Scanned ${pins.length} pinned action reference(s).`);
    logWarn(`Updates available: ${updateCount}`);
    return;
  }

  const analysis = await analyzeAction(input.actionPath, input.currentRef);
  printAnalysis(analysis);

  if (analysis.latestSha && !analysis.isCurrent) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
