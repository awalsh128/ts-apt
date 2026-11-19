import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Integration tests install real packages, which can be slow on a loaded mirror.
    testTimeout: 300000,
    hookTimeout: 300000,
    coverage: {
      provider: "v8",
      reporter: ["lcov", "json"], // Required for Codecov + Annotations
      include: ["src/**/*.{js,ts}"],
      // Exclude test files and build artifacts from coverage or it will fail due to skews or mismatches
      exclude: ["node_modules", "dist/", "test/"],
      // Ensure v8 doesn't pick up external files
      allowExternal: false,
      thresholds: {
        // TODO: Update once coverage is improved. Release is still unstable.
        // statements: 90,
        // branches: 90,
        // functions: 90,
        // lines: 90,
      },
    },
  },
});
