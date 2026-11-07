/**
 * Enforces Conventional Commits so semantic-release can pick the version bump
 * from each commit's type (feat: minor, fix and perf: patch, `!` or a
 * BREAKING CHANGE footer: major).
 *
 * @type {import('@commitlint/types').UserConfig}
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // semantic-release's release commits embed release notes with long links.
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
