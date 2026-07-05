import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { CommandExecutionError } from "../src/errors.js";
import { createPackageName } from "../src/package.js";
import {
  canRunIntegration,
  createIntegrationContext,
  expectNamedEntries,
  installTestPackage,
  integrationAptTimeoutMs,
  missingPackageName,
  multiSearchKeyword,
  packageName,
  removeTestPackage,
  runWithTimeout,
  secondaryPackageName,
  virtualPackageName,
} from "./ubuntu.integration.helpers.js";

(canRunIntegration ? describe : describe.skip)(
  "ubuntu integration for readonly operations",
  () => {
    let manager: Awaited<
      ReturnType<typeof createIntegrationContext>
    >["manager"];
    let runner: Awaited<ReturnType<typeof createIntegrationContext>>["runner"];

    beforeAll(async () => {
      ({ manager, runner } = await createIntegrationContext());
      await installTestPackage(runner);
    }, 600_000);

    afterAll(async () => {
      if (!runner) {
        return;
      }
      await removeTestPackage(runner);
    }, 600_000);

    test("lists installed packages", async () => {
      const installed = await manager.listInstalled();

      expect(installed.length).toBeGreaterThan(0);
      expect(installed.some((pkg) => pkg.name.length > 0)).toBe(true);
    });

    test(`searches for ${packageName}`, async () => {
      const found = await manager.search([packageName]);

      expect(found.length).toBeGreaterThan(0);
      expect(found.some((pkg) => pkg.name.includes(packageName))).toBe(true);
    });

    test("search multiple matches returns more than one result", async () => {
      const found = await manager.search([multiSearchKeyword]);

      expect(found.length).toBeGreaterThan(1);
      expect(found.some((pkg) => pkg.name.includes(multiSearchKeyword))).toBe(
        true,
      );
    });

    test("search none found returns empty results", async () => {
      const found = await manager.search([missingPackageName]);

      expect(found).toEqual([]);
    });

    test(`gets ${packageName} package info`, async () => {
      const info = await manager.show([createPackageName(packageName)]);

      expect(info.success.length).toBeGreaterThan(0);
      expect(info.success[0]?.name).toBe(packageName);
      expect(info.success[0]?.version).toMatch(/\S/);
    });

    test("show multiple packages returns all requested packages", async () => {
      const info = await manager.show([
        createPackageName(packageName),
        createPackageName(secondaryPackageName),
      ]);

      expectNamedEntries(info.success, [packageName, secondaryPackageName]);
    });

    test("show mixed found and missing packages returns successes and stderr notice", async () => {
      const info = await manager.show([
        createPackageName(packageName),
        createPackageName(secondaryPackageName),
        createPackageName(missingPackageName),
      ]);

      expectNamedEntries(info.success, [packageName, secondaryPackageName]);
      expect(info.stderr).toContain(missingPackageName);
    });

    test("show virtual package returns empty success and diagnostic stderr", async () => {
      const info = await manager.show([createPackageName(virtualPackageName)]);

      expect(info.success).toEqual([]);
      expect(info.stderr).toMatch(/purely virtual|No packages found/);
    });

    test(`lists files installed by ${packageName}`, async () => {
      const files = await manager.listInstalledFiles(
        createPackageName(packageName),
      );

      expect(files.length).toBeGreaterThan(0);
      expect(files.some((file) => file.includes(packageName))).toBe(true);
    });

    test("listInstalledFiles missing package throws command execution error", async () => {
      await expect(
        manager.listInstalledFiles(createPackageName(missingPackageName)),
      ).rejects.toBeInstanceOf(CommandExecutionError);
    });

    test("listUpgradable current system returns parseable package entries", async () => {
      const upgradable = await manager.listUpgradable();

      expect(Array.isArray(upgradable.success)).toBe(true);
      expect(typeof upgradable.stderr).toBe("string");
      for (const pkg of upgradable.success) {
        expect(pkg.name).toMatch(/\S/);
        expect(["upgradeable", "broken"]).toContain(pkg.status);
        expect(pkg.metadata?.get("newVersion")).toMatch(/\S/);
      }
    });

    test("concurrent readonly operations complete with the real runner", async () => {
      const results = await runWithTimeout(
        Promise.all([
          manager.listInstalled(),
          manager.search([packageName]),
          manager.show([createPackageName(packageName)]),
        ]),
        30_000,
        "parallel read operations",
      );

      expect(results[0].length).toBeGreaterThan(0);
      expect(results[1].length).toBeGreaterThan(0);
      expect(results[2].success.length).toBeGreaterThan(0);
    });

    test("readonly package metadata operations compose correctly in parallel", async () => {
      const [found, info, upgradable] = await runWithTimeout(
        Promise.all([
          manager.search([multiSearchKeyword]),
          manager.show([createPackageName(packageName)]),
          manager.listUpgradable(),
        ]),
        30_000,
        "parallel readonly metadata operations",
      );

      expect(found.length).toBeGreaterThan(0);
      expect(info.success.length).toBeGreaterThan(0);
      expect(Array.isArray(upgradable.success)).toBe(true);
    });
  },
);
