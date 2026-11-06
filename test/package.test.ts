import { describe, expect, test } from "vitest";
import { createPackageName, deserializePackageName } from "../src/package.js";

const pkg = (input: { name: string; version?: string; arch?: string }) =>
  createPackageName(input.name, input.version, input.arch);

describe("packages", () => {
  describe("PackageName", () => {
    test.each([
      [
        pkg({ name: "vim", version: "2:9.0", arch: "amd64" }),
        "vim:amd64=2:9.0",
      ],
      [pkg({ name: "vim" }), "vim"],
      [pkg({ name: "vim", arch: "amd64" }), "vim:amd64"],
      [pkg({ name: "vim", version: "2:9.0" }), "vim=2:9.0"],
    ])("serializes %j to %s", (input, expected) => {
      expect(input.serialize()).toBe(expected);
    });

    test("compares multiple packages in stable order", () => {
      const pkg1 = deserializePackageName("vim:amd64=2:9.0");
      const pkg2 = deserializePackageName("vim:arm64=2:9.0");
      const pkg3 = deserializePackageName("curl:amd64=8.5.0-2ubuntu10.6");
      const pkg4 = deserializePackageName("curl:arm64=8.5.0-2ubuntu10.6");

      expect([pkg1, pkg2, pkg3, pkg4].sort((a, b) => a.compareTo(b))).toEqual(
        [pkg4, pkg3, pkg1, pkg2].sort((a, b) => a.compareTo(b)),
      );
    });
  });

  test.each([
    [pkg({ name: "vim", version: "2:9.0", arch: "amd64" })],
    [pkg({ name: "vim", version: undefined, arch: undefined })],
    [pkg({ name: "vim", version: undefined, arch: "amd64" })],
    [pkg({ name: "vim", version: "2:9.0", arch: undefined })],
  ])("createPackageName creates expected PackageName", (pkgInstance) => {
    expect(
      createPackageName(
        pkgInstance.name,
        pkgInstance.version,
        pkgInstance.arch,
      ),
    ).toEqual(pkgInstance);
  });

  test.each([
    ["vim", pkg({ name: "vim", version: undefined, arch: undefined })],
    ["vim:amd64", pkg({ name: "vim", version: undefined, arch: "amd64" })],
    ["vim=2:9.0", pkg({ name: "vim", version: "2:9.0", arch: undefined })],
    ["vim:amd64=2:9.0", pkg({ name: "vim", version: "2:9.0", arch: "amd64" })],
    // Invalid APT package names but still parsed by our naive split function
    ["vim=a=a", pkg({ name: "vim", version: "a=a", arch: undefined })],
    ["vim:a:amd64=a=a", pkg({ name: "vim", version: "a=a", arch: "a:amd64" })],
  ])("deserializePackageName(%j) returns %j", (input, expected) => {
    expect(deserializePackageName(input)).toEqual(expected);
  });

  test("deserializePackageName throws on empty package", () => {
    expect(() => deserializePackageName("")).toThrow();
  });

  interface PackageNameJSON {
    name: string;
    version?: string;
    arch?: string;
  }
  test.each([
    [
      { name: "vim", version: "2:9.0", arch: "amd64" },
      pkg({ name: "vim", version: "2:9.0", arch: "amd64" }),
    ],
    [
      { name: "vim" },
      pkg({ name: "vim", version: undefined, arch: undefined }),
    ],
    [
      { name: "vim", arch: "amd64" },
      pkg({ name: "vim", version: undefined, arch: "amd64" }),
    ],
    [
      { name: "vim", version: "2:9.0" },
      pkg({ name: "vim", version: "2:9.0", arch: undefined }),
    ],
  ])(
    "packageNameFromJSON(%j) returns %j",
    (input: PackageNameJSON, expected) => {
      expect(
        createPackageName(input.name, input?.version, input?.arch),
      ).toEqual(expected);
    },
  );
});
