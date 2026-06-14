import { describe, expect, test } from "vitest";
import { createPackageManager } from "../../src/factory.js";

const isLinux = process.platform === "linux";
const runOnLinux = isLinux ? describe : describe.skip;

runOnLinux("ubuntu integration", () => {
  test("apt manager can list installed packages", async () => {
    const manager = await createPackageManager({ preferred: "apt" });
    const installed = await manager.listInstalled();

    expect(Array.isArray(installed)).toBe(true);
    expect(installed.length).toBeGreaterThan(0);
  });

  test("apt search returns array", async () => {
    const manager = await createPackageManager({ preferred: "apt" });
    const found = await manager.find(["bash"]);

    expect(Array.isArray(found)).toBe(true);
  });

  test("apt dry-run install command path works", async () => {
    const manager = await createPackageManager({ preferred: "apt" });
    const out = await manager.install(["bash"], { dryRun: true });

    expect(Array.isArray(out)).toBe(true);
  });
});
