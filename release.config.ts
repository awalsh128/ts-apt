import type { GlobalConfig } from "semantic-release";

const preid = (process.env.PREID ?? "rc").trim() || "rc";

const config: GlobalConfig = {
  branches: [
    "main", // Stable releases (latest)
    { name: "next", channel: "next", prerelease: preid }, // Pre-releases (e.g., v1.0.0-rc.1)
  ],
  plugins: [
    // 1. Analyze commits to determine version bump (major/minor/patch)
    "@semantic-release/commit-analyzer",

    // 2. Generate release notes from commit messages
    "@semantic-release/release-notes-generator",

    // 3. Update CHANGELOG.md
    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md" }],

    // 4. Update package.json/version and publish to npm
    [
      "@semantic-release/npm",
      {
        npmPublish: true, // Publishes to npm registry
        pkgRoot: ".", // Root directory where package.json lives
        // If you have a 'dist' folder, set pkgRoot: 'dist' and ensure package.json is copied there
      },
    ],

    // 5. Commit changelog and version changes back to Git
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md", "package.json", "package-lock.json"],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],

    // 6. Create GitHub Release with notes and assets
    [
      "@semantic-release/github",
      {
        assets: [
          // Upload build artifacts if you have them (e.g., compiled JS, types)
          // { path: 'dist/**', label: 'Distribution Files' },
        ],
        // Automatically comment on PRs/Issues resolved by this release
        successComment: false,
      },
    ],
  ],
};

export default config;
