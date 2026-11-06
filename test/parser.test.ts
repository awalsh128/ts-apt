/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CommandResult, PackageInfo } from "../src/types.js";
import { tsAptMetaKeys } from "../src/types.js";
import { AptOutputParser } from "../src/parser.js";
import { ValidationError } from "../src/errors.js";
import { createPackageName } from "../src/package.js";
import { deserializeCommandResult, nullLogger } from "./common.js";

import searchMultipleFoundExpected from "./data/parser/search_multiplefound_expected.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = resolve(__dirname, "data");

function deserialize(path: string): CommandResult {
  return deserializeCommandResult(resolve(DATA_DIR, path));
}

describe("apt output parser", () => {
  const parser = new AptOutputParser(nullLogger);
  interface LegacyExpectedPackage {
    name: string;
    version?: string;
    arch?: string;
    status?: PackageInfo["status"];
    metadata?: Record<string, string | undefined>;
  }
  type ExpectedPackage = PackageInfo | LegacyExpectedPackage;
  type ExpectedPackagesOrError = ExpectedPackage[] | string;

  const available = (
    name: string,
    version?: string,
    arch?: string,
  ): PackageInfo => ({
    name: createPackageName(name, version, arch),
    status: "available",
  });

  const installed = (
    name: string,
    version: string,
    arch?: string,
  ): PackageInfo => ({
    name: createPackageName(name, version, arch),
    status: "installed",
  });

  function expectPackagesOrError(
    result: CommandResult,
    parsed: PackageInfo[],
    expected: ExpectedPackagesOrError,
  ): void {
    if (typeof expected === "string") {
      expect(result.stderr).toContain(expected);
      expect(parsed).toEqual([]);
      return;
    }

    if (expected.length === 0) {
      expect(parsed).toEqual([]);
      return;
    }

    const toComparable = (pkg: ExpectedPackage) => {
      if (typeof (pkg as LegacyExpectedPackage).name === "string") {
        const legacy = pkg as LegacyExpectedPackage;
        return {
          name: legacy.name,
          version: legacy.version,
          arch: legacy.arch,
          status: legacy.status,
          metadata: legacy.metadata,
        };
      }

      const current = pkg as PackageInfo;
      return {
        name: current.name.name,
        version: current.name.version,
        arch: current.name.arch,
        status: current.status,
        metadata: current.metadata,
      };
    };

    const metadataKeyAliases: Readonly<Record<string, string>> = {
      description: tsAptMetaKeys.searchDescription,
      repos: tsAptMetaKeys.searchReleaseCodename,
    };

    const matches = (actual: PackageInfo, expectedPkg: ExpectedPackage) => {
      const normalized = toComparable(expectedPkg);
      if (actual.name.name !== normalized.name) {
        return false;
      }
      if (
        normalized.version !== undefined &&
        actual.name.version !== normalized.version
      ) {
        return false;
      }
      if (
        normalized.arch !== undefined &&
        actual.name.arch !== undefined &&
        actual.name.arch !== normalized.arch
      ) {
        return false;
      }
      if (
        normalized.status !== undefined &&
        actual.status !== normalized.status
      ) {
        return false;
      }

      if (normalized.metadata !== undefined) {
        for (const [key, value] of Object.entries(normalized.metadata)) {
          const mappedKey = metadataKeyAliases[key] ?? key;
          if (actual.metadata?.[mappedKey] !== value) {
            return false;
          }
        }
      }

      return true;
    };

    for (const expectedPkg of expected) {
      expect(parsed.some((actual) => matches(actual, expectedPkg))).toBe(true);
    }
  }

  it.each([
    [
      "cacheshow_multiplefound.log",
      [
        available("xdot", "1.1-2", "all"),
        available("python3", "3.8.2-0ubuntu2", "amd64"),
      ],
    ],
    [
      "cacheshow_singlefound.log",
      [available("python3", "3.8.2-0ubuntu2", "amd64")],
    ],
    ["cacheshow_singlenotfound.log", []],
  ])("parseCacheShowOutput uses %s", (file, expected) => {
    const result = deserialize(file);
    const parsed = parser.parseCacheShowOutput(result, true);

    expectPackagesOrError(result, parsed, expected);
  });

  it.each([
    [
      "install_mixedfoundnotfound.log",
      "E: Unable to locate package nonexistentpackage",
    ],
    ["install_mixedinstallstatus.log", [installed("rolldice", "1.16-1build1")]],
    ["install_singleinstalled.log", []],
    [
      "install_singlenotfound.log",
      "E: Unable to locate package nonexistentpackage",
    ],
    ["install_singlenotinstalled.log", [installed("xdot", "1.1-2")]],
  ])("parseInstallOutput uses %s", (file, expected) => {
    const result = deserialize(file);
    const parsed = parser.parseInstallOutput(result);

    expectPackagesOrError(result, parsed, expected);
  });

  it.each([
    [
      "remove_mixedfoundnotfound.log",
      "E: Unable to locate package nonexistentpackage",
    ],
    ["remove_mixedinstallstatus.log", [available("xdot", "1.1-2")]],
    ["remove_singleinstalled.log", [available("xdot", "1.1-2")]],
    [
      "remove_singlenotfound.log",
      "E: Unable to locate package nonexistentpackage",
    ],
    ["remove_singlenotinstalled.log", []],
    ["autoremove_found.log", []],
    ["autoremove_notfound.log", []],
  ])("parseRemoveOutput uses %s", (file, expected) => {
    const result = deserialize(file);
    const parsed = parser.parseRemoveOutput(result);

    expectPackagesOrError(result, parsed, expected);
  });

  test("parseListInstalledOutput uses listinstalled.log", () => {
    const result = deserialize("listinstalled.log");
    const parsed = parser.parseListInstalledOutput(result);

    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.every((pkg) => pkg.status === "installed")).toBe(true);
    expect(parsed.some((pkg) => pkg.name.name === "apt")).toBe(true);
  });

  it.each([
    [
      "listupgradable_found.log",
      [
        {
          name: createPackageName(
            "firefox-locale-en",
            "75.0+build3-0ubuntu1",
            "amd64",
          ),
          status: "upgradeable" as const,
          metadata: {
            [tsAptMetaKeys.listUpgradeableNewVersion]:
              "136.0+build3-0ubuntu0.20.04.1",
          },
        },
      ],
    ],
    ["listupgradable_notfound.log", []],
  ])("parseListUpgradableOutput uses %s", (file, expected) => {
    const result = deserialize(file);
    const parsed = parser.parseListUpgradableOutput(result);

    expectPackagesOrError(result, parsed, expected);
  });

  it.each([
    [
      "search_multiplefound.log",
      searchMultipleFoundExpected as ExpectedPackage[],
    ],
    ["search_nonefound.log", []],
    [
      "search_singlefound.log",
      [
        {
          name: createPackageName(
            "vim-vimerl-syntax",
            "1.4.1+git20120509.89111c7-2",
            "all",
          ),
          status: "available" as const,
          metadata: {
            [tsAptMetaKeys.searchDescription]: "Erlang syntax for Vim",
            [tsAptMetaKeys.searchReleaseCodename]: "focal",
          },
        },
      ],
    ],
  ])("parseSearchOutput uses %s", (file, expected) => {
    const result = deserialize(file);
    const parsed = parser.parseSearchOutput(result);

    expectPackagesOrError(result, parsed, expected);
  });

  it.each([["update.log", 0]])(
    "parseUpdateOutput uses %s",
    (file, expectedValue) => {
      const result = deserialize(file);
      const parsed = parser.parseUpdateOutput(result);

      expect(parsed).toBe(expectedValue);
    },
  );

  test("parseCachePolicyOutput parses installed and available entries", () => {
    const parsed = parser.parseCachePolicyOutput({
      cmdLine: "apt-cache policy curl vim",
      exitCode: 0,
      stdout: [
        "curl:",
        "  Installed: 8.5.0-2ubuntu10.6",
        "  Candidate: 8.5.0-2ubuntu10.6",
        "",
        "vim:",
        "  Installed: (none)",
        "  Candidate: 2:9.0-1",
        "",
      ].join("\n"),
      stderr: "",
    });

    expect(parsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.objectContaining({
            name: "curl",
            version: "8.5.0-2ubuntu10.6",
          }),
          status: "installed",
        }),
        expect.objectContaining({
          name: expect.objectContaining({ name: "vim", version: "2:9.0-1" }),
          status: "available",
        }),
      ]),
    );
  });

  test("parseQueryOutput parses dpkg-query formatted lines", () => {
    const parsed = parser.parseQueryOutput({
      cmdLine: "dpkg-query -W -f=${binary:Package}=${Version}",
      exitCode: 0,
      stdout: "openssl:amd64=3.0.13-0ubuntu3.5\ninvalid-line\n",
      stderr: "",
    });

    expect(parsed).toEqual([
      expect.objectContaining({
        name: expect.objectContaining({
          name: "openssl",
          version: "3.0.13-0ubuntu3.5",
          arch: "amd64",
        }),
        status: "installed",
      }),
    ]);
  });

  test("parseListInstalledOutput skips empty lines", () => {
    const parsed = parser.parseListInstalledOutput({
      cmdLine: "dpkg-query -W",
      exitCode: 0,
      stdout: "\n\nopenssl:amd64=3.0.13-0ubuntu3.5\n",
      stderr: "",
    });

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.name.name).toBe("openssl");
    expect(parsed[0]?.name.version).toBe("3.0.13-0ubuntu3.5");
    expect(parsed[0]?.name.arch).toBe("amd64");
    expect(parsed[0]?.status).toBe("installed");
  });

  test("parseCacheShowOutput stanza without version or architecture leaves them undefined", () => {
    const parsed = parser.parseCacheShowOutput({
      cmdLine: "apt-cache show curl",
      exitCode: 0,
      stdout: "Package: curl\nDescription: command line tool\n",
      stderr: "",
    });

    expect(parsed.map((pkg) => pkg.name)).toEqual([createPackageName("curl")]);
  });

  test("parseListInstalledOutput unrecognized line skips line", () => {
    const parsed = parser.parseListInstalledOutput({
      cmdLine: "dpkg-query -W",
      exitCode: 0,
      stdout: "not a package line\nopenssl:amd64=3.0.13-0ubuntu3.5\n",
      stderr: "",
    });

    expect(parsed.map((pkg) => pkg.name.name)).toEqual(["openssl"]);
  });

  test("parseListInstalledOutput empty version throws ValidationError", () => {
    expect(() =>
      parser.parseListInstalledOutput({
        cmdLine: "dpkg-query -W",
        exitCode: 0,
        stdout: "openssl:amd64=\n",
        stderr: "",
      }),
    ).toThrow(ValidationError);
  });

  test("parseUpgradeOutput Inst line without repositories parses package", () => {
    const parsed = parser.parseUpgradeOutput({
      cmdLine: "apt-get upgrade",
      exitCode: 0,
      stdout: "Inst vim:amd64 (2:8.1.2269-1ubuntu5.32)\n",
      stderr: "",
    });

    expect(parsed).toEqual([
      {
        name: createPackageName("vim", "2:8.1.2269-1ubuntu5.32", "amd64"),
        status: "installed",
      },
    ]);
  });

  test("parseInstallOutput captures architecture when present", () => {
    const parsed = parser.parseInstallOutput({
      cmdLine: "apt-get install -f libc6",
      exitCode: 0,
      stdout: "Setting up libc6:amd64 (2.39-0ubuntu8.4) ...\n",
      stderr: "",
    });

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.name.name).toBe("libc6");
    expect(parsed[0]?.name.version).toBe("2.39-0ubuntu8.4");
    expect(parsed[0]?.name.arch).toBe("amd64");
    expect(parsed[0]?.status).toBe("installed");
  });

  test("parseUpdateOutput extracts upgradable package count", () => {
    const count = parser.parseUpdateOutput({
      cmdLine: "apt update",
      exitCode: 0,
      stdout:
        "Hit:1 http://archive.ubuntu.com/ubuntu jammy InRelease\n3 packages can be upgraded. Run 'apt list --upgradable' to see them.\n",
      stderr: "",
    });

    expect(count).toBe(3);
  });

  it.each([
    [
      "upgrade_mixedfoundnotfound.log",
      "E: Unable to locate package nonexistentpackage",
    ],
    [
      "upgrade_mixedupgradestatus.log",
      [installed("xxd", "2:8.1.2269-1ubuntu5.32")],
    ],
    [
      "upgrade_singlenotfound.log",
      "E: Unable to locate package nonexistentpackage",
    ],
    [
      "upgrade_singlenotupgraded.log",
      [installed("xxd", "2:8.1.2269-1ubuntu5.32")],
    ],
    ["upgrade_singleupgraded.log", []],
    [
      "upgradeall_found.log",
      [
        installed("libc-bin", "2.31-0ubuntu9.18"),
        installed("libapt-pkg6.0", "2.0.11", "amd64"),
        installed("apt", "2.0.11"),
        installed("xxd", "2:8.1.2269-1ubuntu5.32"),
      ],
    ],
    ["upgradeall_notfound.log", []],
  ])("parseUpgradeOutput uses %s", (file, expected) => {
    const result = deserialize(file);
    const parsed = parser.parseUpgradeOutput(result);

    expectPackagesOrError(result, parsed, expected);
  });
});
