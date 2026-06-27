import { describe, expect, test } from "vitest";
import { createPackageManager } from "../src/manager.js";

const isLinux = process.platform === "linux";
const runOnLinux = isLinux ? describe : describe.skip;

runOnLinux("ubuntu integration", () => {
  test("apt manager can list installed packages", async () => {
    const manager = await createPackageManager(false);
    const installed = await manager.listInstalled();

    expect(Array.isArray(installed)).toBe(true);
    expect(installed.length).toBeGreaterThan(0);
  });

  test("apt search returns array", async () => {
    const manager = await createPackageManager(false);
    const found = await manager.search(["bash"]);

    expect(Array.isArray(found)).toBe(true);
  });

  test("apt package info returns array", async () => {
    const manager = await createPackageManager(false);
    const out = await manager.getPackageInfo(["bash"]);

    expect(Array.isArray(out)).toBe(true);
  });
});
