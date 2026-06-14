import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseDeletedOutput,
  parseDpkgStatusOutput,
  parseInstallOutput,
  parseListInstalledOutput,
  parseListUpgradableOutput,
  parsePackageInfoOutput,
  parseSearchEntries,
} from "../../src/managers/apt/parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function fixture(path: string): string {
  return readFileSync(resolve(__dirname, "..", "fixtures", path), "utf8");
}

describe("apt parser", () => {
  test("parses install output", () => {
    const output = fixture("apt/install-output.txt");

    const parsed = parseInstallOutput(output, "apt");
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({
      name: "libssl3",
      arch: "amd64",
      version: "3.0.2-0ubuntu1.9",
      status: "installed",
    });
  });

  test("parses removed output", () => {
    const output = fixture("apt/remove-output.txt");

    const parsed = parseDeletedOutput(output, "apt");
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      name: "vim",
      arch: "amd64",
      status: "available",
    });
  });

  test("parses search entries", () => {
    const output = fixture("apt/search-output.txt");

    const parsed = parseSearchEntries(output, "apt");
    expect(Object.keys(parsed)).toEqual(["vim", "vim-common", "vim-tiny"]);
    expect(parsed.vim?.newVersion).toBe("2:9.0.1378-2+deb12u2");
  });

  test("parses installed and upgradable outputs", () => {
    const installed = fixture("apt/list-installed-output.txt");
    const upgradable = fixture("apt/list-upgradable-output.txt");

    const installedParsed = parseListInstalledOutput(installed, "apt");
    const upgradableParsed = parseListUpgradableOutput(upgradable, "apt");

    expect(installedParsed.find((p) => p.name === "vim")).toMatchObject({
      name: "vim",
      status: "installed",
    });
    expect(upgradableParsed.find((p) => p.name === "vim")).toMatchObject({
      name: "vim",
      status: "upgradable",
    });
  });

  test("parses package info output", () => {
    const info = fixture("apt/package-info-output.txt");

    const parsed = parsePackageInfoOutput(info, "apt");
    expect(parsed).toMatchObject({
      name: "vim",
      version: "2:9.0.1378-2+deb12u2",
      arch: "amd64",
      category: "editors",
    });
  });

  test("normalizes dpkg config-files to available", () => {
    const search = parseSearchEntries(fixture("apt/search-output.txt"), "apt");
    const statusOut = fixture("apt/dpkg-status-output.txt");

    const parsed = parseDpkgStatusOutput(statusOut, search, "apt");
    expect(parsed.find((p) => p.name === "vim")?.status).toBe("installed");
    expect(parsed.find((p) => p.name === "vim-tiny")?.status).toBe("available");
  });

  test("parses apt-fast output through shared parser", () => {
    const output = fixture("apt-fast/install-output.txt");
    const parsed = parseInstallOutput(output, "apt-fast");

    expect(parsed[0]).toMatchObject({
      name: "aria2",
      packageManager: "apt-fast",
      status: "installed",
    });
  });
});
