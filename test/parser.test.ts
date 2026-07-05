import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CommandResult, PackageInfo } from "../src/types.js";
import { AptOutputParser } from "../src/parser.js";
import { deserializeCommandResult, nullLogger } from "./common.js";

import listInstalledExpected from "./data/parser/listinstalled_expected.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = resolve(__dirname, "data");

function dumpPackages(packages: PackageInfo[]): string {
  return JSON.stringify(packages, (_, value) =>
    value instanceof Map ? Object.fromEntries(value) : value,
  );
}

function jsonToPackageInfos(
  jsonArray: Record<string, unknown>[],
): PackageInfo[] {
  return jsonArray.map(
    (json) =>
      ({
        name: json.name,
        version: json.version,
        status: json.status,
        arch: json.arch,
        metadata: json.metadata
          ? new Map(Object.entries(json.metadata as Record<string, string>))
          : undefined,
      }) as PackageInfo,
  );
}

function withoutUndefinedFields<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as Partial<T>;
}

function deserialize(path: string): CommandResult {
  return deserializeCommandResult(resolve(DATA_DIR, path));
}

describe("apt output parser", () => {
  const parser = new AptOutputParser(nullLogger);
  type ExpectedPackagesOrError = PackageInfo[] | string;

  const available = (
    name: string,
    version = "",
    arch: string | undefined = undefined,
  ): PackageInfo => ({
    name,
    version,
    status: "available",
    arch,
  });

  const installed = (
    name: string,
    version: string,
    arch?: string,
  ): PackageInfo => ({
    name,
    version,
    status: "installed",
    arch,
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

    expect(parsed).toEqual(
      expect.arrayContaining(
        expected.map((pkg) =>
          expect.objectContaining(withoutUndefinedFields(pkg)),
        ),
      ),
    );
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
    [
      "autoremove_found.log",
      [
        available("gir1.2-gtk-3.0", "3.24.20-0ubuntu1.2", "amd64"),
        available("gir1.2-pango-1.0", "1.44.7-2ubuntu4", "amd64"),
        available("gir1.2-freedesktop", "1.64.1-1~ubuntu20.04.1", "amd64"),
        available("gir1.2-gdkpixbuf-2.0", "2.40.0+dfsg-3ubuntu0.5", "amd64"),
        available("libpangoxft-1.0-0", "1.44.7-2ubuntu4", "amd64"),
        available("python3-gi-cairo", "3.36.0-1"),
        available("python3-cairo", "1.16.2-2ubuntu2", "amd64"),
      ],
    ],
    ["autoremove_notfound.log", []],
  ])("parseRemoveOutput uses %s", (file, expected) => {
    const result = deserialize(file);
    const parsed = parser.parseRemoveOutput(result);

    expectPackagesOrError(result, parsed, expected);
  });

  it.each([
    [
      "listinstalled.log",
      jsonToPackageInfos(listInstalledExpected) as PackageInfo[],
    ],
  ])("parseListInstalledOutput uses %s", (file, expected) => {
    const result = deserialize(file);
    const parsed = parser.parseListInstalledOutput(result);

    expectPackagesOrError(result, parsed, expected);
  });

  it.each([
    [
      "listupgradable_found.log",
      [
        {
          name: "firefox-locale-en",
          version: "75.0+build3-0ubuntu1",
          status: "upgradeable" as const,
          arch: "amd64",
          metadata: new Map([["newVersion", "136.0+build3-0ubuntu0.20.04.1"]]),
        } as PackageInfo,
      ],
    ],
    ["listupgradable_notfound.log", []],
  ])("parseListUpgradableOutput uses %s", (file, expected) => {
    const result = deserialize(file);
    const parsed = parser.parseSimulateDistUpgrade(result);

    expectPackagesOrError(result, parsed, expected);
  });

  it.each([
    ["search_multiplefound.log", "acr/focal 1.7.2-1 all", "autoconf like tool"],
    ["search_nonefound.log", "", ""],
    [
      "search_singlefound.log",
      "vim-vimerl-syntax/focal 1.4.1+git20120509.89111c7-2 all",
      "Erlang syntax for Vim",
    ],
  ])("parseSearchOutput uses %s", (file, expectedName, expectedDescription) => {
    const result = deserialize(file);
    const parsed = parser.parseSearchOutput(result);

    if (!expectedName) {
      expect(parsed).toEqual([
        { name: "Sorting...", description: "" },
        { name: "Full Text Search...", description: "" },
      ]);
      return;
    }

    expect(parsed[0]).toEqual({ name: "Sorting...", description: "" });
    expect(parsed[1]).toEqual({ name: "Full Text Search...", description: "" });
    expect(parsed).toEqual(
      expect.arrayContaining([
        { name: expectedName, description: "" },
        { name: expectedDescription, description: "" },
      ]),
    );
  });

  test("parseSearchOutput ignores empty lines and keeps malformed entries", () => {
    const parsed = parser.parseSearchOutput({
      command: "apt-get",
      args: ["search", "vim"],
      exitCode: 0,
      stdout: "\nvim - editor\nnot-a-valid-line\n\n",
      stderr: "",
    });

    expect(parsed).toEqual([
      { name: "vim", description: "editor" },
      { name: "not-a-valid-line", description: "" },
    ]);
  });

  it.each([["update.log", 0]])(
    "parseUpdateOutput uses %s",
    (file, expectedValue) => {
      const result = deserialize(file);
      const parsed = parser.parseUpdateOutput(result);

      expect(parsed.success).toBe(expectedValue);
    },
  );

  test("parseCachePolicyOutput parses installed and available entries", () => {
    const parsed = parser.parseCachePolicyOutput({
      command: "apt-cache",
      args: ["policy", "curl", "vim"],
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
          name: "curl",
          version: "8.5.0-2ubuntu10.6",
          status: "installed",
        }),
        expect.objectContaining({
          name: "vim",
          version: "2:9.0-1",
          status: "available",
        }),
      ]),
    );
  });

  test("parseQueryOutput parses dpkg-query formatted lines", () => {
    const parsed = parser.parseQueryOutput({
      command: "dpkg-query",
      args: ["-W", "-f=${binary:Package}:${Architecture}=${Version}"],
      exitCode: 0,
      stdout: "openssl:amd64=3.0.13-0ubuntu3.5\ninvalid-line\n",
      stderr: "",
    });

    expect(parsed).toEqual([
      expect.objectContaining({
        name: "openssl",
        arch: "amd64",
        version: "3.0.13-0ubuntu3.5",
        status: "installed",
      }),
    ]);
  });

  test("parseListInstalledOutput skips empty lines", () => {
    const parsed = parser.parseListInstalledOutput({
      command: "dpkg-query",
      args: ["-W"],
      exitCode: 0,
      stdout: "\n\nopenssl:amd64=3.0.13-0ubuntu3.5\n",
      stderr: "",
    });

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      name: "openssl",
      arch: "amd64",
      version: "3.0.13-0ubuntu3.5",
      status: "installed",
    });
  });

  test("parseInstallOutput captures architecture when present", () => {
    const parsed = parser.parseInstallOutput({
      command: "apt-get",
      args: ["install", "-f", "libc6"],
      exitCode: 0,
      stdout: "Setting up libc6:amd64 (2.39-0ubuntu8.4) ...\n",
      stderr: "",
    });

    expect(parsed).toEqual([
      expect.objectContaining({
        name: "libc6",
        arch: "amd64",
        version: "2.39-0ubuntu8.4",
        status: "installed",
      }),
    ]);
  });

  test("parseUpdateOutput extracts upgradable package count", () => {
    const count = parser.parseUpdateOutput({
      command: "apt",
      args: ["update"],
      exitCode: 0,
      stdout:
        "Hit:1 http://archive.ubuntu.com/ubuntu jammy InRelease\n3 packages can be upgraded. Run 'apt list --upgradable' to see them.\n",
      stderr: "",
    });

    expect(count.success).toBe(3);
  });

  test("parseUpdateOutput returns zero when summary line is missing", () => {
    const count = parser.parseUpdateOutput({
      command: "apt-get",
      args: ["update"],
      exitCode: 0,
      stdout: "Hit:1 http://archive.ubuntu.com/ubuntu jammy InRelease\n",
      stderr: "",
    });

    expect(count.success).toBe(0);
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
