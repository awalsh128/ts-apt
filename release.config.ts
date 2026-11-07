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
