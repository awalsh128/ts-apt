/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  // Versions follow semantic-release's defaults: the first release is 1.0.0, tags are 'v<version>',
  // and the commit analyzer's default release rules apply (feat: minor; fix and perf: patch; a
  // breaking change: major).
  branches: [
    // Release candidates: 'prerelease: "rc"' versions them as the next release plus '-rc.<n>'
    // (e.g. v1.1.0-rc.1, v1.1.0-rc.2) and marks their GitHub Releases as prereleases.
    { name: "staging", prerelease: "rc" },

    // Official releases (e.g. v1.1.0), cut when promote.yml fast-forwards main to staging.
    "main",
  ],

  // Actions to perform during a release.
  //
  // Releases create a git tag, a GitHub Release, and (official releases only) an npm package; they
  // never commit. A release commit on 'main' would put 'main' ahead of 'staging', and 'main' must only
  // ever fast-forward to commits already on 'staging' (see .github/workflows/promote.yml). So the
  // committed package.json keeps its placeholder version and there is no CHANGELOG.md: the tags and
  // GitHub Releases are the version history.
  plugins: [
    // Analyzes commit messages (Conventional Commits) to determine if the next version should be a major,
    // minor, or patch bump.
    // The 'conventionalcommits' preset matches commitlint and, unlike the default 'angular' preset,
    // treats 'feat!:' as a breaking change.
    ["@semantic-release/commit-analyzer", { preset: "conventionalcommits" }],

    // Generates the release notes (changelog content) based on the commit history.
    [
      "@semantic-release/release-notes-generator",
      { preset: "conventionalcommits" },
    ],

    // Writes the release version into package.json in the CI workspace (not committed), so the
    // published package and the API docs (built below) carry it, then publishes to npm.
    // Only 'main' publishes. npm trusted publishing (OIDC) matches the top-level workflow file, and
    // official releases run from a release.yml dispatch while candidates run release.yml through a
    // ci.yml workflow_call, so npm trusts release.yml alone. Candidates still get a tag and a GitHub
    // prerelease.
    [
      "@semantic-release/npm",
      { npmPublish: process.env.GITHUB_REF === "refs/heads/main" },
    ],

    // Builds the API docs for the release, then reports the released version to the workflow.
    // Runs after @semantic-release/npm so the docs show the version it wrote into package.json, and
    // in 'prepare' so a docs build failure stops the release before it is tagged. Source links point
    // at the release tag. On 'main', release.yml deploys docs/api to GitHub Pages only when the
    // 'version' step output is set, so runs that release nothing (or dry runs) never deploy.
    // Commands are lodash templates: '${...}' is a semantic-release value, so shell variables are
    // written as '$NAME'.
    [
      "@semantic-release/exec",
      {
        prepareCmd: "npm run -s docs:api -- --gitRevision v${nextRelease.version}",
        successCmd:
          'if [ -n "$GITHUB_OUTPUT" ]; then echo "version=${nextRelease.version}" >> "$GITHUB_OUTPUT"; fi',
      },
    ],

    // Creates a GitHub Release with the generated notes and posts comments on resolved issues/PRs.
    "@semantic-release/github",
  ],
};
