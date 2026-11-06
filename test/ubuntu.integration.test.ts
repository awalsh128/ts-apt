/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { AptPackageManager, Binary } from "../src/manager.js";
import { createPackageName } from "../src/package.js";
import { CommandRunner } from "../src/index.js";

import {
  canRunIntegration,
  createIntegrationContext,
  installTestPackage,
  packageName,
  removeTestPackage,
} from "./ubuntu.integration.common.js";

(canRunIntegration ? describe : describe.skip)(
  "ubuntu integration for readonly operations",
  () => {
    let manager: AptPackageManager;
    let runner: CommandRunner;

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
      expect(installed.some((pkg) => pkg.name.name.length > 0)).toBe(true);
    });

    test(`searches for ${packageName}`, async () => {
      const found = await manager.search([packageName], true);

      expect(found.length).toBeGreaterThan(0);
      expect(found.some((pkg) => pkg.name.name.includes(packageName))).toBe(
        true,
      );
    });

    test(`gets ${packageName} package info`, async () => {
      const info = await manager.getPackageInfo([
        createPackageName(packageName),
      ]);

      expect(info.length).toBeGreaterThan(0);
      expect(info[0]?.name.name).toBe(packageName);
      expect(info[0]?.name.version).toMatch(/\S/);
    });

    test(`lists files installed by ${packageName}`, async () => {
      const files = await manager.listInstalledFiles(
        createPackageName(packageName),
      );

      expect(files.length).toBeGreaterThan(0);
      expect(files.some((file) => file.includes(packageName))).toBe(true);
    });
  },
);
