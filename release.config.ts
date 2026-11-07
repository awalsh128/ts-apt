/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  // The 'branches' array defines the release workflow and versioning strategy.
  // Order matters: list branches from least stable to most stable.
  branches: [
    // Development branch is assumed to be from local development and may contain breaking changes.

    // Pre-release candidate, feature complete, but may contain known bugs.
    //
    //   'staging' is for release candidates.
    //   'channel: "next"' publishes to the '@next' tag on npm.
    //   'prerelease: "rc"' adds the '-rc.x' suffix (e.g., v1.1.0-rc.1).
    { name: "staging", channel: "next", prerelease: "rc" },

    // Final and stable release.
    //
    // No prerelease tag and are published to the 'latest' dist-tag on npm.
    "main",
  ],

  // Actions to perform during a release.
  //
  // Releases only create a git tag and a GitHub Release; they never commit. A release commit on 'main'
  // would put 'main' ahead of 'staging', and 'main' must only ever fast-forward to commits already on
  // 'staging' (see .github/workflows/promote.yml). So package.json keeps its placeholder version and
  // there is no CHANGELOG.md: the tags and GitHub Releases are the version history, and consumers such
  // as cache-apt-pkgs-action install ts-apt from a git commit SHA rather than from npm.
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

    // Creates a GitHub Release with the generated notes and posts comments on resolved issues/PRs.
    "@semantic-release/github",
  ],
};
