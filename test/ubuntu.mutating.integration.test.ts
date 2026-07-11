import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { CommandExecutionError } from "../src/errors.js";
import { createPackageName } from "../src/package.js";
import {
  canRunMutatingIntegration,
  createIntegrationContext,
  ensurePackageMissing,
  expectNamedEntries,
  installTestPackage,
  integrationAptTimeoutMs,
  missingPackageName,
  packageName,
  removeTestPackage,
  runWithTimeout,
} from "./ubuntu.integration.helpers.js";

(canRunMutatingIntegration ? describe : describe.skip)(
  "ubuntu integration for mutating operations",
  () => {
    let manager: Awaited<
      ReturnType<typeof createIntegrationContext>
    >["manager"];
    let runner: Awaited<ReturnType<typeof createIntegrationContext>>["runner"];

    beforeAll(async () => {
      ({ manager, runner } = await createIntegrationContext());
    }, 600_000);

    beforeEach(async () => {
      await ensurePackageMissing(runner);
    }, 600_000);

    afterAll(async () => {
      if (!runner) {
        return;
      }
      await removeTestPackage(runner);
    }, 600_000);

    test("autoClean completes successfully", async () => {
      await expect(manager.autoClean()).resolves.toBeUndefined();
    });

    test("install adds a package when missing", async () => {
      const result = await manager.install([createPackageName(packageName)]);

      expectNamedEntries(result, [packageName]);
    });

    test("install missing package rejects with command execution error", async () => {
      await expect(
        manager.install([createPackageName(missingPackageName)]),
      ).rejects.toBeInstanceOf(CommandExecutionError);
    });

    test("install mixed found and missing packages rejects", async () => {
      await expect(
        manager.install([
          createPackageName(packageName),
          createPackageName(missingPackageName),
        ]),
      ).rejects.toBeInstanceOf(CommandExecutionError);
    });

    test("remove returns removed package when installed", async () => {
      await installTestPackage(runner);

      const removed = await manager.remove(
        [createPackageName(packageName)],
        false,
      );

      expectNamedEntries(removed, [packageName]);
    });

    test("remove absent package returns no removed packages", async () => {
      const removed = await manager.remove(
        [createPackageName(packageName)],
        false,
      );

      expect(removed).toEqual([]);
    });

    test("remove missing package rejects with command execution error", async () => {
      await expect(
        manager.remove([createPackageName(missingPackageName)], false),
      ).rejects.toBeInstanceOf(CommandExecutionError);
    });

    test("autoRemove completes after removing package-installed dependencies", async () => {
      await installTestPackage(runner);
      await manager.remove([createPackageName(packageName)]);

      const removed = await runWithTimeout(
        manager.autoRemove(),
        integrationAptTimeoutMs,
        "autoRemove operation",
      );

      expect(Array.isArray(removed)).toBe(true);
      for (const pkg of removed) {
        expect(pkg.name).toMatch(/\S/);
      }
    });
  },
);
